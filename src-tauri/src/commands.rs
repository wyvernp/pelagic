use tauri::State;
use std::path::Path;
use crate::{AppState, db::{Trip, Dive, DiveSample, Photo, TankPressure, DiveStats}, import, photos};

#[tauri::command]
pub fn get_trips(state: State<AppState>) -> Result<Vec<Trip>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_trips().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_trip(state: State<AppState>, id: i64) -> Result<Option<Trip>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_trip(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_trip(
    state: State<AppState>,
    name: String,
    location: String,
    date_start: String,
    date_end: String,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_trip(&name, &location, &date_start, &date_end)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_trip(
    state: State<AppState>,
    id: i64,
    name: String,
    location: String,
    resort: Option<String>,
    date_start: String,
    date_end: String,
    notes: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_trip(id, &name, &location, resort.as_deref(), &date_start, &date_end, notes.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_trip(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_trip(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_dive(
    state: State<AppState>,
    id: i64,
    location: Option<String>,
    ocean: Option<String>,
    visibility_m: Option<f64>,
    buddy: Option<String>,
    divemaster: Option<String>,
    guide: Option<String>,
    instructor: Option<String>,
    comments: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    is_fresh_water: bool,
    is_boat_dive: bool,
    is_drift_dive: bool,
    is_night_dive: bool,
    is_training_dive: bool,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_dive(
        id,
        location.as_deref(),
        ocean.as_deref(),
        visibility_m,
        buddy.as_deref(),
        divemaster.as_deref(),
        guide.as_deref(),
        instructor.as_deref(),
        comments.as_deref(),
        latitude,
        longitude,
        is_fresh_water,
        is_boat_dive,
        is_drift_dive,
        is_night_dive,
        is_training_dive,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_dive(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_dive(id).map_err(|e| e.to_string())
}

/// Bulk update multiple dives with only specified fields
#[tauri::command]
pub fn bulk_update_dives(
    state: State<AppState>,
    dive_ids: Vec<i64>,
    location: Option<Option<String>>,
    ocean: Option<Option<String>>,
    buddy: Option<Option<String>>,
    divemaster: Option<Option<String>>,
    guide: Option<Option<String>>,
    instructor: Option<Option<String>>,
    is_boat_dive: Option<bool>,
    is_night_dive: Option<bool>,
    is_drift_dive: Option<bool>,
    is_fresh_water: Option<bool>,
    is_training_dive: Option<bool>,
) -> Result<usize, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.bulk_update_dives(
        &dive_ids,
        location.as_ref().map(|o| o.as_deref()),
        ocean.as_ref().map(|o| o.as_deref()),
        buddy.as_ref().map(|o| o.as_deref()),
        divemaster.as_ref().map(|o| o.as_deref()),
        guide.as_ref().map(|o| o.as_deref()),
        instructor.as_ref().map(|o| o.as_deref()),
        is_boat_dive,
        is_night_dive,
        is_drift_dive,
        is_fresh_water,
        is_training_dive,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_dives_for_trip(state: State<AppState>, trip_id: i64) -> Result<Vec<Dive>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_dives_for_trip(trip_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_dive(state: State<AppState>, id: i64) -> Result<Option<Dive>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_dive(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_dive_samples(state: State<AppState>, dive_id: i64) -> Result<Vec<DiveSample>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_dive_samples(dive_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_tank_pressures(state: State<AppState>, dive_id: i64) -> Result<Vec<TankPressure>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_tank_pressures_for_dive(dive_id).map_err(|e| e.to_string())
}

/// Insert samples for a dive (from dive computer data)
#[tauri::command]
pub fn insert_dive_samples(
    state: State<AppState>,
    dive_id: i64,
    samples: Vec<DiveSample>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut count = 0i64;
    for mut sample in samples {
        sample.dive_id = dive_id;
        db.insert_dive_sample(&sample).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

#[tauri::command]
pub fn import_ssrf_file(state: State<AppState>, file_path: String, trip_id: Option<i64>) -> Result<i64, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    
    let result = import::parse_ssrf_file(path)?;
    
    let db = state.db.lock().map_err(|e| e.to_string())?;
    import::import_to_database(&db, result, trip_id)
}

/// Import dive log from any supported format (SSRF, Suunto JSON, FIT)
#[tauri::command]
pub fn import_dive_file(state: State<AppState>, file_path: String, trip_id: Option<i64>) -> Result<i64, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    
    // Auto-detect format and parse
    let result = import::parse_dive_file(path)?;
    
    let db = state.db.lock().map_err(|e| e.to_string())?;
    import::import_to_database(&db, result, trip_id)
}

/// Import dive log from file data (bytes) instead of file path
/// Used for USB storage devices where files are read via File System Access API
#[tauri::command]
pub fn import_dive_file_data(state: State<AppState>, file_name: String, file_data: Vec<u8>, trip_id: Option<i64>) -> Result<i64, String> {
    // Create a temporary file to parse the data
    use std::io::Write;
    use tempfile::NamedTempFile;
    
    let mut temp_file = NamedTempFile::with_suffix(&format!(".{}", file_name.split('.').last().unwrap_or("tmp")))
        .map_err(|e| format!("Failed to create temporary file: {}", e))?;
    
    temp_file.write_all(&file_data)
        .map_err(|e| format!("Failed to write file data: {}", e))?;
    
    let path = temp_file.path().to_path_buf();
    
    // Auto-detect format and parse
    let result = import::parse_dive_file(&path)?;
    
    let db = state.db.lock().map_err(|e| e.to_string())?;
    import::import_to_database(&db, result, trip_id)
}

/// Create a dive from dive computer data (downloaded directly via Bluetooth/USB)
#[tauri::command]
pub fn create_dive_from_computer(
    state: State<AppState>,
    trip_id: i64,
    date: String,
    time: String,
    duration_seconds: i64,
    max_depth_m: f64,
    mean_depth_m: f64,
    water_temp_c: Option<f64>,
    air_temp_c: Option<f64>,
    surface_pressure_bar: Option<f64>,
    cns_percent: Option<f64>,
    dive_computer_model: Option<String>,
    dive_computer_serial: Option<String>,
    nitrox_o2_percent: Option<f64>,
    latitude: Option<f64>,
    longitude: Option<f64>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    // Get current dive count for numbering
    let existing_dives = db.get_dives_for_trip(trip_id).map_err(|e| e.to_string())?;
    let dive_number = existing_dives.len() as i64 + 1;
    
    db.create_dive_from_computer(
        trip_id,
        dive_number,
        &date,
        &time,
        duration_seconds,
        max_depth_m,
        mean_depth_m,
        water_temp_c,
        air_temp_c,
        surface_pressure_bar,
        cns_percent,
        dive_computer_model.as_deref(),
        dive_computer_serial.as_deref(),
        nitrox_o2_percent,
        latitude,
        longitude,
    ).map_err(|e| e.to_string())
}

/// Create a manual dive with all fields (for dives without a dive computer)
#[tauri::command]
pub fn create_manual_dive(
    state: State<AppState>,
    trip_id: i64,
    date: String,
    time: String,
    duration_seconds: i64,
    max_depth_m: f64,
    mean_depth_m: f64,
    water_temp_c: Option<f64>,
    air_temp_c: Option<f64>,
    surface_pressure_bar: Option<f64>,
    cns_percent: Option<f64>,
    nitrox_o2_percent: Option<f64>,
    // User-editable fields
    location: Option<String>,
    ocean: Option<String>,
    visibility_m: Option<f64>,
    buddy: Option<String>,
    divemaster: Option<String>,
    guide: Option<String>,
    instructor: Option<String>,
    comments: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    is_fresh_water: bool,
    is_boat_dive: bool,
    is_drift_dive: bool,
    is_night_dive: bool,
    is_training_dive: bool,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    // Get current dive count for numbering
    let existing_dives = db.get_dives_for_trip(trip_id).map_err(|e| e.to_string())?;
    let dive_number = existing_dives.len() as i64 + 1;
    
    db.create_manual_dive(
        trip_id,
        dive_number,
        &date,
        &time,
        duration_seconds,
        max_depth_m,
        mean_depth_m,
        water_temp_c,
        air_temp_c,
        surface_pressure_bar,
        cns_percent,
        nitrox_o2_percent,
        location.as_deref(),
        ocean.as_deref(),
        visibility_m,
        buddy.as_deref(),
        divemaster.as_deref(),
        guide.as_deref(),
        instructor.as_deref(),
        comments.as_deref(),
        latitude,
        longitude,
        is_fresh_water,
        is_boat_dive,
        is_drift_dive,
        is_night_dive,
        is_training_dive,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_photos_for_dive(state: State<AppState>, dive_id: i64) -> Result<Vec<Photo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_photos_for_dive(dive_id).map_err(|e| e.to_string())
}

/// Get top photos for a dive for thumbnail display (prioritizes processed versions and high ratings)
#[tauri::command]
pub fn get_dive_thumbnail_photos(state: State<AppState>, dive_id: i64, limit: i64) -> Result<Vec<Photo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_dive_thumbnail_photos(dive_id, limit).map_err(|e| e.to_string())
}

/// Get photo count and species count for a dive
#[tauri::command]
pub fn get_dive_stats(state: State<AppState>, dive_id: i64) -> Result<DiveStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_dive_stats(dive_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_photos_for_trip(state: State<AppState>, trip_id: i64) -> Result<Vec<Photo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_photos_for_trip(trip_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_photos_for_import(
    state: State<AppState>,
    paths: Vec<String>,
    trip_id: i64,
    gap_minutes: Option<i64>,
) -> Result<photos::PhotoImportPreview, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let dives = db.get_dives_for_trip(trip_id).map_err(|e| e.to_string())?;
    
    let gap = gap_minutes.unwrap_or(60); // Default 60 min gap between groups
    photos::create_import_preview(&paths, &dives, gap)
}

#[tauri::command]
pub fn import_photos(
    state: State<AppState>,
    trip_id: i64,
    assignments: Vec<photos::PhotoAssignment>,
    overwrite: Option<bool>,
) -> Result<i64, String> {
    let overwrite_flag = overwrite.unwrap_or(false);
    log::info!("import_photos called with overwrite={}", overwrite_flag);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    photos::import_photos(&db, trip_id, assignments, overwrite_flag)
}

#[tauri::command]
pub fn get_photo(state: State<AppState>, id: i64) -> Result<Option<Photo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_photo(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn regenerate_thumbnails(state: State<AppState>) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    // Get all photos without thumbnails
    let photos_needing_thumbs = db.get_photos_without_thumbnails()
        .map_err(|e| e.to_string())?;
    
    let mut count = 0i64;
    
    for photo in photos_needing_thumbs {
        let path = std::path::Path::new(&photo.file_path);
        if path.exists() {
            if let Some(thumb_path) = photos::generate_thumbnail(path, photo.id) {
                db.update_photo_thumbnail(photo.id, &thumb_path)
                    .map_err(|e| format!("Failed to update thumbnail: {}", e))?;
                count += 1;
            }
        }
    }
    
    Ok(count)
}

/// Get list of photo IDs that need thumbnails
#[tauri::command]
pub fn get_photos_needing_thumbnails(state: State<AppState>) -> Result<Vec<i64>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let photos = db.get_photos_without_thumbnails()
        .map_err(|e| e.to_string())?;
    Ok(photos.iter().map(|p| p.id).collect())
}

/// Generate thumbnail for a single photo (for background processing)
#[tauri::command]
pub fn generate_single_thumbnail(state: State<AppState>, photo_id: i64) -> Result<Option<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let photo = db.get_photo(photo_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Photo not found".to_string())?;
    
    let path = std::path::Path::new(&photo.file_path);
    if !path.exists() {
        return Ok(None);
    }
    
    if let Some(thumb_path) = photos::generate_thumbnail(path, photo_id) {
        db.update_photo_thumbnail(photo_id, &thumb_path)
            .map_err(|e| format!("Failed to update thumbnail: {}", e))?;
        Ok(Some(thumb_path))
    } else {
        Ok(None)
    }
}

/// Rescan EXIF data for a single photo
#[tauri::command]
pub fn rescan_photo_exif(state: State<AppState>, photo_id: i64) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let photo = db.get_photo(photo_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Photo not found".to_string())?;
    
    let path = std::path::Path::new(&photo.file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", photo.file_path));
    }
    
    println!("=== RESCAN EXIF for {} ===", photo.filename);
    
    // Use the scan_single_file function which reads EXIF
    if let Some(scanned) = photos::scan_single_file(path) {
        println!("Scanned values:");
        println!("  aperture: {:?}", scanned.aperture);
        println!("  shutter: {:?}", scanned.shutter_speed);
        println!("  iso: {:?}", scanned.iso);
        println!("  focal: {:?}", scanned.focal_length_mm);
        println!("  make: {:?}", scanned.camera_make);
        println!("  model: {:?}", scanned.camera_model);
        
        db.update_photo_exif(
            photo_id,
            scanned.capture_time.as_deref(),
            scanned.camera_make.as_deref(),
            scanned.camera_model.as_deref(),
            scanned.lens_info.as_deref(),
            scanned.focal_length_mm,
            scanned.aperture,
            scanned.shutter_speed.as_deref(),
            scanned.iso,
        ).map_err(|e| e.to_string())?;
        
        println!("Database updated!");
        Ok(true)
    } else {
        println!("scan_single_file returned None!");
        Ok(false)
    }
}

/// Debug: dump all EXIF tags from a photo file
#[tauri::command]
pub fn debug_dump_exif(state: State<AppState>, photo_id: i64) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let photo = db.get_photo(photo_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Photo not found".to_string())?;
    
    let path = std::path::Path::new(&photo.file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", photo.file_path));
    }
    
    let mut tags = Vec::new();
    
    // First show what's in the database
    tags.push("=== DATABASE VALUES ===".to_string());
    tags.push(format!("aperture: {:?}", photo.aperture));
    tags.push(format!("shutter_speed: {:?}", photo.shutter_speed));
    tags.push(format!("iso: {:?}", photo.iso));
    tags.push(format!("focal_length_mm: {:?}", photo.focal_length_mm));
    tags.push(format!("camera_make: {:?}", photo.camera_make));
    tags.push(format!("camera_model: {:?}", photo.camera_model));
    
    // Show what scan_single_file returns
    tags.push("".to_string());
    tags.push("=== SCAN_SINGLE_FILE RESULTS ===".to_string());
    if let Some(scanned) = photos::scan_single_file(path) {
        tags.push(format!("aperture: {:?}", scanned.aperture));
        tags.push(format!("shutter_speed: {:?}", scanned.shutter_speed));
        tags.push(format!("iso: {:?}", scanned.iso));
        tags.push(format!("focal_length_mm: {:?}", scanned.focal_length_mm));
        tags.push(format!("camera_make: {:?}", scanned.camera_make));
        tags.push(format!("camera_model: {:?}", scanned.camera_model));
    } else {
        tags.push("scan_single_file returned None".to_string());
    }
    
    tags.push("".to_string());
    
    // Try rexif first
    if let Ok(exif) = rexif::parse_file(path) {
        tags.push(format!("=== rexif found {} entries ===", exif.entries.len()));
        // Only show exposure-related tags
        for entry in &exif.entries {
            let tag_name = format!("{:?}", entry.tag);
            if tag_name.contains("FNumber") || tag_name.contains("Aperture") ||
               tag_name.contains("Exposure") || tag_name.contains("ISO") ||
               tag_name.contains("Shutter") || tag_name.contains("Focal") ||
               tag_name.contains("Make") || tag_name.contains("Model") {
                tags.push(format!("{:?}: {}", entry.tag, entry.value_more_readable));
            }
        }
    } else {
        tags.push("rexif: failed to parse".to_string());
    }
    
    // Also try kamadak-exif
    if let Ok(file) = std::fs::File::open(path) {
        let mut bufreader = std::io::BufReader::new(&file);
        if let Ok(exif) = exif::Reader::new().read_from_container(&mut bufreader) {
            tags.push(format!("=== kamadak-exif found {} fields ===", exif.fields().count()));
            for field in exif.fields() {
                tags.push(format!("{:?} (IFD {:?}): {}", field.tag, field.ifd_num, field.display_value()));
            }
        } else {
            tags.push("kamadak-exif: failed to parse".to_string());
        }
    }
    
    Ok(tags)
}

/// Rescan EXIF data for all photos in a trip
#[tauri::command]
pub fn rescan_trip_exif(state: State<AppState>, trip_id: i64) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let photos = db.get_photos_for_trip(trip_id)
        .map_err(|e| e.to_string())?;
    
    let mut count = 0i64;
    for photo in photos {
        let path = std::path::Path::new(&photo.file_path);
        if path.exists() {
            if let Some(scanned) = photos::scan_single_file(path) {
                db.update_photo_exif(
                    photo.id,
                    scanned.capture_time.as_deref(),
                    scanned.camera_make.as_deref(),
                    scanned.camera_model.as_deref(),
                    scanned.lens_info.as_deref(),
                    scanned.focal_length_mm,
                    scanned.aperture,
                    scanned.shutter_speed.as_deref(),
                    scanned.iso,
                ).map_err(|e| e.to_string())?;
                count += 1;
            }
        }
    }
    
    Ok(count)
}

/// Rescan EXIF data for ALL photos in the database
#[tauri::command]
pub fn rescan_all_exif(state: State<AppState>) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    // Get all photos
    let photos = db.get_all_photos()
        .map_err(|e| e.to_string())?;
    
    println!("=== RESCANNING ALL {} PHOTOS ===", photos.len());
    
    let mut count = 0i64;
    for photo in photos {
        let path = std::path::Path::new(&photo.file_path);
        if path.exists() {
            if let Some(scanned) = photos::scan_single_file(path) {
                if scanned.aperture.is_some() || scanned.iso.is_some() {
                    println!("  {}: aperture={:?}, iso={:?}, shutter={:?}", 
                        photo.filename, scanned.aperture, scanned.iso, scanned.shutter_speed);
                }
                db.update_photo_exif(
                    photo.id,
                    scanned.capture_time.as_deref(),
                    scanned.camera_make.as_deref(),
                    scanned.camera_model.as_deref(),
                    scanned.lens_info.as_deref(),
                    scanned.focal_length_mm,
                    scanned.aperture,
                    scanned.shutter_speed.as_deref(),
                    scanned.iso,
                ).map_err(|e| e.to_string())?;
                count += 1;
            }
        }
    }
    
    println!("=== DONE: Updated {} photos ===", count);
    Ok(count)
}

/// Read an image file and return it as base64-encoded data URL
/// For RAW files (DNG, CR2, etc.), decodes the raw sensor data into a viewable image
#[tauri::command]
pub fn get_image_data(file_path: String) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    
    // Check if this is a RAW file that needs decoding
    let raw_extensions = ["raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2", "raf", "pef"];
    let is_raw = path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| raw_extensions.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false);
    
    let jpeg_data = if is_raw {
        // Decode RAW file using rawloader + imagepipe
        photos::decode_raw_to_jpeg(path)?
    } else {
        // Regular image - just read and re-encode as JPEG if needed
        let img = image::open(path)
            .map_err(|e| format!("Failed to open image: {}", e))?;
        
        let mut jpeg_bytes = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
        img.write_to(&mut cursor, image::ImageFormat::Jpeg)
            .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
        jpeg_bytes
    };
    
    let base64_data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &jpeg_data);
    
    Ok(format!("data:image/jpeg;base64,{}", base64_data))
}

/// Get the processed version of a RAW photo (if exists)
#[tauri::command]
pub fn get_processed_version(state: State<AppState>, photo_id: i64) -> Result<Option<Photo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_processed_version(photo_id).map_err(|e| e.to_string())
}

/// Get the RAW version of a processed photo
#[tauri::command]
pub fn get_raw_version(state: State<AppState>, photo_id: i64) -> Result<Option<Photo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_raw_version(photo_id).map_err(|e| e.to_string())
}

/// Get the best version for display: processed if available, otherwise the original
/// Use this when showing thumbnails and full-size images
#[tauri::command]
pub fn get_display_version(state: State<AppState>, photo_id: i64) -> Result<Photo, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_display_version(photo_id).map_err(|e| e.to_string())
}

/// Link orphan processed photos to their RAW counterparts
/// Call this to fix data imported before automatic linking was added
#[tauri::command]
pub fn link_orphan_processed_photos(state: State<AppState>) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.link_orphan_processed_photos().map_err(|e| e.to_string())
}

// Species tag commands

use crate::db::SpeciesTag;

#[tauri::command]
pub fn get_all_species_tags(state: State<AppState>) -> Result<Vec<SpeciesTag>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_species_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_species_tags(state: State<AppState>, query: String) -> Result<Vec<SpeciesTag>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.search_species_tags(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_species_tag(
    state: State<AppState>,
    name: String,
    category: Option<String>,
    scientific_name: Option<String>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_species_tag(&name, category.as_deref(), scientific_name.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_or_create_species_tag(
    state: State<AppState>,
    name: String,
    category: Option<String>,
    scientific_name: Option<String>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_or_create_species_tag(&name, category.as_deref(), scientific_name.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_species_tags_for_photo(state: State<AppState>, photo_id: i64) -> Result<Vec<SpeciesTag>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_species_tags_for_photo(photo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_species_tag_to_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    species_tag_id: i64,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_species_tag_to_photos(&photo_ids, species_tag_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_species_tag_from_photo(
    state: State<AppState>,
    photo_id: i64,
    species_tag_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.remove_species_tag_from_photo(photo_id, species_tag_id)
        .map_err(|e| e.to_string())
}

// Photo management commands

#[tauri::command]
pub fn delete_photos(state: State<AppState>, photo_ids: Vec<i64>) -> Result<u64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_photos(&photo_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_photo_rating(state: State<AppState>, photo_id: i64, rating: i32) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_photo_rating(photo_id, rating).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_photos_rating(state: State<AppState>, photo_ids: Vec<i64>, rating: i32) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_photos_rating(&photo_ids, rating).map_err(|e| e.to_string())
}

// General tag commands

use crate::db::GeneralTag;

#[tauri::command]
pub fn get_all_general_tags(state: State<AppState>) -> Result<Vec<GeneralTag>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_general_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_general_tags(state: State<AppState>, query: String) -> Result<Vec<GeneralTag>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.search_general_tags(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_or_create_general_tag(state: State<AppState>, name: String) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_or_create_general_tag(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_general_tags_for_photo(state: State<AppState>, photo_id: i64) -> Result<Vec<GeneralTag>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_general_tags_for_photo(photo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_general_tag_to_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    general_tag_id: i64,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_general_tag_to_photos(&photo_ids, general_tag_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_general_tag_from_photo(
    state: State<AppState>,
    photo_id: i64,
    general_tag_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.remove_general_tag_from_photo(photo_id, general_tag_id)
        .map_err(|e| e.to_string())
}

// Statistics commands

use crate::db::{Statistics, SpeciesCount, CameraStat, YearlyStat};

#[tauri::command]
pub fn get_statistics(state: State<AppState>) -> Result<Statistics, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_statistics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_species_with_counts(state: State<AppState>) -> Result<Vec<SpeciesCount>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_species_with_counts().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_camera_stats(state: State<AppState>) -> Result<Vec<CameraStat>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_camera_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_yearly_stats(state: State<AppState>) -> Result<Vec<YearlyStat>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_yearly_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_trip_species_count(state: State<AppState>, trip_id: i64) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_trip_species_count(trip_id).map_err(|e| e.to_string())
}

// Export commands

use crate::db::{TripExport, SpeciesExport};

#[tauri::command]
pub fn get_trip_export(state: State<AppState>, trip_id: i64) -> Result<TripExport, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_trip_export(trip_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_species_export(state: State<AppState>) -> Result<Vec<SpeciesExport>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_species_export().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    destination_folder: String,
    include_processed: bool,
) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    // Get photo details
    let photos = db.get_photos_for_export(&photo_ids).map_err(|e| e.to_string())?;
    
    let dest_path = std::path::PathBuf::from(&destination_folder);
    if !dest_path.exists() {
        std::fs::create_dir_all(&dest_path).map_err(|e| e.to_string())?;
    }
    
    let mut exported_files = Vec::new();
    
    for photo in photos {
        // Skip processed versions if not requested
        if photo.is_processed && !include_processed {
            continue;
        }
        
        let source = std::path::PathBuf::from(&photo.file_path);
        if !source.exists() {
            continue;
        }
        
        let dest_file = dest_path.join(&photo.filename);
        
        // Handle filename collision
        let final_dest = if dest_file.exists() {
            let stem = dest_file.file_stem().unwrap_or_default().to_string_lossy();
            let ext = dest_file.extension().unwrap_or_default().to_string_lossy();
            let mut counter = 1;
            loop {
                let new_name = if ext.is_empty() {
                    format!("{}_{}", stem, counter)
                } else {
                    format!("{}_{}.{}", stem, counter, ext)
                };
                let candidate = dest_path.join(&new_name);
                if !candidate.exists() {
                    break candidate;
                }
                counter += 1;
            }
        } else {
            dest_file
        };
        
        // Copy the file
        std::fs::copy(&source, &final_dest).map_err(|e| e.to_string())?;
        exported_files.push(final_dest.to_string_lossy().to_string());
    }
    
    Ok(exported_files)
}

// Search commands

use crate::db::{SearchResults, PhotoFilter};

#[tauri::command]
pub fn search(state: State<AppState>, query: String) -> Result<SearchResults, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.search(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn filter_photos(state: State<AppState>, filter: PhotoFilter) -> Result<Vec<Photo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.filter_photos(&filter).map_err(|e| e.to_string())
}

// Batch operations

#[tauri::command]
pub fn move_photos_to_dive(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    dive_id: Option<i64>,
) -> Result<usize, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.move_photos_to_dive(&photo_ids, dive_id).map_err(|e| e.to_string())
}

// Dive sites commands

use crate::db::DiveSite;

#[tauri::command]
pub fn get_dive_sites(state: State<AppState>) -> Result<Vec<DiveSite>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_dive_sites().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_dive_sites_csv(state: State<AppState>, csv_path: String) -> Result<usize, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};
    
    let file = File::open(&csv_path).map_err(|e| format!("Failed to open CSV file: {}", e))?;
    let reader = BufReader::new(file);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let mut count = 0;
    let mut lines = reader.lines();
    
    // Skip header line
    if let Some(Ok(_header)) = lines.next() {
        // Process each line
        for line_result in lines {
            let line = line_result.map_err(|e| format!("Failed to read line: {}", e))?;
            let parts: Vec<&str> = line.split(',').collect();
            
            if parts.len() >= 3 {
                let name = parts[0].trim();
                if let (Ok(lat), Ok(lon)) = (parts[1].trim().parse::<f64>(), parts[2].trim().parse::<f64>()) {
                    db.insert_dive_site(name, lat, lon)
                        .map_err(|e| format!("Failed to insert dive site: {}", e))?;
                    count += 1;
                }
            }
        }
    }
    
    Ok(count)
}

// Map commands

use crate::db::DiveMapPoint;

#[tauri::command]
pub fn get_dive_map_points(state: State<AppState>) -> Result<Vec<DiveMapPoint>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_dives_with_coordinates().map_err(|e| e.to_string())
}

// AI Species Identification commands

use crate::ai::{SpeciesIdentification, identify_species};

#[derive(serde::Serialize)]
pub struct IdentificationResult {
    pub photo_id: i64,
    pub identification: Option<SpeciesIdentification>,
    pub error: Option<String>,
}

/// Identify species in a single photo using Google Gemini Vision API
#[tauri::command]
pub async fn identify_species_in_photo(
    state: State<'_, AppState>,
    api_key: String,
    photo_id: i64,
    location_context: Option<String>,
) -> Result<IdentificationResult, String> {
    // Get photo info from database
    let photo = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_photo(photo_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Photo not found".to_string())?
    };
    
    // Prefer thumbnail for faster processing (smaller file)
    let image_path = photo.thumbnail_path
        .as_ref()
        .filter(|p| std::path::Path::new(p).exists())
        .unwrap_or(&photo.file_path);
    
    // Call the AI identification
    match identify_species(&api_key, image_path, location_context.as_deref()).await {
        Ok(identification) => Ok(IdentificationResult {
            photo_id,
            identification: Some(identification),
            error: None,
        }),
        Err(e) => Ok(IdentificationResult {
            photo_id,
            identification: None,
            error: Some(e),
        }),
    }
}

/// Identify species in multiple photos (batch processing)
#[tauri::command]
pub async fn identify_species_batch(
    state: State<'_, AppState>,
    api_key: String,
    photo_ids: Vec<i64>,
    location_context: Option<String>,
) -> Result<Vec<IdentificationResult>, String> {
    let mut results = Vec::new();
    
    for photo_id in photo_ids {
        // Get photo info from database
        let photo = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            match db.get_photo(photo_id) {
                Ok(Some(p)) => p,
                Ok(None) => {
                    results.push(IdentificationResult {
                        photo_id,
                        identification: None,
                        error: Some("Photo not found".to_string()),
                    });
                    continue;
                }
                Err(e) => {
                    results.push(IdentificationResult {
                        photo_id,
                        identification: None,
                        error: Some(e.to_string()),
                    });
                    continue;
                }
            }
        };
        
        // Prefer thumbnail for faster processing
        let image_path = photo.thumbnail_path
            .as_ref()
            .filter(|p| std::path::Path::new(p).exists())
            .unwrap_or(&photo.file_path);
        
        // Call the AI identification
        let result = match identify_species(&api_key, image_path, location_context.as_deref()).await {
            Ok(identification) => IdentificationResult {
                photo_id,
                identification: Some(identification),
                error: None,
            },
            Err(e) => IdentificationResult {
                photo_id,
                identification: None,
                error: Some(e),
            },
        };
        
        results.push(result);
        
        // Small delay to avoid rate limiting
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }
    
    Ok(results)
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    Ok(())
}

// ==================== Equipment Commands ====================

use crate::db::{EquipmentCategory, Equipment, EquipmentWithCategory, EquipmentSet, EquipmentSetWithItems};

// Equipment Category commands

#[tauri::command]
pub fn get_equipment_categories(state: State<AppState>) -> Result<Vec<EquipmentCategory>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_equipment_categories().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_equipment_category(
    state: State<AppState>,
    name: String,
    icon: Option<String>,
    sort_order: i32,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_equipment_category(&name, icon.as_deref(), sort_order)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_equipment_category(
    state: State<AppState>,
    id: i64,
    name: String,
    icon: Option<String>,
    sort_order: i32,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_equipment_category(id, &name, icon.as_deref(), sort_order)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_equipment_category(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_equipment_category(id).map_err(|e| e.to_string())
}

// Equipment commands

#[tauri::command]
pub fn get_all_equipment(state: State<AppState>) -> Result<Vec<EquipmentWithCategory>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_equipment().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_equipment_by_category(state: State<AppState>, category_id: i64) -> Result<Vec<Equipment>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_equipment_by_category(category_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_equipment(state: State<AppState>, id: i64) -> Result<Option<EquipmentWithCategory>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_equipment(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_equipment(
    state: State<AppState>,
    category_id: i64,
    name: String,
    brand: Option<String>,
    model: Option<String>,
    serial_number: Option<String>,
    purchase_date: Option<String>,
    notes: Option<String>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_equipment(
        category_id,
        &name,
        brand.as_deref(),
        model.as_deref(),
        serial_number.as_deref(),
        purchase_date.as_deref(),
        notes.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_equipment(
    state: State<AppState>,
    id: i64,
    category_id: i64,
    name: String,
    brand: Option<String>,
    model: Option<String>,
    serial_number: Option<String>,
    purchase_date: Option<String>,
    notes: Option<String>,
    is_retired: bool,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_equipment(
        id,
        category_id,
        &name,
        brand.as_deref(),
        model.as_deref(),
        serial_number.as_deref(),
        purchase_date.as_deref(),
        notes.as_deref(),
        is_retired,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_equipment(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_equipment(id).map_err(|e| e.to_string())
}

// Equipment Set commands

#[tauri::command]
pub fn get_equipment_sets(state: State<AppState>) -> Result<Vec<EquipmentSet>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_equipment_sets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_equipment_sets_by_type(state: State<AppState>, set_type: String) -> Result<Vec<EquipmentSet>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_equipment_sets_by_type(&set_type).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_equipment_set_with_items(state: State<AppState>, id: i64) -> Result<Option<EquipmentSetWithItems>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_equipment_set_with_items(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_equipment_set(
    state: State<AppState>,
    name: String,
    description: Option<String>,
    set_type: String,
    is_default: bool,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_equipment_set(&name, description.as_deref(), &set_type, is_default)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_equipment_set(
    state: State<AppState>,
    id: i64,
    name: String,
    description: Option<String>,
    set_type: String,
    is_default: bool,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_equipment_set(id, &name, description.as_deref(), &set_type, is_default)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_equipment_set(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_equipment_set(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_equipment_to_set(state: State<AppState>, set_id: i64, equipment_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_equipment_to_set(set_id, equipment_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_equipment_from_set(state: State<AppState>, set_id: i64, equipment_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.remove_equipment_from_set(set_id, equipment_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_equipment_set_items(state: State<AppState>, set_id: i64, equipment_ids: Vec<i64>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_equipment_set_items(set_id, &equipment_ids).map_err(|e| e.to_string())
}

// Dive Equipment commands

#[tauri::command]
pub fn get_equipment_sets_for_dive(state: State<AppState>, dive_id: i64) -> Result<Vec<EquipmentSet>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_equipment_sets_for_dive(dive_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_equipment_set_to_dive(state: State<AppState>, dive_id: i64, set_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_equipment_set_to_dive(dive_id, set_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_equipment_set_from_dive(state: State<AppState>, dive_id: i64, set_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.remove_equipment_set_from_dive(dive_id, set_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_dive_equipment_sets(state: State<AppState>, dive_id: i64, set_ids: Vec<i64>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_dive_equipment_sets(dive_id, &set_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_default_equipment_set(state: State<AppState>, set_type: String) -> Result<Option<EquipmentSet>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_default_equipment_set(&set_type).map_err(|e| e.to_string())
}
