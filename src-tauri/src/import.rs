use quick_xml::events::Event;
use quick_xml::Reader;
use std::path::Path;
use crate::db::{Dive, DiveSample, DiveEvent, Db, TankPressure, DiveTank};

#[derive(Debug)]
pub struct ImportedDive {
    pub dive: Dive,
    pub samples: Vec<DiveSample>,
    pub events: Vec<DiveEvent>,
    pub tank_pressures: Vec<TankPressure>,
    pub tanks: Vec<DiveTank>,
}

#[derive(Debug)]
pub struct ImportResult {
    pub dives: Vec<ImportedDive>,
    pub trip_name: String,
    pub date_start: String,
    pub date_end: String,
}

/// Detect file type and parse accordingly
pub fn parse_dive_file(path: &Path) -> Result<ImportResult, String> {
    let extension = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    
    match extension.as_str() {
        "ssrf" | "xml" => parse_ssrf_file(path),
        "json" => parse_suunto_json_file(path),
        "fit" => parse_fit_file(path),
        _ => Err(format!("Unsupported file format: .{}", extension)),
    }
}

/// Parse a .ssrf file and extract dive data
pub fn parse_ssrf_file(path: &Path) -> Result<ImportResult, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    parse_ssrf_content(&content)
}

pub fn parse_ssrf_content(content: &str) -> Result<ImportResult, String> {
    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(true);
    
    let mut dives: Vec<ImportedDive> = Vec::new();
    let mut current_dive: Option<Dive> = None;
    let mut current_samples: Vec<DiveSample> = Vec::new();
    let mut current_events: Vec<DiveEvent> = Vec::new();
    let mut current_tank_pressures: Vec<TankPressure> = Vec::new();
    let mut current_tanks: Vec<DiveTank> = Vec::new();
    let mut in_divecomputer = false;
    let mut cylinder_index: i32 = 0;
    
    let mut buf = Vec::new();
    
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                match e.name().as_ref() {
                    b"dive" => {
                        let mut dive = Dive {
                            id: 0,
                            trip_id: 0,
                            dive_number: 0,
                            date: String::new(),
                            time: String::new(),
                            duration_seconds: 0,
                            max_depth_m: 0.0,
                            mean_depth_m: 0.0,
                            water_temp_c: None,
                            air_temp_c: None,
                            surface_pressure_bar: None,
                            otu: None,
                            cns_percent: None,
                            dive_computer_model: None,
                            dive_computer_serial: None,
                            location: None,
                            ocean: None,
                            visibility_m: None,
                            gear_profile_id: None,
                            buddy: None,
                            divemaster: None,
                            guide: None,
                            instructor: None,
                            comments: None,
                            latitude: None,
                            longitude: None,
                            dive_site_id: None,
                            is_fresh_water: false,
                            is_boat_dive: false,
                            is_drift_dive: false,
                            is_night_dive: false,
                            is_training_dive: false,
                            created_at: String::new(),
                            updated_at: String::new(),
                        };
                        
                        for attr in e.attributes().flatten() {
                            match attr.key.as_ref() {
                                b"number" => {
                                    dive.dive_number = String::from_utf8_lossy(&attr.value)
                                        .parse().unwrap_or(0);
                                }
                                b"date" => {
                                    dive.date = String::from_utf8_lossy(&attr.value).to_string();
                                }
                                b"time" => {
                                    dive.time = String::from_utf8_lossy(&attr.value).to_string();
                                }
                                b"duration" => {
                                    dive.duration_seconds = parse_duration(&String::from_utf8_lossy(&attr.value));
                                }
                                b"otu" => {
                                    dive.otu = String::from_utf8_lossy(&attr.value).parse().ok();
                                }
                                b"cns" => {
                                    let cns_str = String::from_utf8_lossy(&attr.value);
                                    dive.cns_percent = cns_str.trim_end_matches('%').parse().ok();
                                }
                                _ => {}
                            }
                        }
                        current_dive = Some(dive);
                        current_samples.clear();
                        current_events.clear();
                        current_tank_pressures.clear();
                        current_tanks.clear();
                        cylinder_index = 0;
                    }
                    b"cylinder" => {
                        // Parse cylinder/tank with gas mix info
                        let mut o2_percent: Option<f64> = None;
                        let mut he_percent: Option<f64> = None;
                        let mut start_pressure: Option<f64> = None;
                        let mut end_pressure: Option<f64> = None;
                        
                        for attr in e.attributes().flatten() {
                            match attr.key.as_ref() {
                                b"o2" => {
                                    let o2_str = String::from_utf8_lossy(&attr.value);
                                    o2_percent = o2_str.trim_end_matches('%').parse().ok();
                                }
                                b"he" => {
                                    let he_str = String::from_utf8_lossy(&attr.value);
                                    he_percent = he_str.trim_end_matches('%').parse().ok();
                                }
                                b"start" => {
                                    start_pressure = Some(parse_pressure(&String::from_utf8_lossy(&attr.value)));
                                }
                                b"end" => {
                                    end_pressure = Some(parse_pressure(&String::from_utf8_lossy(&attr.value)));
                                }
                                _ => {}
                            }
                        }
                        
                        // Create DiveTank entry
                        current_tanks.push(DiveTank {
                            id: 0,
                            dive_id: 0,
                            sensor_id: cylinder_index as i64,
                            sensor_name: None,
                            gas_index: cylinder_index,
                            o2_percent,
                            he_percent,
                            start_pressure_bar: start_pressure,
                            end_pressure_bar: end_pressure,
                            volume_used_liters: None,
                        });
                        
                        cylinder_index += 1;
                    }
                    b"divecomputer" => {
                        in_divecomputer = true;
                        if let Some(ref mut dive) = current_dive {
                            for attr in e.attributes().flatten() {
                                match attr.key.as_ref() {
                                    b"model" => {
                                        dive.dive_computer_model = Some(
                                            String::from_utf8_lossy(&attr.value).to_string()
                                        );
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                    b"depth" if in_divecomputer => {
                        if let Some(ref mut dive) = current_dive {
                            for attr in e.attributes().flatten() {
                                match attr.key.as_ref() {
                                    b"max" => {
                                        dive.max_depth_m = parse_depth(&String::from_utf8_lossy(&attr.value));
                                    }
                                    b"mean" => {
                                        dive.mean_depth_m = parse_depth(&String::from_utf8_lossy(&attr.value));
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                    b"temperature" if in_divecomputer => {
                        if let Some(ref mut dive) = current_dive {
                            for attr in e.attributes().flatten() {
                                match attr.key.as_ref() {
                                    b"water" => {
                                        dive.water_temp_c = Some(parse_temp(&String::from_utf8_lossy(&attr.value)));
                                    }
                                    b"air" => {
                                        dive.air_temp_c = Some(parse_temp(&String::from_utf8_lossy(&attr.value)));
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                    b"surface" if in_divecomputer => {
                        if let Some(ref mut dive) = current_dive {
                            for attr in e.attributes().flatten() {
                                if attr.key.as_ref() == b"pressure" {
                                    dive.surface_pressure_bar = Some(
                                        parse_pressure(&String::from_utf8_lossy(&attr.value))
                                    );
                                }
                            }
                        }
                    }
                    b"extradata" if in_divecomputer => {
                        if let Some(ref mut dive) = current_dive {
                            let mut key = String::new();
                            let mut value = String::new();
                            for attr in e.attributes().flatten() {
                                match attr.key.as_ref() {
                                    b"key" => key = String::from_utf8_lossy(&attr.value).to_string(),
                                    b"value" => value = String::from_utf8_lossy(&attr.value).to_string(),
                                    _ => {}
                                }
                            }
                            if key == "Serial" {
                                dive.dive_computer_serial = Some(value);
                            }
                        }
                    }
                    b"sample" if in_divecomputer => {
                        let mut sample = DiveSample {
                            id: 0,
                            dive_id: 0,
                            time_seconds: 0,
                            depth_m: 0.0,
                            temp_c: None,
                            pressure_bar: None,
                            ndl_seconds: None,
                            rbt_seconds: None,
                        };
                        // Support multiple tank pressures (pressure0, pressure1, pressure2, etc.)
                        let mut tank_pressures_in_sample: Vec<(i64, f64)> = Vec::new();
                        
                        for attr in e.attributes().flatten() {
                            let key = attr.key.as_ref();
                            match key {
                                b"time" => {
                                    sample.time_seconds = parse_duration(&String::from_utf8_lossy(&attr.value));
                                }
                                b"depth" => {
                                    sample.depth_m = parse_depth(&String::from_utf8_lossy(&attr.value));
                                }
                                b"temp" => {
                                    sample.temp_c = Some(parse_temp(&String::from_utf8_lossy(&attr.value)));
                                }
                                b"ndl" => {
                                    sample.ndl_seconds = Some(parse_duration(&String::from_utf8_lossy(&attr.value)));
                                }
                                b"rbt" => {
                                    sample.rbt_seconds = Some(parse_duration(&String::from_utf8_lossy(&attr.value)));
                                }
                                _ => {
                                    // Check for pressure0, pressure1, pressure2, etc.
                                    let key_str = String::from_utf8_lossy(key);
                                    if key_str.starts_with("pressure") {
                                        if let Some(idx_str) = key_str.strip_prefix("pressure") {
                                            let sensor_id: i64 = idx_str.parse().unwrap_or(0);
                                            let pressure = parse_pressure(&String::from_utf8_lossy(&attr.value));
                                            if pressure > 0.0 {
                                                tank_pressures_in_sample.push((sensor_id, pressure));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Add tank pressures to the collection
                        for (sensor_id, pressure) in tank_pressures_in_sample {
                            current_tank_pressures.push(TankPressure {
                                id: 0,
                                dive_id: 0,
                                sensor_id,
                                sensor_name: None,
                                time_seconds: sample.time_seconds,
                                pressure_bar: pressure,
                            });
                        }
                        
                        current_samples.push(sample);
                    }
                    b"event" if in_divecomputer => {
                        let mut event = DiveEvent {
                            id: 0,
                            dive_id: 0,
                            time_seconds: 0,
                            event_type: 0,
                            name: String::new(),
                            flags: None,
                            value: None,
                        };
                        
                        for attr in e.attributes().flatten() {
                            match attr.key.as_ref() {
                                b"time" => {
                                    event.time_seconds = parse_duration(&String::from_utf8_lossy(&attr.value));
                                }
                                b"type" => {
                                    event.event_type = String::from_utf8_lossy(&attr.value)
                                        .parse().unwrap_or(0);
                                }
                                b"name" => {
                                    event.name = String::from_utf8_lossy(&attr.value).to_string();
                                }
                                b"flags" => {
                                    event.flags = String::from_utf8_lossy(&attr.value).parse().ok();
                                }
                                b"value" => {
                                    event.value = String::from_utf8_lossy(&attr.value).parse().ok();
                                }
                                _ => {}
                            }
                        }
                        current_events.push(event);
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                match e.name().as_ref() {
                    b"dive" => {
                        if let Some(dive) = current_dive.take() {
                            dives.push(ImportedDive {
                                dive,
                                samples: std::mem::take(&mut current_samples),
                                events: std::mem::take(&mut current_events),
                                tank_pressures: std::mem::take(&mut current_tank_pressures),
                                tanks: std::mem::take(&mut current_tanks),
                            });
                        }
                    }
                    b"divecomputer" => {
                        in_divecomputer = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
        buf.clear();
    }
    
    // Determine trip date range from dives
    let (date_start, date_end) = if !dives.is_empty() {
        let dates: Vec<&str> = dives.iter().map(|d| d.dive.date.as_str()).collect();
        let start = dates.iter().min().unwrap_or(&"").to_string();
        let end = dates.iter().max().unwrap_or(&"").to_string();
        (start, end)
    } else {
        (String::new(), String::new())
    };
    
    // Generate trip name from file or dates
    let trip_name = format!("Dive Trip {}", &date_start);
    
    Ok(ImportResult {
        dives,
        trip_name,
        date_start,
        date_end,
    })
}

/// Parse duration string like "66:40 min" to seconds
fn parse_duration(s: &str) -> i32 {
    let s = s.trim().trim_end_matches(" min");
    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        2 => {
            let mins: i32 = parts[0].parse().unwrap_or(0);
            let secs: i32 = parts[1].parse().unwrap_or(0);
            mins * 60 + secs
        }
        1 => parts[0].parse().unwrap_or(0) * 60,
        _ => 0,
    }
}

/// Parse depth string like "22.893 m" to meters
fn parse_depth(s: &str) -> f64 {
    s.trim().trim_end_matches(" m").parse().unwrap_or(0.0)
}

/// Parse temperature string like "28.7 C" to celsius
fn parse_temp(s: &str) -> f64 {
    s.trim().trim_end_matches(" C").parse().unwrap_or(0.0)
}

/// Parse pressure string like "210.14 bar" to bar
fn parse_pressure(s: &str) -> f64 {
    s.trim().trim_end_matches(" bar").parse().unwrap_or(0.0)
}

/// Import dives from .ssrf file into database
/// If trip_id is provided, add dives to existing trip; otherwise create a new trip
pub fn import_to_database(db: &Db, mut result: ImportResult, existing_trip_id: Option<i64>) -> Result<i64, String> {
    // Sort dives by date and time before importing
    result.dives.sort_by(|a, b| {
        let date_cmp = a.dive.date.cmp(&b.dive.date);
        if date_cmp == std::cmp::Ordering::Equal {
            a.dive.time.cmp(&b.dive.time)
        } else {
            date_cmp
        }
    });
    
    // Use existing trip or create new one
    let trip_id = match existing_trip_id {
        Some(id) => id,
        None => {
            // Create new trip
            db.create_trip(
                &result.trip_name,
                "",
                &result.date_start,
                &result.date_end,
            ).map_err(|e| format!("Failed to create trip: {}", e))?
        }
    };
    
    // Get the highest dive number for this trip to continue numbering
    let existing_dives = db.get_dives_for_trip(trip_id)
        .map_err(|e| format!("Failed to get existing dives: {}", e))?;
    let max_dive_number = existing_dives.iter()
        .map(|d| d.dive_number)
        .max()
        .unwrap_or(0);
    
    // Insert dives with samples and events (now in chronological order)
    for (i, imported) in result.dives.into_iter().enumerate() {
        let mut dive = imported.dive;
        dive.trip_id = trip_id;
        // Keep original dive number if importing to new trip, otherwise renumber
        if existing_trip_id.is_some() {
            dive.dive_number = max_dive_number + (i as i32) + 1;
        }
        
        let dive_id = db.insert_dive(&dive)
            .map_err(|e| format!("Failed to insert dive: {}", e))?;
        
        // Insert samples using batch operation for performance
        if !imported.samples.is_empty() {
            db.insert_dive_samples_batch(dive_id, &imported.samples)
                .map_err(|e| format!("Failed to insert samples: {}", e))?;
        }
        
        // Insert events using batch operation for performance
        if !imported.events.is_empty() {
            db.insert_dive_events_batch(dive_id, &imported.events)
                .map_err(|e| format!("Failed to insert events: {}", e))?;
        }
        
        // Insert tank pressures using batch operation for performance
        if !imported.tank_pressures.is_empty() {
            db.insert_tank_pressures_batch(dive_id, &imported.tank_pressures)
                .map_err(|e| format!("Failed to insert tank pressures: {}", e))?;
        }
        
        // Insert dive tanks (gas mix and summary data)
        if !imported.tanks.is_empty() {
            db.insert_dive_tanks_batch(dive_id, &imported.tanks)
                .map_err(|e| format!("Failed to insert dive tanks: {}", e))?;
        }
    }
    
    Ok(trip_id)
}

// ============================================================================
// Suunto JSON Import
// ============================================================================

use serde::Deserialize;
use serde_json::Value as JsonValue;

/// Suunto app exports dives as JSON - supports multiple formats
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoExport {
    #[serde(default)]
    dive_log: Option<SuuntoDiveLog>,
    // Alternative format: array of dives directly
    #[serde(default)]
    dives: Option<Vec<SuuntoDive>>,
    // Suunto app DeviceLog format
    #[serde(default)]
    device_log: Option<SuuntoDeviceLog>,
}

/// Suunto app DeviceLog format (exported from Suunto app)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoDeviceLog {
    #[serde(default)]
    header: Option<SuuntoDeviceHeader>,
    #[serde(default)]
    samples: Option<Vec<SuuntoDeviceSample>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoDeviceHeader {
    #[serde(default)]
    activity: Option<String>,
    #[serde(default)]
    date_time: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    depth: Option<SuuntoDepthInfo>,
    #[serde(default)]
    device: Option<SuuntoDeviceInfo>,
    #[serde(default)]
    diving: Option<SuuntoDivingInfo>,
    #[serde(default)]
    sample_interval: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoDepthInfo {
    #[serde(default)]
    avg: Option<f64>,
    #[serde(default)]
    max: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoDeviceInfo {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    serial_number: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoDivingInfo {
    #[serde(default)]
    surface_pressure: Option<f64>,
    #[serde(default)]
    number_in_series: Option<i32>,
    #[serde(default)]
    gases: Option<Vec<SuuntoGasInfo>>,
    #[serde(default)]
    end_tissue: Option<SuuntoTissueInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoGasInfo {
    #[serde(default)]
    oxygen: Option<f64>,
    #[serde(default)]
    helium: Option<f64>,
    #[serde(default, alias = "StartPressure")]
    start_pressure: Option<f64>,  // in Pa (e.g., 22276562 = 222.76 bar)
    #[serde(default, alias = "EndPressure")]
    end_pressure: Option<f64>,    // in Pa
    #[serde(default, alias = "TransmitterID")]
    transmitter_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoTissueInfo {
    #[serde(default, alias = "CNS")]
    cns: Option<f64>,
    #[serde(default, alias = "OTU")]
    otu: Option<f64>,
}

/// Sample from DeviceLog format
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoDeviceSample {
    #[serde(default)]
    depth: Option<f64>,
    #[serde(default)]
    temperature: Option<f64>,
    #[serde(default)]
    time: Option<f64>,
    #[serde(default)]
    tank_pressure: Option<Vec<f64>>,  // Array of tank pressures in Pa
    #[serde(default, alias = "TankPressure")]
    tank_pressure_single: Option<f64>,
    #[serde(default)]
    events: Option<Vec<JsonValue>>,  // Events are complex, just capture as JSON
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoDiveLog {
    #[serde(default)]
    dives: Vec<SuuntoDive>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoDive {
    #[serde(default, alias = "StartTime", alias = "start_time")]
    start_time: Option<String>,
    #[serde(default, alias = "DiveNumberInSerie", alias = "dive_number")]
    dive_number: Option<i32>,
    #[serde(default, alias = "Duration", alias = "duration", alias = "DiveTime")]
    duration: Option<f64>,  // in seconds
    #[serde(default, alias = "MaxDepth", alias = "max_depth")]
    max_depth: Option<f64>,  // in meters
    #[serde(default, alias = "AvgDepth", alias = "avg_depth")]
    avg_depth: Option<f64>,
    #[serde(default, alias = "WaterTemperatureMinimum", alias = "MinWaterTemp")]
    water_temp_min: Option<f64>,  // Kelvin in some formats
    #[serde(default, alias = "WaterTemperatureMaximum", alias = "MaxWaterTemp")]
    water_temp_max: Option<f64>,
    #[serde(default, alias = "SurfacePressure")]
    surface_pressure: Option<f64>,  // in Pa
    #[serde(default, alias = "OTU", alias = "otu")]
    otu: Option<f64>,
    #[serde(default, alias = "CNS", alias = "cns")]
    cns: Option<f64>,
    #[serde(default, alias = "DeviceModel", alias = "Source", alias = "Computer")]
    device_model: Option<String>,
    #[serde(default, alias = "DeviceSerial", alias = "SerialNumber")]
    device_serial: Option<String>,
    #[serde(default, alias = "DiveSite", alias = "Location")]
    dive_site: Option<String>,
    #[serde(default, alias = "Note", alias = "Notes")]
    notes: Option<String>,
    #[serde(default, alias = "DiveSamples", alias = "Samples")]
    samples: Option<Vec<SuuntoSample>>,
    // Alternative sample format
    #[serde(default, alias = "DiveProfile")]
    dive_profile: Option<Vec<SuuntoProfilePoint>>,
    // GPS coordinates
    #[serde(default, alias = "Latitude", alias = "StartLatitude")]
    latitude: Option<f64>,
    #[serde(default, alias = "Longitude", alias = "StartLongitude")]
    longitude: Option<f64>,
    // Gas mix
    #[serde(default, alias = "Cylinder", alias = "Cylinders")]
    cylinders: Option<Vec<SuuntoCylinder>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoSample {
    #[serde(default, alias = "Time", alias = "time", alias = "t")]
    time: Option<f64>,  // in seconds
    #[serde(default, alias = "Depth", alias = "depth", alias = "d")]
    depth: Option<f64>,  // in meters
    #[serde(default, alias = "Temperature", alias = "temp", alias = "Temp")]
    temperature: Option<f64>,  // Kelvin or Celsius depending on format
    #[serde(default, alias = "Pressure", alias = "TankPressure", alias = "pressure", alias = "Tank1Pressure", alias = "CylinderPressure")]
    pressure: Option<f64>,  // in Pa or bar
    #[serde(default, alias = "NDL", alias = "NoDecoTime", alias = "ndl", alias = "NoDecoLimit")]
    ndl: Option<f64>,  // in seconds
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoProfilePoint {
    #[serde(default)]
    time: Option<f64>,
    #[serde(default)]
    depth: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SuuntoCylinder {
    #[serde(default, alias = "O2", alias = "Oxygen")]
    oxygen: Option<f64>,  // fraction 0.0-1.0 or percentage
}

/// Parse a Suunto JSON export file
pub fn parse_suunto_json_file(path: &Path) -> Result<ImportResult, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    parse_suunto_json_content(&content)
}

pub fn parse_suunto_json_content(content: &str) -> Result<ImportResult, String> {
    // Log a snippet of the raw JSON to help debug
    log::info!("Suunto JSON content preview (first 2000 chars): {}", &content[..content.len().min(2000)]);
    
    // Try parsing as Suunto export format
    let export: SuuntoExport = serde_json::from_str(content)
        .map_err(|e| format!("Failed to parse Suunto JSON: {}", e))?;
    
    // Check for DeviceLog format first (Suunto app export)
    if let Some(device_log) = export.device_log {
        log::info!("Detected Suunto DeviceLog format");
        return parse_suunto_device_log(device_log);
    }
    
    // Get dives from DiveLog or Dives format
    let suunto_dives = export.dive_log
        .map(|dl| dl.dives)
        .or(export.dives)
        .unwrap_or_default();
    
    if suunto_dives.is_empty() {
        return Err("No dives found in Suunto JSON file. Expected DeviceLog, DiveLog, or Dives format.".to_string());
    }
    
    parse_suunto_dives_format(suunto_dives)
}

/// Parse the Suunto app DeviceLog format
fn parse_suunto_device_log(device_log: SuuntoDeviceLog) -> Result<ImportResult, String> {
    let header = device_log.header.ok_or("DeviceLog missing Header")?;
    
    // Parse date/time
    let (date, time) = parse_suunto_datetime(header.date_time.as_deref());
    
    // Get depth info
    let (max_depth, avg_depth) = header.depth
        .map(|d| (d.max.unwrap_or(0.0), d.avg.unwrap_or(0.0)))
        .unwrap_or((0.0, 0.0));
    
    // Get device info
    let (device_model, device_serial) = header.device
        .map(|d| (d.name, d.serial_number))
        .unwrap_or((None, None));
    
    // Get diving info
    let diving = header.diving;
    let surface_pressure = diving.as_ref()
        .and_then(|d| d.surface_pressure)
        .map(|p| p / 100000.0);  // Pa to bar
    
    let dive_number = diving.as_ref()
        .and_then(|d| d.number_in_series)
        .unwrap_or(1);
    
    // Parse ALL gases into DiveTank entries
    let gases = diving.as_ref().and_then(|d| d.gases.as_ref());
    let mut dive_tanks: Vec<DiveTank> = Vec::new();
    
    if let Some(gas_list) = gases {
        for (index, gas) in gas_list.iter().enumerate() {
            let o2_percent = gas.oxygen.map(|o2| if o2 <= 1.0 { o2 * 100.0 } else { o2 });
            let he_percent = gas.helium.map(|he| if he <= 1.0 { he * 100.0 } else { he });
            let start_pressure = gas.start_pressure.map(|p| p / 100000.0);  // Pa to bar
            let end_pressure = gas.end_pressure.map(|p| p / 100000.0);  // Pa to bar
            
            // Use transmitter_id as sensor_name if available
            let sensor_name = gas.transmitter_id.clone();
            
            dive_tanks.push(DiveTank {
                id: 0,
                dive_id: 0,
                sensor_id: index as i64,
                sensor_name,
                gas_index: index as i32,
                o2_percent,
                he_percent,
                start_pressure_bar: start_pressure,
                end_pressure_bar: end_pressure,
                volume_used_liters: None,
            });
        }
    }
    
    // Get first gas info for tank pressure extraction
    let gas_info = gases.and_then(|g| g.first());
    
    let start_tank_pressure = gas_info
        .and_then(|g| g.start_pressure)
        .map(|p| p / 100000.0);  // Pa to bar
    let end_tank_pressure = gas_info
        .and_then(|g| g.end_pressure)
        .map(|p| p / 100000.0);  // Pa to bar
    
    log::info!("Parsed {} gas mixes, primary tank pressure: start={:?} bar, end={:?} bar", dive_tanks.len(), start_tank_pressure, end_tank_pressure);
    
    // Get CNS/OTU from end tissue
    let tissue = diving.as_ref().and_then(|d| d.end_tissue.as_ref());
    let cns = tissue.and_then(|t| t.cns).map(|c| if c <= 1.0 { c * 100.0 } else { c });
    let otu = tissue.and_then(|t| t.otu).map(|o| o as i32);
    
    // Parse samples and tank pressures
    let sample_interval = header.sample_interval.unwrap_or(10.0) as i32;
    let (samples, tank_pressures) = parse_suunto_device_samples(
        device_log.samples.unwrap_or_default(),
        sample_interval,
        start_tank_pressure,
        end_tank_pressure,
    );
    
    log::info!("Parsed {} samples and {} tank pressures from DeviceLog", samples.len(), tank_pressures.len());
    
    let dive = Dive {
        id: 0,
        trip_id: 0,
        dive_number,
        date,
        time,
        duration_seconds: header.duration.map(|d| d as i32).unwrap_or(0),
        max_depth_m: max_depth,
        mean_depth_m: avg_depth,
        water_temp_c: None,  // Will be extracted from samples
        air_temp_c: None,
        surface_pressure_bar: surface_pressure,
        otu,
        cns_percent: cns,
        dive_computer_model: device_model,
        dive_computer_serial: device_serial,
        location: None,
        ocean: None,
        visibility_m: None,
        gear_profile_id: None,
        buddy: None,
        divemaster: None,
        guide: None,
        instructor: None,
        comments: None,
        latitude: None,
        longitude: None,
        dive_site_id: None,
        is_fresh_water: false,
        is_boat_dive: false,
        is_drift_dive: false,
        is_night_dive: false,
        is_training_dive: false,
        created_at: String::new(),
        updated_at: String::new(),
    };
    
    let dives = vec![ImportedDive {
        dive,
        samples,
        events: Vec::new(),
        tank_pressures,
        tanks: dive_tanks,
    }];
    
    // Determine trip info
    let trip_name = format!("Suunto Import {}", chrono::Local::now().format("%Y-%m-%d"));
    let date_start = dives.first().map(|d| d.dive.date.clone()).unwrap_or_default();
    let date_end = date_start.clone();
    
    Ok(ImportResult {
        dives,
        trip_name,
        date_start,
        date_end,
    })
}

/// Parse samples from DeviceLog format - returns (samples, tank_pressures)
fn parse_suunto_device_samples(
    samples: Vec<SuuntoDeviceSample>,
    sample_interval: i32,
    start_pressure: Option<f64>,
    end_pressure: Option<f64>,
) -> (Vec<DiveSample>, Vec<TankPressure>) {
    let mut dive_samples = Vec::new();
    let mut tank_pressures = Vec::new();
    let total_samples = samples.len();
    
    // Calculate pressure drop per sample for interpolation if we have start/end pressures
    let pressure_drop_per_sample = match (start_pressure, end_pressure, total_samples) {
        (Some(start), Some(end), n) if n > 1 => Some((start - end) / (n as f64 - 1.0)),
        _ => None,
    };
    
    // Use sensor_id 0 for Suunto single-tank data
    const SUUNTO_DEFAULT_SENSOR_ID: i64 = 0;
    
    for (idx, sample) in samples.iter().enumerate() {
        let time_seconds = sample.time
            .map(|t| t as i32)
            .unwrap_or(idx as i32 * sample_interval);
        
        let depth_m = sample.depth.unwrap_or(0.0);
        
        // Temperature - convert from Kelvin if needed
        let temp_c = sample.temperature.map(|t| {
            if t > 200.0 { t - 273.15 } else { t }
        });
        
        // Tank pressure - try multiple sources
        let pressure_bar = sample.tank_pressure
            .as_ref()
            .and_then(|arr| arr.first())
            .map(|p| p / 100000.0)  // Pa to bar
            .or(sample.tank_pressure_single.map(|p| p / 100000.0))
            .or_else(|| {
                // Interpolate from start/end pressure if available
                pressure_drop_per_sample.map(|drop| {
                    start_pressure.unwrap_or(0.0) - (drop * idx as f64)
                })
            });
        
        // Log first few samples for debugging
        if idx < 3 {
            log::info!("Sample {}: time={}, depth={}, temp={:?}, pressure={:?}", 
                idx, time_seconds, depth_m, temp_c, pressure_bar);
        }
        
        // Add tank pressure to tank_pressures table if we have pressure data
        if let Some(pressure) = pressure_bar {
            tank_pressures.push(TankPressure {
                id: 0,
                dive_id: 0,
                sensor_id: SUUNTO_DEFAULT_SENSOR_ID,
                sensor_name: None,
                time_seconds,
                pressure_bar: pressure,
            });
        }
        
        dive_samples.push(DiveSample {
            id: 0,
            dive_id: 0,
            time_seconds,
            depth_m,
            temp_c,
            pressure_bar: None,  // Tank pressure now in tank_pressures table
            ndl_seconds: None,
            rbt_seconds: None,
        });
    }
    
    log::info!("Parsed {} dive samples and {} tank pressure readings", dive_samples.len(), tank_pressures.len());
    
    (dive_samples, tank_pressures)
}

/// Parse the older DiveLog/Dives format
fn parse_suunto_dives_format(suunto_dives: Vec<SuuntoDive>) -> Result<ImportResult, String> {
    let mut dives: Vec<ImportedDive> = Vec::new();
    let mut dive_number_counter = 1;
    
    for suunto_dive in suunto_dives {
        // Parse start time
        let (date, time) = parse_suunto_datetime(suunto_dive.start_time.as_deref());
        
        // Convert temperature from Kelvin to Celsius if needed
        let water_temp = suunto_dive.water_temp_min
            .or(suunto_dive.water_temp_max)
            .map(|t| if t > 200.0 { t - 273.15 } else { t });  // Kelvin to Celsius
        
        // Convert surface pressure from Pa to bar if needed
        let surface_pressure = suunto_dive.surface_pressure
            .map(|p| if p > 10000.0 { p / 100000.0 } else { p });  // Pa to bar
        
        // Parse ALL cylinders into DiveTank entries
        let mut dive_tanks: Vec<DiveTank> = Vec::new();
        if let Some(ref cylinders) = suunto_dive.cylinders {
            for (index, cyl) in cylinders.iter().enumerate() {
                let o2_percent = cyl.oxygen.map(|o2| if o2 <= 1.0 { o2 * 100.0 } else { o2 });
                
                dive_tanks.push(DiveTank {
                    id: 0,
                    dive_id: 0,
                    sensor_id: index as i64,
                    sensor_name: None,
                    gas_index: index as i32,
                    o2_percent,
                    he_percent: None,  // Suunto DiveLog cylinder doesn't have helium
                    start_pressure_bar: None,  // Not available in SuuntoCylinder struct
                    end_pressure_bar: None,
                    volume_used_liters: None,
                });
            }
        }
        
        // Parse samples and tank pressures before moving fields from suunto_dive
        let (samples, tank_pressures) = parse_suunto_samples(&suunto_dive);
        
        let dive = Dive {
            id: 0,
            trip_id: 0,
            dive_number: suunto_dive.dive_number.unwrap_or(dive_number_counter),
            date,
            time,
            duration_seconds: suunto_dive.duration.map(|d| d as i32).unwrap_or(0),
            max_depth_m: suunto_dive.max_depth.unwrap_or(0.0),
            mean_depth_m: suunto_dive.avg_depth.unwrap_or(0.0),
            water_temp_c: water_temp,
            air_temp_c: None,
            surface_pressure_bar: surface_pressure,
            otu: suunto_dive.otu.map(|o| o as i32),
            cns_percent: suunto_dive.cns.map(|c| if c > 1.0 { c } else { c * 100.0 }),
            dive_computer_model: suunto_dive.device_model,
            dive_computer_serial: suunto_dive.device_serial,
            location: suunto_dive.dive_site,
            ocean: None,
            visibility_m: None,
            gear_profile_id: None,
            buddy: None,
            divemaster: None,
            guide: None,
            instructor: None,
            comments: suunto_dive.notes,
            latitude: suunto_dive.latitude,
            longitude: suunto_dive.longitude,
            dive_site_id: None,
            is_fresh_water: false,
            is_boat_dive: false,
            is_drift_dive: false,
            is_night_dive: false,
            is_training_dive: false,
            created_at: String::new(),
            updated_at: String::new(),
        };
        
        dives.push(ImportedDive {
            dive,
            samples,
            events: Vec::new(),
            tank_pressures,
            tanks: dive_tanks,
        });
        
        dive_number_counter += 1;
    }
    
    // Determine trip date range
    let (date_start, date_end) = if !dives.is_empty() {
        let dates: Vec<&str> = dives.iter().map(|d| d.dive.date.as_str()).collect();
        let start = dates.iter().min().unwrap_or(&"").to_string();
        let end = dates.iter().max().unwrap_or(&"").to_string();
        (start, end)
    } else {
        (String::new(), String::new())
    };
    
    let trip_name = format!("Suunto Import {}", &date_start);
    
    Ok(ImportResult {
        dives,
        trip_name,
        date_start,
        date_end,
    })
}

fn parse_suunto_datetime(datetime_str: Option<&str>) -> (String, String) {
    match datetime_str {
        Some(s) => {
            // Common formats: "2024-01-15T10:30:00Z", "2024-01-15 10:30:00"
            let cleaned = s.replace('T', " ").replace('Z', "");
            let parts: Vec<&str> = cleaned.split_whitespace().collect();
            match parts.len() {
                2 => (parts[0].to_string(), parts[1].to_string()),
                1 => (parts[0].to_string(), "00:00:00".to_string()),
                _ => (String::new(), String::new()),
            }
        }
        None => (String::new(), String::new()),
    }
}

/// Parse samples from older DiveLog/Dives format - returns (samples, tank_pressures)
fn parse_suunto_samples(dive: &SuuntoDive) -> (Vec<DiveSample>, Vec<TankPressure>) {
    let mut samples = Vec::new();
    let mut tank_pressures = Vec::new();
    let mut pressure_count = 0;
    
    // Use sensor_id 0 for Suunto single-tank data
    const SUUNTO_DEFAULT_SENSOR_ID: i64 = 0;
    
    // Try DiveSamples first
    if let Some(ref suunto_samples) = dive.samples {
        for s in suunto_samples {
            let temp = s.temperature.map(|t| if t > 200.0 { t - 273.15 } else { t });
            let pressure = s.pressure.map(|p| if p > 10000.0 { p / 100000.0 } else { p });
            let time_seconds = s.time.map(|t| t as i32).unwrap_or(0);
            
            if let Some(pressure_bar) = pressure {
                pressure_count += 1;
                tank_pressures.push(TankPressure {
                    id: 0,
                    dive_id: 0,
                    sensor_id: SUUNTO_DEFAULT_SENSOR_ID,
                    sensor_name: None,
                    time_seconds,
                    pressure_bar,
                });
            }
            
            samples.push(DiveSample {
                id: 0,
                dive_id: 0,
                time_seconds,
                depth_m: s.depth.unwrap_or(0.0),
                temp_c: temp,
                pressure_bar: None,  // Tank pressure now in tank_pressures table
                ndl_seconds: s.ndl.map(|n| n as i32),
                rbt_seconds: None,
            });
        }
        log::info!("Suunto JSON: parsed {} samples, {} tank pressure readings", samples.len(), pressure_count);
    }
    // Try DiveProfile as fallback
    else if let Some(ref profile) = dive.dive_profile {
        for p in profile {
            samples.push(DiveSample {
                id: 0,
                dive_id: 0,
                time_seconds: p.time.map(|t| t as i32).unwrap_or(0),
                depth_m: p.depth.unwrap_or(0.0),
                temp_c: None,
                pressure_bar: None,
                ndl_seconds: None,
                rbt_seconds: None,
            });
        }
    }
    
    (samples, tank_pressures)
}

// ============================================================================
// Garmin FIT File Import
// ============================================================================

use fitparser::{self, FitDataRecord, Value};
use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;

/// Parse a FIT file (Garmin, Suunto, Shearwater, etc.)
pub fn parse_fit_file(path: &Path) -> Result<ImportResult, String> {
    let file = File::open(path)
        .map_err(|e| format!("Failed to open FIT file: {}", e))?;
    let mut reader = BufReader::new(file);
    
    let records = fitparser::from_reader(&mut reader)
        .map_err(|e| format!("Failed to parse FIT file: {}", e))?;
    
    log::info!("FIT file parsed, found {} records", records.len());
    
    parse_fit_records(records)
}

fn parse_fit_records(records: Vec<FitDataRecord>) -> Result<ImportResult, String> {
    let mut dives: Vec<ImportedDive> = Vec::new();
    let mut current_samples: Vec<DiveSample> = Vec::new();
    let mut current_events: Vec<DiveEvent> = Vec::new();
    let mut current_tank_pressures: Vec<TankPressure> = Vec::new();
    let dive_number = 1;
    
    // Collect ALL data from the file - we'll figure out what's useful later
    let mut all_data: HashMap<String, Value> = HashMap::new();
    let mut record_types: Vec<String> = Vec::new();
    let mut sample_time_offset: i32 = 0;
    let mut start_timestamp: Option<chrono::DateTime<chrono::Utc>> = None;
    
    // Separate collection for tank pressure data (indexed by timestamp or sample number)
    // Format: (timestamp_or_index, pressure_bar, sensor_id, has_timestamp) - sensor_id distinguishes multiple tanks
    let mut tank_pressures: Vec<(i64, f64, i64, bool)> = Vec::new();
    
    // Collect gas mix records: (message_index, o2_percent, he_percent)
    let mut gas_mixes: Vec<(i64, Option<f64>, Option<f64>)> = Vec::new();
    
    // Collect tank summary records: (sensor_id, start_pressure, end_pressure, volume_used)
    let mut tank_summaries: Vec<(i64, Option<f64>, Option<f64>, Option<f64>)> = Vec::new();
    
    for record in &records {
        let kind = record.kind().to_string();
        
        // Track all record types we see
        if !record_types.contains(&kind) {
            record_types.push(kind.clone());
            log::info!("FIT record type: '{}' (len={})", kind, kind.len());
            
            // Log all fields for this record type (first occurrence only)
            for field in record.fields() {
                log::info!("  Field: {} = {:?}", field.name(), field.value());
            }
        }
        
        // DEBUG: Check if this is a gas record
        if kind.to_lowercase().contains("gas") {
            log::info!("FOUND GAS RECORD: kind='{}', matching against 'DiveGas' | 'dive_gas'", kind);
        }
        
        // Collect data from various record types
        match kind.as_str() {
            // Session-level data (common in Garmin files)
            "Session" | "Activity" | "Lap" | "Sport" | "session" | "activity" | "lap" | "sport" => {
                for field in record.fields() {
                    all_data.insert(field.name().to_string(), field.value().clone());
                    // Capture dive start time from session (more accurate than file time_created)
                    if field.name() == "start_time" {
                        if let Value::Timestamp(ts) = field.value() {
                            start_timestamp = Some(ts.with_timezone(&chrono::Utc));
                            log::info!("Captured dive start_time from Session: {:?}", start_timestamp);
                        }
                    }
                }
            }
            // Dive-specific records (Garmin Descent, etc.)
            "DiveSummary" | "dive_summary" | "DiveSettings" | "dive_settings" | "DiveApneaSummary" | "dive_apnea_summary" => {
                for field in record.fields() {
                    all_data.insert(field.name().to_string(), field.value().clone());
                }
            }
            // Gas mix records - parse explicitly to capture multi-gas setups
            "DiveGas" | "dive_gas" => {
                let mut message_index: i64 = gas_mixes.len() as i64;  // Default to next index
                let mut o2_percent: Option<f64> = None;
                let mut he_percent: Option<f64> = None;
                
                for field in record.fields() {
                    let name = field.name().to_lowercase();
                    all_data.insert(field.name().to_string(), field.value().clone());
                    
                    if name == "message_index" {
                        message_index = extract_float(field.value()).map(|f| f as i64).unwrap_or(message_index);
                    } else if name == "oxygen_content" {
                        o2_percent = extract_float(field.value());
                    } else if name == "helium_content" {
                        he_percent = extract_float(field.value());
                    }
                }
                
                log::info!("FIT dive_gas: index={}, O2={:?}%, He={:?}%", message_index, o2_percent, he_percent);
                gas_mixes.push((message_index, o2_percent, he_percent));
            }
            // File identification - use time_created as fallback only
            "FileId" | "file_id" => {
                for field in record.fields() {
                    all_data.insert(format!("file_{}", field.name()), field.value().clone());
                    // Only use time_created if we don't have a start_time from Session yet
                    if field.name() == "time_created" && start_timestamp.is_none() {
                        if let Value::Timestamp(ts) = field.value() {
                            start_timestamp = Some(ts.with_timezone(&chrono::Utc));
                            log::info!("Using file time_created as fallback: {:?}", start_timestamp);
                        }
                    }
                }
            }
            // Sample/record data points - try multiple record types that might have depth
            // Note: fitparser may return lowercase record type names
            "Record" | "record" | "DiveAlarm" | "dive_alarm" | "Length" | "length" => {
                // Log first few records to debug
                if sample_time_offset < 3 {
                    let fields: Vec<String> = record.fields().iter().map(|f| format!("{}={:?}", f.name(), f.value())).collect();
                    log::info!("Record #{} fields: {:?}", sample_time_offset, fields);
                }
                
                // Capture timestamp from first record as dive start if not already set
                if start_timestamp.is_none() {
                    for field in record.fields() {
                        if field.name() == "timestamp" {
                            if let Value::Timestamp(ts) = field.value() {
                                start_timestamp = Some(ts.with_timezone(&chrono::Utc));
                                log::info!("Captured dive start from first record timestamp: {:?}", start_timestamp);
                                break;
                            }
                        }
                    }
                }
                
                let sample = parse_fit_record_to_sample(record, sample_time_offset, start_timestamp);
                if sample.depth_m > 0.0 {
                    current_samples.push(sample);
                }
                sample_time_offset += 1; // Always increment for timing purposes
            }
            // Tank pressure records - Garmin and other dive computers often send these separately
            // Note: fitparser returns lowercase record type names like "tank_update", "tank_summary"
            "TankUpdate" | "tank_update" => {
                let fields: Vec<String> = record.fields().iter().map(|f| format!("{}={:?}", f.name(), f.value())).collect();
                log::info!("Tank update fields: {:?}", fields);
                
                let mut pressure: Option<f64> = None;
                let mut tank_timestamp: Option<i64> = None;
                let mut sensor_id: Option<i64> = None;
                
                for field in record.fields() {
                    let name = field.name().to_lowercase();
                    // Look for "pressure" field but not start/end pressure from summary
                    if name == "pressure" {
                        if let Some(p) = extract_float(field.value()) {
                            // Garmin tank_update records have pressure in bar (e.g., 210.42)
                            // Some formats may use Pa (values > 10000)
                            let p_bar = if p > 10000.0 { p / 100000.0 } else { p };
                            if p_bar > 1.0 && p_bar < 350.0 {
                                pressure = Some(p_bar);
                            }
                        }
                    }
                    if name == "timestamp" {
                        if let Value::Timestamp(ts) = field.value() {
                            tank_timestamp = Some(ts.timestamp());
                        }
                    }
                    // Track sensor ID to distinguish between multiple tanks
                    if name == "sensor" {
                        sensor_id = extract_float(field.value()).map(|f| f as i64);
                    }
                }
                
                if let Some(p) = pressure {
                    // Track whether we have a real timestamp or just a sequential index
                    let (time_value, has_ts) = match tank_timestamp {
                        Some(ts) => (ts, true),
                        None => (tank_pressures.len() as i64, false),
                    };
                    let sid = sensor_id.unwrap_or(0);
                    tank_pressures.push((time_value, p, sid, has_ts));
                    log::info!("Tank pressure: {} bar at time {} (has_ts={}) from sensor {}", p, time_value, has_ts, sid);
                }
            }
            // Tank summary records - contain start/end pressure and volume used per tank
            "TankSummary" | "tank_summary" | "Tank" | "tank" => {
                let fields: Vec<String> = record.fields().iter().map(|f| format!("{}={:?}", f.name(), f.value())).collect();
                log::info!("Tank summary fields: {:?}", fields);
                
                let mut sensor_id: Option<i64> = None;
                let mut start_pressure: Option<f64> = None;
                let mut end_pressure: Option<f64> = None;
                let mut volume_used: Option<f64> = None;
                
                for field in record.fields() {
                    let name = field.name().to_lowercase();
                    
                    if name == "sensor" {
                        sensor_id = extract_float(field.value()).map(|f| f as i64);
                    } else if name == "start_pressure" {
                        start_pressure = extract_float(field.value());
                    } else if name == "end_pressure" {
                        end_pressure = extract_float(field.value());
                    } else if name == "volume_used" {
                        volume_used = extract_float(field.value());
                    }
                }
                
                let sid = sensor_id.unwrap_or(tank_summaries.len() as i64);
                log::info!("Tank summary: sensor={}, start={:?}, end={:?}, volume={:?}", sid, start_pressure, end_pressure, volume_used);
                tank_summaries.push((sid, start_pressure, end_pressure, volume_used));
            }
            // Events
            "Event" => {
                let event = parse_fit_event(record);
                if !event.name.is_empty() {
                    current_events.push(event);
                }
            }
            _ => {
                // For ANY record type that might have depth data, try to extract it
                let mut has_depth = false;
                for field in record.fields() {
                    if field.name().to_lowercase().contains("depth") {
                        has_depth = true;
                        break;
                    }
                }
                
                if has_depth {
                    let sample = parse_fit_record_to_sample(record, sample_time_offset, start_timestamp);
                    if sample.depth_m > 0.0 {
                        current_samples.push(sample);
                        sample_time_offset += 1;
                    }
                }
                
                // Capture any other data that might be useful
                for field in record.fields() {
                    let key = format!("{}_{}", kind.to_lowercase(), field.name());
                    all_data.insert(key, field.value().clone());
                }
            }
        }
    }
    
    log::info!("FIT parsing complete. Record types found: {:?}", record_types);
    log::info!("Total data fields collected: {}", all_data.len());
    log::info!("Total depth samples: {}", current_samples.len());
    log::info!("Total tank pressure readings: {}", tank_pressures.len());
    log::info!("Final start_timestamp: {:?}", start_timestamp);
    
    // ========================================================================
    // IMPORTANT: FIT files have Session.start_time at the END of the file,
    // but samples are parsed BEFORE we see it. We need to recalculate sample
    // time_seconds now that we have the correct start_timestamp.
    // ========================================================================
    
    // First, we need to get sample timestamps to recalculate. We stored them
    // using time_offset initially - we need to find the actual timestamps.
    // The simplest approach: use the dive duration from dive_summary or session.
    let dive_duration_from_metadata = all_data.get("total_elapsed_time")
        .or_else(|| all_data.get("total_timer_time"))
        .and_then(|v| extract_float(v))
        .map(|f| f as i32);
    
    // If samples have bad time_seconds (negative or based on wrong start), recalculate
    // by spreading them evenly across the dive duration
    if let Some(duration) = dive_duration_from_metadata {
        let sample_count = current_samples.len();
        if sample_count > 1 {
            for (i, sample) in current_samples.iter_mut().enumerate() {
                sample.time_seconds = (i as i32 * duration) / (sample_count as i32 - 1);
            }
            log::info!("Recalculated {} sample times over {} seconds", sample_count, duration);
        }
    }
    
    let dive_duration = current_samples.last().map(|s| s.time_seconds).unwrap_or(0);
    log::info!("Dive duration from samples: {} seconds", dive_duration);
    
    // Merge tank pressure data into samples if we have separate tank records
    if !tank_pressures.is_empty() && !current_samples.is_empty() {
        // Check if we have real timestamps (first entry's has_timestamp flag)
        let have_timestamps = tank_pressures.first().map(|t| t.3).unwrap_or(false);
        
        // Group tank pressures by sensor ID to handle multiple tanks
        // Store (time_value, pressure, has_timestamp)
        let mut sensors: HashMap<i64, Vec<(i64, f64, bool)>> = HashMap::new();
        for (time_value, pressure, sensor_id, has_ts) in &tank_pressures {
            sensors.entry(*sensor_id).or_insert_with(Vec::new).push((*time_value, *pressure, *has_ts));
        }
        
        log::info!("Found {} different tank sensors (have_timestamps={})", sensors.len(), have_timestamps);
        for (sensor_id, readings) in &sensors {
            log::info!("  Sensor {}: {} readings, first={:.1} bar, last={:.1} bar", 
                sensor_id, readings.len(),
                readings.first().map(|r| r.1).unwrap_or(0.0),
                readings.last().map(|r| r.1).unwrap_or(0.0));
        }
        
        // Get dive start timestamp for calculating relative tank pressure times
        // Priority: start_timestamp (from Session.start_time) > first tank timestamp
        // Note: start_timestamp should already be set from Session.start_time which is the true dive start
        let dive_start_ts = start_timestamp
            .map(|ts| ts.timestamp())
            .or_else(|| {
                // Fallback: use earliest tank timestamp if no session start_time
                tank_pressures.iter()
                    .filter(|(_, _, _, has_ts)| *has_ts)
                    .map(|(ts, _, _, _)| *ts)
                    .min()
            })
            .unwrap_or(0);
        
        log::info!("Tank time calculation - dive_start_ts: {}, dive_duration: {} seconds", 
            dive_start_ts, dive_duration);
        
        // Create TankPressure records for each sensor
        for (idx, (sensor_id, readings)) in sensors.iter().enumerate() {
            let sensor_name = Some(format!("Tank {}", idx + 1));
            let total_readings = readings.len();
            
            for (i, (time_value, pressure, has_ts)) in readings.iter().enumerate() {
                // Calculate time_seconds based on whether we have real timestamps
                let time_seconds = if *has_ts {
                    // Real timestamp: subtract dive start to get relative offset
                    (*time_value - dive_start_ts) as i32
                } else {
                    // No timestamp: interpolate across dive duration based on reading index
                    if total_readings > 1 {
                        (i as i32 * dive_duration) / (total_readings as i32 - 1)
                    } else {
                        0
                    }
                };
                
                // Only include tank pressures within the dive time range
                if time_seconds >= 0 && time_seconds <= dive_duration {
                    current_tank_pressures.push(TankPressure {
                        id: 0,
                        dive_id: 0,
                        sensor_id: *sensor_id,
                        sensor_name: sensor_name.clone(),
                        time_seconds,
                        pressure_bar: *pressure,
                    });
                }
            }
        }
        
        log::info!("Created {} tank pressure records across {} sensors (filtered to dive duration)", 
            current_tank_pressures.len(), sensors.len());
    }
    
    // Build DiveTank entries from gas_mixes and tank_summaries
    // Strategy: Create a tank for EACH tank summary (physical tank), and associate gas mix if available
    // FIT files can have multiple tank summaries (2 tanks) but only 1 gas mix (both tanks use same gas)
    // The gas_mix message_index indicates which gas in dive_gas records, but for single-gas diving
    // with multiple tanks, all tanks use the same gas
    let mut dive_tanks: Vec<DiveTank> = Vec::new();
    
    log::info!("Building dive tanks from {} gas mixes and {} tank summaries", gas_mixes.len(), tank_summaries.len());
    
    // Get the primary gas mix (index 0) if available - this is the main breathing gas
    let primary_gas: Option<(Option<f64>, Option<f64>)> = gas_mixes.first().map(|(_, o2, he)| (*o2, *he));
    
    if !tank_summaries.is_empty() {
        // Create a tank entry for each physical tank (tank summary)
        for (idx, (sid, sp, ep, vu)) in tank_summaries.iter().enumerate() {
            // Try to find a specific gas mix for this tank by index
            // If not found, use the primary gas (all tanks typically use same gas in recreational diving)
            let (o2, he) = if idx < gas_mixes.len() {
                (gas_mixes[idx].1, gas_mixes[idx].2)
            } else {
                // Use primary gas for additional tanks (sidemount/twinset scenarios)
                primary_gas.unwrap_or((None, None))
            };
            
            log::info!("Creating tank {}: sensor={}, gas O2={:?}% He={:?}%", idx, sid, o2, he);
            
            dive_tanks.push(DiveTank {
                id: 0,
                dive_id: 0,
                sensor_id: *sid,
                sensor_name: None,
                gas_index: idx as i32,
                o2_percent: o2,
                he_percent: he,
                start_pressure_bar: *sp,
                end_pressure_bar: *ep,
                volume_used_liters: *vu,
            });
        }
    } else if !gas_mixes.is_empty() {
        // Have gas mixes but no tank summaries (rare) - create tanks from gas mixes alone
        for (_idx, (msg_idx, o2, he)) in gas_mixes.iter().enumerate() {
            dive_tanks.push(DiveTank {
                id: 0,
                dive_id: 0,
                sensor_id: *msg_idx,
                sensor_name: None,
                gas_index: *msg_idx as i32,
                o2_percent: *o2,
                he_percent: *he,
                start_pressure_bar: None,
                end_pressure_bar: None,
                volume_used_liters: None,
            });
        }
    }
    
    log::info!("Created {} dive tanks", dive_tanks.len());
    
    // Build dive from all collected data
    let dive = build_dive_from_fit_data(&all_data, dive_number, start_timestamp);
    
    // Only add if we have SOME meaningful data
    let has_depth = dive.max_depth_m > 0.0 || !current_samples.is_empty();
    let has_duration = dive.duration_seconds > 0;
    let has_date = !dive.date.is_empty();
    
    log::info!("Dive data: depth={}, duration={}, date={}, samples={}, tank_pressures={}", 
        dive.max_depth_m, dive.duration_seconds, dive.date, current_samples.len(), current_tank_pressures.len());
    
    if has_depth || has_duration || has_date || !current_samples.is_empty() {
        dives.push(ImportedDive {
            dive,
            samples: current_samples,
            events: current_events,
            tank_pressures: current_tank_pressures,
            tanks: dive_tanks,
        });
    }
    
    if dives.is_empty() {
        // Provide more helpful error message
        let available_types = record_types.join(", ");
        return Err(format!(
            "No dive data found in FIT file. Record types present: {}. This may not be a dive log file.",
            available_types
        ));
    }
    
    // Determine trip date range
    let (date_start, date_end) = if !dives.is_empty() {
        let dates: Vec<&str> = dives.iter()
            .map(|d| d.dive.date.as_str())
            .filter(|d| !d.is_empty())
            .collect();
        let start = dates.iter().min().unwrap_or(&"").to_string();
        let end = dates.iter().max().unwrap_or(&"").to_string();
        (start, end)
    } else {
        (String::new(), String::new())
    };
    
    let trip_name = format!("FIT Import {}", &date_start);
    
    Ok(ImportResult {
        dives,
        trip_name,
        date_start,
        date_end,
    })
}

fn create_empty_dive(dive_number: i32) -> Dive {
    Dive {
        id: 0,
        trip_id: 0,
        dive_number,
        date: String::new(),
        time: String::new(),
        duration_seconds: 0,
        max_depth_m: 0.0,
        mean_depth_m: 0.0,
        water_temp_c: None,
        air_temp_c: None,
        surface_pressure_bar: None,
        otu: None,
        cns_percent: None,
        dive_computer_model: None,
        dive_computer_serial: None,
        location: None,
        ocean: None,
        visibility_m: None,
        gear_profile_id: None,
        buddy: None,
        divemaster: None,
        guide: None,
        instructor: None,
        comments: None,
        latitude: None,
        longitude: None,
        dive_site_id: None,
        is_fresh_water: false,
        is_boat_dive: false,
        is_drift_dive: false,
        is_night_dive: false,
        is_training_dive: false,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn build_dive_from_fit_data(
    data: &HashMap<String, Value>, 
    dive_number: i32,
    start_timestamp: Option<chrono::DateTime<chrono::Utc>>
) -> Dive {
    let mut dive = create_empty_dive(dive_number);
    
    // Set date/time from start timestamp if available
    if let Some(ts) = start_timestamp {
        dive.date = ts.format("%Y-%m-%d").to_string();
        dive.time = ts.format("%H:%M:%S").to_string();
    }
    
    for (key, value) in data {
        let key_lower = key.to_lowercase();
        
        // Timestamp fields
        if key_lower.contains("start_time") || key_lower.contains("timestamp") || key_lower.contains("time_created") {
            if let Value::Timestamp(ts) = value {
                let datetime = ts.with_timezone(&chrono::Utc);
                dive.date = datetime.format("%Y-%m-%d").to_string();
                dive.time = datetime.format("%H:%M:%S").to_string();
            }
        }
        // Duration fields
        else if key_lower.contains("elapsed_time") || key_lower.contains("timer_time") || key_lower.contains("duration") || key_lower.contains("bottom_time") {
            if dive.duration_seconds == 0 {
                dive.duration_seconds = extract_float(value).map(|f| f as i32).unwrap_or(0);
            }
        }
        // Max depth
        else if key_lower.contains("max_depth") || (key_lower.contains("depth") && key_lower.contains("max")) {
            let depth = extract_float(value).unwrap_or(0.0);
            if depth > dive.max_depth_m {
                dive.max_depth_m = depth;
            }
        }
        // Average depth  
        else if key_lower.contains("avg_depth") || (key_lower.contains("depth") && key_lower.contains("avg")) || key_lower.contains("mean_depth") {
            dive.mean_depth_m = extract_float(value).unwrap_or(0.0);
        }
        // Temperature
        else if key_lower.contains("temperature") || key_lower.contains("temp") {
            if let Some(temp) = extract_float(value) {
                // FIT temps can be in various units
                let temp_c = if temp > 200.0 { 
                    temp - 273.15  // Kelvin to Celsius
                } else if temp > 100.0 { 
                    temp / 100.0   // Centidegrees to degrees
                } else { 
                    temp 
                };
                dive.water_temp_c = Some(temp_c);
            }
        }
        // GPS latitude
        else if key_lower.contains("lat") && (key_lower.contains("position") || key_lower.contains("start") || key_lower.contains("gps")) {
            if let Some(lat) = extract_semicircles_to_degrees(value) {
                dive.latitude = Some(lat);
            }
        }
        // GPS longitude
        else if key_lower.contains("long") && (key_lower.contains("position") || key_lower.contains("start") || key_lower.contains("gps")) {
            if let Some(lon) = extract_semicircles_to_degrees(value) {
                dive.longitude = Some(lon);
            }
        }
        // O2 toxicity (OTU)
        else if key_lower.contains("o2_toxicity") || key_lower.contains("otu") {
            if let Some(otu) = extract_float(value) {
                dive.otu = Some(otu as i32);
            }
        }
        // CNS
        else if key_lower.contains("cns") {
            if let Some(cns) = extract_float(value) {
                dive.cns_percent = Some(if cns <= 1.0 { cns * 100.0 } else { cns });
            }
        }
        // Surface pressure
        else if key_lower.contains("surface") && key_lower.contains("pressure") {
            if let Some(pressure) = extract_float(value) {
                // Convert from Pa to bar if needed
                dive.surface_pressure_bar = Some(if pressure > 10000.0 { pressure / 100000.0 } else { pressure });
            }
        }
        // Water type
        else if key_lower.contains("water_type") {
            if let Value::String(s) = value {
                dive.is_fresh_water = s.to_lowercase().contains("fresh");
            }
        }
    }
    
    dive
}

fn parse_fit_record_to_sample(
    record: &FitDataRecord, 
    time_offset: i32,
    _start_timestamp: Option<chrono::DateTime<chrono::Utc>>
) -> DiveSample {
    let mut sample = DiveSample {
        id: 0,
        dive_id: 0,
        time_seconds: time_offset, // Use offset as fallback
        depth_m: 0.0,
        temp_c: None,
        pressure_bar: None,
        ndl_seconds: None,
        rbt_seconds: None,
    };
    
    // Log all fields in this record for debugging
    if time_offset == 0 {
        let fields: Vec<String> = record.fields().iter().map(|f| format!("{}={:?}", f.name(), f.value())).collect();
        log::info!("First record fields: {:?}", fields);
    }
    
    for field in record.fields() {
        let name = field.name().to_lowercase();
        
        // Depth - look for various field names (Garmin uses "depth", some use "enhanced_depth", etc.)
        if name.contains("depth") || name == "altitude" {
            let raw_value = extract_float(field.value()).unwrap_or(0.0);
            // Some devices report altitude as negative when underwater
            let depth = if name == "altitude" && raw_value < 0.0 {
                raw_value.abs()
            } else {
                raw_value
            };
            if depth > sample.depth_m && depth < 500.0 { // Sanity check - max 500m depth
                sample.depth_m = depth;
            }
        }
        // Timestamp for this sample - calculate relative time from dive start
        else if name == "timestamp" {
            if let Value::Timestamp(ts) = field.value() {
                if let Some(start_ts) = _start_timestamp {
                    let elapsed = ts.signed_duration_since(start_ts);
                    sample.time_seconds = elapsed.num_seconds() as i32;
                }
            }
        }
        // Temperature
        else if name.contains("temp") {
            if let Some(temp) = extract_float(field.value()) {
                sample.temp_c = Some(if temp > 200.0 { temp - 273.15 } else if temp > 100.0 { temp / 100.0 } else { temp });
            }
        }
        // NDL time
        else if name.contains("ndl") || name.contains("no_deco") || name.contains("n2_load") {
            sample.ndl_seconds = extract_float(field.value()).map(|f| f as i32);
        }
        // Air time remaining / RBT
        else if name.contains("air_time") || name.contains("remaining") || name.contains("rbt") {
            sample.rbt_seconds = extract_float(field.value()).map(|f| f as i32);
        }
        // Tank pressure - look for various field names
        // Garmin uses "tank_pressure", some use "cylinder_pressure", etc.
        // IMPORTANT: Exclude "absolute_pressure" which is ambient/water pressure, not tank pressure
        else if (name.contains("pressure") || name.contains("tank") || name.contains("cylinder")) 
                && !name.contains("surface") && !name.contains("ambient") && !name.contains("absolute") {
            if let Some(p) = extract_float(field.value()) {
                // Only set if it looks like a tank pressure (typically 1-300 bar or 100000-30000000 Pa)
                if p > 0.0 {
                    let pressure_bar = if p > 10000.0 { 
                        p / 100000.0  // Pa to bar
                    } else { 
                        p 
                    };
                    // Sanity check - tank pressure should be between 1 and 350 bar
                    if pressure_bar > 1.0 && pressure_bar < 350.0 {
                        sample.pressure_bar = Some(pressure_bar);
                    }
                }
            }
        }
    }
    
    sample
}

fn parse_fit_event(record: &FitDataRecord) -> DiveEvent {
    let mut event = DiveEvent {
        id: 0,
        dive_id: 0,
        time_seconds: 0,
        event_type: 0,
        name: String::new(),
        flags: None,
        value: None,
    };
    
    for field in record.fields() {
        match field.name() {
            "event" | "event_type" => {
                if let Value::String(s) = field.value() {
                    event.name = s.clone();
                }
            }
            "data" => {
                event.value = extract_float(field.value()).map(|f| f as i32);
            }
            _ => {}
        }
    }
    
    event
}

fn extract_float(value: &Value) -> Option<f64> {
    match value {
        Value::Float64(f) => Some(*f),
        Value::Float32(f) => Some(*f as f64),
        Value::SInt64(i) => Some(*i as f64),
        Value::UInt64(u) => Some(*u as f64),
        Value::SInt32(i) => Some(*i as f64),
        Value::UInt32(u) => Some(*u as f64),
        Value::SInt16(i) => Some(*i as f64),
        Value::UInt16(u) => Some(*u as f64),
        Value::SInt8(i) => Some(*i as f64),
        Value::UInt8(u) => Some(*u as f64),
        _ => None,
    }
}

fn extract_semicircles_to_degrees(value: &Value) -> Option<f64> {
    // FIT uses semicircles for lat/long: degrees = semicircles * (180 / 2^31)
    extract_float(value).map(|sc| sc * (180.0 / 2147483648.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_duration() {
        assert_eq!(parse_duration("66:40 min"), 4000);
        assert_eq!(parse_duration("0:10 min"), 10);
        assert_eq!(parse_duration("1:00 min"), 60);
    }
    
    #[test]
    fn test_parse_depth() {
        assert_eq!(parse_depth("22.893 m"), 22.893);
        assert_eq!(parse_depth("0.0 m"), 0.0);
    }
    
    #[test]
    fn test_parse_temp() {
        assert_eq!(parse_temp("28.7 C"), 28.7);
    }
    
    #[test]
    fn test_parse_pressure() {
        assert_eq!(parse_pressure("210.14 bar"), 210.14);
    }
    
    #[test]
    fn test_parse_suunto_datetime() {
        let (date, time) = parse_suunto_datetime(Some("2024-01-15T10:30:00Z"));
        assert_eq!(date, "2024-01-15");
        assert_eq!(time, "10:30:00");
    }
}
