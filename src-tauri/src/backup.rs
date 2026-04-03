//! Backup & Restore for Pelagic.
//!
//! A backup is a zip archive containing:
//!   - `pelagic.db`       – the full SQLite database
//!   - `thumbnails/`      – all cached thumbnail JPEGs
//!   - `manifest.json`    – metadata (app version, date, counts)
//!
//! Photo originals are NOT included (they live on the user's filesystem and
//! are referenced by absolute path in the database). This keeps backups small.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use zip::write::FileOptions;
use zip::CompressionMethod;

use crate::db::Database;
use crate::photos::get_thumbnails_dir;

/// Metadata written into the backup zip as `manifest.json`.
#[derive(Debug, Serialize, Deserialize)]
pub struct BackupManifest {
    pub app_version: String,
    pub created_at: String,
    pub db_size_bytes: u64,
    pub thumbnail_count: u32,
}

/// Information returned to the frontend after a successful backup.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupResult {
    pub path: String,
    pub size_bytes: u64,
    pub thumbnail_count: u32,
}

/// Information returned to the frontend after a successful restore.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RestoreResult {
    pub thumbnails_restored: u32,
}

/// Create a backup zip at the given destination path.
pub fn create_backup(dest_path: &Path) -> Result<BackupResult, String> {
    let db_path = Database::get_db_path();
    let thumb_dir = get_thumbnails_dir();

    if !db_path.exists() {
        return Err("Database file not found. Nothing to back up.".into());
    }

    // Force a WAL checkpoint so all data is in the main DB file.
    // We open a temporary connection just for this.
    {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database for checkpoint: {}", e))?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| format!("Failed to checkpoint WAL: {}", e))?;
    }

    let db_meta = fs::metadata(&db_path)
        .map_err(|e| format!("Cannot read database file: {}", e))?;

    let file = fs::File::create(dest_path)
        .map_err(|e| format!("Cannot create backup file: {}", e))?;

    let mut zip = zip::ZipWriter::new(file);
    let options = FileOptions::<()>::default().compression_method(CompressionMethod::Deflated);

    // 1. Add database
    zip.start_file("pelagic.db", options)
        .map_err(|e| format!("Zip error: {}", e))?;
    let db_bytes = fs::read(&db_path)
        .map_err(|e| format!("Cannot read database: {}", e))?;
    zip.write_all(&db_bytes)
        .map_err(|e| format!("Zip write error: {}", e))?;

    // 2. Add thumbnails
    let mut thumb_count: u32 = 0;
    if thumb_dir.exists() {
        if let Ok(entries) = fs::read_dir(&thumb_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        let archive_name = format!("thumbnails/{}", name);
                        zip.start_file(&archive_name, options)
                            .map_err(|e| format!("Zip error: {}", e))?;
                        let bytes = fs::read(&path)
                            .map_err(|e| format!("Cannot read thumbnail {}: {}", name, e))?;
                        zip.write_all(&bytes)
                            .map_err(|e| format!("Zip write error: {}", e))?;
                        thumb_count += 1;
                    }
                }
            }
        }
    }

    // 3. Add manifest
    let manifest = BackupManifest {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: Utc::now().to_rfc3339(),
        db_size_bytes: db_meta.len(),
        thumbnail_count: thumb_count,
    };
    zip.start_file("manifest.json", options)
        .map_err(|e| format!("Zip error: {}", e))?;
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("JSON error: {}", e))?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| format!("Zip write error: {}", e))?;

    zip.finish()
        .map_err(|e| format!("Failed to finalize zip: {}", e))?;

    let zip_size = fs::metadata(dest_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(BackupResult {
        path: dest_path.to_string_lossy().to_string(),
        size_bytes: zip_size,
        thumbnail_count: thumb_count,
    })
}

/// Read the manifest from a backup zip without extracting everything.
pub fn read_backup_manifest(zip_path: &Path) -> Result<BackupManifest, String> {
    let file = fs::File::open(zip_path)
        .map_err(|e| format!("Cannot open backup file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid backup file: {}", e))?;

    let mut manifest_file = archive.by_name("manifest.json")
        .map_err(|_| "Backup file is missing manifest.json — not a valid Pelagic backup.".to_string())?;

    let mut contents = String::new();
    manifest_file.read_to_string(&mut contents)
        .map_err(|e| format!("Cannot read manifest: {}", e))?;

    serde_json::from_str(&contents)
        .map_err(|e| format!("Invalid manifest: {}", e))
}

/// Restore from a backup zip, replacing the current database and thumbnails.
///
/// **Important**: The caller must ensure the database pool is not in active use.
/// After restore, the app should be restarted so the pool reconnects to the new DB.
pub fn restore_backup(zip_path: &Path) -> Result<RestoreResult, String> {
    // Validate it's a real Pelagic backup first
    let _manifest = read_backup_manifest(zip_path)?;

    let db_path = Database::get_db_path();
    let thumb_dir = get_thumbnails_dir();

    let file = fs::File::open(zip_path)
        .map_err(|e| format!("Cannot open backup file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid backup file: {}", e))?;

    // Verify the archive contains a database
    archive.by_name("pelagic.db")
        .map_err(|_| "Backup file does not contain a database.".to_string())?;

    // Back up the current DB to a .bak file (safety net)
    if db_path.exists() {
        let bak_path = db_path.with_extension("db.bak");
        fs::copy(&db_path, &bak_path)
            .map_err(|e| format!("Failed to create safety backup of current database: {}", e))?;

        // Also remove WAL/SHM files so the restored DB starts clean
        let wal_path = db_path.with_extension("db-wal");
        let shm_path = db_path.with_extension("db-shm");
        let _ = fs::remove_file(&wal_path);
        let _ = fs::remove_file(&shm_path);
    }

    let mut thumb_count: u32 = 0;

    // Re-open the archive (we consumed it during validation)
    let file = fs::File::open(zip_path)
        .map_err(|e| format!("Cannot open backup file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid backup file: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| format!("Zip read error: {}", e))?;

        let entry_name = entry.name().to_string();

        if entry_name == "pelagic.db" {
            // Extract database
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)
                .map_err(|e| format!("Failed to read database from backup: {}", e))?;
            fs::write(&db_path, &buf)
                .map_err(|e| format!("Failed to write database: {}", e))?;
        } else if let Some(thumb_name) = entry_name.strip_prefix("thumbnails/") {
            if !thumb_name.is_empty() {
                // Validate filename doesn't contain path traversal
                if thumb_name.contains("..") || thumb_name.contains('/') || thumb_name.contains('\\') {
                    continue;
                }
                let dest = thumb_dir.join(thumb_name);
                let mut buf = Vec::new();
                entry.read_to_end(&mut buf)
                    .map_err(|e| format!("Failed to read thumbnail from backup: {}", e))?;
                fs::write(&dest, &buf)
                    .map_err(|e| format!("Failed to write thumbnail: {}", e))?;
                thumb_count += 1;
            }
        }
        // manifest.json and anything else is ignored during extract
    }

    Ok(RestoreResult {
        thumbnails_restored: thumb_count,
    })
}
