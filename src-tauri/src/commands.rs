use tauri::{State, Emitter};
use std::path::Path;
use crate::{AppState, db::{Trip, Dive, DiveSample, Photo, TankPressure, DiveTank, DiveStats, DiveWithDetails, Db}, import, photos};
use crate::validation::{Validator, MAX_NAME_LENGTH, MAX_LOCATION_LENGTH, MAX_BATCH_SIZE};

#[tauri::command]
pub fn get_trips(state: State<AppState>) -> Result<Vec<Trip>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.get_all_trips().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_trip(state: State<AppState>, id: i64) -> Result<Option<Trip>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
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
    // Validate inputs
    let mut v = Validator::new();
    v.validate_name("name", &name);
    v.validate_string_optional("location", Some(&location), MAX_LOCATION_LENGTH);
    v.validate_date("date_start", &date_start);
    v.validate_date("date_end", &date_end);
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
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
    // Validate inputs
    let mut v = Validator::new();
    v.validate_id("id", id);
    v.validate_name("name", &name);
    v.validate_string_optional("location", Some(&location), MAX_LOCATION_LENGTH);
    v.validate_name_optional("resort", resort.as_deref());
    v.validate_date("date_start", &date_start);
    v.validate_date("date_end", &date_end);
    v.validate_notes("notes", notes.as_deref());
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.update_trip(id, &name, &location, resort.as_deref(), &date_start, &date_end, notes.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_trip(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
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
    dive_site_id: Option<i64>,
    is_fresh_water: bool,
    is_boat_dive: bool,
    is_drift_dive: bool,
    is_night_dive: bool,
    is_training_dive: bool,
) -> Result<(), String> {
    // Validate inputs
    let mut v = Validator::new();
    v.validate_id("id", id);
    v.validate_string_optional("location", location.as_deref(), MAX_LOCATION_LENGTH);
    v.validate_string_optional("ocean", ocean.as_deref(), MAX_NAME_LENGTH);
    v.validate_depth_optional("visibility_m", visibility_m); // Visibility in meters, same range as depth
    v.validate_name_optional("buddy", buddy.as_deref());
    v.validate_name_optional("divemaster", divemaster.as_deref());
    v.validate_name_optional("guide", guide.as_deref());
    v.validate_name_optional("instructor", instructor.as_deref());
    v.validate_notes("comments", comments.as_deref());
    v.validate_gps_optional(latitude, longitude);
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
        dive_site_id,
        is_fresh_water,
        is_boat_dive,
        is_drift_dive,
        is_night_dive,
        is_training_dive,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_dive(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    // Validate inputs
    let mut v = Validator::new();
    v.validate_array_required("dive_ids", &dive_ids);
    v.validate_array_size("dive_ids", &dive_ids, MAX_BATCH_SIZE);
    v.validate_id_array("dive_ids", &dive_ids);
    if let Some(Some(ref loc)) = location {
        v.validate_string_optional("location", Some(loc), MAX_LOCATION_LENGTH);
    }
    if let Some(Some(ref o)) = ocean {
        v.validate_string_optional("ocean", Some(o), MAX_NAME_LENGTH);
    }
    if let Some(Some(ref b)) = buddy {
        v.validate_name_optional("buddy", Some(b));
    }
    if let Some(Some(ref dm)) = divemaster {
        v.validate_name_optional("divemaster", Some(dm));
    }
    if let Some(Some(ref g)) = guide {
        v.validate_name_optional("guide", Some(g));
    }
    if let Some(Some(ref i)) = instructor {
        v.validate_name_optional("instructor", Some(i));
    }
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_dives_for_trip(trip_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_dive(state: State<AppState>, id: i64) -> Result<Option<Dive>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_dive(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_dive_samples(state: State<AppState>, dive_id: i64) -> Result<Vec<DiveSample>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_dive_samples(dive_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_tank_pressures(state: State<AppState>, dive_id: i64) -> Result<Vec<TankPressure>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_tank_pressures_for_dive(dive_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_dive_tanks(state: State<AppState>, dive_id: i64) -> Result<Vec<DiveTank>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_dive_tanks(dive_id).map_err(|e| e.to_string())
}

/// Insert samples for a dive (from dive computer data) - uses batch insert for performance
#[tauri::command]
pub fn insert_dive_samples(
    state: State<AppState>,
    dive_id: i64,
    samples: Vec<DiveSample>,
) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    let count = db.insert_dive_samples_batch(dive_id, &samples)
        .map_err(|e| e.to_string())?;
    Ok(count as i64)
}

/// Insert tank pressures for a dive (from file imports like FIT) - uses batch insert for performance
#[tauri::command]
pub fn insert_tank_pressures(
    state: State<AppState>,
    dive_id: i64,
    pressures: Vec<ParsedTankPressure>,
) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    
    // Convert ParsedTankPressure to TankPressure
    let tank_pressures: Vec<TankPressure> = pressures.into_iter().map(|p| TankPressure {
        id: 0,
        dive_id,
        sensor_id: p.sensor_id,
        sensor_name: p.sensor_name,
        time_seconds: p.time_seconds,
        pressure_bar: p.pressure_bar,
    }).collect();
    
    let count = db.insert_tank_pressures_batch(dive_id, &tank_pressures)
        .map_err(|e| e.to_string())?;
    Ok(count as i64)
}

#[tauri::command]
pub fn import_ssrf_file(state: State<AppState>, file_path: String, trip_id: Option<i64>) -> Result<i64, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    
    let result = import::parse_ssrf_file(path)?;
    
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    import::import_to_database(&db, result, trip_id)
}

/// Preview/parse dive log from file data without importing
/// Returns parsed dive data for the review UI
#[derive(serde::Serialize)]
pub struct ParsedDivePreview {
    pub date: String,
    pub time: String,
    pub duration_seconds: i32,
    pub max_depth_m: f64,
    pub mean_depth_m: f64,
    pub water_temp_c: Option<f64>,
    pub dive_computer_model: Option<String>,
    pub samples: Vec<ParsedDiveSample>,
    pub tank_pressures: Vec<ParsedTankPressure>,
    pub tanks: Vec<ParsedTank>,
}

#[derive(serde::Serialize, Clone)]
pub struct ParsedTank {
    pub sensor_id: i64,
    pub gas_index: i32,
    pub o2_percent: Option<f64>,
    pub he_percent: Option<f64>,
    pub start_pressure_bar: Option<f64>,
    pub end_pressure_bar: Option<f64>,
    pub volume_used_liters: Option<f64>,
}

#[derive(serde::Serialize)]
pub struct ParsedDiveSample {
    pub time_seconds: i32,
    pub depth_m: f64,
    pub temp_c: Option<f64>,
    pub pressure_bar: Option<f64>,
    pub ndl_seconds: Option<i32>,
    pub rbt_seconds: Option<i32>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ParsedTankPressure {
    pub sensor_id: i64,
    pub sensor_name: Option<String>,
    pub time_seconds: i32,
    pub pressure_bar: f64,
}

#[derive(serde::Serialize)]
pub struct ParsedFileResult {
    pub dives: Vec<ParsedDivePreview>,
    pub trip_name: String,
    pub date_start: String,
    pub date_end: String,
}

// ============================================================================
// Bulk Import Structures (for high-performance import from review modal)
// ============================================================================

/// A single dive with all its data for bulk import
#[derive(serde::Deserialize)]
pub struct BulkDiveData {
    pub date: String,
    pub time: String,
    pub duration_seconds: i64,
    pub max_depth_m: f64,
    pub mean_depth_m: f64,
    pub water_temp_c: Option<f64>,
    pub air_temp_c: Option<f64>,
    pub surface_pressure_bar: Option<f64>,
    pub cns_percent: Option<f64>,
    pub dive_computer_model: Option<String>,
    pub dive_computer_serial: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub samples: Vec<BulkDiveSample>,
    pub tank_pressures: Vec<ParsedTankPressure>,
    #[serde(default)]
    pub tanks: Vec<BulkDiveTank>,
}

#[derive(serde::Deserialize)]
pub struct BulkDiveTank {
    pub sensor_id: i64,
    pub gas_index: i32,
    pub o2_percent: Option<f64>,
    pub he_percent: Option<f64>,
    pub start_pressure_bar: Option<f64>,
    pub end_pressure_bar: Option<f64>,
    pub volume_used_liters: Option<f64>,
}

#[derive(serde::Deserialize)]
pub struct BulkDiveSample {
    pub time_seconds: i32,
    pub depth_m: f64,
    pub temp_c: Option<f64>,
    pub pressure_bar: Option<f64>,
    pub ndl_seconds: Option<i32>,
    pub rbt_seconds: Option<i32>,
}

/// A group of dives to import together (may create a new trip)
#[derive(serde::Deserialize)]
pub struct BulkImportGroup {
    pub trip_id: Option<i64>,           // Existing trip ID, or None to create new
    pub new_trip_name: Option<String>,  // Name for new trip if trip_id is None
    pub date_start: String,
    pub date_end: String,
    pub dives: Vec<BulkDiveData>,
}

/// Result of bulk import
#[derive(serde::Serialize)]
pub struct BulkImportResult {
    pub trips_created: i64,
    pub dives_imported: i64,
    pub samples_imported: i64,
    pub tank_pressures_imported: i64,
    pub tanks_imported: i64,
    pub created_trip_ids: Vec<i64>,
}

/// Bulk import multiple dive groups in a single transaction
/// This is much faster than individual IPC calls per dive
#[tauri::command]
pub fn bulk_import_dives(
    state: State<AppState>,
    groups: Vec<BulkImportGroup>,
) -> Result<BulkImportResult, String> {
    // Validate all groups and dives upfront
    let mut v = Validator::new();
    v.validate_array_required("groups", &groups);
    
    for (group_idx, group) in groups.iter().enumerate() {
        // Validate group-level fields
        if let Some(trip_id) = group.trip_id {
            v.validate_id(&format!("groups[{}].trip_id", group_idx), trip_id);
        }
        if let Some(ref name) = group.new_trip_name {
            v.validate_name_optional(&format!("groups[{}].new_trip_name", group_idx), Some(name));
        }
        v.validate_date(&format!("groups[{}].date_start", group_idx), &group.date_start);
        v.validate_date(&format!("groups[{}].date_end", group_idx), &group.date_end);
        
        // Validate each dive in the group
        for (dive_idx, dive) in group.dives.iter().enumerate() {
            let prefix = format!("groups[{}].dives[{}]", group_idx, dive_idx);
            v.validate_date(&format!("{}.date", prefix), &dive.date);
            v.validate_time(&format!("{}.time", prefix), &dive.time);
            v.validate_duration(&format!("{}.duration_seconds", prefix), dive.duration_seconds);
            v.validate_depth(&format!("{}.max_depth_m", prefix), dive.max_depth_m);
            v.validate_depth(&format!("{}.mean_depth_m", prefix), dive.mean_depth_m);
            v.validate_water_temp_optional(&format!("{}.water_temp_c", prefix), dive.water_temp_c);
            v.validate_air_temp_optional(&format!("{}.air_temp_c", prefix), dive.air_temp_c);
            v.validate_surface_pressure_optional(&format!("{}.surface_pressure_bar", prefix), dive.surface_pressure_bar);
            v.validate_cns_percent_optional(&format!("{}.cns_percent", prefix), dive.cns_percent);
            v.validate_gps_optional(dive.latitude, dive.longitude);
        }
    }
    
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    
    let mut trips_created: i64 = 0;
    let mut dives_imported: i64 = 0;
    let mut samples_imported: i64 = 0;
    let mut tank_pressures_imported: i64 = 0;
    let mut tanks_imported: i64 = 0;
    let mut created_trip_ids: Vec<i64> = Vec::new();
    
    // Process all groups - each group becomes a trip
    for group in groups {
        if group.dives.is_empty() {
            continue;
        }
        
        // Get or create trip
        let trip_id = match group.trip_id {
            Some(id) => id,
            None => {
                let name = group.new_trip_name.unwrap_or_else(|| {
                    format!("Import {}", &group.date_start)
                });
                let id = db.create_trip(&name, "", &group.date_start, &group.date_end)
                    .map_err(|e| format!("Failed to create trip: {}", e))?;
                trips_created += 1;
                created_trip_ids.push(id);
                id
            }
        };
        
        // Get starting dive number
        let existing_dives = db.get_dives_for_trip(trip_id)
            .map_err(|e| format!("Failed to get existing dives: {}", e))?;
        let mut dive_number = existing_dives.len() as i64 + 1;
        
        // Import each dive
        for dive_data in group.dives {
            // Create the dive
            let dive_id = db.create_dive_from_computer(
                trip_id,
                dive_number,
                &dive_data.date,
                &dive_data.time,
                dive_data.duration_seconds,
                dive_data.max_depth_m,
                dive_data.mean_depth_m,
                dive_data.water_temp_c,
                dive_data.air_temp_c,
                dive_data.surface_pressure_bar,
                dive_data.cns_percent,
                dive_data.dive_computer_model.as_deref(),
                dive_data.dive_computer_serial.as_deref(),
                dive_data.latitude,
                dive_data.longitude,
            ).map_err(|e| format!("Failed to create dive: {}", e))?;
            
            dive_number += 1;
            dives_imported += 1;
            
            // Insert samples in batch
            if !dive_data.samples.is_empty() {
                let samples: Vec<DiveSample> = dive_data.samples.iter().map(|s| DiveSample {
                    id: 0,
                    dive_id,
                    time_seconds: s.time_seconds,
                    depth_m: s.depth_m,
                    temp_c: s.temp_c,
                    pressure_bar: s.pressure_bar,
                    ndl_seconds: s.ndl_seconds,
                    rbt_seconds: s.rbt_seconds,
                }).collect();
                
                let count = db.insert_dive_samples_batch(dive_id, &samples)
                    .map_err(|e| format!("Failed to insert samples: {}", e))?;
                samples_imported += count as i64;
            }
            
            // Insert tank pressures in batch
            if !dive_data.tank_pressures.is_empty() {
                let pressures: Vec<TankPressure> = dive_data.tank_pressures.iter().map(|p| TankPressure {
                    id: 0,
                    dive_id,
                    sensor_id: p.sensor_id,
                    sensor_name: p.sensor_name.clone(),
                    time_seconds: p.time_seconds,
                    pressure_bar: p.pressure_bar,
                }).collect();
                
                let count = db.insert_tank_pressures_batch(dive_id, &pressures)
                    .map_err(|e| format!("Failed to insert tank pressures: {}", e))?;
                tank_pressures_imported += count as i64;
            }
            
            // Insert dive tanks (gas mix metadata)
            if !dive_data.tanks.is_empty() {
                let tanks: Vec<DiveTank> = dive_data.tanks.iter().map(|t| DiveTank {
                    id: 0,
                    dive_id,
                    sensor_id: t.sensor_id,
                    sensor_name: None,
                    gas_index: t.gas_index,
                    o2_percent: t.o2_percent,
                    he_percent: t.he_percent,
                    start_pressure_bar: t.start_pressure_bar,
                    end_pressure_bar: t.end_pressure_bar,
                    volume_used_liters: t.volume_used_liters,
                }).collect();
                
                let count = db.insert_dive_tanks_batch(dive_id, &tanks)
                    .map_err(|e| format!("Failed to insert dive tanks: {}", e))?;
                tanks_imported += count as i64;
            }
        }
    }
    
    Ok(BulkImportResult {
        trips_created,
        dives_imported,
        samples_imported,
        tank_pressures_imported,
        tanks_imported,
        created_trip_ids,
    })
}

#[tauri::command]
pub fn parse_dive_file_data(file_name: String, file_data: Vec<u8>) -> Result<ParsedFileResult, String> {
    use std::io::Write;
    use tempfile::NamedTempFile;
    
    let mut temp_file = NamedTempFile::with_suffix(&format!(".{}", file_name.split('.').last().unwrap_or("tmp")))
        .map_err(|e| format!("Failed to create temporary file: {}", e))?;
    
    temp_file.write_all(&file_data)
        .map_err(|e| format!("Failed to write file data: {}", e))?;
    
    let path = temp_file.path().to_path_buf();
    
    // Parse without importing
    let result = import::parse_dive_file(&path)?;
    
    // Convert to preview format
    let dives = result.dives.into_iter().map(|imported| {
        ParsedDivePreview {
            date: imported.dive.date,
            time: imported.dive.time,
            duration_seconds: imported.dive.duration_seconds,
            max_depth_m: imported.dive.max_depth_m,
            mean_depth_m: imported.dive.mean_depth_m,
            water_temp_c: imported.dive.water_temp_c,
            dive_computer_model: imported.dive.dive_computer_model,
            samples: imported.samples.into_iter().map(|s| ParsedDiveSample {
                time_seconds: s.time_seconds,
                depth_m: s.depth_m,
                temp_c: s.temp_c,
                pressure_bar: s.pressure_bar,
                ndl_seconds: s.ndl_seconds,
                rbt_seconds: s.rbt_seconds,
            }).collect(),
            tank_pressures: imported.tank_pressures.into_iter().map(|tp| ParsedTankPressure {
                sensor_id: tp.sensor_id,
                sensor_name: tp.sensor_name,
                time_seconds: tp.time_seconds,
                pressure_bar: tp.pressure_bar,
            }).collect(),
            tanks: imported.tanks.into_iter().map(|t| ParsedTank {
                sensor_id: t.sensor_id,
                gas_index: t.gas_index,
                o2_percent: t.o2_percent,
                he_percent: t.he_percent,
                start_pressure_bar: t.start_pressure_bar,
                end_pressure_bar: t.end_pressure_bar,
                volume_used_liters: t.volume_used_liters,
            }).collect(),
        }
    }).collect();
    
    Ok(ParsedFileResult {
        dives,
        trip_name: result.trip_name,
        date_start: result.date_start,
        date_end: result.date_end,
    })
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
    latitude: Option<f64>,
    longitude: Option<f64>,
) -> Result<i64, String> {
    // Validate inputs
    let mut v = Validator::new();
    v.validate_id("trip_id", trip_id);
    v.validate_date("date", &date);
    v.validate_time("time", &time);
    v.validate_duration("duration_seconds", duration_seconds);
    v.validate_depth("max_depth_m", max_depth_m);
    v.validate_depth("mean_depth_m", mean_depth_m);
    v.validate_water_temp_optional("water_temp_c", water_temp_c);
    v.validate_air_temp_optional("air_temp_c", air_temp_c);
    v.validate_surface_pressure_optional("surface_pressure_bar", surface_pressure_bar);
    v.validate_cns_percent_optional("cns_percent", cns_percent);
    v.validate_name_optional("dive_computer_model", dive_computer_model.as_deref());
    v.validate_name_optional("dive_computer_serial", dive_computer_serial.as_deref());
    v.validate_gps_optional(latitude, longitude);
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    
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
    // Validate inputs
    let mut v = Validator::new();
    v.validate_id("trip_id", trip_id);
    v.validate_date("date", &date);
    v.validate_time("time", &time);
    v.validate_duration("duration_seconds", duration_seconds);
    v.validate_depth("max_depth_m", max_depth_m);
    v.validate_depth("mean_depth_m", mean_depth_m);
    v.validate_water_temp_optional("water_temp_c", water_temp_c);
    v.validate_air_temp_optional("air_temp_c", air_temp_c);
    v.validate_surface_pressure_optional("surface_pressure_bar", surface_pressure_bar);
    v.validate_cns_percent_optional("cns_percent", cns_percent);
    v.validate_string_optional("location", location.as_deref(), MAX_LOCATION_LENGTH);
    v.validate_string_optional("ocean", ocean.as_deref(), MAX_NAME_LENGTH);
    v.validate_depth_optional("visibility_m", visibility_m);
    v.validate_name_optional("buddy", buddy.as_deref());
    v.validate_name_optional("divemaster", divemaster.as_deref());
    v.validate_name_optional("guide", guide.as_deref());
    v.validate_name_optional("instructor", instructor.as_deref());
    v.validate_notes("comments", comments.as_deref());
    v.validate_gps_optional(latitude, longitude);
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_photos_for_dive(dive_id).map_err(|e| e.to_string())
}

/// Get top photos for a dive for thumbnail display (prioritizes processed versions and high ratings)
#[tauri::command]
pub fn get_dive_thumbnail_photos(state: State<AppState>, dive_id: i64, limit: i64) -> Result<Vec<Photo>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_dive_thumbnail_photos(dive_id, limit).map_err(|e| e.to_string())
}

/// Get photo count and species count for a dive
#[tauri::command]
pub fn get_dive_stats(state: State<AppState>, dive_id: i64) -> Result<DiveStats, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_dive_stats(dive_id).map_err(|e| e.to_string())
}

/// Get all dives for a trip with their stats and thumbnails in a single batch call
/// This replaces multiple get_dive_stats + get_dive_thumbnail_photos calls
#[tauri::command]
pub fn get_dives_with_details(state: State<AppState>, trip_id: i64, thumbnail_limit: Option<i64>) -> Result<Vec<DiveWithDetails>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    let limit = thumbnail_limit.unwrap_or(4);
    db.get_dives_with_details(trip_id, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_photos_for_trip(state: State<AppState>, trip_id: i64) -> Result<Vec<Photo>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_photos_for_trip(trip_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_photos_for_trip(state: State<AppState>, trip_id: i64) -> Result<Vec<Photo>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_all_photos_for_trip(trip_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_photos_for_import(
    state: State<AppState>,
    paths: Vec<String>,
    trip_id: i64,
    gap_minutes: Option<i64>,
) -> Result<photos::PhotoImportPreview, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    photos::import_photos(&db, trip_id, assignments, overwrite_flag)
}

#[tauri::command]
pub fn get_photo(state: State<AppState>, id: i64) -> Result<Option<Photo>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_photo(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn regenerate_thumbnails(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    // Get photos needing thumbnails while holding lock briefly
    let photos_needing_thumbs = {
        let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
        db.get_photos_without_thumbnails().map_err(|e| e.to_string())?
    };
    
    let total = photos_needing_thumbs.len();
    let mut count = 0i64;
    
    for (i, photo) in photos_needing_thumbs.into_iter().enumerate() {
        let path = std::path::PathBuf::from(&photo.file_path);
        let photo_id = photo.id;
        
        if path.exists() {
            // Run thumbnail generation in blocking thread pool
            let thumb_result = tokio::task::spawn_blocking(move || {
                photos::generate_thumbnail(&path, photo_id)
            }).await.map_err(|e| e.to_string())?;
            
            if let Some(thumb_path) = thumb_result {
                let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
                db.update_photo_thumbnail(photo_id, &thumb_path)
                    .map_err(|e| format!("Failed to update thumbnail: {}", e))?;
                count += 1;
            }
        }
        
        // Emit progress event
        let _ = window.emit("thumbnail-progress", serde_json::json!({
            "current": i + 1,
            "total": total,
            "completed": count
        }));
    }
    
    Ok(count)
}

/// Get list of photo IDs that need thumbnails
#[tauri::command]
pub fn get_photos_needing_thumbnails(state: State<AppState>) -> Result<Vec<i64>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    let photos = db.get_photos_without_thumbnails()
        .map_err(|e| e.to_string())?;
    Ok(photos.iter().map(|p| p.id).collect())
}

/// Generate thumbnail for a single photo (for background processing)
#[tauri::command]
pub async fn generate_single_thumbnail(state: State<'_, AppState>, photo_id: i64) -> Result<Option<String>, String> {
    let photo = {
        let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
        db.get_photo(photo_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Photo not found".to_string())?
    };
    
    let path = std::path::PathBuf::from(&photo.file_path);
    if !path.exists() {
        return Ok(None);
    }
    
    // Run thumbnail generation in blocking thread pool
    let thumb_result = tokio::task::spawn_blocking(move || {
        photos::generate_thumbnail(&path, photo_id)
    }).await.map_err(|e| e.to_string())?;
    
    if let Some(ref thumb_path) = thumb_result {
        let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
        db.update_photo_thumbnail(photo_id, thumb_path)
            .map_err(|e| format!("Failed to update thumbnail: {}", e))?;
    }
    
    Ok(thumb_result)
}

/// Rescan EXIF data for a single photo
#[tauri::command]
pub async fn rescan_photo_exif(state: State<'_, AppState>, photo_id: i64) -> Result<bool, String> {
    let photo = {
        let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
        db.get_photo(photo_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Photo not found".to_string())?
    };
    
    let path = std::path::PathBuf::from(&photo.file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", photo.file_path));
    }
    
    println!("=== RESCAN EXIF for {} ===", photo.filename);
    
    // Run EXIF scanning in blocking thread pool
    let scanned = tokio::task::spawn_blocking(move || {
        photos::scan_single_file(&path)
    }).await.map_err(|e| e.to_string())?;
    
    if let Some(scanned) = scanned {
        println!("Scanned values:");
        println!("  aperture: {:?}", scanned.aperture);
        println!("  shutter: {:?}", scanned.shutter_speed);
        println!("  iso: {:?}", scanned.iso);
        println!("  focal: {:?}", scanned.focal_length_mm);
        println!("  make: {:?}", scanned.camera_make);
        println!("  model: {:?}", scanned.camera_model);
        println!("  exposure_comp: {:?}", scanned.exposure_compensation);
        println!("  white_balance: {:?}", scanned.white_balance);
        println!("  flash: {:?}", scanned.flash_fired);
        println!("  metering: {:?}", scanned.metering_mode);
        println!("  gps: {:?}, {:?}", scanned.gps_latitude, scanned.gps_longitude);
        
        let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
            scanned.exposure_compensation,
            scanned.white_balance.as_deref(),
            scanned.flash_fired,
            scanned.metering_mode.as_deref(),
            scanned.gps_latitude,
            scanned.gps_longitude,
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    
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
pub async fn rescan_trip_exif(state: State<'_, AppState>, trip_id: i64) -> Result<i64, String> {
    let photos = {
        let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
        db.get_photos_for_trip(trip_id).map_err(|e| e.to_string())?
    };
    
    let mut count = 0i64;
    for photo in photos {
        let path = std::path::PathBuf::from(&photo.file_path);
        let photo_id = photo.id;
        
        if path.exists() {
            // Run EXIF scanning in blocking thread pool
            let scanned = tokio::task::spawn_blocking(move || {
                photos::scan_single_file(&path)
            }).await.map_err(|e| e.to_string())?;
            
            if let Some(scanned) = scanned {
                let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
                    scanned.exposure_compensation,
                    scanned.white_balance.as_deref(),
                    scanned.flash_fired,
                    scanned.metering_mode.as_deref(),
                    scanned.gps_latitude,
                    scanned.gps_longitude,
                ).map_err(|e| e.to_string())?;
                count += 1;
            }
        }
    }
    
    Ok(count)
}

/// Rescan EXIF data for ALL photos in the database
#[tauri::command]
pub async fn rescan_all_exif(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    // Get all photos while holding lock briefly
    let all_photos = {
        let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
        db.get_all_photos().map_err(|e| e.to_string())?
    };
    
    let total = all_photos.len();
    println!("=== RESCANNING ALL {} PHOTOS ===", total);
    
    let mut count = 0i64;
    
    for (i, photo) in all_photos.into_iter().enumerate() {
        let path = std::path::PathBuf::from(&photo.file_path);
        let photo_id = photo.id;
        let filename = photo.filename.clone();
        
        if path.exists() {
            // Run EXIF scanning in blocking thread pool
            let scanned = tokio::task::spawn_blocking(move || {
                photos::scan_single_file(&path)
            }).await.map_err(|e| e.to_string())?;
            
            if let Some(scanned) = scanned {
                if scanned.aperture.is_some() || scanned.iso.is_some() {
                    println!("  {}: aperture={:?}, iso={:?}, shutter={:?}", 
                        filename, scanned.aperture, scanned.iso, scanned.shutter_speed);
                }
                
                let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
                    scanned.exposure_compensation,
                    scanned.white_balance.as_deref(),
                    scanned.flash_fired,
                    scanned.metering_mode.as_deref(),
                    scanned.gps_latitude,
                    scanned.gps_longitude,
                ).map_err(|e| e.to_string())?;
                count += 1;
            }
        }
        
        // Emit progress event every 10 photos or on last photo
        if i % 10 == 0 || i == total - 1 {
            let _ = window.emit("exif-rescan-progress", serde_json::json!({
                "current": i + 1,
                "total": total,
                "completed": count
            }));
        }
    }
    
    println!("=== DONE: Updated {} photos ===", count);
    Ok(count)
}

/// Read an image file and return it as base64-encoded data URL
/// For RAW files (DNG, CR2, etc.), decodes the raw sensor data into a viewable image
/// For JPEG files, reads directly without re-encoding (fast path for thumbnails)
/// Uses spawn_blocking to avoid blocking the async runtime on CPU-intensive decoding
#[tauri::command]
pub async fn get_image_data(file_path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(&file_path);
    
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    
    // Run image decoding in blocking thread pool since it's CPU-intensive
    let result = tokio::task::spawn_blocking(move || {
        // Check file extension
        let ext_lower = path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase())
            .unwrap_or_default();
        
        // FAST PATH: If it's already a JPEG, just read the bytes directly - no decoding needed!
        // This is ~10-50x faster for thumbnails which are pre-generated JPEGs
        if ext_lower == "jpg" || ext_lower == "jpeg" {
            let jpeg_data = std::fs::read(&path)
                .map_err(|e| format!("Failed to read JPEG file: {}", e))?;
            let base64_data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &jpeg_data);
            return Ok(format!("data:image/jpeg;base64,{}", base64_data));
        }
        
        // Check if this is a RAW file that needs decoding
        let raw_extensions = ["raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2", "raf", "pef"];
        let is_raw = raw_extensions.contains(&ext_lower.as_str());
        
        let jpeg_data = if is_raw {
            // CR3 fast path: rawloader doesn't support CR3, skip directly to rawler
            if ext_lower == "cr3" {
                log::info!("CR3 file detected, using rawler directly: {}", path.display());
                decode_raw_with_fallbacks(&path, true)
            } else {
                // For other RAW formats, try rawloader first, then fallback chain
                decode_raw_with_fallbacks(&path, false)
            }?
        } else {
            // Other image formats (PNG, TIFF, etc.) - decode and re-encode as JPEG
            let img = image::open(&path)
                .map_err(|e| format!("Failed to open image: {}", e))?;
            
            let mut jpeg_bytes = Vec::new();
            let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
            img.write_to(&mut cursor, image::ImageFormat::Jpeg)
                .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
            jpeg_bytes
        };
        
        let base64_data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &jpeg_data);
        Ok::<String, String>(format!("data:image/jpeg;base64,{}", base64_data))
    }).await.map_err(|e| format!("Task join error: {}", e))?;
    
    result
}

/// Decode RAW file with fallback chain:
/// 1. rawloader + imagepipe (unless skip_rawloader is true)
/// 2. rawler (supports CR3 and other formats)
/// 3. Embedded JPEG extraction (last resort)
fn decode_raw_with_fallbacks(path: &std::path::Path, skip_rawloader: bool) -> Result<Vec<u8>, String> {
    let mut last_error = String::new();
    
    // Step 1: Try rawloader + imagepipe (unless skipping for CR3)
    if !skip_rawloader {
        match photos::decode_raw_to_jpeg(path) {
            Ok(data) => {
                log::info!("RAW decoded with rawloader: {}", path.display());
                return Ok(data);
            }
            Err(e) => {
                log::warn!("rawloader failed for {}: {}", path.display(), e);
                last_error = e;
            }
        }
    }
    
    // Step 2: Try rawler (supports CR3, newer cameras)
    match photos::decode_raw_with_rawler(path) {
        Ok(data) => {
            log::info!("RAW decoded with rawler: {}", path.display());
            return Ok(data);
        }
        Err(e) => {
            log::warn!("rawler failed for {}: {}", path.display(), e);
            last_error = e;
        }
    }
    
    // Step 3: Last resort - extract embedded JPEG preview
    log::warn!("Falling back to embedded JPEG extraction for: {}", path.display());
    let file_data = std::fs::read(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    if let Some(jpeg_data) = photos::extract_embedded_jpeg(&file_data) {
        log::info!("Extracted embedded JPEG from: {}", path.display());
        return Ok(jpeg_data);
    }
    
    // All methods failed
    Err(format!(
        "Failed to decode RAW file with all methods. Last error: {}",
        last_error
    ))
}

/// Get the processed version of a RAW photo (if exists)
#[tauri::command]
pub fn get_processed_version(state: State<AppState>, photo_id: i64) -> Result<Option<Photo>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_processed_version(photo_id).map_err(|e| e.to_string())
}

/// Get the RAW version of a processed photo
#[tauri::command]
pub fn get_raw_version(state: State<AppState>, photo_id: i64) -> Result<Option<Photo>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_raw_version(photo_id).map_err(|e| e.to_string())
}

/// Get the best version for display: processed if available, otherwise the original
/// Use this when showing thumbnails and full-size images
#[tauri::command]
pub fn get_display_version(state: State<AppState>, photo_id: i64) -> Result<Photo, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_display_version(photo_id).map_err(|e| e.to_string())
}

/// Link orphan processed photos to their RAW counterparts
/// Call this to fix data imported before automatic linking was added
#[tauri::command]
pub fn link_orphan_processed_photos(state: State<AppState>) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.link_orphan_processed_photos().map_err(|e| e.to_string())
}

// Species tag commands

use crate::db::SpeciesTag;

#[tauri::command]
pub fn get_all_species_tags(state: State<AppState>) -> Result<Vec<SpeciesTag>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_all_species_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_species_tags(state: State<AppState>, query: String) -> Result<Vec<SpeciesTag>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.search_species_tags(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_species_tag(
    state: State<AppState>,
    name: String,
    category: Option<String>,
    scientific_name: Option<String>,
) -> Result<i64, String> {
    // Validate inputs
    let mut v = Validator::new();
    v.validate_name("name", &name);
    v.validate_name_optional("category", category.as_deref());
    v.validate_name_optional("scientific_name", scientific_name.as_deref());
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_or_create_species_tag(&name, category.as_deref(), scientific_name.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_species_tags_for_photo(state: State<AppState>, photo_id: i64) -> Result<Vec<SpeciesTag>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_species_tags_for_photo(photo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_species_tag_to_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    species_tag_id: i64,
) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.add_species_tag_to_photos(&photo_ids, species_tag_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_species_tag_from_photo(
    state: State<AppState>,
    photo_id: i64,
    species_tag_id: i64,
) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.remove_species_tag_from_photo(photo_id, species_tag_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_species_tag_from_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    species_tag_id: i64,
) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.remove_species_tag_from_photos(&photo_ids, species_tag_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_distinct_species_categories(state: State<AppState>) -> Result<Vec<String>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_distinct_species_categories().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_species_tag_category(
    state: State<AppState>,
    species_tag_id: i64,
    category: Option<String>,
) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.update_species_tag_category(species_tag_id, category.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_common_species_tags_for_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
) -> Result<Vec<SpeciesTag>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_common_species_tags_for_photos(&photo_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_common_general_tags_for_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
) -> Result<Vec<GeneralTag>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_common_general_tags_for_photos(&photo_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_general_tag_from_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    general_tag_id: i64,
) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.remove_general_tag_from_photos(&photo_ids, general_tag_id)
        .map_err(|e| e.to_string())
}

// Photo management commands

#[tauri::command]
pub fn delete_photos(state: State<AppState>, photo_ids: Vec<i64>) -> Result<u64, String> {
    // Validate inputs
    let mut v = Validator::new();
    v.validate_array_required("photo_ids", &photo_ids);
    v.validate_array_size("photo_ids", &photo_ids, MAX_BATCH_SIZE);
    v.validate_id_array("photo_ids", &photo_ids);
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.delete_photos(&photo_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_photo_rating(state: State<AppState>, photo_id: i64, rating: i32) -> Result<(), String> {
    // Validate inputs
    let mut v = Validator::new();
    v.validate_id("photo_id", photo_id);
    v.validate_rating(rating);
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.update_photo_rating(photo_id, rating).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_photos_rating(state: State<AppState>, photo_ids: Vec<i64>, rating: i32) -> Result<(), String> {
    // Validate inputs
    let mut v = Validator::new();
    v.validate_array_required("photo_ids", &photo_ids);
    v.validate_array_size("photo_ids", &photo_ids, MAX_BATCH_SIZE);
    v.validate_id_array("photo_ids", &photo_ids);
    v.validate_rating(rating);
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.update_photos_rating(&photo_ids, rating).map_err(|e| e.to_string())
}

// General tag commands

use crate::db::GeneralTag;

#[tauri::command]
pub fn get_all_general_tags(state: State<AppState>) -> Result<Vec<GeneralTag>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_all_general_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_general_tags(state: State<AppState>, query: String) -> Result<Vec<GeneralTag>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.search_general_tags(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_or_create_general_tag(state: State<AppState>, name: String) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_or_create_general_tag(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_general_tags_for_photo(state: State<AppState>, photo_id: i64) -> Result<Vec<GeneralTag>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_general_tags_for_photo(photo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_general_tag_to_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    general_tag_id: i64,
) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.add_general_tag_to_photos(&photo_ids, general_tag_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_general_tag_from_photo(
    state: State<AppState>,
    photo_id: i64,
    general_tag_id: i64,
) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.remove_general_tag_from_photo(photo_id, general_tag_id)
        .map_err(|e| e.to_string())
}

// Statistics commands

use crate::db::{Statistics, SpeciesCount, CameraStat, YearlyStat};

#[tauri::command]
pub fn get_statistics(state: State<AppState>) -> Result<Statistics, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_statistics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_species_with_counts(state: State<AppState>) -> Result<Vec<SpeciesCount>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_species_with_counts().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_camera_stats(state: State<AppState>) -> Result<Vec<CameraStat>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_camera_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_yearly_stats(state: State<AppState>) -> Result<Vec<YearlyStat>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_yearly_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_trip_species_count(state: State<AppState>, trip_id: i64) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_trip_species_count(trip_id).map_err(|e| e.to_string())
}

// Export commands

use crate::db::{TripExport, SpeciesExport};

#[tauri::command]
pub fn get_trip_export(state: State<AppState>, trip_id: i64) -> Result<TripExport, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_trip_export(trip_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_species_export(state: State<AppState>) -> Result<Vec<SpeciesExport>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_species_export().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    destination_folder: String,
    include_processed: bool,
) -> Result<Vec<String>, String> {
    // Validate inputs
    let mut v = Validator::new();
    v.validate_array_required("photo_ids", &photo_ids);
    v.validate_array_size("photo_ids", &photo_ids, MAX_BATCH_SIZE);
    v.validate_id_array("photo_ids", &photo_ids);
    v.validate_path(&destination_folder);
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.search(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn filter_photos(state: State<AppState>, filter: PhotoFilter) -> Result<Vec<Photo>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.filter_photos(&filter).map_err(|e| e.to_string())
}

// Batch operations

#[tauri::command]
pub fn move_photos_to_dive(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    dive_id: Option<i64>,
) -> Result<usize, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.move_photos_to_dive(&photo_ids, dive_id).map_err(|e| e.to_string())
}

// Dive sites commands

use crate::db::DiveSite;

#[tauri::command]
pub fn get_dive_sites(state: State<AppState>) -> Result<Vec<DiveSite>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_all_dive_sites().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_dive_sites_csv(state: State<AppState>, csv_path: String) -> Result<usize, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};
    
    let file = File::open(&csv_path).map_err(|e| format!("Failed to open CSV file: {}", e))?;
    let reader = BufReader::new(file);
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    
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

/// Search dive sites by name (server-side filtering)
#[tauri::command]
pub fn search_dive_sites(state: State<AppState>, query: String) -> Result<Vec<DiveSite>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.search_dive_sites(&query).map_err(|e| e.to_string())
}

/// Create a new user dive site
#[tauri::command]
pub fn create_dive_site(state: State<AppState>, name: String, lat: f64, lon: f64) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.create_dive_site(&name, lat, lon).map_err(|e| e.to_string())
}

/// Update a dive site
#[tauri::command]
pub fn update_dive_site(state: State<AppState>, id: i64, name: String, lat: f64, lon: f64) -> Result<bool, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.update_dive_site(id, &name, lat, lon).map_err(|e| e.to_string())
}

/// Delete a user-created dive site (imported sites cannot be deleted)
#[tauri::command]
pub fn delete_dive_site(state: State<AppState>, id: i64) -> Result<bool, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.delete_dive_site(id).map_err(|e| e.to_string())
}

/// Find or create a dive site - matches by name or nearby location, creates if not found
#[tauri::command]
pub fn find_or_create_dive_site(state: State<AppState>, name: String, lat: f64, lon: f64) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.find_or_create_dive_site(&name, lat, lon).map_err(|e| e.to_string())
}

/// Get a single dive site by ID
#[tauri::command]
pub fn get_dive_site(state: State<AppState>, id: i64) -> Result<Option<DiveSite>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.get_dive_site(id).map_err(|e| e.to_string())
}

// Map commands

use crate::db::DiveMapPoint;

#[tauri::command]
pub fn get_dive_map_points(state: State<AppState>) -> Result<Vec<DiveMapPoint>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
        let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
            let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_equipment_categories().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_equipment_category(
    state: State<AppState>,
    name: String,
    icon: Option<String>,
    sort_order: i32,
) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.update_equipment_category(id, &name, icon.as_deref(), sort_order)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_equipment_category(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.delete_equipment_category(id).map_err(|e| e.to_string())
}

// Equipment commands

#[tauri::command]
pub fn get_all_equipment(state: State<AppState>) -> Result<Vec<EquipmentWithCategory>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_all_equipment().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_equipment_by_category(state: State<AppState>, category_id: i64) -> Result<Vec<Equipment>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_equipment_by_category(category_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_equipment(state: State<AppState>, id: i64) -> Result<Option<EquipmentWithCategory>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    // Validate inputs
    let mut v = Validator::new();
    v.validate_id("category_id", category_id);
    v.validate_name("name", &name);
    v.validate_name_optional("brand", brand.as_deref());
    v.validate_name_optional("model", model.as_deref());
    v.validate_name_optional("serial_number", serial_number.as_deref());
    v.validate_date_optional("purchase_date", purchase_date.as_deref());
    v.validate_notes("notes", notes.as_deref());
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.delete_equipment(id).map_err(|e| e.to_string())
}

// Equipment Set commands

#[tauri::command]
pub fn get_equipment_sets(state: State<AppState>) -> Result<Vec<EquipmentSet>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_equipment_sets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_equipment_sets_by_type(state: State<AppState>, set_type: String) -> Result<Vec<EquipmentSet>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_equipment_sets_by_type(&set_type).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_equipment_set_with_items(state: State<AppState>, id: i64) -> Result<Option<EquipmentSetWithItems>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
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
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.update_equipment_set(id, &name, description.as_deref(), &set_type, is_default)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_equipment_set(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.delete_equipment_set(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_equipment_to_set(state: State<AppState>, set_id: i64, equipment_id: i64) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.add_equipment_to_set(set_id, equipment_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_equipment_from_set(state: State<AppState>, set_id: i64, equipment_id: i64) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.remove_equipment_from_set(set_id, equipment_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_equipment_set_items(state: State<AppState>, set_id: i64, equipment_ids: Vec<i64>) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.set_equipment_set_items(set_id, &equipment_ids).map_err(|e| e.to_string())
}

// Dive Equipment commands

#[tauri::command]
pub fn get_equipment_sets_for_dive(state: State<AppState>, dive_id: i64) -> Result<Vec<EquipmentSet>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_equipment_sets_for_dive(dive_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_equipment_set_to_dive(state: State<AppState>, dive_id: i64, set_id: i64) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.add_equipment_set_to_dive(dive_id, set_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_equipment_set_from_dive(state: State<AppState>, dive_id: i64, set_id: i64) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.remove_equipment_set_from_dive(dive_id, set_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_dive_equipment_sets(state: State<AppState>, dive_id: i64, set_ids: Vec<i64>) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.set_dive_equipment_sets(dive_id, &set_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_default_equipment_set(state: State<AppState>, set_type: String) -> Result<Option<EquipmentSet>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.get_default_equipment_set(&set_type).map_err(|e| e.to_string())
}

// ==================== External Image Editor Commands ====================

#[derive(serde::Serialize, Clone)]
pub struct ImageEditor {
    pub name: String,
    pub path: String,
}

/// Detect installed image editors on the system
#[tauri::command]
pub fn detect_image_editors() -> Result<Vec<ImageEditor>, String> {
    let mut editors = Vec::new();
    
    #[cfg(target_os = "windows")]
    {
        use std::path::Path;
        
        // Common image editors and their typical installation paths
        let editor_paths = [
            // Adobe Photoshop (various versions)
            ("Adobe Photoshop", r"C:\Program Files\Adobe\Adobe Photoshop 2024\Photoshop.exe"),
            ("Adobe Photoshop", r"C:\Program Files\Adobe\Adobe Photoshop 2023\Photoshop.exe"),
            ("Adobe Photoshop", r"C:\Program Files\Adobe\Adobe Photoshop 2022\Photoshop.exe"),
            ("Adobe Photoshop", r"C:\Program Files\Adobe\Adobe Photoshop CC 2019\Photoshop.exe"),
            ("Adobe Photoshop", r"C:\Program Files\Adobe\Adobe Photoshop CC 2018\Photoshop.exe"),
            // Adobe Lightroom
            ("Adobe Lightroom Classic", r"C:\Program Files\Adobe\Adobe Lightroom Classic\Lightroom.exe"),
            ("Adobe Lightroom", r"C:\Program Files\Adobe\Adobe Lightroom\Lightroom.exe"),
            // Affinity Photo
            ("Affinity Photo 2", r"C:\Program Files\Affinity\Photo 2\Photo.exe"),
            ("Affinity Photo", r"C:\Program Files\Affinity\Photo\Photo.exe"),
            // GIMP
            ("GIMP", r"C:\Program Files\GIMP 2\bin\gimp-2.10.exe"),
            ("GIMP", r"C:\Program Files\GIMP 2\bin\gimp-2.99.exe"),
            // Paint.NET
            ("Paint.NET", r"C:\Program Files\paint.net\paintdotnet.exe"),
            // Capture One
            ("Capture One", r"C:\Program Files\Capture One\Capture One.exe"),
            // DxO PhotoLab
            ("DxO PhotoLab", r"C:\Program Files\DxO\DxO PhotoLab 7\DxOPhotoLab7.exe"),
            ("DxO PhotoLab", r"C:\Program Files\DxO\DxO PhotoLab 6\DxOPhotoLab6.exe"),
            // ON1 Photo RAW
            ("ON1 Photo RAW", r"C:\Program Files\ON1\ON1 Photo RAW 2024\ON1 Photo RAW 2024.exe"),
            // Darktable
            ("Darktable", r"C:\Program Files\darktable\bin\darktable.exe"),
            // RawTherapee
            ("RawTherapee", r"C:\Program Files\RawTherapee\rawtherapee.exe"),
            // IrfanView
            ("IrfanView", r"C:\Program Files\IrfanView\i_view64.exe"),
            ("IrfanView", r"C:\Program Files (x86)\IrfanView\i_view32.exe"),
            // XnView
            ("XnView", r"C:\Program Files\XnView\xnview.exe"),
            ("XnViewMP", r"C:\Program Files\XnViewMP\xnviewmp.exe"),
            // FastStone Image Viewer
            ("FastStone Image Viewer", r"C:\Program Files (x86)\FastStone Image Viewer\FSViewer.exe"),
        ];
        
        // Check which editors exist
        for (name, path) in editor_paths {
            if Path::new(path).exists() {
                // Avoid duplicates (in case multiple versions exist)
                if !editors.iter().any(|e: &ImageEditor| e.name == name) {
                    editors.push(ImageEditor {
                        name: name.to_string(),
                        path: path.to_string(),
                    });
                }
            }
        }
        
        // Also try to find editors via registry
        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Photoshop.exe", "/ve"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if line.contains("REG_SZ") {
                        if let Some(path) = line.split("REG_SZ").nth(1) {
                            let path = path.trim();
                            if Path::new(path).exists() && !editors.iter().any(|e| e.name == "Adobe Photoshop") {
                                editors.push(ImageEditor {
                                    name: "Adobe Photoshop".to_string(),
                                    path: path.to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        use std::path::Path;
        
        let editor_paths = [
            ("Adobe Photoshop", "/Applications/Adobe Photoshop 2024/Adobe Photoshop 2024.app"),
            ("Adobe Photoshop", "/Applications/Adobe Photoshop 2023/Adobe Photoshop 2023.app"),
            ("Adobe Lightroom Classic", "/Applications/Adobe Lightroom Classic/Adobe Lightroom Classic.app"),
            ("Affinity Photo 2", "/Applications/Affinity Photo 2.app"),
            ("Affinity Photo", "/Applications/Affinity Photo.app"),
            ("GIMP", "/Applications/GIMP-2.10.app"),
            ("Pixelmator Pro", "/Applications/Pixelmator Pro.app"),
            ("Capture One", "/Applications/Capture One.app"),
            ("Darktable", "/Applications/darktable.app"),
            ("Preview", "/System/Applications/Preview.app"),
        ];
        
        for (name, path) in editor_paths {
            if Path::new(path).exists() {
                if !editors.iter().any(|e: &ImageEditor| e.name == name) {
                    editors.push(ImageEditor {
                        name: name.to_string(),
                        path: path.to_string(),
                    });
                }
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // On Linux, check common locations and use `which` command
        let editor_commands = [
            ("GIMP", "gimp"),
            ("Darktable", "darktable"),
            ("RawTherapee", "rawtherapee"),
            ("Krita", "krita"),
            ("Inkscape", "inkscape"),
        ];
        
        for (name, cmd) in editor_commands {
            if let Ok(output) = std::process::Command::new("which").arg(cmd).output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        editors.push(ImageEditor {
                            name: name.to_string(),
                            path,
                        });
                    }
                }
            }
        }
    }
    
    Ok(editors)
}

/// Open a file in an external editor
#[tauri::command]
pub fn open_in_editor(file_path: String, editor_path: Option<String>) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    
    match editor_path {
        Some(editor) => {
            // Use specified editor
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new(&editor)
                    .arg(&file_path)
                    .spawn()
                    .map_err(|e| format!("Failed to open editor: {}", e))?;
            }
            
            #[cfg(target_os = "macos")]
            {
                // On macOS, .app bundles need 'open -a'
                if editor.ends_with(".app") {
                    std::process::Command::new("open")
                        .args(["-a", &editor, &file_path])
                        .spawn()
                        .map_err(|e| format!("Failed to open editor: {}", e))?;
                } else {
                    std::process::Command::new(&editor)
                        .arg(&file_path)
                        .spawn()
                        .map_err(|e| format!("Failed to open editor: {}", e))?;
                }
            }
            
            #[cfg(target_os = "linux")]
            {
                std::process::Command::new(&editor)
                    .arg(&file_path)
                    .spawn()
                    .map_err(|e| format!("Failed to open editor: {}", e))?;
            }
        }
        None => {
            // Use system default
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new("cmd")
                    .args(["/c", "start", "", &file_path])
                    .spawn()
                    .map_err(|e| format!("Failed to open with default app: {}", e))?;
            }
            
            #[cfg(target_os = "macos")]
            {
                std::process::Command::new("open")
                    .arg(&file_path)
                    .spawn()
                    .map_err(|e| format!("Failed to open with default app: {}", e))?;
            }
            
            #[cfg(target_os = "linux")]
            {
                std::process::Command::new("xdg-open")
                    .arg(&file_path)
                    .spawn()
                    .map_err(|e| format!("Failed to open with default app: {}", e))?;
            }
        }
    }
    
    Ok(())
}

// ==================== Secure Settings Commands ====================

use tauri_plugin_store::StoreExt;

/// Get a secure setting from encrypted local storage
#[tauri::command]
pub fn get_secure_setting(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let store = app.store("secure-settings.json")
        .map_err(|e| format!("Failed to open secure store: {}", e))?;
    
    let value = store.get(&key)
        .and_then(|v| v.as_str().map(|s| s.to_string()));
    
    Ok(value)
}

/// Set a secure setting in encrypted local storage
#[tauri::command]
pub fn set_secure_setting(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let store = app.store("secure-settings.json")
        .map_err(|e| format!("Failed to open secure store: {}", e))?;
    
    store.set(&key, serde_json::json!(value));
    store.save()
        .map_err(|e| format!("Failed to save secure store: {}", e))?;
    
    Ok(())
}

