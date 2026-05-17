use crate::{photos, AppState, DbPool};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, State};

const DEFAULT_PROXY_QUALITY: u8 = 92;
const DEFAULT_PROXY_MAX_DIMENSION: u32 = 6000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveDestinationValidation {
    pub root_path: String,
    pub exists: bool,
    pub is_directory: bool,
    pub writable: bool,
    pub available: bool,
    pub destination_kind: String,
    pub free_space_bytes: Option<i64>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoArchivePreviewFile {
    pub photo_id: i64,
    pub filename: String,
    pub source_path: String,
    pub target_path: Option<String>,
    pub file_size_bytes: i64,
    pub status: String,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoArchivePreview {
    pub scope_type: String,
    pub scope_id: Option<i64>,
    pub total_raw_count: i64,
    pub online_raw_count: i64,
    pub already_archived_count: i64,
    pub missing_count: i64,
    pub total_raw_bytes: i64,
    pub estimated_proxy_bytes: Option<i64>,
    pub destination: ArchiveDestinationValidation,
    pub files: Vec<PhotoArchivePreviewFile>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoArchiveProgress {
    pub current: i64,
    pub total: i64,
    pub phase: String,
    pub filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoArchiveResult {
    pub job_id: Option<i64>,
    pub archived_count: i64,
    pub skipped_count: i64,
    pub failed_count: i64,
    pub bytes_archived: i64,
    pub proxy_bytes: i64,
    pub bytes_saved: i64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoArchiveState {
    pub photo_id: i64,
    pub raw_archive_status: String,
    pub raw_original_path: Option<String>,
    pub raw_archive_path: Option<String>,
    pub raw_archive_destination_id: Option<i64>,
    pub display_proxy_path: Option<String>,
    pub display_proxy_size_bytes: Option<i64>,
    pub raw_sha256: Option<String>,
    pub archive_available: bool,
    pub destination_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoArchiveRestoreResult {
    pub photo_id: i64,
    pub restored_path: String,
}

#[derive(Debug, Clone)]
struct ArchiveCandidate {
    id: i64,
    file_path: String,
    filename: String,
    file_size_bytes: i64,
    raw_archive_status: String,
    trip_name: String,
    trip_date_start: String,
    dive_number: Option<i32>,
}

#[tauri::command]
pub fn validate_archive_destination(
    destination_root: String,
) -> Result<ArchiveDestinationValidation, String> {
    Ok(validate_destination(&destination_root))
}

#[tauri::command]
pub fn preview_photo_archive(
    state: State<AppState>,
    scope_type: String,
    scope_id: Option<i64>,
    photo_ids: Option<Vec<i64>>,
    destination_root: String,
) -> Result<PhotoArchivePreview, String> {
    let conn = state
        .db
        .get()
        .map_err(|e| format!("Database error: {}", e))?;
    let candidates = load_candidates(&conn, &scope_type, scope_id, photo_ids)?;
    build_preview(&scope_type, scope_id, &destination_root, candidates)
}

#[tauri::command]
pub async fn archive_photos(
    window: tauri::Window,
    state: State<'_, AppState>,
    scope_type: String,
    scope_id: Option<i64>,
    photo_ids: Option<Vec<i64>>,
    destination_root: String,
    move_raws: Option<bool>,
    proxy_quality: Option<u8>,
    proxy_max_dimension: Option<u32>,
) -> Result<PhotoArchiveResult, String> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        archive_photos_inner(
            window,
            pool,
            scope_type,
            scope_id,
            photo_ids,
            destination_root,
            move_raws.unwrap_or(true),
            proxy_quality.unwrap_or(DEFAULT_PROXY_QUALITY),
            proxy_max_dimension.or(Some(DEFAULT_PROXY_MAX_DIMENSION)),
        )
    })
    .await
    .map_err(|e| format!("Archive task failed: {}", e))?
}

#[tauri::command]
pub fn get_photo_archive_state(
    state: State<AppState>,
    photo_id: i64,
) -> Result<Option<PhotoArchiveState>, String> {
    let conn = state
        .db
        .get()
        .map_err(|e| format!("Database error: {}", e))?;
    get_archive_state(&conn, photo_id)
}

#[tauri::command]
pub async fn restore_archived_photo(
    state: State<'_, AppState>,
    photo_id: i64,
    restore_path: Option<String>,
) -> Result<PhotoArchiveRestoreResult, String> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || restore_archived_photo_inner(pool, photo_id, restore_path))
        .await
        .map_err(|e| format!("Restore task failed: {}", e))?
}

fn archive_photos_inner(
    window: tauri::Window,
    pool: DbPool,
    scope_type: String,
    scope_id: Option<i64>,
    photo_ids: Option<Vec<i64>>,
    destination_root: String,
    move_raws: bool,
    proxy_quality: u8,
    proxy_max_dimension: Option<u32>,
) -> Result<PhotoArchiveResult, String> {
    let validation = validate_destination(&destination_root);
    if !validation.available || !validation.writable {
        return Err(validation
            .warning
            .unwrap_or_else(|| "Archive destination is not writable".to_string()));
    }

    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    let destination_id = upsert_archive_destination(&conn, &validation)?;
    let job_id = create_archive_job(
        &conn,
        &scope_type,
        scope_id,
        destination_id,
        &destination_root,
    )
    .ok();
    let candidates = load_candidates(&conn, &scope_type, scope_id, photo_ids)?;
    let total = candidates.len() as i64;
    let mut reserved_targets = HashSet::new();

    let mut archived_count = 0i64;
    let mut skipped_count = 0i64;
    let mut failed_count = 0i64;
    let mut bytes_archived = 0i64;
    let mut proxy_bytes = 0i64;
    let mut errors = Vec::new();

    for (index, candidate) in candidates.iter().enumerate() {
        emit_progress(
            &window,
            index as i64 + 1,
            total,
            "preparing",
            Some(&candidate.filename),
        );

        if candidate.raw_archive_status == "archived" {
            skipped_count += 1;
            continue;
        }

        let source_path = PathBuf::from(&candidate.file_path);
        if !source_path.exists() {
            failed_count += 1;
            errors.push(format!("Source file missing: {}", candidate.file_path));
            continue;
        }

        let target_path = target_path_for_candidate(
            Path::new(&destination_root),
            candidate,
            &mut reserved_targets,
        );
        if let Some(parent) = target_path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                failed_count += 1;
                errors.push(format!(
                    "Failed to create archive folder for {}: {}",
                    candidate.filename, e
                ));
                continue;
            }
        }

        emit_progress(
            &window,
            index as i64 + 1,
            total,
            "proxy",
            Some(&candidate.filename),
        );
        let (proxy_path, proxy_size) = match photos::generate_archive_proxy(
            &source_path,
            candidate.id,
            proxy_quality,
            proxy_max_dimension,
        ) {
            Ok(proxy) => proxy,
            Err(e) => {
                failed_count += 1;
                errors.push(format!(
                    "Failed to create proxy for {}: {}",
                    candidate.filename, e
                ));
                continue;
            }
        };

        emit_progress(
            &window,
            index as i64 + 1,
            total,
            "hashing",
            Some(&candidate.filename),
        );
        let source_hash = match sha256_file(&source_path) {
            Ok(hash) => hash,
            Err(e) => {
                failed_count += 1;
                errors.push(format!("Failed to hash {}: {}", candidate.filename, e));
                continue;
            }
        };

        emit_progress(
            &window,
            index as i64 + 1,
            total,
            "copying",
            Some(&candidate.filename),
        );
        if let Err(e) = fs::copy(&source_path, &target_path) {
            failed_count += 1;
            errors.push(format!("Failed to copy {}: {}", candidate.filename, e));
            continue;
        }

        let copied_size = fs::metadata(&target_path)
            .map(|m| m.len() as i64)
            .unwrap_or(0);
        if copied_size != candidate.file_size_bytes {
            failed_count += 1;
            let _ = fs::remove_file(&target_path);
            errors.push(format!(
                "Copied size mismatch for {}: expected {} bytes, got {} bytes",
                candidate.filename, candidate.file_size_bytes, copied_size
            ));
            continue;
        }

        emit_progress(
            &window,
            index as i64 + 1,
            total,
            "verifying",
            Some(&candidate.filename),
        );
        let target_hash = match sha256_file(&target_path) {
            Ok(hash) => hash,
            Err(e) => {
                failed_count += 1;
                errors.push(format!(
                    "Failed to verify copied {}: {}",
                    candidate.filename, e
                ));
                continue;
            }
        };
        if target_hash != source_hash {
            failed_count += 1;
            let _ = fs::remove_file(&target_path);
            errors.push(format!(
                "Hash mismatch after copying {}",
                candidate.filename
            ));
            continue;
        }

        let target_path_string = target_path.to_string_lossy().to_string();
        update_photo_archived(
            &conn,
            candidate.id,
            &proxy_path,
            proxy_size,
            &candidate.file_path,
            &target_path_string,
            destination_id,
            &source_hash,
        )?;

        if move_raws {
            emit_progress(
                &window,
                index as i64 + 1,
                total,
                "removing-local",
                Some(&candidate.filename),
            );
            if let Err(e) = fs::remove_file(&source_path) {
                errors.push(format!(
                    "Archived {}, but could not remove local RAW: {}",
                    candidate.filename, e
                ));
            }
        }

        archived_count += 1;
        bytes_archived += candidate.file_size_bytes;
        proxy_bytes += proxy_size;
    }

    let bytes_saved = if move_raws {
        (bytes_archived - proxy_bytes).max(0)
    } else {
        0
    };

    if let Some(id) = job_id {
        let status = if failed_count > 0 {
            "completed_with_errors"
        } else {
            "completed"
        };
        let error_text = if errors.is_empty() {
            None
        } else {
            Some(errors.join("\n"))
        };
        let _ = update_archive_job_complete(
            &conn,
            id,
            status,
            bytes_archived,
            proxy_bytes,
            bytes_saved,
            error_text.as_deref(),
        );
    }

    emit_progress(&window, total, total, "complete", None);

    Ok(PhotoArchiveResult {
        job_id,
        archived_count,
        skipped_count,
        failed_count,
        bytes_archived,
        proxy_bytes,
        bytes_saved,
        errors,
    })
}

fn restore_archived_photo_inner(
    pool: DbPool,
    photo_id: i64,
    restore_path: Option<String>,
) -> Result<PhotoArchiveRestoreResult, String> {
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    let state = get_archive_state(&conn, photo_id)?
        .ok_or_else(|| format!("Photo {} not found", photo_id))?;
    let archive_path = state
        .raw_archive_path
        .clone()
        .ok_or_else(|| "Photo does not have an archive path".to_string())?;
    let archive_path_buf = PathBuf::from(&archive_path);
    if !archive_path_buf.exists() {
        return Err(
            "Archive file is not available. Connect the archive location or relink the file first."
                .to_string(),
        );
    }

    let restore_target = restore_path
        .or(state.raw_original_path.clone())
        .ok_or_else(|| "No restore path available".to_string())?;
    let restore_target_buf = PathBuf::from(&restore_target);
    if let Some(parent) = restore_target_buf.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create restore folder: {}", e))?;
    }

    if restore_target_buf.exists() {
        let existing_hash = sha256_file(&restore_target_buf)?;
        if state.raw_sha256.as_deref() != Some(existing_hash.as_str()) {
            return Err(format!(
                "Restore target already exists and does not match archive hash: {}",
                restore_target
            ));
        }
    } else {
        fs::copy(&archive_path_buf, &restore_target_buf)
            .map_err(|e| format!("Failed to restore RAW: {}", e))?;
    }

    if let Some(expected_hash) = state.raw_sha256.as_deref() {
        let restored_hash = sha256_file(&restore_target_buf)?;
        if restored_hash != expected_hash {
            return Err("Restored RAW hash did not match archived RAW".to_string());
        }
    }

    conn.execute(
        "UPDATE photos
         SET file_path = ?, raw_original_path = ?, raw_archive_status = 'online', updated_at = datetime('now')
         WHERE id = ?",
        params![restore_target.as_str(), restore_target.as_str(), photo_id],
    )
    .map_err(|e| format!("Failed to update restored photo: {}", e))?;

    Ok(PhotoArchiveRestoreResult {
        photo_id,
        restored_path: restore_target,
    })
}

fn build_preview(
    scope_type: &str,
    scope_id: Option<i64>,
    destination_root: &str,
    candidates: Vec<ArchiveCandidate>,
) -> Result<PhotoArchivePreview, String> {
    let destination = validate_destination(destination_root);
    let mut files = Vec::new();
    let mut reserved_targets = HashSet::new();
    let mut online_raw_count = 0i64;
    let mut already_archived_count = 0i64;
    let mut missing_count = 0i64;
    let mut total_raw_bytes = 0i64;
    let mut warnings = Vec::new();

    if let Some(warning) = destination.warning.clone() {
        warnings.push(warning);
    }

    for candidate in &candidates {
        total_raw_bytes += candidate.file_size_bytes;
        let source_path = PathBuf::from(&candidate.file_path);
        let mut status = "ready".to_string();
        let mut warning = None;
        let mut target_path = None;

        if candidate.raw_archive_status == "archived" {
            status = "already_archived".to_string();
            already_archived_count += 1;
        } else if !source_path.exists() {
            status = "missing".to_string();
            missing_count += 1;
            warning = Some("Source RAW is missing".to_string());
        } else {
            online_raw_count += 1;
            target_path = Some(
                target_path_for_candidate(
                    Path::new(destination_root),
                    candidate,
                    &mut reserved_targets,
                )
                .to_string_lossy()
                .to_string(),
            );
        }

        files.push(PhotoArchivePreviewFile {
            photo_id: candidate.id,
            filename: candidate.filename.clone(),
            source_path: candidate.file_path.clone(),
            target_path,
            file_size_bytes: candidate.file_size_bytes,
            status,
            warning,
        });
    }

    if destination.destination_kind == "cloud_sync" {
        warnings.push("Cloud-sync destinations are verified locally. Pelagic cannot confirm provider upload completion.".to_string());
    }

    Ok(PhotoArchivePreview {
        scope_type: scope_type.to_string(),
        scope_id,
        total_raw_count: candidates.len() as i64,
        online_raw_count,
        already_archived_count,
        missing_count,
        total_raw_bytes,
        estimated_proxy_bytes: Some((total_raw_bytes as f64 * 0.12) as i64),
        destination,
        files,
        warnings,
    })
}

fn load_candidates(
    conn: &Connection,
    scope_type: &str,
    scope_id: Option<i64>,
    photo_ids: Option<Vec<i64>>,
) -> Result<Vec<ArchiveCandidate>, String> {
    match scope_type {
        "trip" => {
            let id = scope_id.ok_or_else(|| "Trip archive requires scope_id".to_string())?;
            let mut stmt = conn
                .prepare(candidate_sql("p.trip_id = ?").as_str())
                .map_err(|e| format!("Failed to prepare archive query: {}", e))?;
            let rows = stmt
                .query_map(params![id], map_candidate)
                .map_err(|e| format!("Failed to query archive candidates: {}", e))?;
            collect_raw_candidates(rows)
        }
        "dive" => {
            let id = scope_id.ok_or_else(|| "Dive archive requires scope_id".to_string())?;
            let mut stmt = conn
                .prepare(candidate_sql("p.dive_id = ?").as_str())
                .map_err(|e| format!("Failed to prepare archive query: {}", e))?;
            let rows = stmt
                .query_map(params![id], map_candidate)
                .map_err(|e| format!("Failed to query archive candidates: {}", e))?;
            collect_raw_candidates(rows)
        }
        "selection" => {
            let ids =
                photo_ids.ok_or_else(|| "Selection archive requires photo_ids".to_string())?;
            if ids.is_empty() {
                return Ok(Vec::new());
            }
            let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let clause = format!("p.id IN ({})", placeholders);
            let mut stmt = conn
                .prepare(candidate_sql(&clause).as_str())
                .map_err(|e| format!("Failed to prepare archive query: {}", e))?;
            let rows = stmt
                .query_map(rusqlite::params_from_iter(ids), map_candidate)
                .map_err(|e| format!("Failed to query archive candidates: {}", e))?;
            collect_raw_candidates(rows)
        }
        other => Err(format!("Unsupported archive scope: {}", other)),
    }
}

fn candidate_sql(scope_clause: &str) -> String {
    format!(
        "SELECT p.id, p.file_path, p.filename,
                COALESCE(p.file_size_bytes, 0), COALESCE(p.raw_archive_status, 'online'),
                t.name, t.date_start, d.dive_number
         FROM photos p
         JOIN trips t ON t.id = p.trip_id
         LEFT JOIN dives d ON d.id = p.dive_id
         WHERE p.is_processed = 0 AND {}",
        scope_clause
    )
}

fn map_candidate(row: &rusqlite::Row<'_>) -> rusqlite::Result<ArchiveCandidate> {
    let file_path: String = row.get(1)?;
    let metadata_size = fs::metadata(&file_path).map(|m| m.len() as i64).ok();
    let db_size: i64 = row.get(3)?;
    Ok(ArchiveCandidate {
        id: row.get(0)?,
        file_path,
        filename: row.get(2)?,
        file_size_bytes: metadata_size.unwrap_or(db_size),
        raw_archive_status: row.get(4)?,
        trip_name: row.get(5)?,
        trip_date_start: row.get(6)?,
        dive_number: row.get(7)?,
    })
}

fn collect_raw_candidates<I>(rows: I) -> Result<Vec<ArchiveCandidate>, String>
where
    I: Iterator<Item = rusqlite::Result<ArchiveCandidate>>,
{
    let mut candidates = Vec::new();
    for row in rows {
        let candidate = row.map_err(|e| format!("Failed to read archive candidate: {}", e))?;
        if photos::is_raw_file(Path::new(&candidate.file_path)) {
            candidates.push(candidate);
        }
    }
    Ok(candidates)
}

fn validate_destination(destination_root: &str) -> ArchiveDestinationValidation {
    let path = PathBuf::from(destination_root);
    let exists = path.exists();
    let is_directory = path.is_dir();
    let destination_kind = classify_destination(destination_root);
    let mut writable = false;
    let mut warning = None;

    if !exists {
        warning = Some("Archive destination does not exist".to_string());
    } else if !is_directory {
        warning = Some("Archive destination is not a folder".to_string());
    } else {
        match write_test_file(&path) {
            Ok(()) => writable = true,
            Err(e) => warning = Some(format!("Archive destination is not writable: {}", e)),
        }
    }

    ArchiveDestinationValidation {
        root_path: destination_root.to_string(),
        exists,
        is_directory,
        writable,
        available: exists && is_directory,
        destination_kind,
        free_space_bytes: None,
        warning,
    }
}

fn write_test_file(path: &Path) -> Result<(), String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let test_path = path.join(format!(
        ".pelagic-archive-write-test-{}-{}.tmp",
        std::process::id(),
        stamp
    ));
    {
        let mut file = fs::File::create(&test_path).map_err(|e| e.to_string())?;
        file.write_all(b"pelagic archive write test")
            .map_err(|e| e.to_string())?;
    }
    fs::remove_file(&test_path).map_err(|e| e.to_string())?;
    Ok(())
}

fn classify_destination(destination_root: &str) -> String {
    let lower = destination_root.to_lowercase();
    if lower.starts_with("\\\\") || lower.starts_with("//") {
        return "network".to_string();
    }
    if lower.contains("onedrive")
        || lower.contains("dropbox")
        || lower.contains("google drive")
        || lower.contains("googledrive")
        || lower.contains("icloud")
        || lower.contains("box sync")
    {
        return "cloud_sync".to_string();
    }
    "local".to_string()
}

fn target_path_for_candidate(
    destination_root: &Path,
    candidate: &ArchiveCandidate,
    reserved_targets: &mut HashSet<PathBuf>,
) -> PathBuf {
    let trip_folder = sanitize_path_segment(&format!(
        "{} {}",
        candidate.trip_date_start, candidate.trip_name
    ));
    let dive_folder = match candidate.dive_number {
        Some(number) => sanitize_path_segment(&format!("Dive {:03}", number)),
        None => "Trip Photos".to_string(),
    };
    let target_dir = destination_root.join(trip_folder).join(dive_folder);
    unique_target_path(&target_dir, &candidate.filename, reserved_targets)
}

fn unique_target_path(
    target_dir: &Path,
    filename: &str,
    reserved_targets: &mut HashSet<PathBuf>,
) -> PathBuf {
    let safe_filename = sanitize_filename(filename);
    let base_path = target_dir.join(&safe_filename);
    if !base_path.exists() && reserved_targets.insert(base_path.clone()) {
        return base_path;
    }

    let path = Path::new(&safe_filename);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("photo");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    for index in 1..10_000 {
        let candidate_name = if ext.is_empty() {
            format!("{}-{}", stem, index)
        } else {
            format!("{}-{}.{}", stem, index, ext)
        };
        let candidate = target_dir.join(candidate_name);
        if !candidate.exists() && reserved_targets.insert(candidate.clone()) {
            return candidate;
        }
    }

    target_dir.join(format!("{}-{}", stem, unix_timestamp()))
}

fn sanitize_path_segment(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();

    if sanitized.is_empty() {
        "Archive".to_string()
    } else {
        sanitized.chars().take(120).collect()
    }
}

fn sanitize_filename(value: &str) -> String {
    let sanitized = sanitize_path_segment(value);
    if sanitized.is_empty() {
        "photo.raw".to_string()
    } else {
        sanitized
    }
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file =
        fs::File::open(path).map_err(|e| format!("Failed to open file for hash: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 1024 * 1024];
    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read file for hash: {}", e))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect())
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn upsert_archive_destination(
    conn: &Connection,
    validation: &ArchiveDestinationValidation,
) -> Result<i64, String> {
    let label = destination_label(&validation.root_path);
    conn.execute(
        "INSERT INTO archive_destinations (label, root_path, destination_kind, last_seen_at, last_verified_at, is_available, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'), ?, datetime('now'))
         ON CONFLICT(root_path) DO UPDATE SET
             destination_kind = excluded.destination_kind,
             last_seen_at = datetime('now'),
             last_verified_at = datetime('now'),
             is_available = excluded.is_available,
             updated_at = datetime('now')",
        params![
            label.as_str(),
            validation.root_path.as_str(),
            validation.destination_kind.as_str(),
            validation.available as i32,
        ],
    )
    .map_err(|e| format!("Failed to save archive destination: {}", e))?;

    conn.query_row(
        "SELECT id FROM archive_destinations WHERE root_path = ?",
        params![validation.root_path.as_str()],
        |row| row.get(0),
    )
    .map_err(|e| format!("Failed to load archive destination: {}", e))
}

fn destination_label(root_path: &str) -> String {
    Path::new(root_path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(root_path)
        .to_string()
}

fn create_archive_job(
    conn: &Connection,
    scope_type: &str,
    scope_id: Option<i64>,
    destination_id: i64,
    destination_root: &str,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO archive_jobs (scope_type, scope_id, destination_id, destination_root_snapshot, status, started_at)
         VALUES (?, ?, ?, ?, 'running', datetime('now'))",
        params![scope_type, scope_id, destination_id, destination_root],
    )
    .map_err(|e| format!("Failed to create archive job: {}", e))?;
    Ok(conn.last_insert_rowid())
}

fn update_archive_job_complete(
    conn: &Connection,
    job_id: i64,
    status: &str,
    bytes_archived: i64,
    proxy_bytes: i64,
    bytes_saved: i64,
    error: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE archive_jobs
         SET status = ?, completed_at = datetime('now'), bytes_before = ?, bytes_after = ?, bytes_saved = ?, error = ?
         WHERE id = ?",
        params![status, bytes_archived, proxy_bytes, bytes_saved, error, job_id],
    )
    .map_err(|e| format!("Failed to update archive job: {}", e))?;
    Ok(())
}

fn update_photo_archived(
    conn: &Connection,
    photo_id: i64,
    proxy_path: &str,
    proxy_size: i64,
    original_path: &str,
    archive_path: &str,
    destination_id: i64,
    sha256: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE photos
         SET display_proxy_path = ?, display_proxy_size_bytes = ?, raw_archive_status = 'archived',
             raw_original_path = COALESCE(raw_original_path, ?), raw_archive_path = ?,
             raw_archive_destination_id = ?, raw_sha256 = ?, raw_archived_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?",
        params![
            proxy_path,
            proxy_size,
            original_path,
            archive_path,
            destination_id,
            sha256,
            photo_id
        ],
    )
    .map_err(|e| format!("Failed to mark photo archived: {}", e))?;
    Ok(())
}

fn get_archive_state(
    conn: &Connection,
    photo_id: i64,
) -> Result<Option<PhotoArchiveState>, String> {
    let state = conn
        .query_row(
            "SELECT p.id, COALESCE(p.raw_archive_status, 'online'), p.raw_original_path,
                p.raw_archive_path, p.raw_archive_destination_id, p.display_proxy_path,
                p.display_proxy_size_bytes, p.raw_sha256, d.root_path
         FROM photos p
         LEFT JOIN archive_destinations d ON d.id = p.raw_archive_destination_id
         WHERE p.id = ?",
            params![photo_id],
            |row| {
                let archive_path: Option<String> = row.get(3)?;
                let destination_root: Option<String> = row.get(8)?;
                let archive_available = archive_path
                    .as_ref()
                    .map(|path| Path::new(path).exists())
                    .unwrap_or(false);
                Ok(PhotoArchiveState {
                    photo_id: row.get(0)?,
                    raw_archive_status: row.get(1)?,
                    raw_original_path: row.get(2)?,
                    raw_archive_path: archive_path,
                    raw_archive_destination_id: row.get(4)?,
                    display_proxy_path: row.get(5)?,
                    display_proxy_size_bytes: row.get(6)?,
                    raw_sha256: row.get(7)?,
                    archive_available,
                    destination_root,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to load photo archive state: {}", e))?;

    Ok(state)
}

fn emit_progress(
    window: &tauri::Window,
    current: i64,
    total: i64,
    phase: &str,
    filename: Option<&str>,
) {
    let _ = window.emit(
        "photo-archive-progress",
        PhotoArchiveProgress {
            current,
            total,
            phase: phase.to_string(),
            filename: filename.map(|value| value.to_string()),
        },
    );
}
