use tauri::{State, Emitter};
use std::path::Path;
use crate::{AppState, db::{Trip, Dive, DiveSample, Photo, TankPressure, DiveTank, DiveStats, DiveWithDetails, Db, CaptionTemplate}, import, photos, metadata, community};
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

/// Move a dive to a different trip
#[tauri::command]
pub fn move_dive_to_trip(
    state: State<AppState>,
    dive_id: i64,
    new_trip_id: i64,
) -> Result<(), String> {
    // Validate inputs
    let mut v = Validator::new();
    v.validate_id("dive_id", dive_id);
    v.validate_id("new_trip_id", new_trip_id);
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.move_dive_to_trip(dive_id, new_trip_id).map_err(|e| e.to_string())
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
    // Parse directly from bytes — no temp file needed
    let result = import::parse_dive_file_from_bytes(&file_name, &file_data)?;
    
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
pub fn get_photo_dive_context(state: State<AppState>, photo_id: i64) -> Result<Option<metadata::PhotoDiveContext>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    let photo = db.get_photo(photo_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Photo {} not found", photo_id))?;
    let dive_id = match photo.dive_id {
        Some(id) => id,
        None => return Ok(None),
    };
    let dive = match db.get_dive(dive_id).map_err(|e| e.to_string())? {
        Some(d) => d,
        None => return Ok(None),
    };
    let samples = db.get_dive_samples(dive_id).map_err(|e| e.to_string())?;
    Ok(Some(metadata::compute_photo_dive_context(&photo, &dive, &samples)))
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
    // Step 1: Try rawloader + imagepipe (unless skipping for CR3)
    if !skip_rawloader {
        match photos::decode_raw_to_jpeg(path) {
            Ok(data) => {
                log::info!("RAW decoded with rawloader: {}", path.display());
                return Ok(data);
            }
            Err(e) => {
                log::warn!("rawloader failed for {}: {}", path.display(), e);
            }
        }
    }
    
    // Step 2: Try rawler (supports CR3, newer cameras)
    let last_error;
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
    let result = db.add_species_tag_to_photos(&photo_ids, species_tag_id)
        .map_err(|e| e.to_string())?;
    metadata::write_xmp_sidecars_for_photos(&db, &photo_ids);
    Ok(result)
}

#[tauri::command]
pub fn remove_species_tag_from_photo(
    state: State<AppState>,
    photo_id: i64,
    species_tag_id: i64,
) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.remove_species_tag_from_photo(photo_id, species_tag_id)
        .map_err(|e| e.to_string())?;
    metadata::write_xmp_sidecar_for_photo(&db, photo_id);
    Ok(())
}

#[tauri::command]
pub fn remove_species_tag_from_photos(
    state: State<AppState>,
    photo_ids: Vec<i64>,
    species_tag_id: i64,
) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    let result = db.remove_species_tag_from_photos(&photo_ids, species_tag_id)
        .map_err(|e| e.to_string())?;
    metadata::write_xmp_sidecars_for_photos(&db, &photo_ids);
    Ok(result)
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
    let result = db.remove_general_tag_from_photos(&photo_ids, general_tag_id)
        .map_err(|e| e.to_string())?;
    metadata::write_xmp_sidecars_for_photos(&db, &photo_ids);
    Ok(result)
}

// Photo management commands

#[tauri::command]
pub fn sync_photo_metadata(state: State<AppState>, photo_ids: Vec<i64>) -> Result<u64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    let mut count: u64 = 0;
    for &photo_id in &photo_ids {
        metadata::write_xmp_sidecar_for_photo(&db, photo_id);
        count += 1;
    }
    Ok(count)
}

#[tauri::command]
pub fn sync_all_photo_metadata(state: State<AppState>) -> Result<u64, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    let photo_ids = db.get_all_photo_ids().map_err(|e| e.to_string())?;
    let mut count: u64 = 0;
    for photo_id in &photo_ids {
        metadata::write_xmp_sidecar_for_photo(&db, *photo_id);
        count += 1;
    }
    Ok(count)
}

#[tauri::command]
pub fn report_user_activity(state: State<AppState>) -> Result<(), String> {
    state.sync_worker.record_activity();
    Ok(())
}

#[tauri::command]
pub fn nudge_metadata_sync(state: State<AppState>) -> Result<(), String> {
    state.sync_worker.nudge();
    Ok(())
}

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
    db.update_photo_rating(photo_id, rating).map_err(|e| e.to_string())?;
    metadata::write_xmp_sidecar_for_photo(&db, photo_id);
    Ok(())
}

#[tauri::command]
pub fn update_photo_caption(state: State<AppState>, photo_id: i64, caption: Option<String>) -> Result<(), String> {
    let mut v = Validator::new();
    v.validate_id("photo_id", photo_id);
    v.validate_notes("caption", caption.as_deref());
    if v.has_errors() {
        return Err(v.to_error_string());
    }

    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.update_photo_caption(photo_id, caption.as_deref()).map_err(|e| e.to_string())?;
    metadata::write_xmp_sidecar_for_photo(&db, photo_id);
    Ok(())
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
    db.update_photos_rating(&photo_ids, rating).map_err(|e| e.to_string())?;
    metadata::write_xmp_sidecars_for_photos(&db, &photo_ids);
    Ok(())
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
    let result = db.add_general_tag_to_photos(&photo_ids, general_tag_id)
        .map_err(|e| e.to_string())?;
    metadata::write_xmp_sidecars_for_photos(&db, &photo_ids);
    Ok(result)
}

#[tauri::command]
pub fn remove_general_tag_from_photo(
    state: State<AppState>,
    photo_id: i64,
    general_tag_id: i64,
) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?; let db = Db::new(&*conn);
    db.remove_general_tag_from_photo(photo_id, general_tag_id)
        .map_err(|e| e.to_string())?;
    metadata::write_xmp_sidecar_for_photo(&db, photo_id);
    Ok(())
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
pub async fn detect_image_editors() -> Result<Vec<ImageEditor>, String> {
    // Run the detection in a blocking task to avoid blocking the main thread
    tokio::task::spawn_blocking(detect_image_editors_sync)
        .await
        .map_err(|e| format!("Failed to detect editors: {}", e))?
}

fn detect_image_editors_sync() -> Result<Vec<ImageEditor>, String> {
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

/// Open a file in an external editor and start watching for processed output files.
///
/// Two monitoring strategies are used:
/// 1. Real-time filesystem watcher on the photo's parent directory (recursive).
/// 2. Process monitoring: when the editor exits, scan the directory tree for new files.
#[tauri::command]
pub fn open_in_editor(state: State<AppState>, file_path: String, editor_path: Option<String>, photo_id: Option<i64>) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    
    // Launch the editor and capture the Child process handle
    let child: Option<std::process::Child> = match editor_path {
        Some(ref editor) => {
            // Use specified editor
            #[cfg(target_os = "windows")]
            {
                Some(
                    std::process::Command::new(editor)
                        .arg(&file_path)
                        .spawn()
                        .map_err(|e| format!("Failed to open editor: {}", e))?
                )
            }
            
            #[cfg(target_os = "macos")]
            {
                if editor.ends_with(".app") {
                    Some(
                        std::process::Command::new("open")
                            .args(["-a", editor, &file_path])
                            .spawn()
                            .map_err(|e| format!("Failed to open editor: {}", e))?
                    )
                } else {
                    Some(
                        std::process::Command::new(editor)
                            .arg(&file_path)
                            .spawn()
                            .map_err(|e| format!("Failed to open editor: {}", e))?
                    )
                }
            }
            
            #[cfg(target_os = "linux")]
            {
                Some(
                    std::process::Command::new(editor)
                        .arg(&file_path)
                        .spawn()
                        .map_err(|e| format!("Failed to open editor: {}", e))?
                )
            }
        }
        None => {
            // Use system default — the intermediate process (cmd/open/xdg-open)
            // exits immediately, so process monitoring won't help here.
            // The filesystem watcher will still catch saved files.
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
            
            None
        }
    };
    
    // Start watching for processed files if we know which photo this is.
    // Pass the editor's Child handle so we can also scan when the editor exits.
    if let Some(pid) = photo_id {
        state.file_watcher.watch_for_processed_file(pid, &file_path, child);
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

// ====================== Caption Template Commands ======================

#[tauri::command]
pub fn get_caption_templates(
    state: State<AppState>,
    content_type: Option<String>,
) -> Result<Vec<CaptionTemplate>, String> {
    let conn = state.db.get().map_err(|e| e.to_string())?;
    let db = Db::new(&*conn);
    db.get_caption_templates(content_type.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_caption_template(
    state: State<AppState>,
    name: String,
    template: String,
    content_type: String,
) -> Result<i64, String> {
    let conn = state.db.get().map_err(|e| e.to_string())?;
    let db = Db::new(&*conn);
    db.save_caption_template(&name, &template, &content_type).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_caption_template(
    state: State<AppState>,
    id: i64,
    name: String,
    template: String,
) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| e.to_string())?;
    let db = Db::new(&*conn);
    db.update_caption_template(id, &name, &template).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_caption_template(
    state: State<AppState>,
    id: i64,
) -> Result<(), String> {
    let conn = state.db.get().map_err(|e| e.to_string())?;
    let db = Db::new(&*conn);
    db.delete_caption_template(id).map_err(|e| e.to_string())
}

// ====================== Storage Path Commands ======================

#[tauri::command]
pub fn get_storage_path() -> Result<String, String> {
    Ok(crate::get_storage_base_path().to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_storage_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let store = app.store("secure-settings.json")
        .map_err(|e| format!("Failed to open store: {}", e))?;
    store.set("storagePath", serde_json::json!(path));
    store.save()
        .map_err(|e| format!("Failed to save store: {}", e))?;
    Ok(())
}

// ====================== libdivecomputer Commands ======================

/// List all dive computers supported by libdivecomputer.
/// Returns a sorted array of { vendor, product, family, model, transports }.
#[tauri::command]
pub fn get_supported_dive_computers() -> Result<Vec<crate::libdc::DeviceDescriptorInfo>, String> {
    crate::libdc::list_supported_devices().map_err(|e| e.to_string())
}

/// List available serial ports on this system.
#[tauri::command]
pub fn list_serial_ports() -> Vec<crate::transport::SerialPortInfo> {
    crate::transport::list_serial_ports()
}

/// List available USB HID devices on this system.
#[tauri::command]
pub fn list_hid_devices() -> Vec<crate::transport::HidDeviceInfo> {
    crate::transport::list_hid_devices()
}

/// Download dives from a dive computer over a serial port.
/// Returns parsed dive data for the review UI.
#[tauri::command]
pub async fn download_dives_serial(
    window: tauri::Window,
    state: State<'_, AppState>,
    vendor: String,
    product: String,
    port_name: String,
) -> Result<ParsedFileResult, String> {
    let pool = state.db.clone();
    // Run blocking I/O on a dedicated thread
    tokio::task::spawn_blocking(move || {
        download_dives_serial_blocking(&window, &pool, &vendor, &product, &port_name)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn download_dives_serial_blocking(
    window: &tauri::Window,
    pool: &crate::DbPool,
    vendor: &str,
    product: &str,
    port_name: &str,
) -> Result<ParsedFileResult, String> {
    use crate::libdc::*;
    use crate::transport::*;
    use crate::db::Db;

    // 1. Find the device descriptor
    let descriptor = find_descriptor(vendor, product)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Unknown device: {} {}", vendor, product))?;

    // 2. Open serial port
    let transport = SerialTransport::open(port_name)?;

    // 3. Create libdivecomputer context
    let context = Context::new().map_err(|e| e.to_string())?;
    context.set_loglevel(2).ok(); // DC_LOGLEVEL_WARNING

    // 4. Create custom iostream backed by our serial transport
    let stream = CustomIoStream::new(
        &context,
        dc_transport_t::DC_TRANSPORT_SERIAL,
        Box::new(transport),
    )?;

    // 5. Build session with event streaming + fingerprint
    let device_key = Db::fingerprint_key(&format!("{} {}", vendor, product), port_name);
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    let mut session = DownloadSession::new();
    if let Some(fp) = Db::get_device_fingerprint(&conn, &device_key) {
        log::info!("Loaded existing fingerprint for {} ({} bytes)", device_key, fp.len());
        session = session.with_fingerprint(fp);
    }
    let win = window.clone();
    session = session.with_event_callback(move |evt| {
        let _ = win.emit("dive-download-progress", evt);
    });

    // 6. Download and parse
    let previews = download_and_parse_dives(&context, &descriptor, stream.iostream, &mut session)?;

    // 7. Save fingerprint of the newest dive for next incremental sync
    if let Some(fp) = session.fingerprints.first() {
        let serial_str = session.devinfo.as_ref().map(|d| d.serial.to_string());
        Db::save_device_fingerprint(
            &conn,
            &device_key,
            fp,
            serial_str.as_deref(),
            Some(&format!("{} {}", vendor, product)),
        ).map_err(|e| format!("Failed to save fingerprint: {}", e))?;
        log::info!("Saved fingerprint for {} ({} bytes)", device_key, fp.len());
    }

    // 8. Build result
    let (date_start, date_end) = compute_date_range(&previews);
    let trip_name = format!("{} {} Download", vendor, product);

    Ok(ParsedFileResult {
        dives: previews,
        trip_name,
        date_start,
        date_end,
    })
}

/// Download dives from a dive computer over USB HID.
/// Returns parsed dive data for the review UI.
#[tauri::command]
pub async fn download_dives_usbhid(
    window: tauri::Window,
    state: State<'_, AppState>,
    vendor: String,
    product: String,
    vid: u16,
    pid: u16,
) -> Result<ParsedFileResult, String> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        download_dives_usbhid_blocking(&window, &pool, &vendor, &product, vid, pid)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn download_dives_usbhid_blocking(
    window: &tauri::Window,
    pool: &crate::DbPool,
    vendor: &str,
    product: &str,
    vid: u16,
    pid: u16,
) -> Result<ParsedFileResult, String> {
    use crate::libdc::*;
    use crate::transport::*;
    use crate::db::Db;

    let descriptor = find_descriptor(vendor, product)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Unknown device: {} {}", vendor, product))?;

    let transport = HidTransport::open(vid, pid)?;

    let context = Context::new().map_err(|e| e.to_string())?;
    context.set_loglevel(2).ok();

    let stream = CustomIoStream::new(
        &context,
        dc_transport_t::DC_TRANSPORT_USBHID,
        Box::new(transport),
    )?;

    // Build session with event streaming + fingerprint
    let device_key = Db::fingerprint_key(&format!("{} {}", vendor, product), "usb_hid");
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    let mut session = DownloadSession::new();
    if let Some(fp) = Db::get_device_fingerprint(&conn, &device_key) {
        log::info!("Loaded existing fingerprint for {} ({} bytes)", device_key, fp.len());
        session = session.with_fingerprint(fp);
    }
    let win = window.clone();
    session = session.with_event_callback(move |evt| {
        let _ = win.emit("dive-download-progress", evt);
    });

    let previews = download_and_parse_dives(&context, &descriptor, stream.iostream, &mut session)?;

    // Save fingerprint of the newest dive for next incremental sync
    if let Some(fp) = session.fingerprints.first() {
        let serial_str = session.devinfo.as_ref().map(|d| d.serial.to_string());
        Db::save_device_fingerprint(
            &conn,
            &device_key,
            fp,
            serial_str.as_deref(),
            Some(&format!("{} {}", vendor, product)),
        ).map_err(|e| format!("Failed to save fingerprint: {}", e))?;
        log::info!("Saved fingerprint for {} ({} bytes)", device_key, fp.len());
    }

    let (date_start, date_end) = compute_date_range(&previews);
    let trip_name = format!("{} {} Download", vendor, product);

    Ok(ParsedFileResult {
        dives: previews,
        trip_name,
        date_start,
        date_end,
    })
}

/// Helper: compute date range from a list of parsed dives.
fn compute_date_range(previews: &[ParsedDivePreview]) -> (String, String) {
    if previews.is_empty() {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        return (today.clone(), today);
    }
    let mut dates: Vec<&str> = previews.iter().map(|d| d.date.as_str()).collect();
    dates.sort();
    (
        dates.first().unwrap().to_string(),
        dates.last().unwrap().to_string(),
    )
}

/// Scan for BLE dive computer devices.
/// Returns a list of discovered BLE peripherals.
#[tauri::command]
pub async fn scan_ble_devices(duration_secs: Option<u64>) -> Result<Vec<crate::transport::BleDeviceInfo>, String> {
    crate::transport::scan_ble_devices(duration_secs.unwrap_or(5)).await
}

/// Download dives from a dive computer over BLE.
/// `device_id` is the peripheral ID from a previous scan.
#[tauri::command]
pub async fn download_dives_ble(
    window: tauri::Window,
    state: State<'_, AppState>,
    vendor: String,
    product: String,
    device_id: String,
) -> Result<ParsedFileResult, String> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        download_dives_ble_blocking(&window, &pool, &vendor, &product, &device_id)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn download_dives_ble_blocking(
    window: &tauri::Window,
    pool: &crate::DbPool,
    vendor: &str,
    product: &str,
    device_id: &str,
) -> Result<ParsedFileResult, String> {
    use crate::libdc::*;
    use crate::transport::*;
    use crate::db::Db;

    let runtime = tokio::runtime::Handle::current();

    // 1. Find the device descriptor
    let descriptor = find_descriptor(vendor, product)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Unknown device: {} {}", vendor, product))?;

    // 2. Connect to BLE device
    let (peripheral, name) = runtime.block_on(connect_ble_device(device_id))?;
    let transport = BleTransport::connect(peripheral, name)?;

    // 3. Create libdivecomputer context
    let context = Context::new().map_err(|e| e.to_string())?;
    context.set_loglevel(2).ok();

    // 4. Create custom iostream backed by our BLE transport
    let stream = CustomIoStream::new(
        &context,
        dc_transport_t::DC_TRANSPORT_BLE,
        Box::new(transport),
    )?;

    // 5. Build session with event streaming + fingerprint
    let device_key = Db::fingerprint_key(&format!("{} {}", vendor, product), "ble");
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    let mut session = DownloadSession::new();
    if let Some(fp) = Db::get_device_fingerprint(&conn, &device_key) {
        log::info!("Loaded existing fingerprint for {} ({} bytes)", device_key, fp.len());
        session = session.with_fingerprint(fp);
    }
    let win = window.clone();
    session = session.with_event_callback(move |evt| {
        let _ = win.emit("dive-download-progress", evt);
    });

    // 6. Download and parse
    let previews = download_and_parse_dives(&context, &descriptor, stream.iostream, &mut session)?;

    // 7. Save fingerprint
    if let Some(fp) = session.fingerprints.first() {
        let serial_str = session.devinfo.as_ref().map(|d| d.serial.to_string());
        Db::save_device_fingerprint(
            &conn,
            &device_key,
            fp,
            serial_str.as_deref(),
            Some(&format!("{} {}", vendor, product)),
        ).map_err(|e| format!("Failed to save fingerprint: {}", e))?;
        log::info!("Saved fingerprint for {} ({} bytes)", device_key, fp.len());
    }

    // 8. Build result
    let (date_start, date_end) = compute_date_range(&previews);
    let trip_name = format!("{} {} Download", vendor, product);

    Ok(ParsedFileResult {
        dives: previews,
        trip_name,
        date_start,
        date_end,
    })
}

// ====================== Citizen Science / Biodiversity Commands ======================

use crate::biodiversity;
use crate::inaturalist;
use crate::db::{ExternalSubmission, SpeciesEnrichmentCache};

// ── iNaturalist OAuth ──────────────────────────────────────────────────────

/// Start the iNaturalist OAuth flow: returns the URL to open in the browser.
#[tauri::command]
pub fn inat_get_auth_url(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("secure-settings.json").map_err(|e| format!("Store error: {}", e))?;
    let client_id = store.get("inatClientId")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .ok_or_else(|| "iNaturalist Client ID not configured. Set it in Settings.".to_string())?;
    Ok(inaturalist::get_auth_url(&client_id))
}

/// Wait for the OAuth callback and exchange the code for a token.
#[tauri::command]
pub async fn inat_complete_auth(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;

    let code = inaturalist::wait_for_auth_code().await?;

    let store = app.store("secure-settings.json").map_err(|e| format!("Store error: {}", e))?;
    let client_id = store.get("inatClientId")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .ok_or_else(|| "iNaturalist Client ID not set".to_string())?;
    let client_secret = store.get("inatClientSecret")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .ok_or_else(|| "iNaturalist Client Secret not set".to_string())?;

    let token_response = inaturalist::exchange_code(&client_id, &client_secret, &code).await?;
    let api_token = inaturalist::get_api_token(&token_response.access_token).await?;

    store.set("inatApiToken", serde_json::json!(api_token));
    store.save().map_err(|e| format!("Failed to save token: {}", e))?;

    let user = inaturalist::get_current_user(&api_token).await?;
    let username = user.login.unwrap_or_else(|| "unknown".to_string());

    store.set("inatUsername", serde_json::json!(username));
    store.save().map_err(|e| format!("Failed to save username: {}", e))?;

    Ok(username)
}

/// Get the currently connected iNaturalist username (if any).
#[tauri::command]
pub fn inat_get_username(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("secure-settings.json").map_err(|e| format!("Store error: {}", e))?;
    Ok(store.get("inatUsername").and_then(|v| v.as_str().map(|s| s.to_string())))
}

/// Disconnect iNaturalist (clear stored credentials).
#[tauri::command]
pub fn inat_disconnect(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("secure-settings.json").map_err(|e| format!("Store error: {}", e))?;
    store.delete("inatApiToken");
    store.delete("inatUsername");
    store.save().map_err(|e| format!("Failed to save store: {}", e))?;
    Ok(())
}

// ── iNaturalist Taxa Search ────────────────────────────────────────────────

#[tauri::command]
pub async fn inat_search_taxa(query: String) -> Result<Vec<inaturalist::INatTaxonSimple>, String> {
    inaturalist::search_taxa(&query, 10).await
}

// ── iNaturalist Submission ─────────────────────────────────────────────────

#[tauri::command]
pub async fn inat_submit_observation(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    photo_id: i64,
) -> Result<inaturalist::INatSubmissionResult, String> {
    use tauri_plugin_store::StoreExt;

    let store = app.store("secure-settings.json").map_err(|e| format!("Store error: {}", e))?;
    let api_token = store.get("inatApiToken")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .ok_or_else(|| "Not connected to iNaturalist. Connect in Settings first.".to_string())?;

    // Gather all DB data before the async call (conn/db are not Send)
    let (photo_path, dive_id, species_guess, lat, lon, observed_on, description) = {
        let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
        let db = Db::new(&*conn);

        if db.has_submission(photo_id, "inaturalist").map_err(|e| e.to_string())? {
            return Err("This photo has already been submitted to iNaturalist".to_string());
        }

        let photo = db.get_photo(photo_id).map_err(|e| e.to_string())?
            .ok_or_else(|| "Photo not found".to_string())?;

        let dive = if let Some(did) = photo.dive_id {
            db.get_dive(did).ok().flatten()
        } else {
            None
        };

        let species_tags = db.get_species_tags_for_photo(photo_id).map_err(|e| e.to_string())?;
        let species_guess = species_tags.first().map(|t| {
            t.scientific_name.as_deref().unwrap_or(&t.name).to_string()
        });

        let (lat, lon) = dive.as_ref()
            .and_then(|d| match (d.latitude, d.longitude) {
                (Some(la), Some(lo)) => Some((la, lo)),
                _ => None,
            })
            .or_else(|| match (photo.gps_latitude, photo.gps_longitude) {
                (Some(la), Some(lo)) => Some((la, lo)),
                _ => None,
            })
            .map(|(la, lo)| (Some(la), Some(lo)))
            .unwrap_or((None, None));

        let observed_on = dive.as_ref().map(|d| d.date.clone())
            .or_else(|| photo.capture_time.as_ref().and_then(|ct| ct.get(..10).map(|s| s.to_string())));

        let description = if let Some(d) = &dive {
            Some(format!(
                "Observed while SCUBA diving at {:.1}m depth. Dive duration: {} min.",
                d.max_depth_m,
                d.duration_seconds / 60
            ))
        } else {
            None
        };

        (photo.file_path.clone(), photo.dive_id, species_guess, lat, lon, observed_on, description)
    }; // conn/db dropped here

    let result = inaturalist::submit_observation(
        &api_token,
        &photo_path,
        species_guess.as_deref(),
        lat, lon,
        observed_on.as_deref(),
        description.as_deref(),
    ).await?;

    // Re-acquire connection to record the submission
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.create_external_submission(
        Some(photo_id),
        dive_id,
        "inaturalist",
        Some(&result.url),
        Some(&result.observation_id.to_string()),
    ).map_err(|e| format!("Failed to record submission: {}", e))?;

    Ok(result)
}

/// Get external submissions for a photo.
#[tauri::command]
pub fn get_photo_submissions(
    state: State<AppState>,
    photo_id: i64,
) -> Result<Vec<ExternalSubmission>, String> {
    let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
    let db = Db::new(&*conn);
    db.get_submissions_for_photo(photo_id).map_err(|e| e.to_string())
}

// ── Biodiversity Enrichment ────────────────────────────────────────────────

#[tauri::command]
pub async fn get_species_enrichment(
    state: State<'_, AppState>,
    species_tag_id: i64,
) -> Result<Option<SpeciesEnrichmentCache>, String> {
    // Do all DB reads before any .await (conn/db are not Send)
    let lookup_name = {
        let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
        let db = Db::new(&*conn);

        let is_stale = db.is_enrichment_stale(species_tag_id, 7).map_err(|e| e.to_string())?;

        if !is_stale {
            return db.get_species_enrichment(species_tag_id).map_err(|e| e.to_string());
        }

        // Get the species tag to know what to look up
        let species_tags: Vec<crate::db::SpeciesTag> = {
            let mut stmt = conn.prepare(
                "SELECT id, name, category, scientific_name FROM species_tags WHERE id = ?1"
            ).map_err(|e| format!("DB error: {}", e))?;
            let rows = stmt.query_map([species_tag_id], |row| {
                Ok(crate::db::SpeciesTag {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: row.get(2)?,
                    scientific_name: row.get(3)?,
                })
            }).map_err(|e| format!("DB error: {}", e))?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("DB error: {}", e))?
        };

        let tag = match species_tags.first() {
            Some(t) => t,
            None => return Ok(None),
        };

        tag.scientific_name.as_deref().unwrap_or(&tag.name).to_string()
    }; // conn/db dropped here

    // Now do the async API call
    match biodiversity::enrich_species(&lookup_name).await {
        Ok(enrichment) => {
            // Re-acquire connection to save results
            let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
            let db = Db::new(&*conn);
            db.save_species_enrichment(
                species_tag_id,
                enrichment.gbif_taxon_key,
                enrichment.iucn_status.as_deref(),
                enrichment.kingdom.as_deref(),
                enrichment.phylum.as_deref(),
                enrichment.class_name.as_deref(),
                enrichment.order.as_deref(),
                enrichment.family.as_deref(),
                enrichment.genus.as_deref(),
            ).map_err(|e| format!("Failed to cache enrichment: {}", e))?;

            db.get_species_enrichment(species_tag_id).map_err(|e| e.to_string())
        }
        Err(e) => {
            log::warn!("Failed to enrich species '{}': {}", lookup_name, e);
            let conn = state.db.get().map_err(|e| format!("Database error: {}", e))?;
            let db = Db::new(&*conn);
            db.get_species_enrichment(species_tag_id).map_err(|e| e.to_string())
        }
    }
}

/// Get nearby sightings of a species from GBIF and OBIS.
#[tauri::command]
pub async fn get_nearby_sightings(
    scientific_name: String,
    lat: f64,
    lon: f64,
    radius_deg: Option<f64>,
    limit: Option<u32>,
) -> Result<Vec<biodiversity::NearbySighting>, String> {
    let radius = radius_deg.unwrap_or(0.5);
    let max = limit.unwrap_or(100);
    let mut all_sightings = Vec::new();

    if let Ok(matched) = biodiversity::gbif_species_match(&scientific_name).await {
        if let Some(key) = matched.usageKey {
            if let Ok(mut sightings) = biodiversity::gbif_occurrences_nearby(key, lat, lon, radius, max / 2).await {
                all_sightings.append(&mut sightings);
            }
        }
    }

    if let Ok(mut sightings) = biodiversity::obis_occurrences_nearby(&scientific_name, lat, lon, radius, max / 2).await {
        all_sightings.append(&mut sightings);
    }

    Ok(all_sightings)
}

/// Get nearby sightings for megafauna (whale sharks + mantas) near a location.
#[tauri::command]
pub async fn get_megafauna_sightings(
    lat: f64,
    lon: f64,
    radius_deg: Option<f64>,
    limit: Option<u32>,
) -> Result<Vec<biodiversity::NearbySighting>, String> {
    let radius = radius_deg.unwrap_or(2.0);
    let max = limit.unwrap_or(200);
    let mut all_sightings = Vec::new();

    // Whale shark: GBIF taxon key 2417858 (Rhincodon typus)
    if let Ok(mut s) = biodiversity::gbif_occurrences_nearby(2417858, lat, lon, radius, max / 4).await {
        all_sightings.append(&mut s);
    }
    // Reef manta: GBIF taxon key 2418451 (Mobula alfredi)
    if let Ok(mut s) = biodiversity::gbif_occurrences_nearby(2418451, lat, lon, radius, max / 4).await {
        all_sightings.append(&mut s);
    }
    // Giant oceanic manta: GBIF taxon key 2418449 (Mobula birostris)
    if let Ok(mut s) = biodiversity::gbif_occurrences_nearby(2418449, lat, lon, radius, max / 4).await {
        all_sightings.append(&mut s);
    }
    // OBIS for whale sharks
    if let Ok(mut s) = biodiversity::obis_occurrences_nearby("Rhincodon typus", lat, lon, radius, max / 4).await {
        all_sightings.append(&mut s);
    }

    Ok(all_sightings)
}

// ====================== Backup & Restore Commands ======================

use crate::backup;

/// Create a full backup (database + thumbnails) as a zip file.
#[tauri::command]
pub fn create_backup(dest_path: String) -> Result<backup::BackupResult, String> {
    let path = std::path::Path::new(&dest_path);
    backup::create_backup(path)
}

/// Read manifest from a backup zip (for preview before restore).
#[tauri::command]
pub fn read_backup_manifest(zip_path: String) -> Result<backup::BackupManifest, String> {
    let path = std::path::Path::new(&zip_path);
    backup::read_backup_manifest(path)
}

/// Restore from a backup zip. Replaces the current database and thumbnails.
/// The app should be restarted after this operation.
#[tauri::command]
pub fn restore_backup(zip_path: String) -> Result<backup::RestoreResult, String> {
    let path = std::path::Path::new(&zip_path);
    backup::restore_backup(path)
}

// ====================== Community Commands ======================

#[tauri::command]
pub async fn community_sign_up(email: String, password: String) -> Result<community::AuthResponse, String> {
    community::sign_up(&email, &password).await
}

#[tauri::command]
pub async fn community_sign_in(email: String, password: String) -> Result<community::AuthResponse, String> {
    community::sign_in(&email, &password).await
}

#[tauri::command]
pub async fn community_refresh_token(refresh_token: String) -> Result<community::AuthRefreshResponse, String> {
    community::refresh_token(&refresh_token).await
}

#[tauri::command]
pub async fn community_get_dive_sites() -> Result<Vec<community::CommunityDiveSite>, String> {
    community::get_community_dive_sites().await
}

#[tauri::command]
pub async fn community_get_nearby_dive_sites(lat: f64, lon: f64, radius_km: f64) -> Result<Vec<community::CommunityDiveSite>, String> {
    community::get_nearby_dive_sites(lat, lon, radius_km).await
}

/// Get a valid community auth token, auto-refreshing if expired.
/// Returns the access token string or an error if not signed in.
async fn get_community_token(app: &tauri::AppHandle) -> Result<String, String> {
    let store = app.store("secure-settings.json")
        .map_err(|e| format!("Failed to open secure store: {}", e))?;
    
    let token = store.get("community_access_token")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Not signed in to community. Please sign in first.".to_string())?;

    // Decode JWT to check expiry (tokens are base64-encoded JSON with an "exp" field)
    let needs_refresh = if let Some(payload) = token.split('.').nth(1) {
        // Add padding if needed for base64
        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        if let Ok(bytes) = engine.decode(payload) {
            if let Ok(claims) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                if let Some(exp) = claims.get("exp").and_then(|e| e.as_i64()) {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs() as i64;
                    // Refresh if token expires within 5 minutes
                    exp - now < 300
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    if needs_refresh {
        let refresh = store.get("community_refresh_token")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .filter(|s| !s.is_empty());

        if let Some(refresh_token) = refresh {
            log::info!("Community: access token expired/expiring, refreshing...");
            match community::refresh_token(&refresh_token).await {
                Ok(refreshed) => {
                    store.set("community_access_token", serde_json::json!(refreshed.access_token));
                    store.set("community_refresh_token", serde_json::json!(refreshed.refresh_token));
                    let _ = store.save();
                    log::info!("Community: token refreshed successfully");
                    return Ok(refreshed.access_token);
                }
                Err(e) => {
                    log::error!("Community: token refresh failed: {}", e);
                    // Clear tokens — user needs to sign in again
                    store.set("community_access_token", serde_json::json!(""));
                    store.set("community_refresh_token", serde_json::json!(""));
                    let _ = store.save();
                    return Err("Session expired. Please sign in again.".to_string());
                }
            }
        } else {
            store.set("community_access_token", serde_json::json!(""));
            let _ = store.save();
            return Err("Session expired. Please sign in again.".to_string());
        }
    }

    Ok(token)
}

#[tauri::command]
pub async fn community_submit_dive_site(
    app: tauri::AppHandle,
    site: community::CommunityDiveSite,
) -> Result<community::CommunityDiveSite, String> {
    let token = get_community_token(&app).await?;
    community::submit_dive_site(&token, &site).await
}

#[tauri::command]
pub async fn community_get_site_observations(dive_site_id: String) -> Result<Vec<community::CommunityObservation>, String> {
    community::get_site_observations(&dive_site_id).await
}

#[tauri::command]
pub async fn community_get_site_species_summary(dive_site_id: String) -> Result<Vec<community::SiteSpeciesSummary>, String> {
    community::get_site_species_summary(&dive_site_id).await
}

#[tauri::command]
pub async fn community_submit_observation(
    app: tauri::AppHandle,
    observation: community::CommunityObservation,
) -> Result<community::CommunityObservation, String> {
    let token = get_community_token(&app).await?;
    community::submit_observation(&token, &observation).await
}

#[tauri::command]
pub async fn community_submit_observations_batch(
    app: tauri::AppHandle,
    observations: Vec<community::CommunityObservation>,
) -> Result<Vec<community::CommunityObservation>, String> {
    let token = get_community_token(&app).await?;
    community::submit_observations_batch(&token, &observations).await
}

#[tauri::command]
pub async fn community_get_stats() -> Result<community::CommunityStats, String> {
    community::get_community_stats().await
}

#[tauri::command]
pub async fn community_get_dive_sites_paginated(
    offset: Option<i64>,
    limit: Option<i64>,
    search: Option<String>,
) -> Result<community::PaginatedDiveSites, String> {
    community::get_dive_sites_paginated(
        offset.unwrap_or(0),
        limit.unwrap_or(50),
        search.as_deref(),
    ).await
}

#[tauri::command]
pub async fn community_get_site_observations_paginated(
    dive_site_id: String,
    offset: Option<i64>,
    limit: Option<i64>,
) -> Result<community::PaginatedObservations, String> {
    community::get_site_observations_paginated(
        &dive_site_id,
        offset.unwrap_or(0),
        limit.unwrap_or(50),
    ).await
}

#[tauri::command]
pub async fn community_get_site_contributor_info(
    dive_site_id: String,
) -> Result<community::SiteContributorInfo, String> {
    community::get_site_contributor_info(&dive_site_id).await
}

#[tauri::command]
pub async fn community_get_distinct_species() -> Result<Vec<String>, String> {
    community::get_distinct_species().await
}

#[tauri::command]
pub async fn community_search(
    query: String,
) -> Result<community::CommunitySearchResults, String> {
    community::community_search(&query).await
}