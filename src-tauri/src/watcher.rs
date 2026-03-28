//! File watcher for detecting processed files saved from external editors.
//!
//! When a user opens a photo in an external editor (e.g., Photoshop, Lightroom),
//! we use two complementary strategies to find the saved output:
//!
//! 1. **Real-time filesystem watcher** (`notify` crate): recursively monitors a
//!    broad area around the photo (grandparent directory) for new files matching
//!    the base filename — catches saves to the same dir, subdirs, or sibling dirs.
//!
//! 2. **Process exit scan**: captures the editor's `Child` handle and waits for it
//!    to exit. Then does a progressive search: local tree → up the hierarchy →
//!    same drive volume → user directories. Searches for files with matching base
//!    filenames that were created/modified after the editor launched. This catches
//!    saves to *any* location, similar to what you'd see in Process Monitor.
//!
//! When a processed version (TIFF, PSD, PNG, JPEG, etc.) is found, we:
//!   1. Import it into the database linked to the original RAW photo
//!   2. Copy the RAW's metadata (species tags, general tags, rating) to it
//!   3. Write an XMP sidecar file for the new processed file
//!   4. Emit a Tauri event so the frontend can refresh

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use crate::db::Db;
use crate::metadata;
use crate::photos;
use crate::DbPool;

/// Extensions we consider "processed" output from an editor (superset of import list)
const PROCESSED_EXTENSIONS: &[&str] = &[
    "tiff", "tif", "png", "psd", "psb", "jpg", "jpeg",
];

/// Extensions that are the original RAW files we opened
const RAW_EXTENSIONS: &[&str] = &[
    "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2", "raf", "pef", "raw",
];

/// How long to wait after a file event before processing (debounce).
/// Editors often write files in multiple steps.
const DEBOUNCE_SECS: u64 = 3;

/// After this duration with no new events, stop watching a directory.
const WATCH_TIMEOUT_SECS: u64 = 7200; // 2 hours

/// Maximum time (seconds) to spend on the broad post-exit scan.
const SCAN_TIMEOUT_SECS: u64 = 30;

/// Directories to skip during broad filesystem scans (lowercased).
/// These are never going to contain user-saved processed photos.
const SKIP_DIRS: &[&str] = &[
    "windows", "$recycle.bin", "system volume information",
    "program files", "program files (x86)", "programdata",
    "appdata", "node_modules", ".git", ".svn", ".hg",
    "__pycache__", "target", "dist", "build", ".next",
    "recovery", "boot", "perflogs",
];

/// Info about a photo we opened in an editor
#[derive(Debug, Clone)]
struct WatchedPhoto {
    /// The original photo's DB id
    photo_id: i64,
    /// The original file's base name (without extension, lowercased)
    base_filename: String,
    /// The original file's full path
    original_path: String,
    /// The trip_id the original belongs to
    trip_id: i64,
    /// The dive_id the original belongs to (if any)
    dive_id: Option<i64>,
    /// When we started watching (monotonic clock for timeout)
    started_at: Instant,
    /// When the editor was launched (wall clock for file timestamp comparison)
    launched_at: SystemTime,
}

/// Tracks directories being watched and their associated opened photos
struct WatchState {
    /// Map from watched directory -> list of opened photos in that dir
    directories: HashMap<PathBuf, Vec<WatchedPhoto>>,
    /// Map from file path -> last event time (for debouncing)
    pending_files: HashMap<PathBuf, Instant>,
    /// The actual filesystem watcher
    watcher: Option<RecommendedWatcher>,
}

/// Thread-safe handle to the file watcher
pub struct FileWatcher {
    state: Arc<Mutex<WatchState>>,
    db_pool: DbPool,
    app_handle: tauri::AppHandle,
}

/// Event emitted to the frontend when a processed file is auto-imported
#[derive(Clone, serde::Serialize)]
pub struct ProcessedFileImported {
    pub photo_id: i64,
    pub raw_photo_id: i64,
    pub file_path: String,
    pub filename: String,
    pub trip_id: i64,
    pub dive_id: Option<i64>,
}

impl FileWatcher {
    pub fn new(db_pool: DbPool, app_handle: tauri::AppHandle) -> Self {
        FileWatcher {
            state: Arc::new(Mutex::new(WatchState {
                directories: HashMap::new(),
                pending_files: HashMap::new(),
                watcher: None,
            })),
            db_pool,
            app_handle,
        }
    }

    /// Start watching for processed versions of a photo opened in an editor.
    ///
    /// - Sets up a recursive filesystem watcher on the photo's grandparent directory
    ///   (2 levels up) for real-time detection — covers sibling dirs like `processed/`.
    /// - If a `Child` process handle is provided, spawns a background thread that
    ///   waits for the editor to exit and then does a progressive scan across the
    ///   directory tree, drive volume, and user directories to find matching files.
    pub fn watch_for_processed_file(
        &self,
        photo_id: i64,
        file_path: &str,
        editor_process: Option<Child>,
    ) {
        let path = Path::new(file_path);
        let parent_dir = match path.parent() {
            Some(d) => d.to_path_buf(),
            None => {
                log::warn!("Cannot watch: no parent directory for {}", file_path);
                return;
            }
        };

        // Watch from the grandparent (2 levels up) so sibling directories are covered.
        // e.g., if photo is in D:\Photos\Trip\IMG.CR3, watch D:\Photos\ recursively,
        // catching D:\Photos\processed\, D:\Photos\output\, etc.
        let watch_root = parent_dir
            .parent()
            .and_then(|gp| gp.parent())
            .map(|ggp| ggp.to_path_buf())
            .unwrap_or_else(|| parent_dir.clone());

        let base_filename = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        // Look up trip_id and dive_id from DB
        let (trip_id, dive_id) = match self.db_pool.get() {
            Ok(conn) => {
                let db = Db::new(&*conn);
                match db.get_photo(photo_id) {
                    Ok(Some(photo)) => (photo.trip_id, photo.dive_id),
                    _ => {
                        log::warn!("Cannot watch: photo {} not found in DB", photo_id);
                        return;
                    }
                }
            }
            Err(e) => {
                log::warn!("Cannot watch: DB error: {}", e);
                return;
            }
        };

        let now_instant = Instant::now();
        let now_system = SystemTime::now();

        let watched = WatchedPhoto {
            photo_id,
            base_filename: base_filename.clone(),
            original_path: file_path.to_string(),
            trip_id,
            dive_id,
            started_at: now_instant,
            launched_at: now_system,
        };

        let mut state = self.state.lock().unwrap();

        // Add to watched directories (keyed by the watch root)
        let already_watching = state.directories.contains_key(&watch_root);
        state
            .directories
            .entry(watch_root.clone())
            .or_insert_with(Vec::new)
            .push(watched.clone());

        // Start watching this directory if not already
        if !already_watching {
            self.ensure_watcher_running(&mut state);
            if let Some(ref mut watcher) = state.watcher {
                match watcher.watch(&watch_root, RecursiveMode::Recursive) {
                    Ok(()) => log::info!(
                        "Watching directory tree for processed files: {} (for photo in {})",
                        watch_root.display(),
                        parent_dir.display()
                    ),
                    Err(e) => log::warn!("Failed to watch directory {}: {}", watch_root.display(), e),
                }
            }
        }

        // Drop the lock before spawning the monitoring thread
        drop(state);

        log::info!(
            "Monitoring for processed versions of photo {} (watching: {})",
            photo_id,
            watch_root.display()
        );

        // If we have the editor's Child handle, spawn a thread to monitor it.
        // When the editor exits, do a broad scan to find the saved file.
        if let Some(child) = editor_process {
            let db_pool = self.db_pool.clone();
            let app_handle = self.app_handle.clone();
            let watched_clone = watched;
            let photo_dir = parent_dir;

            std::thread::spawn(move || {
                let mut child = child;
                log::info!(
                    "Monitoring editor process (PID {:?}) for photo {}",
                    child.id(),
                    watched_clone.photo_id
                );

                // Wait for the editor process to exit
                match child.wait() {
                    Ok(status) => {
                        log::info!(
                            "Editor process exited ({}) for photo {}",
                            status,
                            watched_clone.photo_id
                        );
                        // Give the OS a moment to flush file buffers
                        std::thread::sleep(Duration::from_secs(1));

                        // Broad scan: search progressively wider areas
                        broad_scan_for_new_files(
                            &photo_dir,
                            &watched_clone,
                            &db_pool,
                            &app_handle,
                        );
                    }
                    Err(e) => {
                        log::warn!("Failed to wait on editor process: {}", e);
                    }
                }
            });
        }
    }

    /// Initialize the filesystem watcher if not already running.
    fn ensure_watcher_running(&self, state: &mut WatchState) {
        if state.watcher.is_some() {
            return;
        }

        let state_clone = Arc::clone(&self.state);
        let db_pool = self.db_pool.clone();
        let app_handle = self.app_handle.clone();

        let watcher_result = RecommendedWatcher::new(
            move |result: Result<Event, notify::Error>| {
                match result {
                    Ok(event) => {
                        handle_fs_event(event, &state_clone, &db_pool, &app_handle);
                    }
                    Err(e) => {
                        log::warn!("File watcher error: {}", e);
                    }
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        );

        match watcher_result {
            Ok(w) => {
                state.watcher = Some(w);
                log::info!("File watcher initialized");
            }
            Err(e) => {
                log::error!("Failed to create file watcher: {}", e);
            }
        }
    }

    /// Stop watching a specific directory.
    pub fn unwatch_directory(&self, dir: &Path) {
        let mut state = self.state.lock().unwrap();
        state.directories.remove(dir);
        if let Some(ref mut watcher) = state.watcher {
            let _ = watcher.unwatch(dir);
        }
        // Clean up pending files for this dir and any subdirectories
        state.pending_files.retain(|path, _| {
            !path.starts_with(dir)
        });
        log::info!("Stopped watching directory: {}", dir.display());
    }

    /// Clean up expired watches (called periodically or on new watch).
    pub fn cleanup_expired(&self) {
        let mut state = self.state.lock().unwrap();
        let timeout = Duration::from_secs(WATCH_TIMEOUT_SECS);
        let now = Instant::now();

        let expired_dirs: Vec<PathBuf> = state
            .directories
            .iter()
            .filter(|(_, photos)| {
                photos.iter().all(|p| now.duration_since(p.started_at) > timeout)
            })
            .map(|(dir, _)| dir.clone())
            .collect();

        for dir in expired_dirs {
            state.directories.remove(&dir);
            if let Some(ref mut watcher) = state.watcher {
                let _ = watcher.unwatch(&dir);
            }
            log::info!("Watch expired for directory: {}", dir.display());
        }

        // If no more directories, drop the watcher
        if state.directories.is_empty() {
            state.watcher = None;
            state.pending_files.clear();
            log::info!("All watches expired, watcher stopped");
        }
    }
}

/// Handle a filesystem event from the watcher.
fn handle_fs_event(
    event: Event,
    state: &Arc<Mutex<WatchState>>,
    db_pool: &DbPool,
    app_handle: &tauri::AppHandle,
) {
    // We care about file creation and modification
    let dominated = matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Modify(_)
    );
    if !dominated {
        return;
    }

    for path in &event.paths {
        // Only process files with processed-file extensions
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        if !PROCESSED_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }

        // Skip RAW files (shouldn't match, but be safe)
        if RAW_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }

        let file_base = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        // Check if this file matches any watched photo's base filename.
        // The file may be in a subdirectory of the watched directory (e.g. a "processed" folder),
        // so we check all watched directories to see if any is an ancestor of this file's location.
        let mut state_guard = state.lock().unwrap();
        let watched_photos: Vec<WatchedPhoto> = state_guard
            .directories
            .iter()
            .filter(|(watched_dir, _)| {
                // Match if the file lives in the watched dir or any subdirectory of it
                path.starts_with(watched_dir)
            })
            .flat_map(|(_, photos)| photos.clone())
            .collect();

        if watched_photos.is_empty() {
            continue;
        }

        let matching: Vec<WatchedPhoto> = watched_photos
            .iter()
            .filter(|wp| {
                // Match if the new file's base name starts with the RAW's base name
                // This handles cases like: IMG_1234.CR3 → IMG_1234.tif, IMG_1234_edit.tif, etc.
                file_base.starts_with(&wp.base_filename)
                    // But the new file shouldn't BE the original (same base, different ext is fine)
                    && path.to_str().map(|s| s.to_lowercase()) != Some(wp.base_filename.clone())
            })
            .cloned()
            .collect();

        if matching.is_empty() {
            continue;
        }

        // Debounce: record this event, process after DEBOUNCE_SECS
        let now = Instant::now();
        let previously_pending = state_guard.pending_files.contains_key(path);
        state_guard.pending_files.insert(path.clone(), now);

        if previously_pending {
            // Already scheduled — the debounce timer will pick up the latest timestamp
            continue;
        }

        // Spawn a thread to process after debounce
        let path_clone = path.clone();
        let state_clone = Arc::clone(state);
        let db_pool_clone = db_pool.clone();
        let app_handle_clone = app_handle.clone();
        let matching_clone = matching;

        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(DEBOUNCE_SECS));

            // Check if we should still process (file might have been updated again)
            {
                let mut sg = state_clone.lock().unwrap();
                if let Some(&event_time) = sg.pending_files.get(&path_clone) {
                    if event_time.elapsed() < Duration::from_secs(DEBOUNCE_SECS) {
                        // Another event came in; let that debounce handle it
                        return;
                    }
                    sg.pending_files.remove(&path_clone);
                } else {
                    return; // Already processed or cleaned up
                }
            }

            // Verify the file still exists and has a reasonable size
            let file_meta = match std::fs::metadata(&path_clone) {
                Ok(m) => m,
                Err(_) => return,
            };
            if file_meta.len() < 1024 {
                return; // Too small, probably not a real saved file
            }

            // Process: import each matching photo's processed version
            for watched in &matching_clone {
                import_processed_file(
                    &path_clone,
                    watched,
                    &db_pool_clone,
                    &app_handle_clone,
                );
            }
        });
    }
}

/// Import a newly detected processed file, linking it to the original RAW.
fn import_processed_file(
    file_path: &Path,
    watched: &WatchedPhoto,
    db_pool: &DbPool,
    app_handle: &tauri::AppHandle,
) {
    let conn = match db_pool.get() {
        Ok(c) => c,
        Err(e) => {
            log::error!("DB pool error during auto-import: {}", e);
            return;
        }
    };
    let db = Db::new(&*conn);

    let file_path_str = match file_path.to_str() {
        Some(s) => s.to_string(),
        None => return,
    };

    // Check if this file is already in the database
    if let Ok(Some(_existing)) = db.find_photo_by_path(&file_path_str) {
        log::info!("File already imported, skipping: {}", file_path_str);
        return;
    }

    // Scan the file for EXIF data
    let scanned = match photos::scan_single_file(file_path) {
        Some(p) => p,
        None => {
            log::warn!("Could not scan file: {}", file_path_str);
            return;
        }
    };

    let filename = file_path
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Insert as a processed photo linked to the original
    let new_photo_id = match db.insert_photo_full(
        watched.trip_id,
        watched.dive_id,
        &file_path_str,
        &filename,
        scanned.capture_time.as_deref(),
        scanned.camera_make.as_deref(),
        scanned.camera_model.as_deref(),
        scanned.lens_info.as_deref(),
        scanned.focal_length_mm,
        scanned.aperture,
        scanned.shutter_speed.as_deref(),
        scanned.iso,
        scanned.file_size_bytes,
        true, // is_processed
        Some(watched.photo_id), // raw_photo_id
        scanned.exposure_compensation,
        scanned.white_balance.as_deref(),
        scanned.flash_fired,
        scanned.metering_mode.as_deref(),
        scanned.gps_latitude,
        scanned.gps_longitude,
    ) {
        Ok(id) => id,
        Err(e) => {
            log::error!("Failed to insert processed photo: {}", e);
            return;
        }
    };

    log::info!(
        "Auto-imported processed file {} (id={}) linked to RAW photo {}",
        filename,
        new_photo_id,
        watched.photo_id
    );

    // Generate thumbnail for the processed file
    if let Some(thumb_path) = photos::generate_thumbnail(file_path, new_photo_id) {
        let _ = db.update_photo_thumbnail(new_photo_id, &thumb_path);
    }

    // Copy rating from the original RAW photo
    if let Ok(Some(raw_photo)) = db.get_photo(watched.photo_id) {
        if let Some(rating) = raw_photo.rating {
            if rating > 0 {
                let _ = db.update_photo_rating(new_photo_id, rating);
            }
        }
    }

    // Copy species tags from the original
    if let Ok(species_tags) = db.get_species_tags_for_photo(watched.photo_id) {
        for tag in &species_tags {
            let _ = db.add_species_tag_to_photos(&[new_photo_id], tag.id);
        }
    }

    // Copy general tags from the original
    if let Ok(general_tags) = db.get_general_tags_for_photo(watched.photo_id) {
        for tag in &general_tags {
            let _ = db.add_general_tag_to_photos(&[new_photo_id], tag.id);
        }
    }

    // Write XMP sidecar for the new processed file
    metadata::write_xmp_sidecar_for_photo(&db, new_photo_id);

    // Emit event to frontend so it can refresh
    use tauri::Emitter;
    let _ = app_handle.emit(
        "processed-file-imported",
        ProcessedFileImported {
            photo_id: new_photo_id,
            raw_photo_id: watched.photo_id,
            file_path: file_path_str,
            filename,
            trip_id: watched.trip_id,
            dive_id: watched.dive_id,
        },
    );
}

/// Progressive broad scan after the editor exits.
///
/// Searches for matching processed files across increasingly wider areas:
/// 1. The photo's own directory tree (fast, most common)
/// 2. Up the directory hierarchy (grandparent, great-grandparent, etc.)
/// 3. The entire drive/volume root (catches saves anywhere on the same drive)
/// 4. User directories (Pictures, Documents, Downloads, Desktop)
///
/// Stops expanding once a match is found. Time-limited to avoid hanging.
fn broad_scan_for_new_files(
    photo_dir: &Path,
    watched: &WatchedPhoto,
    db_pool: &DbPool,
    app_handle: &tauri::AppHandle,
) {
    let deadline = Instant::now() + Duration::from_secs(SCAN_TIMEOUT_SECS);
    let mut found = Vec::new();
    let mut scanned = HashSet::new();

    log::info!(
        "Post-exit scan: looking for processed files matching '{}' (photo {}) — time limit {}s",
        watched.base_filename,
        watched.photo_id,
        SCAN_TIMEOUT_SECS,
    );

    // Phase 1: Walk up from the photo's directory, expanding the scan radius
    // at each level. This covers the same dir, sibling dirs, parent dirs, etc.
    let mut current = photo_dir.to_path_buf();
    loop {
        if Instant::now() > deadline {
            log::info!("Post-exit scan: time limit reached during directory walk-up");
            break;
        }

        if !scanned.contains(&current) {
            log::info!("Post-exit scan: scanning {}", current.display());
            walk_directory_for_matches(&current, watched, &mut found, &scanned, deadline);
            scanned.insert(current.clone());
        }

        if !found.is_empty() {
            log::info!("Post-exit scan: found match in {}", current.display());
            break;
        }

        // Move up one level. Stop at the drive/volume root.
        match current.parent() {
            Some(parent) if parent != current => {
                current = parent.to_path_buf();
            }
            _ => break, // Reached root
        }
    }

    // Phase 2: If still not found, check user directories on other drives
    if found.is_empty() && Instant::now() < deadline {
        let user_dirs = get_user_directories();
        for dir in &user_dirs {
            if Instant::now() > deadline {
                break;
            }
            // Skip if we already scanned this dir (it's under the same drive)
            if scanned.iter().any(|s| dir.starts_with(s)) {
                continue;
            }
            log::info!("Post-exit scan: checking user directory {}", dir.display());
            walk_directory_for_matches(dir, watched, &mut found, &scanned, deadline);
            scanned.insert(dir.clone());
            if !found.is_empty() {
                break;
            }
        }
    }

    // Import whatever we found
    if found.is_empty() {
        log::info!("Post-exit scan: no matching files found for photo {}", watched.photo_id);
    } else {
        log::info!(
            "Post-exit scan: found {} file(s) for photo {}",
            found.len(),
            watched.photo_id
        );
        for file_path in &found {
            import_processed_file(file_path, watched, db_pool, app_handle);
        }
    }
}

/// Get user directories that might contain saved photos.
fn get_user_directories() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(d) = dirs::picture_dir() { dirs.push(d); }
    if let Some(d) = dirs::document_dir() { dirs.push(d); }
    if let Some(d) = dirs::download_dir() { dirs.push(d); }
    if let Some(d) = dirs::desktop_dir() { dirs.push(d); }
    dirs
}

/// Check if a directory name should be skipped during broad scanning.
fn should_skip_dir(dir_name: &str) -> bool {
    let lower = dir_name.to_lowercase();
    SKIP_DIRS.iter().any(|&skip| lower == skip)
}

/// Recursively walk a directory looking for processed files that:
/// - Have a processed-file extension (tiff, psd, jpg, etc.)
/// - Have a base filename that starts with the watched photo's base filename
/// - Were created or modified after the editor was launched
///
/// Respects a deadline and skips irrelevant system directories.
fn walk_directory_for_matches(
    dir: &Path,
    watched: &WatchedPhoto,
    results: &mut Vec<PathBuf>,
    already_scanned: &HashSet<PathBuf>,
    deadline: Instant,
) {
    if Instant::now() > deadline {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if Instant::now() > deadline {
            return;
        }

        let path = entry.path();

        if path.is_dir() {
            // Skip system/irrelevant directories
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if should_skip_dir(name) {
                    continue;
                }
                // Skip hidden directories (starting with .)
                if name.starts_with('.') {
                    continue;
                }
            }
            // Skip if we've already scanned this exact directory in a prior phase
            if already_scanned.contains(&path) {
                continue;
            }
            walk_directory_for_matches(&path, watched, results, already_scanned, deadline);
            continue;
        }

        if !path.is_file() {
            continue;
        }

        // Check extension
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        if !PROCESSED_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }

        // Check base filename matches
        let file_base = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !file_base.starts_with(&watched.base_filename) {
            continue;
        }

        // Don't match the original file itself
        if let Some(path_str) = path.to_str() {
            if path_str.eq_ignore_ascii_case(&watched.original_path) {
                continue;
            }
        }

        // Check if the file was modified after the editor was launched
        if let Ok(meta) = path.metadata() {
            let file_time = meta.modified().ok().or_else(|| meta.created().ok());
            if let Some(ft) = file_time {
                if ft >= watched.launched_at {
                    // File size sanity check
                    if meta.len() >= 1024 {
                        log::info!(
                            "Post-exit scan: found matching file: {}",
                            path.display()
                        );
                        results.push(path);
                    }
                }
            }
        }
    }
}
