//! Background metadata sync worker.
//!
//! Periodically writes XMP metadata to photo files when the app is idle.
//! Pauses automatically when the user is actively interacting with the app,
//! resuming once idle for a configurable duration.
//!
//! The worker processes photos in small batches with sleeps between them,
//! keeping disk I/O gentle and avoiding any visible slowdown.

use crate::db::Db;
use crate::metadata;
use crate::DbPool;
use log;
use std::sync::atomic::{AtomicI64, AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// How long the user must be idle before the sync worker starts processing.
const IDLE_THRESHOLD_SECS: u64 = 30;

/// How many photos to sync per batch before rechecking idle status.
const BATCH_SIZE: usize = 20;

/// Sleep between batches (keeps disk I/O gentle).
const BATCH_SLEEP_MS: u64 = 500;

/// Sleep between full sweep cycles (after processing all photos).
const CYCLE_SLEEP_SECS: u64 = 300; // 5 minutes

/// Sleep when the user is active (poll interval for idle check).
const ACTIVE_POLL_SECS: u64 = 10;

/// Shared state for the sync worker, accessible from commands.
pub struct SyncWorker {
    /// Timestamp (unix millis) of the last user activity.
    last_activity: Arc<AtomicI64>,
    /// Flag to request an immediate sync cycle (e.g., after bulk import).
    nudge: Arc<AtomicBool>,
    /// Flag to shut down the worker thread.
    shutdown: Arc<AtomicBool>,
}

impl SyncWorker {
    /// Create a new sync worker and spawn its background thread.
    pub fn new(pool: DbPool) -> Self {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let last_activity = Arc::new(AtomicI64::new(now_millis));
        let nudge = Arc::new(AtomicBool::new(false));
        let shutdown = Arc::new(AtomicBool::new(false));

        let worker = SyncWorker {
            last_activity: last_activity.clone(),
            nudge: nudge.clone(),
            shutdown: shutdown.clone(),
        };

        // Spawn background thread
        std::thread::Builder::new()
            .name("metadata-sync".into())
            .spawn(move || {
                sync_loop(pool, last_activity, nudge, shutdown);
            })
            .expect("Failed to spawn metadata sync worker thread");

        worker
    }

    /// Record user activity (call this on user interactions).
    pub fn record_activity(&self) {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        self.last_activity.store(now_millis, Ordering::Relaxed);
    }

    /// Request an immediate sync cycle (e.g., after bulk import or dive reassignment).
    pub fn nudge(&self) {
        self.nudge.store(true, Ordering::Relaxed);
    }

    /// Check if the user is currently idle.
    fn is_idle(last_activity: &AtomicI64) -> bool {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let last = last_activity.load(Ordering::Relaxed);
        let idle_ms = (now_millis - last).max(0) as u64;
        idle_ms >= IDLE_THRESHOLD_SECS * 1000
    }
}

impl Drop for SyncWorker {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
    }
}

/// Main sync loop — runs on the background thread.
fn sync_loop(
    pool: DbPool,
    last_activity: Arc<AtomicI64>,
    nudge: Arc<AtomicBool>,
    shutdown: Arc<AtomicBool>,
) {
    log::info!("Metadata sync worker started");

    // Wait a bit on startup before first cycle (let the app finish loading)
    std::thread::sleep(Duration::from_secs(15));

    loop {
        if shutdown.load(Ordering::Relaxed) {
            log::info!("Metadata sync worker shutting down");
            break;
        }

        // Check if we were nudged for an immediate cycle
        let was_nudged = nudge.swap(false, Ordering::Relaxed);

        // Wait for idle unless nudged
        if !was_nudged {
            if !SyncWorker::is_idle(&last_activity) {
                std::thread::sleep(Duration::from_secs(ACTIVE_POLL_SECS));
                continue;
            }
        }

        // Run a sync cycle
        match run_sync_cycle(&pool, &last_activity, &shutdown) {
            Ok(synced) => {
                if synced > 0 {
                    log::info!("Metadata sync: processed {} photos", synced);
                }
            }
            Err(e) => {
                log::warn!("Metadata sync cycle error: {}", e);
            }
        }

        // Sleep before next cycle
        for _ in 0..(CYCLE_SLEEP_SECS * 2) {
            if shutdown.load(Ordering::Relaxed) || nudge.load(Ordering::Relaxed) {
                break;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    }
}

/// Run one sync cycle: fetch dirty photo IDs and sync in batches.
/// Returns the number of photos processed.
fn run_sync_cycle(
    pool: &DbPool,
    last_activity: &AtomicI64,
    shutdown: &AtomicBool,
) -> Result<usize, String> {
    // Get only photos with metadata_dirty = 1
    let photo_ids = {
        let conn = pool.get().map_err(|e| format!("DB pool error: {}", e))?;
        let db = Db::new(&*conn);
        db.get_dirty_photo_ids().map_err(|e| format!("Failed to get dirty photo IDs: {}", e))?
    };

    if photo_ids.is_empty() {
        return Ok(0);
    }

    let mut processed = 0;

    for chunk in photo_ids.chunks(BATCH_SIZE) {
        // Check if we should pause (user became active or shutdown requested)
        if shutdown.load(Ordering::Relaxed) {
            log::debug!("Metadata sync paused: shutdown requested ({} processed so far)", processed);
            break;
        }
        if !SyncWorker::is_idle(last_activity) {
            log::debug!("Metadata sync paused: user active ({} processed so far)", processed);
            break;
        }

        // Process this batch
        let conn = pool.get().map_err(|e| format!("DB pool error: {}", e))?;
        let db = Db::new(&*conn);
        for &photo_id in chunk {
            metadata::write_xmp_sidecar_for_photo(&db, photo_id);
            processed += 1;
        }

        // Gentle pause between batches
        std::thread::sleep(Duration::from_millis(BATCH_SLEEP_MS));
    }

    Ok(processed)
}
