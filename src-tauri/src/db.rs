use rusqlite::{Connection, Result, params};
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Trip {
    pub id: i64,
    pub name: String,
    pub location: String,
    pub resort: Option<String>,
    pub date_start: String,
    pub date_end: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Dive {
    pub id: i64,
    pub trip_id: i64,
    pub dive_number: i32,
    pub date: String,
    pub time: String,
    pub duration_seconds: i32,
    pub max_depth_m: f64,
    pub mean_depth_m: f64,
    pub water_temp_c: Option<f64>,
    pub air_temp_c: Option<f64>,
    pub surface_pressure_bar: Option<f64>,
    pub otu: Option<i32>,
    pub cns_percent: Option<f64>,
    pub dive_computer_model: Option<String>,
    pub dive_computer_serial: Option<String>,
    pub location: Option<String>,
    pub ocean: Option<String>,
    pub visibility_m: Option<f64>,
    pub gear_profile_id: Option<i64>,
    pub buddy: Option<String>,
    pub divemaster: Option<String>,
    pub guide: Option<String>,
    pub instructor: Option<String>,
    pub comments: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub dive_site_id: Option<i64>,
    pub is_fresh_water: bool,
    pub is_boat_dive: bool,
    pub is_drift_dive: bool,
    pub is_night_dive: bool,
    pub is_training_dive: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiveSample {
    pub id: i64,
    pub dive_id: i64,
    pub time_seconds: i32,
    pub depth_m: f64,
    pub temp_c: Option<f64>,
    pub pressure_bar: Option<f64>,
    pub ndl_seconds: Option<i32>,
    pub rbt_seconds: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiveEvent {
    pub id: i64,
    pub dive_id: i64,
    pub time_seconds: i32,
    pub event_type: i32,
    pub name: String,
    pub flags: Option<i32>,
    pub value: Option<i32>,
}

/// Tank metadata - gas mix and summary pressures for each tank used in a dive
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiveTank {
    pub id: i64,
    pub dive_id: i64,
    pub sensor_id: i64,             // Matches TankPressure.sensor_id (0 for single-tank imports)
    pub sensor_name: Option<String>,
    pub gas_index: i32,             // Gas mix index (0=primary, 1=secondary, etc)
    pub o2_percent: Option<f64>,    // Oxygen percentage (21 for air, 32 for EAN32, etc)
    pub he_percent: Option<f64>,    // Helium percentage (0 for nitrox, >0 for trimix)
    pub start_pressure_bar: Option<f64>,
    pub end_pressure_bar: Option<f64>,
    pub volume_used_liters: Option<f64>,
}

/// Time-series tank pressure readings during a dive
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TankPressure {
    pub id: i64,
    pub dive_id: i64,
    pub sensor_id: i64,
    pub sensor_name: Option<String>,
    pub time_seconds: i32,
    pub pressure_bar: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Photo {
    pub id: i64,
    pub trip_id: i64,
    pub dive_id: Option<i64>,
    pub file_path: String,
    pub thumbnail_path: Option<String>,
    pub filename: String,
    pub capture_time: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub file_size_bytes: Option<i64>,
    pub is_processed: bool,
    pub raw_photo_id: Option<i64>,
    pub rating: Option<i32>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_info: Option<String>,
    pub focal_length_mm: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<i32>,
    pub exposure_compensation: Option<f64>,
    pub white_balance: Option<String>,
    pub flash_fired: Option<bool>,
    pub metering_mode: Option<String>,
    pub gps_latitude: Option<f64>,
    pub gps_longitude: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpeciesTag {
    pub id: i64,
    pub name: String,
    pub category: Option<String>,
    pub scientific_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeneralTag {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiveSite {
    pub id: i64,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub is_user_created: bool,
}

// Equipment catalogue types

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EquipmentCategory {
    pub id: i64,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Equipment {
    pub id: i64,
    pub category_id: i64,
    pub name: String,
    pub brand: Option<String>,
    pub model: Option<String>,
    pub serial_number: Option<String>,
    pub purchase_date: Option<String>,
    pub notes: Option<String>,
    pub is_retired: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EquipmentWithCategory {
    pub id: i64,
    pub category_id: i64,
    pub category_name: String,
    pub name: String,
    pub brand: Option<String>,
    pub model: Option<String>,
    pub serial_number: Option<String>,
    pub purchase_date: Option<String>,
    pub notes: Option<String>,
    pub is_retired: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EquipmentSet {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub set_type: String,  // 'dive' or 'camera'
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EquipmentSetWithItems {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub set_type: String,
    pub is_default: bool,
    pub items: Vec<EquipmentWithCategory>,
    pub created_at: String,
    pub updated_at: String,
}

// Search results
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResults {
    pub trips: Vec<Trip>,
    pub dives: Vec<Dive>,
    pub photos: Vec<Photo>,
    pub species: Vec<SpeciesTag>,
    pub tags: Vec<GeneralTag>,
    pub dive_sites: Vec<DiveSite>,
}

// Photo filter for advanced filtering
#[derive(Debug, Deserialize, Clone)]
pub struct PhotoFilter {
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub rating_min: Option<i32>,
    pub rating_max: Option<i32>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub iso_min: Option<i32>,
    pub iso_max: Option<i32>,
    pub aperture_min: Option<f64>,
    pub aperture_max: Option<f64>,
    pub focal_length_min: Option<f64>,
    pub focal_length_max: Option<f64>,
    pub width_min: Option<i32>,
    pub width_max: Option<i32>,
    pub height_min: Option<i32>,
    pub height_max: Option<i32>,
    pub has_raw: Option<bool>,
    pub is_processed: Option<bool>,
    pub exposure_compensation_min: Option<f64>,
    pub exposure_compensation_max: Option<f64>,
    pub white_balance: Option<String>,
    pub flash_fired: Option<bool>,
    pub metering_mode: Option<String>,
    pub trip_id: Option<i64>,
    pub dive_id: Option<i64>,
}

/// Database wrapper that works with an owned Connection
pub struct Database {
    conn: Connection,
}

/// Database operations that work with a borrowed connection reference.
/// Use this with pooled connections: `let db = Db::new(&conn);`
pub struct Db<'a> {
    conn: &'a Connection,
}

// Implement all Database methods for Db<'a> so it can be used with pooled connections
// Each method simply delegates to the corresponding Database implementation
impl<'a> Db<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }
    
    // ====================== Trip Operations ======================
    
    pub fn get_all_trips(&self) -> Result<Vec<Trip>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, location, resort, date_start, date_end, notes, created_at, updated_at 
             FROM trips ORDER BY date_start DESC"
        )?;
        let trips = stmt.query_map([], |row| {
            Ok(Trip {
                id: row.get(0)?, name: row.get(1)?, location: row.get(2)?,
                resort: row.get(3)?, date_start: row.get(4)?, date_end: row.get(5)?,
                notes: row.get(6)?, created_at: row.get(7)?, updated_at: row.get(8)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(trips)
    }
    
    pub fn get_trip(&self, id: i64) -> Result<Option<Trip>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, location, resort, date_start, date_end, notes, created_at, updated_at 
             FROM trips WHERE id = ?"
        )?;
        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Trip {
                id: row.get(0)?, name: row.get(1)?, location: row.get(2)?,
                resort: row.get(3)?, date_start: row.get(4)?, date_end: row.get(5)?,
                notes: row.get(6)?, created_at: row.get(7)?, updated_at: row.get(8)?,
            }))
        } else { Ok(None) }
    }
    
    pub fn create_trip(&self, name: &str, location: &str, date_start: &str, date_end: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO trips (name, location, date_start, date_end) VALUES (?, ?, ?, ?)",
            params![name, location, date_start, date_end],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    pub fn update_trip(&self, id: i64, name: &str, location: &str, resort: Option<&str>, date_start: &str, date_end: &str, notes: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE trips SET name = ?, location = ?, resort = ?, date_start = ?, date_end = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
            params![name, location, resort, date_start, date_end, notes, id],
        )?;
        Ok(())
    }
    
    pub fn delete_trip(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM trips WHERE id = ?", params![id])?;
        Ok(())
    }
    
    // ====================== Dive Operations ======================
    
    pub fn get_dives_for_trip(&self, trip_id: i64) -> Result<Vec<Dive>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                    water_temp_c, air_temp_c, surface_pressure_bar, otu, cns_percent,
                    dive_computer_model, dive_computer_serial, location, ocean, visibility_m,
                    gear_profile_id, buddy, divemaster, guide, instructor, comments, latitude, longitude, dive_site_id,
                    is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive,
                    created_at, updated_at
             FROM dives WHERE trip_id = ? ORDER BY dive_number"
        )?;
        let dives = stmt.query_map([trip_id], Self::map_dive_row)?.collect::<Result<Vec<_>>>()?;
        Ok(dives)
    }
    
    pub fn get_dive(&self, id: i64) -> Result<Option<Dive>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                    water_temp_c, air_temp_c, surface_pressure_bar, otu, cns_percent,
                    dive_computer_model, dive_computer_serial, location, ocean, visibility_m,
                    gear_profile_id, buddy, divemaster, guide, instructor, comments, latitude, longitude, dive_site_id,
                    is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive,
                    created_at, updated_at
             FROM dives WHERE id = ?"
        )?;
        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Self::map_dive_row(row)?))
        } else { Ok(None) }
    }
    
    fn map_dive_row(row: &rusqlite::Row) -> rusqlite::Result<Dive> {
        Ok(Dive {
            id: row.get(0)?, trip_id: row.get(1)?, dive_number: row.get(2)?,
            date: row.get(3)?, time: row.get(4)?, duration_seconds: row.get(5)?,
            max_depth_m: row.get(6)?, mean_depth_m: row.get(7)?, water_temp_c: row.get(8)?,
            air_temp_c: row.get(9)?, surface_pressure_bar: row.get(10)?, otu: row.get(11)?,
            cns_percent: row.get(12)?,
            dive_computer_model: row.get(13)?, dive_computer_serial: row.get(14)?,
            location: row.get(15)?, ocean: row.get(16)?, visibility_m: row.get(17)?,
            gear_profile_id: row.get(18)?, buddy: row.get(19)?, divemaster: row.get(20)?,
            guide: row.get(21)?, instructor: row.get(22)?, comments: row.get(23)?,
            latitude: row.get(24)?, longitude: row.get(25)?, dive_site_id: row.get(26)?,
            is_fresh_water: row.get::<_, i32>(27)? != 0, is_boat_dive: row.get::<_, i32>(28)? != 0,
            is_drift_dive: row.get::<_, i32>(29)? != 0, is_night_dive: row.get::<_, i32>(30)? != 0,
            is_training_dive: row.get::<_, i32>(31)? != 0,
            created_at: row.get(32)?, updated_at: row.get(33)?,
        })
    }
    
    pub fn delete_dive(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM photos WHERE dive_id = ?", params![id])?;
        self.conn.execute("DELETE FROM dive_samples WHERE dive_id = ?", params![id])?;
        self.conn.execute("DELETE FROM tank_pressures WHERE dive_id = ?", params![id])?;
        self.conn.execute("DELETE FROM dive_events WHERE dive_id = ?", params![id])?;
        self.conn.execute("DELETE FROM dives WHERE id = ?", params![id])?;
        Ok(())
    }
    
    pub fn update_dive(&self, id: i64, location: Option<&str>, ocean: Option<&str>, visibility_m: Option<f64>,
        buddy: Option<&str>, divemaster: Option<&str>, guide: Option<&str>, instructor: Option<&str>,
        comments: Option<&str>, latitude: Option<f64>, longitude: Option<f64>, dive_site_id: Option<i64>,
        is_fresh_water: bool, is_boat_dive: bool, is_drift_dive: bool, is_night_dive: bool, is_training_dive: bool,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE dives SET location = ?, ocean = ?, visibility_m = ?, buddy = ?, divemaster = ?, guide = ?, instructor = ?, comments = ?,
             latitude = ?, longitude = ?, dive_site_id = ?, is_fresh_water = ?, is_boat_dive = ?, is_drift_dive = ?, is_night_dive = ?, is_training_dive = ?, updated_at = datetime('now') WHERE id = ?",
            params![location, ocean, visibility_m, buddy, divemaster, guide, instructor, comments, latitude, longitude, dive_site_id,
                is_fresh_water as i32, is_boat_dive as i32, is_drift_dive as i32, is_night_dive as i32, is_training_dive as i32, id],
        )?;
        Ok(())
    }
    
    pub fn get_dive_samples(&self, dive_id: i64) -> Result<Vec<DiveSample>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, dive_id, time_seconds, depth_m, temp_c, pressure_bar, ndl_seconds, rbt_seconds
             FROM dive_samples WHERE dive_id = ? ORDER BY time_seconds"
        )?;
        let samples = stmt.query_map([dive_id], |row| {
            Ok(DiveSample {
                id: row.get(0)?, dive_id: row.get(1)?, time_seconds: row.get(2)?,
                depth_m: row.get(3)?, temp_c: row.get(4)?, pressure_bar: row.get(5)?,
                ndl_seconds: row.get(6)?, rbt_seconds: row.get(7)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(samples)
    }
    
    pub fn get_tank_pressures_for_dive(&self, dive_id: i64) -> Result<Vec<TankPressure>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, dive_id, sensor_id, sensor_name, time_seconds, pressure_bar
             FROM tank_pressures WHERE dive_id = ? ORDER BY sensor_id, time_seconds"
        )?;
        let pressures = stmt.query_map([dive_id], |row| {
            Ok(TankPressure {
                id: row.get(0)?, dive_id: row.get(1)?, sensor_id: row.get(2)?,
                sensor_name: row.get(3)?, time_seconds: row.get(4)?, pressure_bar: row.get(5)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(pressures)
    }
    
    pub fn insert_dive_samples_batch(&self, dive_id: i64, samples: &[DiveSample]) -> Result<usize> {
        if samples.is_empty() { return Ok(0); }
        let tx = self.conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO dive_samples (dive_id, time_seconds, depth_m, temp_c, pressure_bar, ndl_seconds, rbt_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )?;
            for sample in samples {
                stmt.execute(params![dive_id, sample.time_seconds, sample.depth_m, sample.temp_c, sample.pressure_bar, sample.ndl_seconds, sample.rbt_seconds])?;
            }
        }
        tx.commit()?;
        Ok(samples.len())
    }
    
    pub fn insert_tank_pressures_batch(&self, dive_id: i64, pressures: &[TankPressure]) -> Result<usize> {
        if pressures.is_empty() { return Ok(0); }
        let tx = self.conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO tank_pressures (dive_id, sensor_id, sensor_name, time_seconds, pressure_bar) VALUES (?, ?, ?, ?, ?)"
            )?;
            for p in pressures {
                stmt.execute(params![dive_id, p.sensor_id, p.sensor_name, p.time_seconds, p.pressure_bar])?;
            }
        }
        tx.commit()?;
        Ok(pressures.len())
    }
    
    pub fn insert_dive_tanks_batch(&self, dive_id: i64, tanks: &[DiveTank]) -> Result<usize> {
        if tanks.is_empty() { return Ok(0); }
        let tx = self.conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO dive_tanks (dive_id, sensor_id, sensor_name, gas_index, o2_percent, he_percent, start_pressure_bar, end_pressure_bar, volume_used_liters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )?;
            for t in tanks {
                stmt.execute(params![dive_id, t.sensor_id, t.sensor_name, t.gas_index, t.o2_percent, t.he_percent, t.start_pressure_bar, t.end_pressure_bar, t.volume_used_liters])?;
            }
        }
        tx.commit()?;
        Ok(tanks.len())
    }
    
    pub fn get_dive_tanks(&self, dive_id: i64) -> Result<Vec<DiveTank>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, dive_id, sensor_id, sensor_name, gas_index, o2_percent, he_percent, start_pressure_bar, end_pressure_bar, volume_used_liters FROM dive_tanks WHERE dive_id = ? ORDER BY gas_index"
        )?;
        let tanks = stmt.query_map([dive_id], |row| {
            Ok(DiveTank {
                id: row.get(0)?,
                dive_id: row.get(1)?,
                sensor_id: row.get(2)?,
                sensor_name: row.get(3)?,
                gas_index: row.get(4)?,
                o2_percent: row.get(5)?,
                he_percent: row.get(6)?,
                start_pressure_bar: row.get(7)?,
                end_pressure_bar: row.get(8)?,
                volume_used_liters: row.get(9)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tanks)
    }
    
    pub fn create_dive_from_computer(&self, trip_id: i64, dive_number: i64, date: &str, time: &str,
        duration_seconds: i64, max_depth_m: f64, mean_depth_m: f64, water_temp_c: Option<f64>,
        air_temp_c: Option<f64>, surface_pressure_bar: Option<f64>, cns_percent: Option<f64>,
        dive_computer_model: Option<&str>, dive_computer_serial: Option<&str>,
        latitude: Option<f64>, longitude: Option<f64>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dives (trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
             water_temp_c, air_temp_c, surface_pressure_bar, cns_percent, dive_computer_model, dive_computer_serial,
             latitude, longitude, is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)",
            params![trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                water_temp_c, air_temp_c, surface_pressure_bar, cns_percent, dive_computer_model, dive_computer_serial, latitude, longitude],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    pub fn create_manual_dive(&self, trip_id: i64, dive_number: i64, date: &str, time: &str,
        duration_seconds: i64, max_depth_m: f64, mean_depth_m: f64, water_temp_c: Option<f64>,
        air_temp_c: Option<f64>, surface_pressure_bar: Option<f64>, cns_percent: Option<f64>,
        location: Option<&str>, ocean: Option<&str>, visibility_m: Option<f64>,
        buddy: Option<&str>, divemaster: Option<&str>, guide: Option<&str>, instructor: Option<&str>, comments: Option<&str>,
        latitude: Option<f64>, longitude: Option<f64>,
        is_fresh_water: bool, is_boat_dive: bool, is_drift_dive: bool, is_night_dive: bool, is_training_dive: bool,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dives (trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
             water_temp_c, air_temp_c, surface_pressure_bar, cns_percent,
             location, ocean, visibility_m, buddy, divemaster, guide, instructor, comments, latitude, longitude,
             is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                water_temp_c, air_temp_c, surface_pressure_bar, cns_percent,
                location, ocean, visibility_m, buddy, divemaster, guide, instructor, comments, latitude, longitude,
                is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    // ====================== Species Tag Operations ======================
    
    pub fn get_all_species_tags(&self) -> Result<Vec<SpeciesTag>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, category, scientific_name FROM species_tags ORDER BY name"
        )?;
        let tags = stmt.query_map([], |row| {
            Ok(SpeciesTag {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                scientific_name: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tags)
    }
    
    pub fn search_species_tags(&self, query: &str) -> Result<Vec<SpeciesTag>> {
        let pattern = format!("{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, name, category, scientific_name 
             FROM species_tags 
             WHERE name LIKE ? COLLATE NOCASE OR scientific_name LIKE ? COLLATE NOCASE
             ORDER BY name
             LIMIT 20"
        )?;
        let tags = stmt.query_map(params![&pattern, &pattern], |row| {
            Ok(SpeciesTag {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                scientific_name: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tags)
    }
    
    pub fn create_species_tag(&self, name: &str, category: Option<&str>, scientific_name: Option<&str>) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO species_tags (name, category, scientific_name) VALUES (?, ?, ?)",
            params![name, category, scientific_name],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    pub fn get_or_create_species_tag(&self, name: &str, category: Option<&str>, scientific_name: Option<&str>) -> Result<i64> {
        let existing: Option<i64> = self.conn.query_row(
            "SELECT id FROM species_tags WHERE name = ? COLLATE NOCASE",
            [name],
            |row| row.get(0),
        ).ok();
        if let Some(id) = existing {
            return Ok(id);
        }
        self.create_species_tag(name, category, scientific_name)
    }
    
    pub fn get_species_tags_for_photo(&self, photo_id: i64) -> Result<Vec<SpeciesTag>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.id, s.name, s.category, s.scientific_name 
             FROM species_tags s
             JOIN photo_species_tags ps ON s.id = ps.species_tag_id
             WHERE ps.photo_id = ?
             ORDER BY s.name"
        )?;
        let tags = stmt.query_map([photo_id], |row| {
            Ok(SpeciesTag {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                scientific_name: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tags)
    }
    
    pub fn add_species_tag_to_photos(&self, photo_ids: &[i64], species_tag_id: i64) -> Result<i64> {
        if photo_ids.is_empty() {
            return Ok(0);
        }
        let tx = self.conn.unchecked_transaction()?;
        let mut count = 0i64;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR IGNORE INTO photo_species_tags (photo_id, species_tag_id) VALUES (?, ?)"
            )?;
            for &photo_id in photo_ids {
                stmt.execute(params![photo_id, species_tag_id])?;
                count += tx.changes() as i64;
            }
        }
        tx.commit()?;
        Ok(count)
    }
    
    pub fn remove_species_tag_from_photo(&self, photo_id: i64, species_tag_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM photo_species_tags WHERE photo_id = ? AND species_tag_id = ?",
            params![photo_id, species_tag_id],
        )?;
        Ok(())
    }
    
    pub fn remove_species_tag_from_photos(&self, photo_ids: &[i64], species_tag_id: i64) -> Result<i64> {
        if photo_ids.is_empty() {
            return Ok(0);
        }
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "DELETE FROM photo_species_tags WHERE species_tag_id = ? AND photo_id IN ({})",
            placeholders
        );
        let mut params: Vec<&dyn rusqlite::ToSql> = vec![&species_tag_id];
        for id in photo_ids {
            params.push(id);
        }
        self.conn.execute(&query, rusqlite::params_from_iter(params))?;
        Ok(self.conn.changes() as i64)
    }
    
    pub fn get_distinct_species_categories(&self) -> Result<Vec<String>> {
        let defaults = vec![
            "Fish", "Nudibranch", "Coral", "Invertebrate", "Cephalopod",
            "Crustacean", "Mammal", "Reptile", "Shark/Ray", "Jellyfish", "Plant/Algae"
        ];
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT category FROM species_tags 
             WHERE category IS NOT NULL AND category != ''
             ORDER BY category"
        )?;
        let db_categories: Vec<String> = stmt.query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        let mut result: Vec<String> = db_categories.clone();
        for default in defaults {
            let default_lower = default.to_lowercase();
            if !result.iter().any(|c| c.to_lowercase() == default_lower) {
                result.push(default.to_string());
            }
        }
        result.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        Ok(result)
    }
    
    pub fn update_species_tag_category(&self, species_tag_id: i64, category: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE species_tags SET category = ? WHERE id = ?",
            params![category, species_tag_id],
        )?;
        Ok(())
    }
    
    pub fn get_common_species_tags_for_photos(&self, photo_ids: &[i64]) -> Result<Vec<SpeciesTag>> {
        if photo_ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let photo_count = photo_ids.len() as i64;
        let query = format!(
            "SELECT st.id, st.name, st.category, st.scientific_name
             FROM species_tags st
             JOIN photo_species_tags pst ON st.id = pst.species_tag_id
             WHERE pst.photo_id IN ({})
             GROUP BY st.id
             HAVING COUNT(DISTINCT pst.photo_id) = ?
             ORDER BY st.name",
            placeholders
        );
        let mut stmt = self.conn.prepare(&query)?;
        let mut params: Vec<&dyn rusqlite::ToSql> = photo_ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        params.push(&photo_count);
        let tags = stmt.query_map(rusqlite::params_from_iter(params), |row| {
            Ok(SpeciesTag {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                scientific_name: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tags)
    }
    
    // ====================== General Tag Operations ======================
    
    pub fn get_all_general_tags(&self) -> Result<Vec<GeneralTag>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name FROM general_tags ORDER BY name"
        )?;
        let tags = stmt.query_map([], |row| {
            Ok(GeneralTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(tags)
    }
    
    pub fn search_general_tags(&self, query: &str) -> Result<Vec<GeneralTag>> {
        let pattern = format!("{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, name FROM general_tags WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 20"
        )?;
        let tags = stmt.query_map([&pattern], |row| {
            Ok(GeneralTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(tags)
    }
    
    pub fn get_or_create_general_tag(&self, name: &str) -> Result<i64> {
        let existing: Option<i64> = self.conn.query_row(
            "SELECT id FROM general_tags WHERE name = ? COLLATE NOCASE",
            [name],
            |row| row.get(0)
        ).ok();
        if let Some(id) = existing {
            return Ok(id);
        }
        self.conn.execute(
            "INSERT INTO general_tags (name) VALUES (?)",
            [name],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    pub fn get_general_tags_for_photo(&self, photo_id: i64) -> Result<Vec<GeneralTag>> {
        let mut stmt = self.conn.prepare(
            "SELECT gt.id, gt.name
             FROM general_tags gt
             JOIN photo_general_tags pgt ON pgt.general_tag_id = gt.id
             WHERE pgt.photo_id = ?
             ORDER BY gt.name"
        )?;
        let tags = stmt.query_map([photo_id], |row| {
            Ok(GeneralTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(tags)
    }
    
    pub fn add_general_tag_to_photos(&self, photo_ids: &[i64], general_tag_id: i64) -> Result<i64> {
        if photo_ids.is_empty() {
            return Ok(0);
        }
        let tx = self.conn.unchecked_transaction()?;
        let mut count = 0i64;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR IGNORE INTO photo_general_tags (photo_id, general_tag_id) VALUES (?, ?)"
            )?;
            for &photo_id in photo_ids {
                stmt.execute(params![photo_id, general_tag_id])?;
                count += tx.changes() as i64;
            }
        }
        tx.commit()?;
        Ok(count)
    }
    
    pub fn remove_general_tag_from_photo(&self, photo_id: i64, general_tag_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM photo_general_tags WHERE photo_id = ? AND general_tag_id = ?",
            params![photo_id, general_tag_id],
        )?;
        Ok(())
    }
    
    pub fn get_common_general_tags_for_photos(&self, photo_ids: &[i64]) -> Result<Vec<GeneralTag>> {
        if photo_ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let photo_count = photo_ids.len() as i64;
        let query = format!(
            "SELECT gt.id, gt.name
             FROM general_tags gt
             JOIN photo_general_tags pgt ON gt.id = pgt.general_tag_id
             WHERE pgt.photo_id IN ({})
             GROUP BY gt.id
             HAVING COUNT(DISTINCT pgt.photo_id) = ?
             ORDER BY gt.name",
            placeholders
        );
        let mut stmt = self.conn.prepare(&query)?;
        let mut params: Vec<&dyn rusqlite::ToSql> = photo_ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        params.push(&photo_count);
        let tags = stmt.query_map(rusqlite::params_from_iter(params), |row| {
            Ok(GeneralTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tags)
    }
    
    pub fn remove_general_tag_from_photos(&self, photo_ids: &[i64], general_tag_id: i64) -> Result<i64> {
        if photo_ids.is_empty() {
            return Ok(0);
        }
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "DELETE FROM photo_general_tags WHERE general_tag_id = ? AND photo_id IN ({})",
            placeholders
        );
        let mut params: Vec<&dyn rusqlite::ToSql> = vec![&general_tag_id];
        for id in photo_ids {
            params.push(id);
        }
        self.conn.execute(&query, rusqlite::params_from_iter(params))?;
        Ok(self.conn.changes() as i64)
    }

    // ====================== Photo Operations ======================

    fn map_photo_row(row: &rusqlite::Row) -> rusqlite::Result<Photo> {
        Ok(Photo {
            id: row.get(0)?, trip_id: row.get(1)?, dive_id: row.get(2)?,
            file_path: row.get(3)?, thumbnail_path: row.get(4)?, filename: row.get(5)?,
            capture_time: row.get(6)?, width: row.get(7)?, height: row.get(8)?,
            file_size_bytes: row.get(9)?, is_processed: row.get::<_, i32>(10)? != 0,
            raw_photo_id: row.get(11)?, rating: row.get(12)?,
            camera_make: row.get(13)?, camera_model: row.get(14)?, lens_info: row.get(15)?,
            focal_length_mm: row.get(16)?, aperture: row.get(17)?, shutter_speed: row.get(18)?,
            iso: row.get(19)?, exposure_compensation: row.get(20)?, white_balance: row.get(21)?,
            flash_fired: row.get::<_, Option<i32>>(22)?.map(|i| i != 0),
            metering_mode: row.get(23)?, gps_latitude: row.get(24)?, gps_longitude: row.get(25)?,
            created_at: row.get(26)?, updated_at: row.get(27)?,
        })
    }

    pub fn get_photos_for_dive(&self, dive_id: i64) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.trip_id, p.dive_id, p.file_path, 
                    COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                    p.filename, p.capture_time, p.width, p.height, p.file_size_bytes, p.is_processed, p.raw_photo_id, p.rating,
                    p.camera_make, p.camera_model, p.lens_info, p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode, p.gps_latitude, p.gps_longitude,
                    p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
             WHERE p.dive_id = ? AND (p.is_processed = 0 OR p.raw_photo_id IS NULL)
             ORDER BY p.capture_time"
        )?;
        let photos = stmt.query_map([dive_id], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }

    pub fn get_photos_for_trip(&self, trip_id: i64) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.trip_id, p.dive_id, p.file_path, 
                    COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                    p.filename, p.capture_time, p.width, p.height, p.file_size_bytes, p.is_processed, p.raw_photo_id, p.rating,
                    p.camera_make, p.camera_model, p.lens_info, p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode, p.gps_latitude, p.gps_longitude,
                    p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
             WHERE p.trip_id = ? AND p.dive_id IS NULL AND (p.is_processed = 0 OR p.raw_photo_id IS NULL)
             ORDER BY p.capture_time"
        )?;
        let photos = stmt.query_map([trip_id], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }

    pub fn get_all_photos_for_trip(&self, trip_id: i64) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.trip_id, p.dive_id, p.file_path, 
                    COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                    p.filename, p.capture_time, p.width, p.height, p.file_size_bytes, p.is_processed, p.raw_photo_id, p.rating,
                    p.camera_make, p.camera_model, p.lens_info, p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode, p.gps_latitude, p.gps_longitude,
                    p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
             WHERE p.trip_id = ? AND (p.is_processed = 0 OR p.raw_photo_id IS NULL)
             ORDER BY p.capture_time"
        )?;
        let photos = stmt.query_map([trip_id], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }

    pub fn get_dive_thumbnail_photos(&self, dive_id: i64, limit: i64) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.trip_id, p.dive_id, p.file_path, 
                    COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                    p.filename, p.capture_time, p.width, p.height, p.file_size_bytes, p.is_processed, p.raw_photo_id, 
                    COALESCE(p.rating, 0) as rating,
                    p.camera_make, p.camera_model, p.lens_info, p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode, p.gps_latitude, p.gps_longitude,
                    p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
             WHERE p.dive_id = ? AND (p.is_processed = 0 OR p.raw_photo_id IS NULL)
                   AND (p.thumbnail_path IS NOT NULL OR proc.thumbnail_path IS NOT NULL)
             ORDER BY CASE WHEN proc.id IS NOT NULL THEN 0 ELSE 1 END, COALESCE(p.rating, 0) DESC, p.capture_time
             LIMIT ?"
        )?;
        let photos = stmt.query_map(params![dive_id, limit], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }

    pub fn get_dive_stats(&self, dive_id: i64) -> Result<DiveStats> {
        let photo_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE dive_id = ? AND (is_processed = 0 OR raw_photo_id IS NULL)",
            params![dive_id], |row| row.get(0),
        )?;
        let species_count: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT pst.species_tag_id) FROM photo_species_tags pst
             JOIN photos p ON p.id = pst.photo_id WHERE p.dive_id = ?",
            params![dive_id], |row| row.get(0),
        )?;
        Ok(DiveStats { photo_count, species_count })
    }

    pub fn get_dives_with_details(&self, trip_id: i64, thumbnail_limit: i64) -> Result<Vec<DiveWithDetails>> {
        let dives = self.get_dives_for_trip(trip_id)?;
        if dives.is_empty() { return Ok(Vec::new()); }
        let dive_ids: Vec<i64> = dives.iter().map(|d| d.id).collect();
        let placeholders = dive_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let mut stats_map: std::collections::HashMap<i64, (i64, i64)> = std::collections::HashMap::new();

        let photo_count_sql = format!("SELECT dive_id, COUNT(*) FROM photos WHERE dive_id IN ({}) AND (is_processed = 0 OR raw_photo_id IS NULL) GROUP BY dive_id", placeholders);
        { let mut stmt = self.conn.prepare(&photo_count_sql)?;
          let mut rows = stmt.query(rusqlite::params_from_iter(dive_ids.iter()))?;
          while let Some(row) = rows.next()? { stats_map.entry(row.get(0)?).or_insert((0, 0)).0 = row.get(1)?; }
        }
        let species_count_sql = format!("SELECT p.dive_id, COUNT(DISTINCT pst.species_tag_id) FROM photos p JOIN photo_species_tags pst ON p.id = pst.photo_id WHERE p.dive_id IN ({}) GROUP BY p.dive_id", placeholders);
        { let mut stmt = self.conn.prepare(&species_count_sql)?;
          let mut rows = stmt.query(rusqlite::params_from_iter(dive_ids.iter()))?;
          while let Some(row) = rows.next()? { stats_map.entry(row.get(0)?).or_insert((0, 0)).1 = row.get(1)?; }
        }
        let mut thumbnails_map: std::collections::HashMap<i64, Vec<String>> = std::collections::HashMap::new();
        let thumbnails_sql = format!(
            "SELECT dive_id, thumbnail_path FROM (
                SELECT p.dive_id, COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                       ROW_NUMBER() OVER (PARTITION BY p.dive_id ORDER BY CASE WHEN proc.id IS NOT NULL THEN 0 ELSE 1 END, COALESCE(p.rating, 0) DESC, p.capture_time) as rn
                FROM photos p LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
                WHERE p.dive_id IN ({}) AND (p.is_processed = 0 OR p.raw_photo_id IS NULL)
                      AND (p.thumbnail_path IS NOT NULL OR proc.thumbnail_path IS NOT NULL)
            ) ranked WHERE rn <= ?", placeholders
        );
        { let mut params: Vec<Box<dyn rusqlite::ToSql>> = dive_ids.iter().map(|id| Box::new(*id) as Box<dyn rusqlite::ToSql>).collect();
          params.push(Box::new(thumbnail_limit));
          let mut stmt = self.conn.prepare(&thumbnails_sql)?;
          let mut rows = stmt.query(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))?;
          while let Some(row) = rows.next()? { thumbnails_map.entry(row.get(0)?).or_insert_with(Vec::new).push(row.get(1)?); }
        }
        Ok(dives.into_iter().map(|dive| {
            let (photo_count, species_count) = stats_map.get(&dive.id).copied().unwrap_or((0, 0));
            let thumbnail_paths = thumbnails_map.remove(&dive.id).unwrap_or_default();
            DiveWithDetails { dive, photo_count, species_count, thumbnail_paths }
        }).collect())
    }

    pub fn get_photo(&self, id: i64) -> Result<Option<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
                    created_at, updated_at FROM photos WHERE id = ?"
        )?;
        let mut rows = stmt.query([id])?;
        match rows.next()? { Some(row) => Ok(Some(Self::map_photo_row(row)?)), None => Ok(None) }
    }

    pub fn get_photos_without_thumbnails(&self) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
                    created_at, updated_at FROM photos WHERE thumbnail_path IS NULL OR thumbnail_path = '' ORDER BY id"
        )?;
        let photos = stmt.query_map([], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }

    pub fn get_all_photos(&self) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
                    created_at, updated_at FROM photos ORDER BY id"
        )?;
        let photos = stmt.query_map([], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }

    pub fn get_processed_version(&self, raw_photo_id: i64) -> Result<Option<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
                    created_at, updated_at FROM photos WHERE raw_photo_id = ?"
        )?;
        let mut photos = stmt.query_map([raw_photo_id], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos.pop())
    }

    pub fn get_raw_version(&self, photo_id: i64) -> Result<Option<Photo>> {
        let raw_id: Option<i64> = self.conn.query_row("SELECT raw_photo_id FROM photos WHERE id = ?", [photo_id], |row| row.get(0)).ok().flatten();
        if let Some(raw_id) = raw_id { self.get_photo(raw_id) } else { Ok(None) }
    }

    pub fn get_display_version(&self, photo_id: i64) -> Result<Photo> {
        if let Some(processed) = self.get_processed_version(photo_id)? { return Ok(processed); }
        self.get_photo(photo_id)?.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn update_photo_thumbnail(&self, photo_id: i64, thumbnail_path: &str) -> Result<()> {
        self.conn.execute("UPDATE photos SET thumbnail_path = ?, updated_at = datetime('now') WHERE id = ?", params![thumbnail_path, photo_id])?;
        Ok(())
    }

    pub fn update_photo_exif(&self, photo_id: i64, capture_time: Option<&str>, camera_make: Option<&str>, camera_model: Option<&str>,
        lens_info: Option<&str>, focal_length_mm: Option<f64>, aperture: Option<f64>, shutter_speed: Option<&str>, iso: Option<i32>,
        exposure_compensation: Option<f64>, white_balance: Option<&str>, flash_fired: Option<bool>, metering_mode: Option<&str>,
        gps_latitude: Option<f64>, gps_longitude: Option<f64>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE photos SET capture_time = ?, camera_make = ?, camera_model = ?, lens_info = ?, focal_length_mm = ?,
             aperture = ?, shutter_speed = ?, iso = ?, exposure_compensation = ?, white_balance = ?, flash_fired = ?,
             metering_mode = ?, gps_latitude = ?, gps_longitude = ?, updated_at = datetime('now') WHERE id = ?",
            params![capture_time, camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired.map(|b| b as i32), metering_mode, gps_latitude, gps_longitude, photo_id],
        )?;
        Ok(())
    }

    pub fn delete_photos(&self, photo_ids: &[i64]) -> Result<u64> {
        if photo_ids.is_empty() { return Ok(0); }
        let tx = self.conn.unchecked_transaction()?;
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        tx.execute(&format!("DELETE FROM photos WHERE raw_photo_id IN ({})", placeholders), rusqlite::params_from_iter(photo_ids.iter()))?;
        tx.execute(&format!("DELETE FROM photos WHERE id IN ({})", placeholders), rusqlite::params_from_iter(photo_ids.iter()))?;
        let deleted = tx.changes() as u64;
        tx.commit()?;
        Ok(deleted)
    }

    pub fn update_photo_rating(&self, photo_id: i64, rating: i32) -> Result<()> {
        self.conn.execute("UPDATE photos SET rating = ?, updated_at = datetime('now') WHERE id = ?", params![rating, photo_id])?;
        Ok(())
    }

    pub fn update_photos_rating(&self, photo_ids: &[i64], rating: i32) -> Result<()> {
        if photo_ids.is_empty() { return Ok(()); }
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!("UPDATE photos SET rating = ?, updated_at = datetime('now') WHERE id IN ({})", placeholders);
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(rating)];
        for &id in photo_ids { params.push(Box::new(id)); }
        self.conn.execute(&query, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))?;
        Ok(())
    }

    pub fn link_orphan_processed_photos(&self) -> Result<i64> {
        let mut stmt = self.conn.prepare("SELECT id, trip_id, filename FROM photos WHERE is_processed = 1 AND raw_photo_id IS NULL")?;
        let orphans: Vec<(i64, i64, String)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).ok().map(|r| r.filter_map(|r| r.ok()).collect()).unwrap_or_default();
        let mut linked_count = 0i64;
        for (processed_id, trip_id, filename) in orphans {
            let base_name = std::path::Path::new(&filename).file_stem().and_then(|s| s.to_str()).unwrap_or(&filename).to_lowercase();
            let pattern = format!("{}%", base_name);
            let raw_id: Option<i64> = self.conn.query_row("SELECT id FROM photos WHERE trip_id = ? AND is_processed = 0 AND LOWER(filename) LIKE ? LIMIT 1", params![trip_id, pattern], |row| row.get(0)).ok();
            if let Some(raw_id) = raw_id { self.conn.execute("UPDATE photos SET raw_photo_id = ? WHERE id = ?", params![raw_id, processed_id])?; linked_count += 1; }
        }
        Ok(linked_count)
    }

    // ====================== Statistics Operations ======================

    pub fn get_statistics(&self) -> Result<Statistics> {
        let total_trips: i64 = self.conn.query_row("SELECT COUNT(*) FROM trips", [], |row| row.get(0))?;
        let total_dives: i64 = self.conn.query_row("SELECT COUNT(*) FROM dives", [], |row| row.get(0))?;
        let total_bottom_time_seconds: i64 = self.conn.query_row("SELECT COALESCE(SUM(duration_seconds), 0) FROM dives", [], |row| row.get(0))?;
        let total_photos: i64 = self.conn.query_row("SELECT COUNT(*) FROM photos WHERE is_processed = 0", [], |row| row.get(0))?;
        let total_species: i64 = self.conn.query_row("SELECT COUNT(DISTINCT species_tag_id) FROM photo_species_tags", [], |row| row.get(0))?;
        let deepest_dive_m: Option<f64> = self.conn.query_row("SELECT MAX(max_depth_m) FROM dives", [], |row| row.get(0)).ok();
        let avg_depth_m: Option<f64> = self.conn.query_row("SELECT AVG(max_depth_m) FROM dives WHERE max_depth_m IS NOT NULL", [], |row| row.get(0)).ok();
        let coldest_water_c: Option<f64> = self.conn.query_row("SELECT MIN(water_temp_c) FROM dives WHERE water_temp_c IS NOT NULL", [], |row| row.get(0)).ok();
        let warmest_water_c: Option<f64> = self.conn.query_row("SELECT MAX(water_temp_c) FROM dives WHERE water_temp_c IS NOT NULL", [], |row| row.get(0)).ok();
        let photos_with_species: i64 = self.conn.query_row("SELECT COUNT(DISTINCT photo_id) FROM photo_species_tags", [], |row| row.get(0))?;
        let rated_photos: i64 = self.conn.query_row("SELECT COUNT(*) FROM photos WHERE rating > 0", [], |row| row.get(0))?;
        Ok(Statistics { total_trips, total_dives, total_bottom_time_seconds, total_photos, total_species, deepest_dive_m, avg_depth_m, coldest_water_c, warmest_water_c, photos_with_species, rated_photos })
    }

    pub fn get_species_with_counts(&self) -> Result<Vec<SpeciesCount>> {
        let mut stmt = self.conn.prepare(
            "SELECT st.id, st.name, st.category, st.scientific_name, COUNT(pst.photo_id) as photo_count
             FROM species_tags st LEFT JOIN photo_species_tags pst ON st.id = pst.species_tag_id
             GROUP BY st.id ORDER BY photo_count DESC, st.name"
        )?;
        let counts = stmt.query_map([], |row| Ok(SpeciesCount {
            id: row.get(0)?, name: row.get(1)?, category: row.get(2)?, scientific_name: row.get(3)?, photo_count: row.get(4)?,
        }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(counts)
    }

    pub fn get_camera_stats(&self) -> Result<Vec<CameraStat>> {
        let mut stmt = self.conn.prepare(
            "SELECT camera_model, COUNT(*) as photo_count
             FROM photos WHERE camera_model IS NOT NULL AND is_processed = 0
             GROUP BY camera_model ORDER BY photo_count DESC"
        )?;
        let stats = stmt.query_map([], |row| Ok(CameraStat { camera_model: row.get(0)?, photo_count: row.get(1)? }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(stats)
    }

    pub fn get_yearly_stats(&self) -> Result<Vec<YearlyStat>> {
        let mut stmt = self.conn.prepare(
            "SELECT strftime('%Y', date) as year, COUNT(*) as dive_count, COALESCE(SUM(duration_seconds), 0) as total_time, AVG(max_depth_m) as avg_depth
             FROM dives WHERE date IS NOT NULL GROUP BY year ORDER BY year DESC"
        )?;
        let stats = stmt.query_map([], |row| Ok(YearlyStat { year: row.get(0)?, dive_count: row.get(1)?, total_time_seconds: row.get(2)?, avg_depth_m: row.get(3)? }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(stats)
    }

    pub fn get_trip_species_count(&self, trip_id: i64) -> Result<i64> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT pst.species_tag_id) FROM photo_species_tags pst
             JOIN photos p ON p.id = pst.photo_id WHERE p.trip_id = ?",
            params![trip_id], |row| row.get(0),
        )?;
        Ok(count)
    }

    // ====================== Export Operations ======================

    pub fn get_trip_export(&self, trip_id: i64) -> Result<TripExport> {
        let trip = self.get_trip(trip_id)?.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
        let dives = self.get_dives_for_trip(trip_id)?;
        
        // Build dive exports with species info
        let mut dive_exports = Vec::new();
        for dive in dives {
            let photo_count: i64 = self.conn.query_row("SELECT COUNT(*) FROM photos WHERE dive_id = ?", [dive.id], |row| row.get(0))?;
            let mut stmt = self.conn.prepare("SELECT DISTINCT st.name FROM species_tags st JOIN photo_species_tags pst ON st.id = pst.species_tag_id JOIN photos p ON pst.photo_id = p.id WHERE p.dive_id = ? ORDER BY st.name")?;
            let species: Vec<String> = stmt.query_map([dive.id], |row| row.get(0))?.collect::<std::result::Result<Vec<_>, _>>()?;
            dive_exports.push(DiveExport { dive, photo_count, species });
        }
        
        let photo_count: i64 = self.conn.query_row("SELECT COUNT(*) FROM photos WHERE trip_id = ?", params![trip_id], |row| row.get(0))?;
        let species_count = self.get_trip_species_count(trip_id)?;
        Ok(TripExport { trip, dives: dive_exports, photo_count, species_count })
    }

    pub fn get_species_export(&self) -> Result<Vec<SpeciesExport>> {
        let mut stmt = self.conn.prepare(
            "SELECT st.name, st.scientific_name, st.category, COUNT(DISTINCT pst.photo_id) as photo_count, COUNT(DISTINCT p.dive_id) as dive_count, COUNT(DISTINCT p.trip_id) as trip_count
             FROM species_tags st LEFT JOIN photo_species_tags pst ON st.id = pst.species_tag_id
             LEFT JOIN photos p ON pst.photo_id = p.id GROUP BY st.id ORDER BY st.name"
        )?;
        let exports = stmt.query_map([], |row| Ok(SpeciesExport {
            name: row.get(0)?, scientific_name: row.get(1)?, category: row.get(2)?, photo_count: row.get(3)?, dive_count: row.get(4)?, trip_count: row.get(5)?,
        }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(exports)
    }

    pub fn get_photos_for_export(&self, photo_ids: &[i64]) -> Result<Vec<Photo>> {
        if photo_ids.is_empty() { return Ok(Vec::new()); }
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
                    created_at, updated_at FROM photos WHERE id IN ({}) ORDER BY capture_time", placeholders
        );
        let mut stmt = self.conn.prepare(&query)?;
        let photos = stmt.query_map(rusqlite::params_from_iter(photo_ids.iter()), Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }

    // ====================== Dive Site Operations ======================

    pub fn get_all_dive_sites(&self) -> Result<Vec<DiveSite>> {
        let mut stmt = self.conn.prepare("SELECT id, name, lat, lon, is_user_created FROM dive_sites ORDER BY name")?;
        let sites = stmt.query_map([], |row| Ok(DiveSite { id: row.get(0)?, name: row.get(1)?, lat: row.get(2)?, lon: row.get(3)?, is_user_created: row.get::<_, i32>(4)? != 0 }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(sites)
    }

    pub fn insert_dive_site(&self, name: &str, lat: f64, lon: f64) -> Result<i64> {
        self.conn.execute("INSERT INTO dive_sites (name, lat, lon, is_user_created) VALUES (?, ?, ?, 0)", params![name, lat, lon])?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn import_dive_sites_from_csv(&self, csv_content: &str) -> Result<usize> {
        let mut count = 0;
        for line in csv_content.lines().skip(1) {
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() >= 3 {
                let name = parts[0].trim().trim_matches('"');
                if let (Ok(lat), Ok(lon)) = (parts[1].trim().parse::<f64>(), parts[2].trim().parse::<f64>()) {
                    self.conn.execute("INSERT OR IGNORE INTO dive_sites (name, lat, lon, is_user_created) VALUES (?, ?, ?, 0)", params![name, lat, lon])?;
                    count += 1;
                }
            }
        }
        Ok(count)
    }
    
    /// Create a user-created dive site
    pub fn create_dive_site(&self, name: &str, lat: f64, lon: f64) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dive_sites (name, lat, lon, is_user_created) VALUES (?1, ?2, ?3, 1)",
            params![name, lat, lon],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Update a dive site
    pub fn update_dive_site(&self, id: i64, name: &str, lat: f64, lon: f64) -> Result<bool> {
        let rows = self.conn.execute(
            "UPDATE dive_sites SET name = ?1, lat = ?2, lon = ?3 WHERE id = ?4",
            params![name, lat, lon, id],
        )?;
        Ok(rows > 0)
    }
    
    /// Delete a dive site (only user-created sites can be deleted)
    pub fn delete_dive_site(&self, id: i64) -> Result<bool> {
        let rows = self.conn.execute(
            "DELETE FROM dive_sites WHERE id = ?1 AND is_user_created = 1",
            params![id],
        )?;
        Ok(rows > 0)
    }
    
    /// Find a dive site by exact name match
    pub fn find_dive_site_by_name(&self, name: &str) -> Result<Option<DiveSite>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, lat, lon, is_user_created FROM dive_sites WHERE LOWER(name) = LOWER(?1) LIMIT 1"
        )?;
        let mut sites = stmt.query_map([name], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
                is_user_created: row.get::<_, i32>(4)? != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(sites.pop())
    }
    
    /// Find nearby dive sites within a given radius (in meters)
    pub fn find_nearby_dive_sites(&self, lat: f64, lon: f64, radius_meters: f64) -> Result<Vec<DiveSite>> {
        let radius_deg = radius_meters / 111_000.0;
        let mut stmt = self.conn.prepare(
            "SELECT id, name, lat, lon, is_user_created FROM dive_sites WHERE lat BETWEEN ?1 AND ?2 AND lon BETWEEN ?3 AND ?4"
        )?;
        let sites = stmt.query_map(params![lat - radius_deg, lat + radius_deg, lon - radius_deg, lon + radius_deg], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
                is_user_created: row.get::<_, i32>(4)? != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        // Filter by actual distance using Haversine formula
        let sites: Vec<DiveSite> = sites.into_iter().filter(|site| {
            let dlat = (site.lat - lat).to_radians();
            let dlon = (site.lon - lon).to_radians();
            let a = (dlat / 2.0).sin().powi(2) + lat.to_radians().cos() * site.lat.to_radians().cos() * (dlon / 2.0).sin().powi(2);
            let c = 2.0 * a.sqrt().asin();
            let distance_m = 6_371_000.0 * c;
            distance_m <= radius_meters
        }).collect();
        Ok(sites)
    }
    
    /// Find or create a dive site
    pub fn find_or_create_dive_site(&self, name: &str, lat: f64, lon: f64) -> Result<i64> {
        if let Some(site) = self.find_dive_site_by_name(name)? {
            return Ok(site.id);
        }
        let nearby = self.find_nearby_dive_sites(lat, lon, 25.0)?;
        if let Some(site) = nearby.first() {
            return Ok(site.id);
        }
        self.create_dive_site(name, lat, lon)
    }
    
    /// Search dive sites by name (server-side)
    pub fn search_dive_sites(&self, query: &str) -> Result<Vec<DiveSite>> {
        let search_pattern = format!("%{}%", query.to_lowercase());
        let mut stmt = self.conn.prepare(
            "SELECT id, name, lat, lon, is_user_created FROM dive_sites WHERE LOWER(name) LIKE ?1 ORDER BY name LIMIT 100"
        )?;
        let sites = stmt.query_map([&search_pattern], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
                is_user_created: row.get::<_, i32>(4)? != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(sites)
    }
    
    /// Get a single dive site by ID
    pub fn get_dive_site(&self, id: i64) -> Result<Option<DiveSite>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, lat, lon, is_user_created FROM dive_sites WHERE id = ?1"
        )?;
        let mut sites = stmt.query_map([id], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
                is_user_created: row.get::<_, i32>(4)? != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(sites.pop())
    }

    // ====================== Search Operations ======================

    pub fn search(&self, query: &str) -> Result<SearchResults> {
        let pattern = format!("%{}%", query.to_lowercase());
        
        // Search trips by name/location
        let mut trips_stmt = self.conn.prepare("SELECT id, name, location, resort, date_start, date_end, notes, created_at, updated_at FROM trips WHERE LOWER(name) LIKE ? OR LOWER(location) LIKE ? OR LOWER(resort) LIKE ? ORDER BY date_start DESC")?;
        let trips = trips_stmt.query_map(params![&pattern, &pattern, &pattern], |row| Ok(Trip {
            id: row.get(0)?, name: row.get(1)?, location: row.get(2)?, resort: row.get(3)?, date_start: row.get(4)?, date_end: row.get(5)?, notes: row.get(6)?, created_at: row.get(7)?, updated_at: row.get(8)?,
        }))?.collect::<Result<Vec<_>>>()?;
        
        // Search species tags
        let mut species_stmt = self.conn.prepare("SELECT id, name, category, scientific_name FROM species_tags WHERE LOWER(name) LIKE ? OR LOWER(scientific_name) LIKE ? ORDER BY name")?;
        let species = species_stmt.query_map(params![&pattern, &pattern], |row| Ok(SpeciesTag { id: row.get(0)?, name: row.get(1)?, category: row.get(2)?, scientific_name: row.get(3)? }))?.collect::<Result<Vec<_>>>()?;
        
        // Search general tags
        let mut tags_stmt = self.conn.prepare("SELECT id, name FROM general_tags WHERE LOWER(name) LIKE ? ORDER BY name")?;
        let tags = tags_stmt.query_map(params![&pattern], |row| Ok(GeneralTag { id: row.get(0)?, name: row.get(1)? }))?.collect::<Result<Vec<_>>>()?;
        
        // Search dive sites
        let mut dive_sites_stmt = self.conn.prepare("SELECT id, name, lat, lon, is_user_created FROM dive_sites WHERE LOWER(name) LIKE ? ORDER BY name LIMIT 100")?;
        let dive_sites = dive_sites_stmt.query_map(params![&pattern], |row| Ok(DiveSite { id: row.get(0)?, name: row.get(1)?, lat: row.get(2)?, lon: row.get(3)?, is_user_created: row.get::<_, i32>(4)? != 0 }))?.collect::<Result<Vec<_>>>()?;
        
        // Search photos - by filename OR by species/general tags on the photo
        let mut photos_stmt = self.conn.prepare(
            "SELECT DISTINCT p.id, p.trip_id, p.dive_id, p.file_path, p.thumbnail_path, p.filename,
                    p.capture_time, p.width, p.height, p.file_size_bytes, p.is_processed,
                    p.raw_photo_id, p.rating, p.camera_make, p.camera_model, p.lens_info,
                    p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode,
                    p.gps_latitude, p.gps_longitude, p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photo_species_tags pst ON pst.photo_id = p.id
             LEFT JOIN species_tags st ON st.id = pst.species_tag_id
             LEFT JOIN photo_general_tags pgt ON pgt.photo_id = p.id
             LEFT JOIN general_tags gt ON gt.id = pgt.general_tag_id
             WHERE LOWER(p.filename) LIKE ?1
                   OR LOWER(st.name) LIKE ?1 OR LOWER(st.scientific_name) LIKE ?1
                   OR LOWER(gt.name) LIKE ?1
             ORDER BY p.capture_time DESC
             LIMIT 100"
        )?;
        let photos: Vec<Photo> = photos_stmt.query_map([&pattern], |row| {
            Ok(Photo {
                id: row.get(0)?,
                trip_id: row.get(1)?,
                dive_id: row.get(2)?,
                file_path: row.get(3)?,
                thumbnail_path: row.get(4)?,
                filename: row.get(5)?,
                capture_time: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                file_size_bytes: row.get(9)?,
                is_processed: row.get(10)?,
                raw_photo_id: row.get(11)?,
                rating: row.get(12)?,
                camera_make: row.get(13)?,
                camera_model: row.get(14)?,
                lens_info: row.get(15)?,
                focal_length_mm: row.get(16)?,
                aperture: row.get(17)?,
                shutter_speed: row.get(18)?,
                iso: row.get(19)?,
                exposure_compensation: row.get(20)?,
                white_balance: row.get(21)?,
                flash_fired: row.get::<_, Option<i32>>(22)?.map(|i| i != 0),
                metering_mode: row.get(23)?,
                gps_latitude: row.get(24)?,
                gps_longitude: row.get(25)?,
                created_at: row.get(26)?,
                updated_at: row.get(27)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        // Search dives - by location/buddy/comments OR by species/tags on photos in the dive
        let mut dives_stmt = self.conn.prepare(
            "SELECT DISTINCT d.id, d.trip_id, d.dive_number, d.date, d.time, d.duration_seconds, 
                    d.max_depth_m, d.mean_depth_m, d.water_temp_c, d.air_temp_c, d.surface_pressure_bar,
                    d.otu, d.cns_percent, d.dive_computer_model, d.dive_computer_serial,
                    d.location, d.ocean, d.visibility_m, d.gear_profile_id, d.buddy, d.divemaster, d.guide,
                    d.instructor, d.comments, d.latitude, d.longitude, d.dive_site_id, d.is_fresh_water, d.is_boat_dive, d.is_drift_dive,
                    d.is_night_dive, d.is_training_dive, d.created_at, d.updated_at
             FROM dives d
             LEFT JOIN photos p ON p.dive_id = d.id
             LEFT JOIN photo_species_tags pst ON pst.photo_id = p.id
             LEFT JOIN species_tags st ON st.id = pst.species_tag_id
             LEFT JOIN photo_general_tags pgt ON pgt.photo_id = p.id
             LEFT JOIN general_tags gt ON gt.id = pgt.general_tag_id
             WHERE LOWER(d.location) LIKE ?1 OR LOWER(d.ocean) LIKE ?1 OR LOWER(d.buddy) LIKE ?1 
                   OR LOWER(d.comments) LIKE ?1 OR LOWER(d.divemaster) LIKE ?1 OR LOWER(d.guide) LIKE ?1
                   OR LOWER(st.name) LIKE ?1 OR LOWER(st.scientific_name) LIKE ?1
                   OR LOWER(gt.name) LIKE ?1
             ORDER BY d.date DESC
             LIMIT 50"
        )?;
        let dives: Vec<Dive> = dives_stmt.query_map([&pattern], |row| {
            Ok(Dive {
                id: row.get(0)?,
                trip_id: row.get(1)?,
                dive_number: row.get(2)?,
                date: row.get(3)?,
                time: row.get(4)?,
                duration_seconds: row.get(5)?,
                max_depth_m: row.get(6)?,
                mean_depth_m: row.get(7)?,
                water_temp_c: row.get(8)?,
                air_temp_c: row.get(9)?,
                surface_pressure_bar: row.get(10)?,
                otu: row.get(11)?,
                cns_percent: row.get(12)?,
                dive_computer_model: row.get(13)?,
                dive_computer_serial: row.get(14)?,
                location: row.get(15)?,
                ocean: row.get(16)?,
                visibility_m: row.get(17)?,
                gear_profile_id: row.get(18)?,
                buddy: row.get(19)?,
                divemaster: row.get(20)?,
                guide: row.get(21)?,
                instructor: row.get(22)?,
                comments: row.get(23)?,
                latitude: row.get(24)?,
                longitude: row.get(25)?,
                dive_site_id: row.get(26)?,
                is_fresh_water: row.get::<_, i32>(27)? != 0,
                is_boat_dive: row.get::<_, i32>(28)? != 0,
                is_drift_dive: row.get::<_, i32>(29)? != 0,
                is_night_dive: row.get::<_, i32>(30)? != 0,
                is_training_dive: row.get::<_, i32>(31)? != 0,
                created_at: row.get(32)?,
                updated_at: row.get(33)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(SearchResults { trips, species, dives, photos, tags, dive_sites })
    }

    pub fn filter_photos(&self, filter: &PhotoFilter) -> Result<Vec<Photo>> {
        let mut sql = String::from(
            "SELECT p.id, p.trip_id, p.dive_id, p.file_path, COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                    p.filename, p.capture_time, p.width, p.height, p.file_size_bytes, p.is_processed, p.raw_photo_id, p.rating,
                    p.camera_make, p.camera_model, p.lens_info, p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode, p.gps_latitude, p.gps_longitude,
                    p.created_at, p.updated_at
             FROM photos p LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
             WHERE (p.is_processed = 0 OR p.raw_photo_id IS NULL)"
        );
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(trip_id) = filter.trip_id { sql.push_str(" AND p.trip_id = ?"); params.push(Box::new(trip_id)); }
        if let Some(dive_id) = filter.dive_id { sql.push_str(" AND p.dive_id = ?"); params.push(Box::new(dive_id)); }
        if let Some(min_rating) = filter.rating_min { sql.push_str(" AND p.rating >= ?"); params.push(Box::new(min_rating)); }
        sql.push_str(" ORDER BY p.capture_time");
        let mut stmt = self.conn.prepare(&sql)?;
        let photos = stmt.query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }

    pub fn move_photos_to_dive(&self, photo_ids: &[i64], dive_id: Option<i64>) -> Result<usize> {
        if photo_ids.is_empty() { return Ok(0); }
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!("UPDATE photos SET dive_id = ?, updated_at = datetime('now') WHERE id IN ({})", placeholders);
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dive_id)];
        for &id in photo_ids { params.push(Box::new(id)); }
        self.conn.execute(&query, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))?;
        Ok(photo_ids.len())
    }

    // ====================== Dive Operations (Additional) ======================

    pub fn bulk_update_dives(&self, dive_ids: &[i64], location: Option<Option<&str>>, ocean: Option<Option<&str>>,
        buddy: Option<Option<&str>>, divemaster: Option<Option<&str>>, guide: Option<Option<&str>>, instructor: Option<Option<&str>>,
        is_boat_dive: Option<bool>, is_night_dive: Option<bool>, is_drift_dive: Option<bool>, is_fresh_water: Option<bool>, is_training_dive: Option<bool>,
    ) -> Result<usize> {
        if dive_ids.is_empty() { return Ok(0); }
        let mut set_clauses: Vec<String> = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(v) = location { set_clauses.push("location = ?".to_string()); params.push(Box::new(v.map(|s| s.to_string()))); }
        if let Some(v) = ocean { set_clauses.push("ocean = ?".to_string()); params.push(Box::new(v.map(|s| s.to_string()))); }
        if let Some(v) = buddy { set_clauses.push("buddy = ?".to_string()); params.push(Box::new(v.map(|s| s.to_string()))); }
        if let Some(v) = divemaster { set_clauses.push("divemaster = ?".to_string()); params.push(Box::new(v.map(|s| s.to_string()))); }
        if let Some(v) = guide { set_clauses.push("guide = ?".to_string()); params.push(Box::new(v.map(|s| s.to_string()))); }
        if let Some(v) = instructor { set_clauses.push("instructor = ?".to_string()); params.push(Box::new(v.map(|s| s.to_string()))); }
        if let Some(v) = is_boat_dive { set_clauses.push("is_boat_dive = ?".to_string()); params.push(Box::new(v as i32)); }
        if let Some(v) = is_night_dive { set_clauses.push("is_night_dive = ?".to_string()); params.push(Box::new(v as i32)); }
        if let Some(v) = is_drift_dive { set_clauses.push("is_drift_dive = ?".to_string()); params.push(Box::new(v as i32)); }
        if let Some(v) = is_fresh_water { set_clauses.push("is_fresh_water = ?".to_string()); params.push(Box::new(v as i32)); }
        if let Some(v) = is_training_dive { set_clauses.push("is_training_dive = ?".to_string()); params.push(Box::new(v as i32)); }
        if set_clauses.is_empty() { return Ok(0); }
        set_clauses.push("updated_at = datetime('now')".to_string());
        let placeholders: String = dive_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!("UPDATE dives SET {} WHERE id IN ({})", set_clauses.join(", "), placeholders);
        for &id in dive_ids { params.push(Box::new(id)); }
        self.conn.execute(&query, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))?;
        Ok(dive_ids.len())
    }

    pub fn get_dives_with_coordinates(&self) -> Result<Vec<DiveMapPoint>> {
        let mut stmt = self.conn.prepare(
            "SELECT d.id, d.trip_id, d.dive_number, d.location, d.latitude, d.longitude, d.date, d.max_depth_m, t.name as trip_name
             FROM dives d JOIN trips t ON d.trip_id = t.id WHERE d.latitude IS NOT NULL AND d.longitude IS NOT NULL"
        )?;
        let points = stmt.query_map([], |row| Ok(DiveMapPoint { 
            dive_id: row.get(0)?, trip_id: row.get(1)?, dive_number: row.get(2)?, location: row.get(3)?, 
            latitude: row.get(4)?, longitude: row.get(5)?, date: row.get(6)?, max_depth_m: row.get::<_, Option<f64>>(7)?.unwrap_or(0.0), trip_name: row.get(8)? 
        }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(points)
    }

    // ====================== Equipment Operations ======================

    pub fn get_equipment_categories(&self) -> Result<Vec<EquipmentCategory>> {
        let mut stmt = self.conn.prepare("SELECT id, name, icon, sort_order FROM equipment_categories ORDER BY sort_order, name")?;
        let categories = stmt.query_map([], |row| Ok(EquipmentCategory { id: row.get(0)?, name: row.get(1)?, icon: row.get(2)?, sort_order: row.get(3)? }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(categories)
    }

    pub fn create_equipment_category(&self, name: &str, icon: Option<&str>, sort_order: i32) -> Result<i64> {
        self.conn.execute("INSERT INTO equipment_categories (name, icon, sort_order) VALUES (?, ?, ?)", params![name, icon, sort_order])?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update_equipment_category(&self, id: i64, name: &str, icon: Option<&str>, sort_order: i32) -> Result<()> {
        self.conn.execute("UPDATE equipment_categories SET name = ?, icon = ?, sort_order = ? WHERE id = ?", params![name, icon, sort_order, id])?;
        Ok(())
    }

    pub fn delete_equipment_category(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM equipment_categories WHERE id = ?", params![id])?;
        Ok(())
    }

    pub fn get_all_equipment(&self) -> Result<Vec<EquipmentWithCategory>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.category_id, e.name, e.brand, e.model, e.serial_number, e.purchase_date, e.notes, e.is_retired, e.created_at, e.updated_at,
                    c.name as category_name
             FROM equipment e LEFT JOIN equipment_categories c ON e.category_id = c.id ORDER BY c.sort_order, c.name, e.name"
        )?;
        let equipment = stmt.query_map([], |row| Ok(EquipmentWithCategory {
            id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?, brand: row.get(3)?, model: row.get(4)?,
            serial_number: row.get(5)?, purchase_date: row.get(6)?, notes: row.get(7)?, is_retired: row.get::<_, i32>(8)? != 0, 
            created_at: row.get(9)?, updated_at: row.get(10)?, category_name: row.get(11)?,
        }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(equipment)
    }

    pub fn get_equipment_by_category(&self, category_id: i64) -> Result<Vec<Equipment>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, category_id, name, brand, model, serial_number, purchase_date, notes, is_retired, created_at, updated_at
             FROM equipment WHERE category_id = ? ORDER BY name"
        )?;
        let equipment = stmt.query_map([category_id], |row| Ok(Equipment {
            id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?, brand: row.get(3)?, model: row.get(4)?,
            serial_number: row.get(5)?, purchase_date: row.get(6)?, notes: row.get(7)?, is_retired: row.get::<_, i32>(8)? != 0, 
            created_at: row.get(9)?, updated_at: row.get(10)?,
        }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(equipment)
    }

    pub fn get_equipment(&self, id: i64) -> Result<Option<EquipmentWithCategory>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.category_id, e.name, e.brand, e.model, e.serial_number, e.purchase_date, e.notes, e.is_retired, e.created_at, e.updated_at,
                    c.name as category_name
             FROM equipment e LEFT JOIN equipment_categories c ON e.category_id = c.id WHERE e.id = ?"
        )?;
        let mut rows = stmt.query([id])?;
        match rows.next()? {
            Some(row) => Ok(Some(EquipmentWithCategory {
                id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?, brand: row.get(3)?, model: row.get(4)?,
                serial_number: row.get(5)?, purchase_date: row.get(6)?, notes: row.get(7)?, is_retired: row.get::<_, i32>(8)? != 0, 
                created_at: row.get(9)?, updated_at: row.get(10)?, category_name: row.get(11)?,
            })),
            None => Ok(None),
        }
    }

    pub fn create_equipment(&self, category_id: i64, name: &str, brand: Option<&str>, model: Option<&str>,
        serial_number: Option<&str>, purchase_date: Option<&str>, notes: Option<&str>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO equipment (category_id, name, brand, model, serial_number, purchase_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![category_id, name, brand, model, serial_number, purchase_date, notes],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update_equipment(&self, id: i64, category_id: i64, name: &str, brand: Option<&str>, model: Option<&str>,
        serial_number: Option<&str>, purchase_date: Option<&str>, notes: Option<&str>, is_retired: bool,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE equipment SET category_id = ?, name = ?, brand = ?, model = ?, serial_number = ?, purchase_date = ?, notes = ?, is_retired = ?, updated_at = datetime('now') WHERE id = ?",
            params![category_id, name, brand, model, serial_number, purchase_date, notes, is_retired as i32, id],
        )?;
        Ok(())
    }

    pub fn delete_equipment(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM equipment WHERE id = ?", params![id])?;
        Ok(())
    }

    pub fn get_equipment_sets(&self) -> Result<Vec<EquipmentSet>> {
        let mut stmt = self.conn.prepare("SELECT id, name, description, set_type, is_default, created_at, updated_at FROM equipment_sets ORDER BY name")?;
        let sets = stmt.query_map([], |row| Ok(EquipmentSet {
            id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, set_type: row.get(3)?,
            is_default: row.get::<_, i32>(4)? != 0, created_at: row.get(5)?, updated_at: row.get(6)?,
        }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(sets)
    }

    pub fn get_equipment_sets_by_type(&self, set_type: &str) -> Result<Vec<EquipmentSet>> {
        let mut stmt = self.conn.prepare("SELECT id, name, description, set_type, is_default, created_at, updated_at FROM equipment_sets WHERE set_type = ? ORDER BY name")?;
        let sets = stmt.query_map([set_type], |row| Ok(EquipmentSet {
            id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, set_type: row.get(3)?,
            is_default: row.get::<_, i32>(4)? != 0, created_at: row.get(5)?, updated_at: row.get(6)?,
        }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(sets)
    }

    pub fn get_equipment_set_with_items(&self, id: i64) -> Result<Option<EquipmentSetWithItems>> {
        let mut stmt = self.conn.prepare("SELECT id, name, description, set_type, is_default, created_at, updated_at FROM equipment_sets WHERE id = ?")?;
        let mut rows = stmt.query([id])?;
        let set = match rows.next()? {
            Some(row) => EquipmentSet {
                id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, set_type: row.get(3)?,
                is_default: row.get::<_, i32>(4)? != 0, created_at: row.get(5)?, updated_at: row.get(6)?,
            },
            None => return Ok(None),
        };
        let items = self.get_equipment_in_set(id)?;
        Ok(Some(EquipmentSetWithItems { 
            id: set.id, name: set.name, description: set.description, set_type: set.set_type, 
            is_default: set.is_default, items, created_at: set.created_at, updated_at: set.updated_at 
        }))
    }

    fn get_equipment_in_set(&self, set_id: i64) -> Result<Vec<EquipmentWithCategory>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.category_id, e.name, e.brand, e.model, e.serial_number, e.purchase_date, e.notes, e.is_retired, e.created_at, e.updated_at,
                    c.name as category_name
             FROM equipment e
             JOIN equipment_set_items esi ON e.id = esi.equipment_id
             LEFT JOIN equipment_categories c ON e.category_id = c.id
             WHERE esi.set_id = ? ORDER BY c.sort_order, c.name, e.name"
        )?;
        let equipment = stmt.query_map([set_id], |row| Ok(EquipmentWithCategory {
            id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?, brand: row.get(3)?, model: row.get(4)?,
            serial_number: row.get(5)?, purchase_date: row.get(6)?, notes: row.get(7)?, is_retired: row.get::<_, i32>(8)? != 0,
            created_at: row.get(9)?, updated_at: row.get(10)?, category_name: row.get(11)?,
        }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(equipment)
    }

    pub fn create_equipment_set(&self, name: &str, description: Option<&str>, set_type: &str, is_default: bool) -> Result<i64> {
        if is_default {
            self.conn.execute("UPDATE equipment_sets SET is_default = 0 WHERE set_type = ?", params![set_type])?;
        }
        self.conn.execute(
            "INSERT INTO equipment_sets (name, description, set_type, is_default) VALUES (?, ?, ?, ?)",
            params![name, description, set_type, is_default as i32],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update_equipment_set(&self, id: i64, name: &str, description: Option<&str>, set_type: &str, is_default: bool) -> Result<()> {
        if is_default {
            self.conn.execute("UPDATE equipment_sets SET is_default = 0 WHERE set_type = ? AND id != ?", params![set_type, id])?;
        }
        self.conn.execute(
            "UPDATE equipment_sets SET name = ?, description = ?, set_type = ?, is_default = ?, updated_at = datetime('now') WHERE id = ?",
            params![name, description, set_type, is_default as i32, id],
        )?;
        Ok(())
    }

    pub fn delete_equipment_set(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM equipment_set_items WHERE set_id = ?", params![id])?;
        self.conn.execute("DELETE FROM equipment_sets WHERE id = ?", params![id])?;
        Ok(())
    }

    pub fn add_equipment_to_set(&self, set_id: i64, equipment_id: i64) -> Result<()> {
        self.conn.execute("INSERT OR IGNORE INTO equipment_set_items (set_id, equipment_id) VALUES (?, ?)", params![set_id, equipment_id])?;
        Ok(())
    }

    pub fn remove_equipment_from_set(&self, set_id: i64, equipment_id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM equipment_set_items WHERE set_id = ? AND equipment_id = ?", params![set_id, equipment_id])?;
        Ok(())
    }

    pub fn set_equipment_set_items(&self, set_id: i64, equipment_ids: &[i64]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM equipment_set_items WHERE set_id = ?", params![set_id])?;
        for &equipment_id in equipment_ids {
            tx.execute("INSERT INTO equipment_set_items (set_id, equipment_id) VALUES (?, ?)", params![set_id, equipment_id])?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_equipment_sets_for_dive(&self, dive_id: i64) -> Result<Vec<EquipmentSet>> {
        let mut stmt = self.conn.prepare(
            "SELECT es.id, es.name, es.description, es.set_type, es.is_default, es.created_at, es.updated_at
             FROM equipment_sets es
             JOIN dive_equipment_sets des ON es.id = des.equipment_set_id
             WHERE des.dive_id = ? ORDER BY es.name"
        )?;
        let sets = stmt.query_map([dive_id], |row| Ok(EquipmentSet {
            id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, set_type: row.get(3)?,
            is_default: row.get::<_, i32>(4)? != 0, created_at: row.get(5)?, updated_at: row.get(6)?,
        }))?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(sets)
    }

    pub fn add_equipment_set_to_dive(&self, dive_id: i64, set_id: i64) -> Result<()> {
        self.conn.execute("INSERT OR IGNORE INTO dive_equipment_sets (dive_id, equipment_set_id) VALUES (?, ?)", params![dive_id, set_id])?;
        Ok(())
    }

    pub fn remove_equipment_set_from_dive(&self, dive_id: i64, set_id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM dive_equipment_sets WHERE dive_id = ? AND equipment_set_id = ?", params![dive_id, set_id])?;
        Ok(())
    }

    pub fn set_dive_equipment_sets(&self, dive_id: i64, set_ids: &[i64]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM dive_equipment_sets WHERE dive_id = ?", params![dive_id])?;
        for &set_id in set_ids {
            tx.execute("INSERT INTO dive_equipment_sets (dive_id, equipment_set_id) VALUES (?, ?)", params![dive_id, set_id])?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_default_equipment_set(&self, set_type: &str) -> Result<Option<EquipmentSet>> {
        let mut stmt = self.conn.prepare("SELECT id, name, description, set_type, is_default, created_at, updated_at FROM equipment_sets WHERE set_type = ? AND is_default = 1")?;
        let mut rows = stmt.query([set_type])?;
        match rows.next()? {
            Some(row) => Ok(Some(EquipmentSet {
                id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, set_type: row.get(3)?,
                is_default: row.get::<_, i32>(4)? != 0, created_at: row.get(5)?, updated_at: row.get(6)?,
            })),
            None => Ok(None),
        }
    }

    // ====================== Additional Dive Import Methods ======================

    pub fn insert_dive(&self, dive: &Dive) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dives (trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                water_temp_c, air_temp_c, surface_pressure_bar, otu, cns_percent,
                dive_computer_model, dive_computer_serial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![dive.trip_id, dive.dive_number, dive.date, dive.time, dive.duration_seconds,
                dive.max_depth_m, dive.mean_depth_m, dive.water_temp_c, dive.air_temp_c,
                dive.surface_pressure_bar, dive.otu, dive.cns_percent,
                dive.dive_computer_model, dive.dive_computer_serial],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn insert_dive_events_batch(&self, dive_id: i64, events: &[DiveEvent]) -> Result<usize> {
        if events.is_empty() { return Ok(0); }
        let tx = self.conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO dive_events (dive_id, time_seconds, event_type, name, flags, value) VALUES (?, ?, ?, ?, ?, ?)"
            )?;
            for event in events {
                stmt.execute(params![dive_id, event.time_seconds, event.event_type, event.name, event.flags, event.value])?;
            }
        }
        tx.commit()?;
        Ok(events.len())
    }

    // ====================== Photo Import Methods ======================

    pub fn delete_photo_by_path(&self, file_path: &str) -> Result<()> {
        let normalized_path = file_path.replace("/", "\\");
        let photo_id: Option<i64> = self.conn.query_row(
            "SELECT id FROM photos WHERE file_path = ? OR file_path = ? COLLATE NOCASE",
            params![file_path, normalized_path], |row| row.get(0),
        ).ok();
        if let Some(id) = photo_id {
            self.conn.execute("DELETE FROM photos WHERE raw_photo_id = ?", [id])?;
            self.conn.execute("DELETE FROM photos WHERE id = ?", [id])?;
        } else {
            self.conn.execute("DELETE FROM photos WHERE file_path = ? COLLATE NOCASE", [file_path])?;
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn insert_photo_full(&self, trip_id: i64, dive_id: Option<i64>, file_path: &str, filename: &str, capture_time: Option<&str>,
        camera_make: Option<&str>, camera_model: Option<&str>, lens_info: Option<&str>, focal_length_mm: Option<f64>,
        aperture: Option<f64>, shutter_speed: Option<&str>, iso: Option<i32>, file_size_bytes: i64, is_processed: bool, raw_photo_id: Option<i64>,
        exposure_compensation: Option<f64>, white_balance: Option<&str>, flash_fired: Option<bool>, metering_mode: Option<&str>,
        gps_latitude: Option<f64>, gps_longitude: Option<f64>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO photos (trip_id, dive_id, file_path, filename, capture_time, camera_make, camera_model,
             lens_info, focal_length_mm, aperture, shutter_speed, iso, file_size_bytes, is_processed, raw_photo_id,
             exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
             created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
            params![trip_id, dive_id, file_path, filename, capture_time, camera_make, camera_model,
                lens_info, focal_length_mm, aperture, shutter_speed, iso, file_size_bytes,
                is_processed as i32, raw_photo_id, exposure_compensation, white_balance, flash_fired.map(|b| b as i32), metering_mode, gps_latitude, gps_longitude],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn find_photo_by_base_filename(&self, trip_id: i64, base_filename: &str) -> Result<Option<Photo>> {
        let pattern = format!("{}%", base_filename);
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
                    created_at, updated_at FROM photos WHERE trip_id = ? AND is_processed = 0 AND filename LIKE ? ORDER BY id LIMIT 1"
        )?;
        let mut photos = stmt.query_map(params![trip_id, pattern], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos.pop())
    }
}

impl Database {
    pub fn new() -> Result<Self> {
        let db_path = Self::get_db_path();
        
        // Create parent directory if it doesn't exist
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        
        let conn = Connection::open(&db_path)?;
        let db = Database { conn };
        db.init_schema()?;
        db.run_migrations()?;
        Ok(db)
    }
    
    /// Create a Database wrapper from an existing connection (e.g., from pool)
    /// Note: This takes ownership, use from_pooled_conn for pooled connections
    pub fn from_conn(conn: Connection) -> Self {
        Database { conn }
    }
    
    /// Get a reference to the internal connection
    pub fn conn(&self) -> &Connection {
        &self.conn
    }
    
    /// Get the database file path (public for async initialization)
    pub fn get_db_path() -> PathBuf {
        // Use app data directory
        let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("Pelagic");
        path.push("pelagic.db");
        path
    }
    
    /// Initialize schema on a raw connection (for async use via tokio-rusqlite)
    pub fn init_schema_on_conn(conn: &Connection) -> Result<()> {
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS trips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                location TEXT NOT NULL DEFAULT '',
                resort TEXT,
                date_start TEXT NOT NULL,
                date_end TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            CREATE TABLE IF NOT EXISTS dives (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                dive_number INTEGER NOT NULL,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL,
                max_depth_m REAL NOT NULL,
                mean_depth_m REAL NOT NULL DEFAULT 0,
                water_temp_c REAL,
                air_temp_c REAL,
                surface_pressure_bar REAL,
                otu INTEGER,
                cns_percent REAL,
                dive_computer_model TEXT,
                dive_computer_serial TEXT,
                location TEXT,
                ocean TEXT,
                visibility_m REAL,
                gear_profile_id INTEGER,
                buddy TEXT,
                divemaster TEXT,
                guide TEXT,
                instructor TEXT,
                comments TEXT,
                is_fresh_water INTEGER NOT NULL DEFAULT 0,
                is_boat_dive INTEGER NOT NULL DEFAULT 0,
                is_drift_dive INTEGER NOT NULL DEFAULT 0,
                is_night_dive INTEGER NOT NULL DEFAULT 0,
                is_training_dive INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            CREATE TABLE IF NOT EXISTS dive_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dive_id INTEGER NOT NULL REFERENCES dives(id) ON DELETE CASCADE,
                time_seconds INTEGER NOT NULL,
                depth_m REAL NOT NULL,
                temp_c REAL,
                pressure_bar REAL,
                ndl_seconds INTEGER,
                rbt_seconds INTEGER
            );
            
            CREATE TABLE IF NOT EXISTS dive_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dive_id INTEGER NOT NULL REFERENCES dives(id) ON DELETE CASCADE,
                time_seconds INTEGER NOT NULL,
                event_type INTEGER NOT NULL,
                name TEXT NOT NULL,
                flags INTEGER,
                value INTEGER
            );
            
            CREATE TABLE IF NOT EXISTS tank_pressures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dive_id INTEGER NOT NULL REFERENCES dives(id) ON DELETE CASCADE,
                sensor_id INTEGER NOT NULL,
                sensor_name TEXT,
                time_seconds INTEGER NOT NULL,
                pressure_bar REAL NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS dive_tanks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dive_id INTEGER NOT NULL REFERENCES dives(id) ON DELETE CASCADE,
                sensor_id INTEGER NOT NULL DEFAULT 0,
                sensor_name TEXT,
                gas_index INTEGER NOT NULL DEFAULT 0,
                o2_percent REAL,
                he_percent REAL,
                start_pressure_bar REAL,
                end_pressure_bar REAL,
                volume_used_liters REAL
            );
            
            CREATE INDEX IF NOT EXISTS idx_dive_tanks_dive ON dive_tanks(dive_id);
            CREATE INDEX IF NOT EXISTS idx_dive_tanks_sensor ON dive_tanks(dive_id, sensor_id);
            
            CREATE TABLE IF NOT EXISTS gear_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                bcd TEXT,
                wetsuit TEXT,
                fins TEXT,
                weights_kg REAL,
                cylinder_liters REAL,
                cylinder_material TEXT,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            CREATE TABLE IF NOT EXISTS photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                dive_id INTEGER REFERENCES dives(id) ON DELETE SET NULL,
                file_path TEXT NOT NULL UNIQUE,
                thumbnail_path TEXT,
                filename TEXT NOT NULL,
                capture_time TEXT,
                width INTEGER,
                height INTEGER,
                file_size_bytes INTEGER,
                is_processed INTEGER NOT NULL DEFAULT 0,
                raw_photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
                rating INTEGER DEFAULT 0,
                camera_make TEXT,
                camera_model TEXT,
                lens_info TEXT,
                focal_length_mm REAL,
                aperture REAL,
                shutter_speed TEXT,
                iso INTEGER,
                exposure_compensation REAL,
                white_balance TEXT,
                flash_fired INTEGER DEFAULT 0,
                metering_mode TEXT,
                gps_latitude REAL,
                gps_longitude REAL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            CREATE TABLE IF NOT EXISTS species_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                category TEXT,
                scientific_name TEXT
            );
            
            CREATE TABLE IF NOT EXISTS general_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );
            
            CREATE TABLE IF NOT EXISTS photo_species_tags (
                photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
                species_tag_id INTEGER NOT NULL REFERENCES species_tags(id) ON DELETE CASCADE,
                PRIMARY KEY (photo_id, species_tag_id)
            );
            
            CREATE TABLE IF NOT EXISTS photo_general_tags (
                photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
                general_tag_id INTEGER NOT NULL REFERENCES general_tags(id) ON DELETE CASCADE,
                PRIMARY KEY (photo_id, general_tag_id)
            );
            
            CREATE TABLE IF NOT EXISTS dive_sites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                is_user_created INTEGER NOT NULL DEFAULT 0
            );
            
            -- Equipment catalogue tables
            CREATE TABLE IF NOT EXISTS equipment_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                icon TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS equipment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL REFERENCES equipment_categories(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                brand TEXT,
                model TEXT,
                serial_number TEXT,
                purchase_date TEXT,
                notes TEXT,
                is_retired INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            CREATE TABLE IF NOT EXISTS equipment_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                set_type TEXT NOT NULL DEFAULT 'dive',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            CREATE TABLE IF NOT EXISTS equipment_set_items (
                equipment_set_id INTEGER NOT NULL REFERENCES equipment_sets(id) ON DELETE CASCADE,
                equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
                PRIMARY KEY (equipment_set_id, equipment_id)
            );
            
            CREATE TABLE IF NOT EXISTS dive_equipment_sets (
                dive_id INTEGER NOT NULL REFERENCES dives(id) ON DELETE CASCADE,
                equipment_set_id INTEGER NOT NULL REFERENCES equipment_sets(id) ON DELETE CASCADE,
                PRIMARY KEY (dive_id, equipment_set_id)
            );
            
            CREATE INDEX IF NOT EXISTS idx_dives_trip_id ON dives(trip_id);
            CREATE INDEX IF NOT EXISTS idx_dive_samples_dive_id ON dive_samples(dive_id);
            CREATE INDEX IF NOT EXISTS idx_dive_events_dive_id ON dive_events(dive_id);
            CREATE INDEX IF NOT EXISTS idx_photos_trip_id ON photos(trip_id);
            CREATE INDEX IF NOT EXISTS idx_photos_dive_id ON photos(dive_id);
            CREATE INDEX IF NOT EXISTS idx_photos_capture_time ON photos(capture_time);
            CREATE INDEX IF NOT EXISTS idx_equipment_category_id ON equipment(category_id);
            CREATE INDEX IF NOT EXISTS idx_equipment_set_items_set ON equipment_set_items(equipment_set_id);
            CREATE INDEX IF NOT EXISTS idx_dive_equipment_sets_dive ON dive_equipment_sets(dive_id);
            
            -- Schema version tracking (avoids repeated migration checks on startup)
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        "#)?;
        
        Ok(())
    }
    
    fn init_schema(&self) -> Result<()> {
        Self::init_schema_on_conn(&self.conn)
    }
    
    // Current schema version - increment this when adding new migrations
    const CURRENT_SCHEMA_VERSION: i64 = 2;
    
    /// Run migrations on a raw connection (for async use via tokio-rusqlite)
    /// Uses version-based tracking to avoid repeated schema checks on every startup
    pub fn run_migrations_on_conn(conn: &Connection) -> Result<()> {
        // Get current schema version (0 if table doesn't exist or is empty)
        let current_version: i64 = conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0)
        ).unwrap_or(0);
        
        // If already at current version, skip all migrations
        if current_version >= Self::CURRENT_SCHEMA_VERSION {
            return Ok(());
        }
        
        log::info!("Running migrations from version {} to {}", current_version, Self::CURRENT_SCHEMA_VERSION);
        
        // For databases created before version tracking, check if they need legacy migrations
        // This only runs once - after that, version tracking takes over
        if current_version == 0 {
            Self::run_legacy_migrations(conn)?;
        }
        
        // Version 1 -> 2: Add is_user_created column to dive_sites
        if current_version < 2 {
            Self::run_migration_v2(conn)?;
        }
        
        // Seed default equipment categories if table is empty
        let categories_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM equipment_categories",
            [],
            |row| row.get(0)
        ).unwrap_or(0);
        
        if categories_count == 0 {
            conn.execute_batch(r#"
                INSERT INTO equipment_categories (name, icon, sort_order) VALUES 
                    ('Mask', '🥽', 1),
                    ('Snorkel', '🤿', 2),
                    ('Fins', '🦶', 3),
                    ('Exposure Protection', '🧥', 4),
                    ('BCD', '🎒', 5),
                    ('Regulator', '💨', 6),
                    ('Cylinder', '🔋', 7),
                    ('Weights', '⚖️', 8),
                    ('Computer & Gauges', '⌚', 9),
                    ('Lighting', '🔦', 10),
                    ('Camera Body', '📷', 11),
                    ('Camera Housing', '📦', 12),
                    ('Camera Lens', '🔍', 13),
                    ('Wet Lens', '🔎', 14),
                    ('Camera Port', '⭕', 15),
                    ('Strobe & Video Light', '💡', 16),
                    ('Arms & Clamps', '🦾', 17),
                    ('Accessories', '🎒', 18);
            "#)?;
        }
        
        // Data migrations - these check actual data state, not schema
        // They only run if data needs migrating and are idempotent
        Self::run_data_migrations(conn)?;
        
        // Record that we're now at current version
        conn.execute(
            "INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, datetime('now'))",
            [Self::CURRENT_SCHEMA_VERSION]
        )?;
        
        log::info!("Migrations complete, now at schema version {}", Self::CURRENT_SCHEMA_VERSION);
        
        Ok(())
    }
    
    /// Legacy migrations for databases created before version tracking
    /// These use schema inspection and only run once (when version = 0)
    fn run_legacy_migrations(conn: &Connection) -> Result<()> {
        // Check if this is truly a legacy database by looking for a column that
        // was added via migration (latitude on dives). If it exists, the migrations
        // were already applied via the old system.
        let has_latitude: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('dives') WHERE name = 'latitude'",
            [],
            |row| row.get(0)
        ).unwrap_or(false);
        
        // If latitude exists, this database already had migrations applied
        // (either old-style or it was created with the full schema)
        if has_latitude {
            log::info!("Database already has all schema columns, skipping legacy migrations");
            return Ok(());
        }
        
        // This is a very old database - apply all the column additions
        log::info!("Running legacy schema migrations...");
        
        // Add rating to photos
        conn.execute("ALTER TABLE photos ADD COLUMN rating INTEGER DEFAULT 0", []).ok();
        
        // Add GPS to dives
        conn.execute("ALTER TABLE dives ADD COLUMN latitude REAL", []).ok();
        conn.execute("ALTER TABLE dives ADD COLUMN longitude REAL", []).ok();
        
        // Add EXIF fields to photos
        conn.execute("ALTER TABLE photos ADD COLUMN exposure_compensation REAL", []).ok();
        conn.execute("ALTER TABLE photos ADD COLUMN white_balance TEXT", []).ok();
        conn.execute("ALTER TABLE photos ADD COLUMN flash_fired INTEGER DEFAULT 0", []).ok();
        conn.execute("ALTER TABLE photos ADD COLUMN metering_mode TEXT", []).ok();
        conn.execute("ALTER TABLE photos ADD COLUMN gps_latitude REAL", []).ok();
        conn.execute("ALTER TABLE photos ADD COLUMN gps_longitude REAL", []).ok();
        
        // Add dive_site_id to dives
        conn.execute("ALTER TABLE dives ADD COLUMN dive_site_id INTEGER REFERENCES dive_sites(id) ON DELETE SET NULL", []).ok();
        
        // Add guide to dives
        conn.execute("ALTER TABLE dives ADD COLUMN guide TEXT", []).ok();
        
        // Add is_user_created to dive_sites
        conn.execute("ALTER TABLE dive_sites ADD COLUMN is_user_created INTEGER NOT NULL DEFAULT 0", []).ok();
        
        log::info!("Legacy schema migrations complete");
        Ok(())
    }
    
    /// Migration v2: Add is_user_created column to dive_sites table
    fn run_migration_v2(conn: &Connection) -> Result<()> {
        log::info!("Running migration v2: adding is_user_created to dive_sites...");
        
        // Check if column already exists (might have been added via legacy migrations)
        let has_column: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('dive_sites') WHERE name = 'is_user_created'",
            [],
            |row| row.get(0)
        ).unwrap_or(false);
        
        if !has_column {
            conn.execute(
                "ALTER TABLE dive_sites ADD COLUMN is_user_created INTEGER NOT NULL DEFAULT 0",
                []
            )?;
            log::info!("Added is_user_created column to dive_sites");
        } else {
            log::info!("is_user_created column already exists, skipping");
        }
        
        Ok(())
    }
    
    /// Data migrations that check actual data state (not schema)
    /// These are idempotent and safe to run multiple times
    fn run_data_migrations(conn: &Connection) -> Result<()> {
        // Migration: Move tank pressure data from dive_samples.pressure_bar to tank_pressures table
        let needs_tank_migration: bool = conn.query_row(
            r#"SELECT EXISTS(
                SELECT 1 FROM dive_samples ds
                WHERE ds.pressure_bar IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM tank_pressures tp WHERE tp.dive_id = ds.dive_id)
            )"#,
            [],
            |row| row.get(0)
        ).unwrap_or(false);
        
        if needs_tank_migration {
            log::info!("Migrating tank pressure data from dive_samples to tank_pressures table...");
            let migrated_count = conn.execute(
                r#"INSERT INTO tank_pressures (dive_id, sensor_id, sensor_name, time_seconds, pressure_bar)
                SELECT ds.dive_id, 0, NULL, ds.time_seconds, ds.pressure_bar
                FROM dive_samples ds
                WHERE ds.pressure_bar IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM tank_pressures tp WHERE tp.dive_id = ds.dive_id)"#,
                []
            ).unwrap_or(0);
            log::info!("Migrated {} tank pressure records", migrated_count);
        }
        
        // Migration: Create dive_tanks entries for dives with tank_pressures but no dive_tanks entry
        let needs_dive_tanks_migration: bool = conn.query_row(
            r#"SELECT EXISTS(
                SELECT 1 FROM tank_pressures tp
                WHERE NOT EXISTS (SELECT 1 FROM dive_tanks dt WHERE dt.dive_id = tp.dive_id AND dt.sensor_id = tp.sensor_id)
            )"#,
            [],
            |row| row.get(0)
        ).unwrap_or(false);
        
        if needs_dive_tanks_migration {
            log::info!("Creating dive_tanks entries from tank_pressures...");
            let migrated_count = conn.execute(
                r#"INSERT INTO dive_tanks (dive_id, sensor_id, gas_index, start_pressure_bar, end_pressure_bar)
                SELECT tp.dive_id, tp.sensor_id,
                    (SELECT COUNT(*) FROM dive_tanks dt2 WHERE dt2.dive_id = tp.dive_id AND dt2.sensor_id < tp.sensor_id),
                    MAX(tp.pressure_bar), MIN(tp.pressure_bar)
                FROM tank_pressures tp
                WHERE NOT EXISTS (SELECT 1 FROM dive_tanks dt WHERE dt.dive_id = tp.dive_id AND dt.sensor_id = tp.sensor_id)
                GROUP BY tp.dive_id, tp.sensor_id"#,
                []
            ).unwrap_or(0);
            log::info!("Created {} dive_tanks entries", migrated_count);
        }
        
        Ok(())
    }
    
    fn run_migrations(&self) -> Result<()> {
        Self::run_migrations_on_conn(&self.conn)
    }
    
    /// Check if dive sites table is empty (static version for async use)
    pub fn dive_sites_empty_on_conn(conn: &Connection) -> Result<bool> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM dive_sites",
            [],
            |row| row.get(0)
        )?;
        Ok(count == 0)
    }
    
    /// Import dive sites from CSV data (static version for async use)
    pub fn import_dive_sites_from_csv_on_conn(conn: &Connection, csv_content: &str) -> Result<usize> {
        let mut count = 0;
        let mut lines = csv_content.lines();
        
        // Skip header line
        if let Some(_header) = lines.next() {
            // Process each line
            for line in lines {
                let parts: Vec<&str> = line.split(',').collect();
                
                if parts.len() >= 3 {
                    let name = parts[0].trim();
                    if let (Ok(lat), Ok(lon)) = (parts[1].trim().parse::<f64>(), parts[2].trim().parse::<f64>()) {
                        conn.execute(
                            "INSERT INTO dive_sites (name, lat, lon) VALUES (?1, ?2, ?3)",
                            params![name, lat, lon],
                        )?;
                        count += 1;
                    }
                }
            }
        }
        
        Ok(count)
    }
    
    // Trip operations
    pub fn get_all_trips(&self) -> Result<Vec<Trip>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, location, resort, date_start, date_end, notes, created_at, updated_at 
             FROM trips ORDER BY date_start DESC"
        )?;
        
        let trips = stmt.query_map([], |row| {
            Ok(Trip {
                id: row.get(0)?,
                name: row.get(1)?,
                location: row.get(2)?,
                resort: row.get(3)?,
                date_start: row.get(4)?,
                date_end: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(trips)
    }
    
    pub fn get_trip(&self, id: i64) -> Result<Option<Trip>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, location, resort, date_start, date_end, notes, created_at, updated_at 
             FROM trips WHERE id = ?"
        )?;
        
        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Trip {
                id: row.get(0)?,
                name: row.get(1)?,
                location: row.get(2)?,
                resort: row.get(3)?,
                date_start: row.get(4)?,
                date_end: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            }))
        } else {
            Ok(None)
        }
    }
    
    pub fn create_trip(&self, name: &str, location: &str, date_start: &str, date_end: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO trips (name, location, date_start, date_end) VALUES (?, ?, ?, ?)",
            params![name, location, date_start, date_end],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    pub fn update_trip(&self, id: i64, name: &str, location: &str, resort: Option<&str>, date_start: &str, date_end: &str, notes: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE trips SET name = ?, location = ?, resort = ?, date_start = ?, date_end = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
            params![name, location, resort, date_start, date_end, notes, id],
        )?;
        Ok(())
    }
    
    pub fn delete_trip(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM trips WHERE id = ?", params![id])?;
        Ok(())
    }
    
    pub fn delete_dive(&self, id: i64) -> Result<()> {
        // Delete associated photos first (due to foreign key)
        self.conn.execute("DELETE FROM photos WHERE dive_id = ?", params![id])?;
        // Delete dive samples
        self.conn.execute("DELETE FROM dive_samples WHERE dive_id = ?", params![id])?;
        // Delete tank pressures
        self.conn.execute("DELETE FROM tank_pressures WHERE dive_id = ?", params![id])?;
        // Delete dive events
        self.conn.execute("DELETE FROM dive_events WHERE dive_id = ?", params![id])?;
        // Delete the dive itself
        self.conn.execute("DELETE FROM dives WHERE id = ?", params![id])?;
        Ok(())
    }
    
    pub fn update_dive(
        &self,
        id: i64,
        location: Option<&str>,
        ocean: Option<&str>,
        visibility_m: Option<f64>,
        buddy: Option<&str>,
        divemaster: Option<&str>,
        guide: Option<&str>,
        instructor: Option<&str>,
        comments: Option<&str>,
        latitude: Option<f64>,
        longitude: Option<f64>,
        dive_site_id: Option<i64>,
        is_fresh_water: bool,
        is_boat_dive: bool,
        is_drift_dive: bool,
        is_night_dive: bool,
        is_training_dive: bool,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE dives SET 
                location = ?, ocean = ?, visibility_m = ?, 
                buddy = ?, divemaster = ?, guide = ?, instructor = ?, comments = ?,
                latitude = ?, longitude = ?, dive_site_id = ?,
                is_fresh_water = ?, is_boat_dive = ?, is_drift_dive = ?, 
                is_night_dive = ?, is_training_dive = ?,
                updated_at = datetime('now') 
             WHERE id = ?",
            params![
                location, ocean, visibility_m,
                buddy, divemaster, guide, instructor, comments,
                latitude, longitude, dive_site_id,
                is_fresh_water as i32, is_boat_dive as i32, is_drift_dive as i32,
                is_night_dive as i32, is_training_dive as i32,
                id
            ],
        )?;
        Ok(())
    }
    
    /// Bulk update multiple dives with only the fields that are Some
    /// Each Option<Option<T>> means: None = don't update, Some(None) = set to NULL, Some(Some(v)) = set to value
    pub fn bulk_update_dives(
        &self,
        dive_ids: &[i64],
        location: Option<Option<&str>>,
        ocean: Option<Option<&str>>,
        buddy: Option<Option<&str>>,
        divemaster: Option<Option<&str>>,
        guide: Option<Option<&str>>,
        instructor: Option<Option<&str>>,
        is_boat_dive: Option<bool>,
        is_night_dive: Option<bool>,
        is_drift_dive: Option<bool>,
        is_fresh_water: Option<bool>,
        is_training_dive: Option<bool>,
    ) -> Result<usize> {
        if dive_ids.is_empty() {
            return Ok(0);
        }
        
        // Build dynamic UPDATE query based on which fields are provided
        let mut set_clauses = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        
        if let Some(val) = location {
            set_clauses.push("location = ?");
            params.push(Box::new(val.map(|s| s.to_string())));
        }
        if let Some(val) = ocean {
            set_clauses.push("ocean = ?");
            params.push(Box::new(val.map(|s| s.to_string())));
        }
        if let Some(val) = buddy {
            set_clauses.push("buddy = ?");
            params.push(Box::new(val.map(|s| s.to_string())));
        }
        if let Some(val) = divemaster {
            set_clauses.push("divemaster = ?");
            params.push(Box::new(val.map(|s| s.to_string())));
        }
        if let Some(val) = guide {
            set_clauses.push("guide = ?");
            params.push(Box::new(val.map(|s| s.to_string())));
        }
        if let Some(val) = instructor {
            set_clauses.push("instructor = ?");
            params.push(Box::new(val.map(|s| s.to_string())));
        }
        if let Some(val) = is_boat_dive {
            set_clauses.push("is_boat_dive = ?");
            params.push(Box::new(val as i32));
        }
        if let Some(val) = is_night_dive {
            set_clauses.push("is_night_dive = ?");
            params.push(Box::new(val as i32));
        }
        if let Some(val) = is_drift_dive {
            set_clauses.push("is_drift_dive = ?");
            params.push(Box::new(val as i32));
        }
        if let Some(val) = is_fresh_water {
            set_clauses.push("is_fresh_water = ?");
            params.push(Box::new(val as i32));
        }
        if let Some(val) = is_training_dive {
            set_clauses.push("is_training_dive = ?");
            params.push(Box::new(val as i32));
        }
        
        if set_clauses.is_empty() {
            return Ok(0);
        }
        
        // Add updated_at
        set_clauses.push("updated_at = datetime('now')");
        
        // Build placeholders for dive IDs
        let placeholders: Vec<_> = dive_ids.iter().map(|_| "?").collect();
        let sql = format!(
            "UPDATE dives SET {} WHERE id IN ({})",
            set_clauses.join(", "),
            placeholders.join(", ")
        );
        
        // Add dive IDs to params
        for id in dive_ids {
            params.push(Box::new(*id));
        }
        
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let affected = self.conn.execute(&sql, params_refs.as_slice())?;
        
        Ok(affected)
    }
    
    // Dive operations
    pub fn get_dives_for_trip(&self, trip_id: i64) -> Result<Vec<Dive>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                    water_temp_c, air_temp_c, surface_pressure_bar, otu, cns_percent,
                    dive_computer_model, dive_computer_serial, location, ocean, visibility_m,
                    gear_profile_id, buddy, divemaster, guide, instructor, comments, latitude, longitude, dive_site_id,
                    is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive,
                    created_at, updated_at
             FROM dives WHERE trip_id = ? ORDER BY dive_number"
        )?;
        
        let dives = stmt.query_map([trip_id], |row| {
            Ok(Dive {
                id: row.get(0)?,
                trip_id: row.get(1)?,
                dive_number: row.get(2)?,
                date: row.get(3)?,
                time: row.get(4)?,
                duration_seconds: row.get(5)?,
                max_depth_m: row.get(6)?,
                mean_depth_m: row.get(7)?,
                water_temp_c: row.get(8)?,
                air_temp_c: row.get(9)?,
                surface_pressure_bar: row.get(10)?,
                otu: row.get(11)?,
                cns_percent: row.get(12)?,
                dive_computer_model: row.get(13)?,
                dive_computer_serial: row.get(14)?,
                location: row.get(15)?,
                ocean: row.get(16)?,
                visibility_m: row.get(17)?,
                gear_profile_id: row.get(18)?,
                buddy: row.get(19)?,
                divemaster: row.get(20)?,
                guide: row.get(21)?,
                instructor: row.get(22)?,
                comments: row.get(23)?,
                latitude: row.get(24)?,
                longitude: row.get(25)?,
                dive_site_id: row.get(26)?,
                is_fresh_water: row.get::<_, i32>(27)? != 0,
                is_boat_dive: row.get::<_, i32>(28)? != 0,
                is_drift_dive: row.get::<_, i32>(29)? != 0,
                is_night_dive: row.get::<_, i32>(30)? != 0,
                is_training_dive: row.get::<_, i32>(31)? != 0,
                created_at: row.get(32)?,
                updated_at: row.get(33)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(dives)
    }
    
    pub fn get_dive(&self, id: i64) -> Result<Option<Dive>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                    water_temp_c, air_temp_c, surface_pressure_bar, otu, cns_percent,
                    dive_computer_model, dive_computer_serial, location, ocean, visibility_m,
                    gear_profile_id, buddy, divemaster, guide, instructor, comments, latitude, longitude, dive_site_id,
                    is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive,
                    created_at, updated_at
             FROM dives WHERE id = ?"
        )?;
        
        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Dive {
                id: row.get(0)?,
                trip_id: row.get(1)?,
                dive_number: row.get(2)?,
                date: row.get(3)?,
                time: row.get(4)?,
                duration_seconds: row.get(5)?,
                max_depth_m: row.get(6)?,
                mean_depth_m: row.get(7)?,
                water_temp_c: row.get(8)?,
                air_temp_c: row.get(9)?,
                surface_pressure_bar: row.get(10)?,
                otu: row.get(11)?,
                cns_percent: row.get(12)?,
                dive_computer_model: row.get(13)?,
                dive_computer_serial: row.get(14)?,
                location: row.get(15)?,
                ocean: row.get(16)?,
                visibility_m: row.get(17)?,
                gear_profile_id: row.get(18)?,
                buddy: row.get(19)?,
                divemaster: row.get(20)?,
                guide: row.get(21)?,
                instructor: row.get(22)?,
                comments: row.get(23)?,
                latitude: row.get(24)?,
                longitude: row.get(25)?,
                dive_site_id: row.get(26)?,
                is_fresh_water: row.get::<_, i32>(27)? != 0,
                is_boat_dive: row.get::<_, i32>(28)? != 0,
                is_drift_dive: row.get::<_, i32>(29)? != 0,
                is_night_dive: row.get::<_, i32>(30)? != 0,
                is_training_dive: row.get::<_, i32>(31)? != 0,
                created_at: row.get(32)?,
                updated_at: row.get(33)?,
            }))
        } else {
            Ok(None)
        }
    }
    
    pub fn insert_dive(&self, dive: &Dive) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dives (
                trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                water_temp_c, air_temp_c, surface_pressure_bar, otu, cns_percent,
                dive_computer_model, dive_computer_serial
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                dive.trip_id, dive.dive_number, dive.date, dive.time, dive.duration_seconds,
                dive.max_depth_m, dive.mean_depth_m, dive.water_temp_c, dive.air_temp_c,
                dive.surface_pressure_bar, dive.otu, dive.cns_percent,
                dive.dive_computer_model, dive.dive_computer_serial
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Create a dive from dive computer download data
    pub fn create_dive_from_computer(
        &self,
        trip_id: i64,
        dive_number: i64,
        date: &str,
        time: &str,
        duration_seconds: i64,
        max_depth_m: f64,
        mean_depth_m: f64,
        water_temp_c: Option<f64>,
        air_temp_c: Option<f64>,
        surface_pressure_bar: Option<f64>,
        cns_percent: Option<f64>,
        dive_computer_model: Option<&str>,
        dive_computer_serial: Option<&str>,
        latitude: Option<f64>,
        longitude: Option<f64>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dives (
                trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                water_temp_c, air_temp_c, surface_pressure_bar, cns_percent,
                dive_computer_model, dive_computer_serial,
                latitude, longitude,
                is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)",
            params![
                trip_id, dive_number, date, time, duration_seconds,
                max_depth_m, mean_depth_m, water_temp_c, air_temp_c,
                surface_pressure_bar, cns_percent,
                dive_computer_model, dive_computer_serial,
                latitude, longitude
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Create a manual dive with all user-editable fields
    pub fn create_manual_dive(
        &self,
        trip_id: i64,
        dive_number: i64,
        date: &str,
        time: &str,
        duration_seconds: i64,
        max_depth_m: f64,
        mean_depth_m: f64,
        water_temp_c: Option<f64>,
        air_temp_c: Option<f64>,
        surface_pressure_bar: Option<f64>,
        cns_percent: Option<f64>,
        location: Option<&str>,
        ocean: Option<&str>,
        visibility_m: Option<f64>,
        buddy: Option<&str>,
        divemaster: Option<&str>,
        guide: Option<&str>,
        instructor: Option<&str>,
        comments: Option<&str>,
        latitude: Option<f64>,
        longitude: Option<f64>,
        is_fresh_water: bool,
        is_boat_dive: bool,
        is_drift_dive: bool,
        is_night_dive: bool,
        is_training_dive: bool,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dives (
                trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                water_temp_c, air_temp_c, surface_pressure_bar, cns_percent,
                location, ocean, visibility_m, buddy, divemaster, guide, instructor, comments,
                latitude, longitude,
                is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                trip_id, dive_number, date, time, duration_seconds,
                max_depth_m, mean_depth_m, water_temp_c, air_temp_c,
                surface_pressure_bar, cns_percent,
                location, ocean, visibility_m, buddy, divemaster, guide, instructor, comments,
                latitude, longitude,
                is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Get all dives that have GPS coordinates
    pub fn get_dives_with_coordinates(&self) -> Result<Vec<DiveMapPoint>> {
        let mut stmt = self.conn.prepare(
            "SELECT d.id, d.trip_id, d.dive_number, d.location, d.latitude, d.longitude, 
                    d.date, d.max_depth_m, t.name as trip_name
             FROM dives d
             JOIN trips t ON d.trip_id = t.id
             WHERE d.latitude IS NOT NULL AND d.longitude IS NOT NULL
             ORDER BY d.date DESC"
        )?;
        
        let points = stmt.query_map([], |row| {
            Ok(DiveMapPoint {
                dive_id: row.get(0)?,
                trip_id: row.get(1)?,
                dive_number: row.get(2)?,
                location: row.get(3)?,
                latitude: row.get(4)?,
                longitude: row.get(5)?,
                date: row.get(6)?,
                max_depth_m: row.get(7)?,
                trip_name: row.get(8)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(points)
    }
    
    // Dive samples
    pub fn get_dive_samples(&self, dive_id: i64) -> Result<Vec<DiveSample>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, dive_id, time_seconds, depth_m, temp_c, pressure_bar, ndl_seconds, rbt_seconds
             FROM dive_samples WHERE dive_id = ? ORDER BY time_seconds"
        )?;
        
        let samples = stmt.query_map([dive_id], |row| {
            Ok(DiveSample {
                id: row.get(0)?,
                dive_id: row.get(1)?,
                time_seconds: row.get(2)?,
                depth_m: row.get(3)?,
                temp_c: row.get(4)?,
                pressure_bar: row.get(5)?,
                ndl_seconds: row.get(6)?,
                rbt_seconds: row.get(7)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(samples)
    }
    
    pub fn insert_dive_sample(&self, sample: &DiveSample) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dive_samples (dive_id, time_seconds, depth_m, temp_c, pressure_bar, ndl_seconds, rbt_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                sample.dive_id, sample.time_seconds, sample.depth_m, sample.temp_c,
                sample.pressure_bar, sample.ndl_seconds, sample.rbt_seconds
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Batch insert multiple dive samples in a single transaction
    /// This is significantly faster than inserting samples one by one
    pub fn insert_dive_samples_batch(&self, dive_id: i64, samples: &[DiveSample]) -> Result<usize> {
        if samples.is_empty() {
            return Ok(0);
        }
        
        let tx = self.conn.unchecked_transaction()?;
        
        // Use a prepared statement for repeated inserts (much faster)
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO dive_samples (dive_id, time_seconds, depth_m, temp_c, pressure_bar, ndl_seconds, rbt_seconds)
                 VALUES (?, ?, ?, ?, ?, ?, ?)"
            )?;
            
            for sample in samples {
                stmt.execute(params![
                    dive_id, sample.time_seconds, sample.depth_m, sample.temp_c,
                    sample.pressure_bar, sample.ndl_seconds, sample.rbt_seconds
                ])?;
            }
        }
        
        tx.commit()?;
        Ok(samples.len())
    }
    
    pub fn insert_dive_event(&self, event: &DiveEvent) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dive_events (dive_id, time_seconds, event_type, name, flags, value)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![event.dive_id, event.time_seconds, event.event_type, event.name, event.flags, event.value],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Batch insert multiple dive events in a single transaction
    pub fn insert_dive_events_batch(&self, dive_id: i64, events: &[DiveEvent]) -> Result<usize> {
        if events.is_empty() {
            return Ok(0);
        }
        
        let tx = self.conn.unchecked_transaction()?;
        
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO dive_events (dive_id, time_seconds, event_type, name, flags, value)
                 VALUES (?, ?, ?, ?, ?, ?)"
            )?;
            
            for event in events {
                stmt.execute(params![
                    dive_id, event.time_seconds, event.event_type, event.name, event.flags, event.value
                ])?;
            }
        }
        
        tx.commit()?;
        Ok(events.len())
    }
    
    /// Batch insert multiple tank pressure readings in a single transaction
    pub fn insert_tank_pressures_batch(&self, dive_id: i64, pressures: &[TankPressure]) -> Result<usize> {
        if pressures.is_empty() {
            return Ok(0);
        }
        
        let tx = self.conn.unchecked_transaction()?;
        
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO tank_pressures (dive_id, sensor_id, sensor_name, time_seconds, pressure_bar)
                 VALUES (?, ?, ?, ?, ?)"
            )?;
            
            for pressure in pressures {
                stmt.execute(params![
                    dive_id, pressure.sensor_id, pressure.sensor_name, pressure.time_seconds, pressure.pressure_bar
                ])?;
            }
        }
        
        tx.commit()?;
        Ok(pressures.len())
    }
    
    // Tank pressure operations
    /// Insert a tank pressure reading
    pub fn insert_tank_pressure(&self, pressure: &TankPressure) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO tank_pressures (dive_id, sensor_id, sensor_name, time_seconds, pressure_bar)
             VALUES (?, ?, ?, ?, ?)",
            params![pressure.dive_id, pressure.sensor_id, pressure.sensor_name, pressure.time_seconds, pressure.pressure_bar],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Get all tank pressures for a dive
    pub fn get_tank_pressures_for_dive(&self, dive_id: i64) -> Result<Vec<TankPressure>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, dive_id, sensor_id, sensor_name, time_seconds, pressure_bar
             FROM tank_pressures
             WHERE dive_id = ?
             ORDER BY sensor_id, time_seconds"
        )?;
        
        let pressures = stmt.query_map([dive_id], |row| {
            Ok(TankPressure {
                id: row.get(0)?,
                dive_id: row.get(1)?,
                sensor_id: row.get(2)?,
                sensor_name: row.get(3)?,
                time_seconds: row.get(4)?,
                pressure_bar: row.get(5)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(pressures)
    }
    
    // Photo operations
    /// Get all photos in the database
    pub fn get_all_photos(&self) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
                    created_at, updated_at
             FROM photos 
             ORDER BY id"
        )?;
        
        let photos = stmt.query_map([], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }
    
    /// Get photos for trip (unassigned to dive), excluding processed versions
    /// Returns RAW photos with their processed version's thumbnail if available
    pub fn get_photos_for_trip(&self, trip_id: i64) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.trip_id, p.dive_id, p.file_path, 
                    COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                    p.filename, p.capture_time,
                    p.width, p.height, p.file_size_bytes, p.is_processed, p.raw_photo_id, p.rating,
                    p.camera_make, p.camera_model, p.lens_info, p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode, p.gps_latitude, p.gps_longitude,
                    p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
             WHERE p.trip_id = ? AND p.dive_id IS NULL AND (p.is_processed = 0 OR p.raw_photo_id IS NULL)
             ORDER BY p.capture_time"
        )?;
        
        let photos = stmt.query_map([trip_id], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }

    /// Get ALL photos for trip (both assigned and unassigned to dives), excluding processed versions
    /// Returns RAW photos with their processed version's thumbnail if available
    pub fn get_all_photos_for_trip(&self, trip_id: i64) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.trip_id, p.dive_id, p.file_path, 
                    COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                    p.filename, p.capture_time,
                    p.width, p.height, p.file_size_bytes, p.is_processed, p.raw_photo_id, p.rating,
                    p.camera_make, p.camera_model, p.lens_info, p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode, p.gps_latitude, p.gps_longitude,
                    p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
             WHERE p.trip_id = ? AND (p.is_processed = 0 OR p.raw_photo_id IS NULL)
             ORDER BY p.capture_time"
        )?;
        
        let photos = stmt.query_map([trip_id], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }
    
    /// Get photos for dive, excluding processed versions (they are accessed via get_display_version)
    /// Returns RAW photos with their processed version's thumbnail if available
    pub fn get_photos_for_dive(&self, dive_id: i64) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.trip_id, p.dive_id, p.file_path, 
                    COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                    p.filename, p.capture_time,
                    p.width, p.height, p.file_size_bytes, p.is_processed, p.raw_photo_id, p.rating,
                    p.camera_make, p.camera_model, p.lens_info, p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode, p.gps_latitude, p.gps_longitude,
                    p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
             WHERE p.dive_id = ? AND (p.is_processed = 0 OR p.raw_photo_id IS NULL)
             ORDER BY p.capture_time"
        )?;
        
        let photos = stmt.query_map([dive_id], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }
    
    /// Get top photos for a dive thumbnail display
    /// Prioritizes: processed versions first, then by rating (high to low), then by capture time
    pub fn get_dive_thumbnail_photos(&self, dive_id: i64, limit: i64) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.trip_id, p.dive_id, p.file_path, 
                    COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                    p.filename, p.capture_time,
                    p.width, p.height, p.file_size_bytes, p.is_processed, p.raw_photo_id, 
                    COALESCE(p.rating, 0) as rating,
                    p.camera_make, p.camera_model, p.lens_info, p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode, p.gps_latitude, p.gps_longitude,
                    p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
             WHERE p.dive_id = ? AND (p.is_processed = 0 OR p.raw_photo_id IS NULL)
                   AND (p.thumbnail_path IS NOT NULL OR proc.thumbnail_path IS NOT NULL)
             ORDER BY 
                CASE WHEN proc.id IS NOT NULL THEN 0 ELSE 1 END,
                COALESCE(p.rating, 0) DESC,
                p.capture_time
             LIMIT ?"
        )?;
        
        let photos = stmt.query_map(params![dive_id, limit], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }
    
    /// Get stats for a dive (photo count and species count)
    pub fn get_dive_stats(&self, dive_id: i64) -> Result<DiveStats> {
        let photo_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM photos 
             WHERE dive_id = ? AND (is_processed = 0 OR raw_photo_id IS NULL)",
            params![dive_id],
            |row| row.get(0),
        )?;
        
        let species_count: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT pst.species_tag_id) 
             FROM photo_species_tags pst
             JOIN photos p ON p.id = pst.photo_id
             WHERE p.dive_id = ?",
            params![dive_id],
            |row| row.get(0),
        )?;
        
        Ok(DiveStats {
            photo_count,
            species_count,
        })
    }
    
    /// Get all dives for a trip with their photo counts, species counts, and thumbnail paths
    /// This is a batch operation that replaces multiple get_dive_stats + get_dive_thumbnail_photos calls
    pub fn get_dives_with_details(&self, trip_id: i64, thumbnail_limit: i64) -> Result<Vec<DiveWithDetails>> {
        // Get all dives for the trip
        let dives = self.get_dives_for_trip(trip_id)?;
        
        if dives.is_empty() {
            return Ok(Vec::new());
        }
        
        // Build a map of dive_id to stats using a single query
        let mut stats_map: std::collections::HashMap<i64, (i64, i64)> = std::collections::HashMap::new();
        
        // Get photo counts for all dives in one query
        let dive_ids: Vec<i64> = dives.iter().map(|d| d.id).collect();
        let placeholders = dive_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        
        let photo_count_sql = format!(
            "SELECT dive_id, COUNT(*) as cnt FROM photos 
             WHERE dive_id IN ({}) AND (is_processed = 0 OR raw_photo_id IS NULL)
             GROUP BY dive_id",
            placeholders
        );
        
        {
            let mut stmt = self.conn.prepare(&photo_count_sql)?;
            let mut rows = stmt.query(rusqlite::params_from_iter(dive_ids.iter()))?;
            while let Some(row) = rows.next()? {
                let dive_id: i64 = row.get(0)?;
                let count: i64 = row.get(1)?;
                stats_map.entry(dive_id).or_insert((0, 0)).0 = count;
            }
        }
        
        // Get species counts for all dives in one query
        let species_count_sql = format!(
            "SELECT p.dive_id, COUNT(DISTINCT pst.species_tag_id) as cnt
             FROM photos p
             JOIN photo_species_tags pst ON p.id = pst.photo_id
             WHERE p.dive_id IN ({})
             GROUP BY p.dive_id",
            placeholders
        );
        
        {
            let mut stmt = self.conn.prepare(&species_count_sql)?;
            let mut rows = stmt.query(rusqlite::params_from_iter(dive_ids.iter()))?;
            while let Some(row) = rows.next()? {
                let dive_id: i64 = row.get(0)?;
                let count: i64 = row.get(1)?;
                stats_map.entry(dive_id).or_insert((0, 0)).1 = count;
            }
        }
        
        // Get thumbnail paths for all dives - use a window function to limit per dive
        let mut thumbnails_map: std::collections::HashMap<i64, Vec<String>> = std::collections::HashMap::new();
        
        let thumbnails_sql = format!(
            "SELECT dive_id, thumbnail_path FROM (
                SELECT p.dive_id, 
                       COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                       ROW_NUMBER() OVER (PARTITION BY p.dive_id ORDER BY 
                           CASE WHEN proc.id IS NOT NULL THEN 0 ELSE 1 END,
                           COALESCE(p.rating, 0) DESC,
                           p.capture_time
                       ) as rn
                FROM photos p
                LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
                WHERE p.dive_id IN ({}) 
                      AND (p.is_processed = 0 OR p.raw_photo_id IS NULL)
                      AND (p.thumbnail_path IS NOT NULL OR proc.thumbnail_path IS NOT NULL)
            ) ranked
            WHERE rn <= ?",
            placeholders
        );
        
        {
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = dive_ids.iter()
                .map(|id| Box::new(*id) as Box<dyn rusqlite::ToSql>)
                .collect();
            params.push(Box::new(thumbnail_limit));
            
            let mut stmt = self.conn.prepare(&thumbnails_sql)?;
            let mut rows = stmt.query(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))?;
            while let Some(row) = rows.next()? {
                let dive_id: i64 = row.get(0)?;
                let thumb_path: String = row.get(1)?;
                thumbnails_map.entry(dive_id).or_insert_with(Vec::new).push(thumb_path);
            }
        }
        
        // Combine everything into DiveWithDetails
        let results: Vec<DiveWithDetails> = dives.into_iter().map(|dive| {
            let (photo_count, species_count) = stats_map.get(&dive.id).copied().unwrap_or((0, 0));
            let thumbnail_paths = thumbnails_map.remove(&dive.id).unwrap_or_default();
            
            DiveWithDetails {
                dive,
                photo_count,
                species_count,
                thumbnail_paths,
            }
        }).collect();
        
        Ok(results)
    }
    
    /// Find a photo by base filename (without extension) within a trip
    /// Used to match processed files to their RAW originals
    pub fn find_photo_by_base_filename(&self, trip_id: i64, base_filename: &str) -> Result<Option<Photo>> {
        // Look for RAW files with matching base name (exclude processed files)
        let pattern = format!("{}%", base_filename);
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
                    created_at, updated_at
             FROM photos 
             WHERE trip_id = ? AND is_processed = 0 AND filename LIKE ?
             ORDER BY id LIMIT 1"
        )?;
        
        let mut photos = stmt.query_map(params![trip_id, pattern], Self::map_photo_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(photos.pop())
    }
    
    /// Get the best version for display: processed if available, otherwise the original
    pub fn get_display_version(&self, photo_id: i64) -> Result<Photo> {
        // First check if there's a processed version linked to this photo
        if let Some(processed) = self.get_processed_version(photo_id)? {
            return Ok(processed);
        }
        // Otherwise return the original
        self.get_photo(photo_id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }
    
    pub fn insert_photo(
        &self,
        trip_id: i64,
        dive_id: Option<i64>,
        file_path: &str,
        filename: &str,
        capture_time: Option<&str>,
        camera_make: Option<&str>,
        camera_model: Option<&str>,
        file_size_bytes: i64,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO photos (trip_id, dive_id, file_path, filename, capture_time, camera_make, camera_model, file_size_bytes, is_processed, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))",
            params![trip_id, dive_id, file_path, filename, capture_time, camera_make, camera_model, file_size_bytes],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Insert photo with all EXIF fields and processed/raw relationship
    #[allow(clippy::too_many_arguments)]
    pub fn insert_photo_full(
        &self,
        trip_id: i64,
        dive_id: Option<i64>,
        file_path: &str,
        filename: &str,
        capture_time: Option<&str>,
        camera_make: Option<&str>,
        camera_model: Option<&str>,
        lens_info: Option<&str>,
        focal_length_mm: Option<f64>,
        aperture: Option<f64>,
        shutter_speed: Option<&str>,
        iso: Option<i32>,
        file_size_bytes: i64,
        is_processed: bool,
        raw_photo_id: Option<i64>,
        exposure_compensation: Option<f64>,
        white_balance: Option<&str>,
        flash_fired: Option<bool>,
        metering_mode: Option<&str>,
        gps_latitude: Option<f64>,
        gps_longitude: Option<f64>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO photos (trip_id, dive_id, file_path, filename, capture_time, camera_make, camera_model, 
             lens_info, focal_length_mm, aperture, shutter_speed, iso, file_size_bytes, is_processed, raw_photo_id,
             exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
             created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
            params![
                trip_id, dive_id, file_path, filename, capture_time, camera_make, camera_model,
                lens_info, focal_length_mm, aperture, shutter_speed, iso, file_size_bytes,
                is_processed as i32, raw_photo_id,
                exposure_compensation, white_balance, flash_fired.map(|b| b as i32), metering_mode,
                gps_latitude, gps_longitude
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Get processed version of a RAW photo if it exists
    pub fn get_processed_version(&self, raw_photo_id: i64) -> Result<Option<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
             width, height, file_size_bytes, is_processed, raw_photo_id, rating, camera_make, camera_model,
             lens_info, focal_length_mm, aperture, shutter_speed, iso,
             exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
             created_at, updated_at
             FROM photos WHERE raw_photo_id = ?"
        )?;
        let mut photos = stmt.query_map([raw_photo_id], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos.pop())
    }
    
    /// Get RAW version of a processed photo
    pub fn get_raw_version(&self, photo_id: i64) -> Result<Option<Photo>> {
        // First get the raw_photo_id from the processed photo
        let raw_id: Option<i64> = self.conn.query_row(
            "SELECT raw_photo_id FROM photos WHERE id = ?",
            [photo_id],
            |row| row.get(0),
        ).ok().flatten();
        
        if let Some(raw_id) = raw_id {
            self.get_photo(raw_id)
        } else {
            Ok(None)
        }
    }
    
    fn map_photo_row(row: &rusqlite::Row) -> rusqlite::Result<Photo> {
        Ok(Photo {
            id: row.get(0)?,
            trip_id: row.get(1)?,
            dive_id: row.get(2)?,
            file_path: row.get(3)?,
            thumbnail_path: row.get(4)?,
            filename: row.get(5)?,
            capture_time: row.get(6)?,
            width: row.get(7)?,
            height: row.get(8)?,
            file_size_bytes: row.get(9)?,
            is_processed: row.get::<_, i32>(10)? != 0,
            raw_photo_id: row.get(11)?,
            rating: row.get(12)?,
            camera_make: row.get(13)?,
            camera_model: row.get(14)?,
            lens_info: row.get(15)?,
            focal_length_mm: row.get(16)?,
            aperture: row.get(17)?,
            shutter_speed: row.get(18)?,
            iso: row.get(19)?,
            exposure_compensation: row.get(20)?,
            white_balance: row.get(21)?,
            flash_fired: row.get::<_, Option<i32>>(22)?.map(|i| i != 0),
            metering_mode: row.get(23)?,
            gps_latitude: row.get(24)?,
            gps_longitude: row.get(25)?,
            created_at: row.get(26)?,
            updated_at: row.get(27)?,
        })
    }
    
    pub fn update_photo_thumbnail(&self, photo_id: i64, thumbnail_path: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE photos SET thumbnail_path = ?, updated_at = datetime('now') WHERE id = ?",
            params![thumbnail_path, photo_id],
        )?;
        Ok(())
    }
    
    /// Get all photos that don't have thumbnails yet
    pub fn get_photos_without_thumbnails(&self) -> Result<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
                    created_at, updated_at
             FROM photos WHERE thumbnail_path IS NULL OR thumbnail_path = '' ORDER BY id"
        )?;
        
        let photos = stmt.query_map([], Self::map_photo_row)?.collect::<Result<Vec<_>>>()?;
        Ok(photos)
    }
    
    /// Get a single photo by ID
    pub fn get_photo(&self, id: i64) -> Result<Option<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture, shutter_speed, iso,
                    exposure_compensation, white_balance, flash_fired, metering_mode, gps_latitude, gps_longitude,
                    created_at, updated_at
             FROM photos WHERE id = ?"
        )?;
        
        let mut rows = stmt.query([id])?;
        match rows.next()? {
            Some(row) => Ok(Some(Self::map_photo_row(row)?)),
            None => Ok(None),
        }
    }
    
    /// Delete a photo by file path (for re-import/overwrite)
    /// Also deletes any processed versions linked to it, and removes it as a raw_photo_id reference
    pub fn delete_photo_by_path(&self, file_path: &str) -> Result<()> {
        // Normalize path for comparison (Windows paths can have different casing/slashes)
        let normalized_path = file_path.replace("/", "\\");
        
        // First, get the photo ID to clean up related processed versions
        // Use LIKE for case-insensitive comparison on Windows
        let photo_id: Option<i64> = self.conn.query_row(
            "SELECT id FROM photos WHERE file_path = ? OR file_path = ? COLLATE NOCASE",
            params![file_path, normalized_path],
            |row| row.get(0),
        ).ok();
        
        if let Some(id) = photo_id {
            // Delete any processed versions that reference this as raw_photo_id
            self.conn.execute(
                "DELETE FROM photos WHERE raw_photo_id = ?",
                [id],
            )?;
            
            // Delete the photo itself by ID (more reliable than path)
            self.conn.execute(
                "DELETE FROM photos WHERE id = ?",
                [id],
            )?;
        } else {
            // Try direct delete anyway in case of edge cases
            self.conn.execute(
                "DELETE FROM photos WHERE file_path = ? COLLATE NOCASE",
                [file_path],
            )?;
        }
        
        Ok(())
    }
    
    /// Delete photos by ID (batch delete for performance)
    pub fn delete_photos(&self, photo_ids: &[i64]) -> Result<u64> {
        if photo_ids.is_empty() {
            return Ok(0);
        }
        
        let tx = self.conn.unchecked_transaction()?;
        
        // Build placeholders for WHERE IN clause
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        
        // Delete any processed versions that reference these as raw_photo_id
        let delete_processed = format!(
            "DELETE FROM photos WHERE raw_photo_id IN ({})",
            placeholders
        );
        tx.execute(&delete_processed, rusqlite::params_from_iter(photo_ids.iter()))?;
        
        // Delete the photos themselves
        let delete_photos = format!(
            "DELETE FROM photos WHERE id IN ({})",
            placeholders
        );
        tx.execute(&delete_photos, rusqlite::params_from_iter(photo_ids.iter()))?;
        let deleted = tx.changes() as u64;
        
        tx.commit()?;
        Ok(deleted)
    }
    
    /// Update photo rating (0-5)
    pub fn update_photo_rating(&self, photo_id: i64, rating: i32) -> Result<()> {
        self.conn.execute(
            "UPDATE photos SET rating = ?, updated_at = datetime('now') WHERE id = ?",
            params![rating, photo_id],
        )?;
        Ok(())
    }
    
    /// Update rating for multiple photos (batch update for performance)
    pub fn update_photos_rating(&self, photo_ids: &[i64], rating: i32) -> Result<()> {
        if photo_ids.is_empty() {
            return Ok(());
        }
        
        // Build placeholders for WHERE IN clause
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "UPDATE photos SET rating = ?, updated_at = datetime('now') WHERE id IN ({})",
            placeholders
        );
        
        // Build params: rating first, then all photo IDs
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::with_capacity(photo_ids.len() + 1);
        params.push(Box::new(rating));
        for &id in photo_ids {
            params.push(Box::new(id));
        }
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        
        self.conn.execute(&query, params_refs.as_slice())?;
        Ok(())
    }
    
    /// Filter photos with advanced criteria
    pub fn filter_photos(&self, filter: &PhotoFilter) -> Result<Vec<Photo>> {
        let mut sql = String::from(
            "SELECT p.id, p.trip_id, p.dive_id, p.file_path, 
                    COALESCE(proc.thumbnail_path, p.thumbnail_path) as thumbnail_path,
                    p.filename, p.capture_time,
                    p.width, p.height, p.file_size_bytes, p.is_processed, p.raw_photo_id, p.rating,
                    p.camera_make, p.camera_model, p.lens_info, p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode, p.gps_latitude, p.gps_longitude,
                    p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photos proc ON proc.raw_photo_id = p.id AND proc.is_processed = 1
             WHERE (p.is_processed = 0 OR p.raw_photo_id IS NULL)"
        );
        
        let mut conditions = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        
        if let Some(ref trip_id) = filter.trip_id {
            conditions.push("p.trip_id = ?");
            params.push(Box::new(*trip_id));
        }
        
        if let Some(ref dive_id) = filter.dive_id {
            conditions.push("p.dive_id = ?");
            params.push(Box::new(*dive_id));
        }
        
        if let Some(ref date_from) = filter.date_from {
            conditions.push("p.capture_time >= ?");
            params.push(Box::new(date_from.clone()));
        }
        
        if let Some(ref date_to) = filter.date_to {
            conditions.push("p.capture_time <= ?");
            params.push(Box::new(format!("{} 23:59:59", date_to)));
        }
        
        if let Some(rating_min) = filter.rating_min {
            conditions.push("p.rating >= ?");
            params.push(Box::new(rating_min));
        }
        
        if let Some(rating_max) = filter.rating_max {
            conditions.push("p.rating <= ?");
            params.push(Box::new(rating_max));
        }
        
        if let Some(ref camera_model) = filter.camera_model {
            conditions.push("LOWER(p.camera_model) LIKE LOWER(?)");
            params.push(Box::new(format!("%{}%", camera_model)));
        }
        
        if let Some(ref lens_model) = filter.lens_model {
            conditions.push("LOWER(p.lens_info) LIKE LOWER(?)");
            params.push(Box::new(format!("%{}%", lens_model)));
        }
        
        if let Some(iso_min) = filter.iso_min {
            conditions.push("p.iso >= ?");
            params.push(Box::new(iso_min));
        }
        
        if let Some(iso_max) = filter.iso_max {
            conditions.push("p.iso <= ?");
            params.push(Box::new(iso_max));
        }
        
        if let Some(aperture_min) = filter.aperture_min {
            conditions.push("p.aperture >= ?");
            params.push(Box::new(aperture_min));
        }
        
        if let Some(aperture_max) = filter.aperture_max {
            conditions.push("p.aperture <= ?");
            params.push(Box::new(aperture_max));
        }
        
        if let Some(focal_length_min) = filter.focal_length_min {
            conditions.push("p.focal_length_mm >= ?");
            params.push(Box::new(focal_length_min));
        }
        
        if let Some(focal_length_max) = filter.focal_length_max {
            conditions.push("p.focal_length_mm <= ?");
            params.push(Box::new(focal_length_max));
        }
        
        if let Some(width_min) = filter.width_min {
            conditions.push("p.width >= ?");
            params.push(Box::new(width_min));
        }
        
        if let Some(width_max) = filter.width_max {
            conditions.push("p.width <= ?");
            params.push(Box::new(width_max));
        }
        
        if let Some(height_min) = filter.height_min {
            conditions.push("p.height >= ?");
            params.push(Box::new(height_min));
        }
        
        if let Some(height_max) = filter.height_max {
            conditions.push("p.height <= ?");
            params.push(Box::new(height_max));
        }
        
        if let Some(has_raw) = filter.has_raw {
            if has_raw {
                conditions.push("p.raw_photo_id IS NOT NULL");
            } else {
                conditions.push("p.raw_photo_id IS NULL");
            }
        }
        
        if let Some(is_processed) = filter.is_processed {
            conditions.push("p.is_processed = ?");
            params.push(Box::new(if is_processed { 1 } else { 0 }));
        }
        
        if let Some(exp_comp_min) = filter.exposure_compensation_min {
            conditions.push("p.exposure_compensation >= ?");
            params.push(Box::new(exp_comp_min));
        }
        
        if let Some(exp_comp_max) = filter.exposure_compensation_max {
            conditions.push("p.exposure_compensation <= ?");
            params.push(Box::new(exp_comp_max));
        }
        
        if let Some(ref wb) = filter.white_balance {
            conditions.push("LOWER(p.white_balance) LIKE LOWER(?)");
            params.push(Box::new(format!("%{}%", wb)));
        }
        
        if let Some(flash_fired) = filter.flash_fired {
            conditions.push("p.flash_fired = ?");
            params.push(Box::new(if flash_fired { 1 } else { 0 }));
        }
        
        if let Some(ref metering) = filter.metering_mode {
            conditions.push("LOWER(p.metering_mode) LIKE LOWER(?)");
            params.push(Box::new(format!("%{}%", metering)));
        }
        
        if !conditions.is_empty() {
            sql.push_str(" AND ");
            sql.push_str(&conditions.join(" AND "));
        }
        
        sql.push_str(" ORDER BY p.capture_time");
        
        let mut stmt = self.conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let photos = stmt.query_map(&*param_refs, Self::map_photo_row)?
            .collect::<Result<Vec<_>>>()?;
        
        Ok(photos)
    }
    
    /// Update EXIF metadata for a photo
    pub fn update_photo_exif(
        &self,
        photo_id: i64,
        capture_time: Option<&str>,
        camera_make: Option<&str>,
        camera_model: Option<&str>,
        lens_info: Option<&str>,
        focal_length_mm: Option<f64>,
        aperture: Option<f64>,
        shutter_speed: Option<&str>,
        iso: Option<i32>,
        exposure_compensation: Option<f64>,
        white_balance: Option<&str>,
        flash_fired: Option<bool>,
        metering_mode: Option<&str>,
        gps_latitude: Option<f64>,
        gps_longitude: Option<f64>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE photos SET 
                capture_time = ?,
                camera_make = ?,
                camera_model = ?,
                lens_info = ?,
                focal_length_mm = ?,
                aperture = ?,
                shutter_speed = ?,
                iso = ?,
                exposure_compensation = ?,
                white_balance = ?,
                flash_fired = ?,
                metering_mode = ?,
                gps_latitude = ?,
                gps_longitude = ?,
                updated_at = datetime('now')
             WHERE id = ?",
            params![
                capture_time,
                camera_make,
                camera_model,
                lens_info,
                focal_length_mm,
                aperture,
                shutter_speed,
                iso,
                exposure_compensation,
                white_balance,
                flash_fired.map(|b| b as i32),
                metering_mode,
                gps_latitude,
                gps_longitude,
                photo_id,
            ],
        )?;
        Ok(())
    }
    
    /// Link orphan processed photos to their RAW counterparts
    /// Returns the number of photos that were linked
    pub fn link_orphan_processed_photos(&self) -> Result<i64> {
        // Find processed photos without raw_photo_id set
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, filename FROM photos WHERE is_processed = 1 AND raw_photo_id IS NULL"
        )?;
        
        let orphans: Vec<(i64, i64, String)> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?.filter_map(|r| r.ok()).collect();
        
        let mut linked_count = 0i64;
        
        for (processed_id, trip_id, filename) in orphans {
            // Get base filename
            let base_name = std::path::Path::new(&filename)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&filename)
                .to_lowercase();
            
            // Find matching RAW photo
            let pattern = format!("{}%", base_name);
            let raw_id: Option<i64> = self.conn.query_row(
                "SELECT id FROM photos WHERE trip_id = ? AND is_processed = 0 AND LOWER(filename) LIKE ? LIMIT 1",
                params![trip_id, pattern],
                |row| row.get(0),
            ).ok();
            
            if let Some(raw_id) = raw_id {
                self.conn.execute(
                    "UPDATE photos SET raw_photo_id = ? WHERE id = ?",
                    params![raw_id, processed_id],
                )?;
                linked_count += 1;
            }
        }
        
        Ok(linked_count)
    }
    
    // General tag operations
    
    /// Get all general tags
    pub fn get_all_general_tags(&self) -> Result<Vec<GeneralTag>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name FROM general_tags ORDER BY name"
        )?;
        
        let tags = stmt.query_map([], |row| {
            Ok(GeneralTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(tags)
    }
    
    /// Get or create a general tag
    pub fn get_or_create_general_tag(&self, name: &str) -> Result<i64> {
        // Try to find existing
        let existing: Option<i64> = self.conn.query_row(
            "SELECT id FROM general_tags WHERE name = ? COLLATE NOCASE",
            [name],
            |row| row.get(0)
        ).ok();
        
        if let Some(id) = existing {
            return Ok(id);
        }
        
        // Create new
        self.conn.execute(
            "INSERT INTO general_tags (name) VALUES (?)",
            [name],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Get general tags for a photo
    pub fn get_general_tags_for_photo(&self, photo_id: i64) -> Result<Vec<GeneralTag>> {
        let mut stmt = self.conn.prepare(
            "SELECT gt.id, gt.name
             FROM general_tags gt
             JOIN photo_general_tags pgt ON pgt.general_tag_id = gt.id
             WHERE pgt.photo_id = ?
             ORDER BY gt.name"
        )?;
        
        let tags = stmt.query_map([photo_id], |row| {
            Ok(GeneralTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(tags)
    }
    
    /// Add a general tag to multiple photos (batch insert for performance)
    pub fn add_general_tag_to_photos(&self, photo_ids: &[i64], general_tag_id: i64) -> Result<i64> {
        if photo_ids.is_empty() {
            return Ok(0);
        }
        
        let tx = self.conn.unchecked_transaction()?;
        let mut count = 0i64;
        
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR IGNORE INTO photo_general_tags (photo_id, general_tag_id) VALUES (?, ?)"
            )?;
            
            for &photo_id in photo_ids {
                stmt.execute(params![photo_id, general_tag_id])?;
                count += tx.changes() as i64;
            }
        }
        
        tx.commit()?;
        Ok(count)
    }
    
    /// Remove a general tag from a photo
    pub fn remove_general_tag_from_photo(&self, photo_id: i64, general_tag_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM photo_general_tags WHERE photo_id = ? AND general_tag_id = ?",
            params![photo_id, general_tag_id],
        )?;
        Ok(())
    }
    
    /// Search general tags by name prefix
    pub fn search_general_tags(&self, query: &str) -> Result<Vec<GeneralTag>> {
        let pattern = format!("{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, name FROM general_tags WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 20"
        )?;
        
        let tags = stmt.query_map([&pattern], |row| {
            Ok(GeneralTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(tags)
    }
    
    // Species tag operations
    
    /// Get all species tags
    pub fn get_all_species_tags(&self) -> Result<Vec<SpeciesTag>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, category, scientific_name FROM species_tags ORDER BY name"
        )?;
        
        let tags = stmt.query_map([], |row| {
            Ok(SpeciesTag {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                scientific_name: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(tags)
    }
    
    /// Create a new species tag
    pub fn create_species_tag(&self, name: &str, category: Option<&str>, scientific_name: Option<&str>) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO species_tags (name, category, scientific_name) VALUES (?, ?, ?)",
            params![name, category, scientific_name],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Get or create a species tag by name (case insensitive)
    pub fn get_or_create_species_tag(&self, name: &str, category: Option<&str>, scientific_name: Option<&str>) -> Result<i64> {
        // Try to find existing
        let existing: Option<i64> = self.conn.query_row(
            "SELECT id FROM species_tags WHERE name = ? COLLATE NOCASE",
            [name],
            |row| row.get(0),
        ).ok();
        
        if let Some(id) = existing {
            return Ok(id);
        }
        
        // Create new
        self.create_species_tag(name, category, scientific_name)
    }
    
    /// Get species tags for a photo
    pub fn get_species_tags_for_photo(&self, photo_id: i64) -> Result<Vec<SpeciesTag>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.id, s.name, s.category, s.scientific_name 
             FROM species_tags s
             JOIN photo_species_tags ps ON s.id = ps.species_tag_id
             WHERE ps.photo_id = ?
             ORDER BY s.name"
        )?;
        
        let tags = stmt.query_map([photo_id], |row| {
            Ok(SpeciesTag {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                scientific_name: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(tags)
    }
    
    /// Add a species tag to a photo
    pub fn add_species_tag_to_photo(&self, photo_id: i64, species_tag_id: i64) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO photo_species_tags (photo_id, species_tag_id) VALUES (?, ?)",
            params![photo_id, species_tag_id],
        )?;
        Ok(())
    }
    
    /// Remove a species tag from a photo
    pub fn remove_species_tag_from_photo(&self, photo_id: i64, species_tag_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM photo_species_tags WHERE photo_id = ? AND species_tag_id = ?",
            params![photo_id, species_tag_id],
        )?;
        Ok(())
    }
    
    /// Add a species tag to multiple photos (batch insert for performance)
    pub fn add_species_tag_to_photos(&self, photo_ids: &[i64], species_tag_id: i64) -> Result<i64> {
        if photo_ids.is_empty() {
            return Ok(0);
        }
        
        let tx = self.conn.unchecked_transaction()?;
        let mut count = 0i64;
        
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR IGNORE INTO photo_species_tags (photo_id, species_tag_id) VALUES (?, ?)"
            )?;
            
            for &photo_id in photo_ids {
                stmt.execute(params![photo_id, species_tag_id])?;
                count += tx.changes() as i64;
            }
        }
        
        tx.commit()?;
        Ok(count)
    }
    
    /// Search species tags by name prefix
    pub fn search_species_tags(&self, query: &str) -> Result<Vec<SpeciesTag>> {
        let pattern = format!("{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, name, category, scientific_name 
             FROM species_tags 
             WHERE name LIKE ? COLLATE NOCASE OR scientific_name LIKE ? COLLATE NOCASE
             ORDER BY name
             LIMIT 20"
        )?;
        
        let tags = stmt.query_map(params![&pattern, &pattern], |row| {
            Ok(SpeciesTag {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                scientific_name: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(tags)
    }
    
    /// Get distinct species categories (user-extensible)
    /// Returns existing categories from database, merged with default suggestions
    pub fn get_distinct_species_categories(&self) -> Result<Vec<String>> {
        // Default categories to suggest if not already present
        let defaults = vec![
            "Fish", "Nudibranch", "Coral", "Invertebrate", "Cephalopod",
            "Crustacean", "Mammal", "Reptile", "Shark/Ray", "Jellyfish", "Plant/Algae"
        ];
        
        // Get existing categories from database
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT category FROM species_tags 
             WHERE category IS NOT NULL AND category != ''
             ORDER BY category"
        )?;
        
        let db_categories: Vec<String> = stmt.query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        
        // Merge defaults with existing, avoiding duplicates (case-insensitive)
        let mut result: Vec<String> = db_categories.clone();
        for default in defaults {
            let default_lower = default.to_lowercase();
            if !result.iter().any(|c| c.to_lowercase() == default_lower) {
                result.push(default.to_string());
            }
        }
        
        // Sort alphabetically
        result.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        
        Ok(result)
    }
    
    /// Update the category for a species tag
    pub fn update_species_tag_category(&self, species_tag_id: i64, category: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE species_tags SET category = ? WHERE id = ?",
            params![category, species_tag_id],
        )?;
        Ok(())
    }
    
    /// Get species tags that are applied to ALL of the given photos (intersection)
    pub fn get_common_species_tags_for_photos(&self, photo_ids: &[i64]) -> Result<Vec<SpeciesTag>> {
        if photo_ids.is_empty() {
            return Ok(Vec::new());
        }
        
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let photo_count = photo_ids.len() as i64;
        
        // Find tags that appear in ALL photos (count matches photo count)
        let query = format!(
            "SELECT st.id, st.name, st.category, st.scientific_name
             FROM species_tags st
             JOIN photo_species_tags pst ON st.id = pst.species_tag_id
             WHERE pst.photo_id IN ({})
             GROUP BY st.id
             HAVING COUNT(DISTINCT pst.photo_id) = ?
             ORDER BY st.name",
            placeholders
        );
        
        let mut stmt = self.conn.prepare(&query)?;
        
        let mut params: Vec<&dyn rusqlite::ToSql> = photo_ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        params.push(&photo_count);
        
        let tags = stmt.query_map(rusqlite::params_from_iter(params), |row| {
            Ok(SpeciesTag {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                scientific_name: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(tags)
    }
    
    /// Get general tags that are applied to ALL of the given photos (intersection)
    pub fn get_common_general_tags_for_photos(&self, photo_ids: &[i64]) -> Result<Vec<GeneralTag>> {
        if photo_ids.is_empty() {
            return Ok(Vec::new());
        }
        
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let photo_count = photo_ids.len() as i64;
        
        let query = format!(
            "SELECT gt.id, gt.name
             FROM general_tags gt
             JOIN photo_general_tags pgt ON gt.id = pgt.general_tag_id
             WHERE pgt.photo_id IN ({})
             GROUP BY gt.id
             HAVING COUNT(DISTINCT pgt.photo_id) = ?
             ORDER BY gt.name",
            placeholders
        );
        
        let mut stmt = self.conn.prepare(&query)?;
        
        let mut params: Vec<&dyn rusqlite::ToSql> = photo_ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        params.push(&photo_count);
        
        let tags = stmt.query_map(rusqlite::params_from_iter(params), |row| {
            Ok(GeneralTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(tags)
    }
    
    /// Remove a species tag from multiple photos
    pub fn remove_species_tag_from_photos(&self, photo_ids: &[i64], species_tag_id: i64) -> Result<i64> {
        if photo_ids.is_empty() {
            return Ok(0);
        }
        
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "DELETE FROM photo_species_tags WHERE species_tag_id = ? AND photo_id IN ({})",
            placeholders
        );
        
        let mut params: Vec<&dyn rusqlite::ToSql> = vec![&species_tag_id];
        for id in photo_ids {
            params.push(id);
        }
        
        self.conn.execute(&query, rusqlite::params_from_iter(params))?;
        Ok(self.conn.changes() as i64)
    }
    
    /// Remove a general tag from multiple photos
    pub fn remove_general_tag_from_photos(&self, photo_ids: &[i64], general_tag_id: i64) -> Result<i64> {
        if photo_ids.is_empty() {
            return Ok(0);
        }
        
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "DELETE FROM photo_general_tags WHERE general_tag_id = ? AND photo_id IN ({})",
            placeholders
        );
        
        let mut params: Vec<&dyn rusqlite::ToSql> = vec![&general_tag_id];
        for id in photo_ids {
            params.push(id);
        }
        
        self.conn.execute(&query, rusqlite::params_from_iter(params))?;
        Ok(self.conn.changes() as i64)
    }
    
    // Statistics functions
    
    /// Get overall statistics
    pub fn get_statistics(&self) -> Result<Statistics> {
        let total_trips: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM trips", [], |row| row.get(0)
        )?;
        
        let total_dives: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM dives", [], |row| row.get(0)
        )?;
        
        let total_bottom_time_seconds: i64 = self.conn.query_row(
            "SELECT COALESCE(SUM(duration_seconds), 0) FROM dives", [], |row| row.get(0)
        )?;
        
        let total_photos: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE is_processed = 0", [], |row| row.get(0)
        )?;
        
        let total_species: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT species_tag_id) FROM photo_species_tags", [], |row| row.get(0)
        )?;
        
        let deepest_dive_m: Option<f64> = self.conn.query_row(
            "SELECT MAX(max_depth_m) FROM dives", [], |row| row.get(0)
        ).ok();
        
        let avg_depth_m: Option<f64> = self.conn.query_row(
            "SELECT AVG(max_depth_m) FROM dives WHERE max_depth_m IS NOT NULL", [], |row| row.get(0)
        ).ok();
        
        let coldest_water_c: Option<f64> = self.conn.query_row(
            "SELECT MIN(water_temp_c) FROM dives WHERE water_temp_c IS NOT NULL", [], |row| row.get(0)
        ).ok();
        
        let warmest_water_c: Option<f64> = self.conn.query_row(
            "SELECT MAX(water_temp_c) FROM dives WHERE water_temp_c IS NOT NULL", [], |row| row.get(0)
        ).ok();
        
        let photos_with_species: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT photo_id) FROM photo_species_tags", [], |row| row.get(0)
        )?;
        
        let rated_photos: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE rating > 0", [], |row| row.get(0)
        )?;
        
        Ok(Statistics {
            total_trips,
            total_dives,
            total_bottom_time_seconds,
            total_photos,
            total_species,
            deepest_dive_m,
            avg_depth_m,
            coldest_water_c,
            warmest_water_c,
            photos_with_species,
            rated_photos,
        })
    }
    
    /// Get species with photo counts
    pub fn get_species_with_counts(&self) -> Result<Vec<SpeciesCount>> {
        let mut stmt = self.conn.prepare(
            "SELECT st.id, st.name, st.category, st.scientific_name, COUNT(pst.photo_id) as photo_count
             FROM species_tags st
             LEFT JOIN photo_species_tags pst ON st.id = pst.species_tag_id
             GROUP BY st.id
             ORDER BY photo_count DESC, st.name"
        )?;
        
        let species = stmt.query_map([], |row| {
            Ok(SpeciesCount {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                scientific_name: row.get(3)?,
                photo_count: row.get(4)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(species)
    }
    
    /// Get camera usage statistics
    pub fn get_camera_stats(&self) -> Result<Vec<CameraStat>> {
        let mut stmt = self.conn.prepare(
            "SELECT camera_model, COUNT(*) as photo_count
             FROM photos
             WHERE camera_model IS NOT NULL AND is_processed = 0
             GROUP BY camera_model
             ORDER BY photo_count DESC"
        )?;
        
        let stats = stmt.query_map([], |row| {
            Ok(CameraStat {
                camera_model: row.get(0)?,
                photo_count: row.get(1)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(stats)
    }
    
    /// Get dive statistics by year
    pub fn get_yearly_stats(&self) -> Result<Vec<YearlyStat>> {
        let mut stmt = self.conn.prepare(
            "SELECT strftime('%Y', date) as year, 
                    COUNT(*) as dive_count,
                    COALESCE(SUM(duration_seconds), 0) as total_time,
                    AVG(max_depth_m) as avg_depth
             FROM dives
             WHERE date IS NOT NULL
             GROUP BY year
             ORDER BY year DESC"
        )?;
        
        let stats = stmt.query_map([], |row| {
            Ok(YearlyStat {
                year: row.get(0)?,
                dive_count: row.get(1)?,
                total_time_seconds: row.get(2)?,
                avg_depth_m: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(stats)
    }
    
    /// Get species count for a trip
    pub fn get_trip_species_count(&self, trip_id: i64) -> Result<i64> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT st.id)
             FROM species_tags st
             JOIN photo_species_tags pst ON st.id = pst.species_tag_id
             JOIN photos p ON pst.photo_id = p.id
             WHERE p.trip_id = ?1",
            [trip_id],
            |row| row.get(0)
        )?;
        Ok(count)
    }
    
    /// Get full trip data for export
    pub fn get_trip_export(&self, trip_id: i64) -> Result<TripExport> {
        let trip = self.get_trip(trip_id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
        
        // Get all dives for this trip
        let dives = self.get_dives_for_trip(trip_id)?;
        
        // Build dive exports with species info
        let mut dive_exports = Vec::new();
        for dive in dives {
            let photo_count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM photos WHERE dive_id = ?1",
                [dive.id],
                |row| row.get(0)
            )?;
            
            // Get species for this dive's photos
            let mut stmt = self.conn.prepare(
                "SELECT DISTINCT st.name 
                 FROM species_tags st
                 JOIN photo_species_tags pst ON st.id = pst.species_tag_id
                 JOIN photos p ON pst.photo_id = p.id
                 WHERE p.dive_id = ?1
                 ORDER BY st.name"
            )?;
            let species: Vec<String> = stmt.query_map([dive.id], |row| row.get(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            
            dive_exports.push(DiveExport {
                dive,
                photo_count,
                species,
            });
        }
        
        let photo_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE trip_id = ?1",
            [trip_id],
            |row| row.get(0)
        )?;
        
        let species_count: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT st.id)
             FROM species_tags st
             JOIN photo_species_tags pst ON st.id = pst.species_tag_id
             JOIN photos p ON pst.photo_id = p.id
             WHERE p.trip_id = ?1",
            [trip_id],
            |row| row.get(0)
        )?;
        
        Ok(TripExport {
            trip,
            dives: dive_exports,
            photo_count,
            species_count,
        })
    }
    
    /// Get species list for export
    pub fn get_species_export(&self) -> Result<Vec<SpeciesExport>> {
        let mut stmt = self.conn.prepare(
            "SELECT st.name, st.scientific_name, st.category,
                    COUNT(DISTINCT pst.photo_id) as photo_count,
                    COUNT(DISTINCT p.dive_id) as dive_count,
                    COUNT(DISTINCT p.trip_id) as trip_count
             FROM species_tags st
             LEFT JOIN photo_species_tags pst ON st.id = pst.species_tag_id
             LEFT JOIN photos p ON pst.photo_id = p.id
             GROUP BY st.id
             ORDER BY st.name"
        )?;
        
        let species = stmt.query_map([], |row| {
            Ok(SpeciesExport {
                name: row.get(0)?,
                scientific_name: row.get(1)?,
                category: row.get(2)?,
                photo_count: row.get(3)?,
                dive_count: row.get(4)?,
                trip_count: row.get(5)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(species)
    }
    
    /// Get photos for export (with full paths)
    pub fn get_photos_for_export(&self, photo_ids: &[i64]) -> Result<Vec<Photo>> {
        if photo_ids.is_empty() {
            return Ok(Vec::new());
        }
        
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT id, trip_id, dive_id, file_path, thumbnail_path, filename, capture_time,
                    width, height, file_size_bytes, is_processed, raw_photo_id, rating,
                    camera_make, camera_model, lens_info, focal_length_mm, aperture,
                    shutter_speed, iso, exposure_compensation, white_balance, flash_fired,
                    metering_mode, gps_latitude, gps_longitude, created_at, updated_at
             FROM photos WHERE id IN ({})",
            placeholders
        );
        
        let mut stmt = self.conn.prepare(&query)?;
        let params_iter = rusqlite::params_from_iter(photo_ids.iter());
        
        let photos = stmt.query_map(params_iter, |row| {
            Ok(Photo {
                id: row.get(0)?,
                trip_id: row.get(1)?,
                dive_id: row.get(2)?,
                file_path: row.get(3)?,
                thumbnail_path: row.get(4)?,
                filename: row.get(5)?,
                capture_time: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                file_size_bytes: row.get(9)?,
                is_processed: row.get(10)?,
                raw_photo_id: row.get(11)?,
                rating: row.get(12)?,
                camera_make: row.get(13)?,
                camera_model: row.get(14)?,
                lens_info: row.get(15)?,
                focal_length_mm: row.get(16)?,
                aperture: row.get(17)?,
                shutter_speed: row.get(18)?,
                iso: row.get(19)?,
                exposure_compensation: row.get(20)?,
                white_balance: row.get(21)?,
                flash_fired: row.get::<_, Option<i32>>(22)?.map(|i| i != 0),
                metering_mode: row.get(23)?,
                gps_latitude: row.get(24)?,
                gps_longitude: row.get(25)?,
                created_at: row.get(26)?,
                updated_at: row.get(27)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(photos)
    }
    
    // Dive site operations
    pub fn get_all_dive_sites(&self) -> Result<Vec<DiveSite>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, lat, lon, is_user_created FROM dive_sites ORDER BY name"
        )?;
        
        let sites = stmt.query_map([], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
                is_user_created: row.get::<_, i32>(4)? != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(sites)
    }
    
    pub fn insert_dive_site(&self, name: &str, lat: f64, lon: f64) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dive_sites (name, lat, lon, is_user_created) VALUES (?1, ?2, ?3, 0)",
            params![name, lat, lon],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Create a user-created dive site
    pub fn create_dive_site(&self, name: &str, lat: f64, lon: f64) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dive_sites (name, lat, lon, is_user_created) VALUES (?1, ?2, ?3, 1)",
            params![name, lat, lon],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Delete a dive site (only user-created sites can be deleted)
    pub fn delete_dive_site(&self, id: i64) -> Result<bool> {
        let rows = self.conn.execute(
            "DELETE FROM dive_sites WHERE id = ?1 AND is_user_created = 1",
            params![id],
        )?;
        Ok(rows > 0)
    }
    
    /// Find a dive site by exact name match
    pub fn find_dive_site_by_name(&self, name: &str) -> Result<Option<DiveSite>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, lat, lon, is_user_created FROM dive_sites WHERE LOWER(name) = LOWER(?1) LIMIT 1"
        )?;
        let mut sites = stmt.query_map([name], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
                is_user_created: row.get::<_, i32>(4)? != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(sites.pop())
    }
    
    /// Find nearby dive sites within a given radius (in meters)
    /// Uses Haversine approximation for small distances
    pub fn find_nearby_dive_sites(&self, lat: f64, lon: f64, radius_meters: f64) -> Result<Vec<DiveSite>> {
        // Convert radius to approximate degrees (very rough, 111km per degree at equator)
        let radius_deg = radius_meters / 111_000.0;
        
        let mut stmt = self.conn.prepare(
            "SELECT id, name, lat, lon, is_user_created FROM dive_sites 
             WHERE lat BETWEEN ?1 AND ?2 AND lon BETWEEN ?3 AND ?4"
        )?;
        
        let sites = stmt.query_map(params![
            lat - radius_deg, lat + radius_deg,
            lon - radius_deg, lon + radius_deg
        ], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
                is_user_created: row.get::<_, i32>(4)? != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        // Filter by actual distance using Haversine formula
        let sites: Vec<DiveSite> = sites.into_iter().filter(|site| {
            let dlat = (site.lat - lat).to_radians();
            let dlon = (site.lon - lon).to_radians();
            let a = (dlat / 2.0).sin().powi(2) + lat.to_radians().cos() * site.lat.to_radians().cos() * (dlon / 2.0).sin().powi(2);
            let c = 2.0 * a.sqrt().asin();
            let distance_m = 6_371_000.0 * c; // Earth radius in meters
            distance_m <= radius_meters
        }).collect();
        
        Ok(sites)
    }
    
    /// Find or create a dive site - returns existing site if name matches or nearby site exists, otherwise creates new
    pub fn find_or_create_dive_site(&self, name: &str, lat: f64, lon: f64) -> Result<i64> {
        // First, try to find by exact name match
        if let Some(site) = self.find_dive_site_by_name(name)? {
            return Ok(site.id);
        }
        
        // Then, look for nearby sites (within 100 meters)
        let nearby = self.find_nearby_dive_sites(lat, lon, 100.0)?;
        if let Some(site) = nearby.first() {
            return Ok(site.id);
        }
        
        // No match found, create a new user site
        self.create_dive_site(name, lat, lon)
    }
    
    /// Get a single dive site by ID
    pub fn get_dive_site(&self, id: i64) -> Result<Option<DiveSite>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, lat, lon, is_user_created FROM dive_sites WHERE id = ?1"
        )?;
        let mut sites = stmt.query_map([id], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
                is_user_created: row.get::<_, i32>(4)? != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(sites.pop())
    }
    
    /// Check if dive sites table is empty
    pub fn dive_sites_empty(&self) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM dive_sites",
            [],
            |row| row.get(0)
        )?;
        Ok(count == 0)
    }
    
    /// Import dive sites from CSV data
    pub fn import_dive_sites_from_csv(&self, csv_content: &str) -> Result<usize> {
        let mut count = 0;
        let mut lines = csv_content.lines();
        
        // Skip header line
        if let Some(_header) = lines.next() {
            // Process each line
            for line in lines {
                let parts: Vec<&str> = line.split(',').collect();
                
                if parts.len() >= 3 {
                    let name = parts[0].trim();
                    if let (Ok(lat), Ok(lon)) = (parts[1].trim().parse::<f64>(), parts[2].trim().parse::<f64>()) {
                        self.insert_dive_site(name, lat, lon)?;
                        count += 1;
                    }
                }
            }
        }
        
        Ok(count)
    }
    
    pub fn search_dive_sites(&self, query: &str) -> Result<Vec<DiveSite>> {
        let search_pattern = format!("%{}%", query.to_lowercase());
        let mut stmt = self.conn.prepare(
            "SELECT id, name, lat, lon, is_user_created FROM dive_sites WHERE LOWER(name) LIKE ?1 ORDER BY name LIMIT 100"
        )?;
        
        let sites = stmt.query_map([&search_pattern], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
                is_user_created: row.get::<_, i32>(4)? != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(sites)
    }
    
    /// Global search across trips, dives, species, tags, and photos
    /// Also finds related items (e.g., dives where a species was seen, photos with matching tags)
    pub fn search(&self, query: &str) -> Result<SearchResults> {
        let search_pattern = format!("%{}%", query.to_lowercase());
        
        // Search trips directly by name/location
        let mut stmt = self.conn.prepare(
            "SELECT id, name, location, resort, date_start, date_end, notes, created_at, updated_at
             FROM trips
             WHERE LOWER(name) LIKE ?1 OR LOWER(location) LIKE ?1 OR LOWER(resort) LIKE ?1 OR LOWER(notes) LIKE ?1
             ORDER BY date_start DESC
             LIMIT 20"
        )?;
        let trips: Vec<Trip> = stmt.query_map([&search_pattern], |row| {
            Ok(Trip {
                id: row.get(0)?,
                name: row.get(1)?,
                location: row.get(2)?,
                resort: row.get(3)?,
                date_start: row.get(4)?,
                date_end: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        // Search dives directly by location/ocean/buddy + dives where matching species were seen
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT d.id, d.trip_id, d.dive_number, d.date, d.time, d.duration_seconds, 
                    d.max_depth_m, d.mean_depth_m, d.water_temp_c, d.air_temp_c, d.surface_pressure_bar,
                    d.otu, d.cns_percent, d.dive_computer_model, d.dive_computer_serial,
                    d.location, d.ocean, d.visibility_m, d.gear_profile_id, d.buddy, d.divemaster, d.guide,
                    d.instructor, d.comments, d.latitude, d.longitude, d.dive_site_id, d.is_fresh_water, d.is_boat_dive, d.is_drift_dive,
                    d.is_night_dive, d.is_training_dive, d.created_at, d.updated_at
             FROM dives d
             LEFT JOIN photos p ON p.dive_id = d.id
             LEFT JOIN photo_species_tags pst ON pst.photo_id = p.id
             LEFT JOIN species_tags st ON st.id = pst.species_tag_id
             LEFT JOIN photo_general_tags pgt ON pgt.photo_id = p.id
             LEFT JOIN general_tags gt ON gt.id = pgt.general_tag_id
             WHERE LOWER(d.location) LIKE ?1 OR LOWER(d.ocean) LIKE ?1 OR LOWER(d.buddy) LIKE ?1 
                   OR LOWER(d.comments) LIKE ?1 OR LOWER(d.divemaster) LIKE ?1 OR LOWER(d.guide) LIKE ?1
                   OR LOWER(st.name) LIKE ?1 OR LOWER(st.scientific_name) LIKE ?1
                   OR LOWER(gt.name) LIKE ?1
             ORDER BY d.date DESC
             LIMIT 50"
        )?;
        let dives: Vec<Dive> = stmt.query_map([&search_pattern], |row| {
            Ok(Dive {
                id: row.get(0)?,
                trip_id: row.get(1)?,
                dive_number: row.get(2)?,
                date: row.get(3)?,
                time: row.get(4)?,
                duration_seconds: row.get(5)?,
                max_depth_m: row.get(6)?,
                mean_depth_m: row.get(7)?,
                water_temp_c: row.get(8)?,
                air_temp_c: row.get(9)?,
                surface_pressure_bar: row.get(10)?,
                otu: row.get(11)?,
                cns_percent: row.get(12)?,
                dive_computer_model: row.get(13)?,
                dive_computer_serial: row.get(14)?,
                location: row.get(15)?,
                ocean: row.get(16)?,
                visibility_m: row.get(17)?,
                gear_profile_id: row.get(18)?,
                buddy: row.get(19)?,
                divemaster: row.get(20)?,
                guide: row.get(21)?,
                instructor: row.get(22)?,
                comments: row.get(23)?,
                latitude: row.get(24)?,
                longitude: row.get(25)?,
                dive_site_id: row.get(26)?,
                is_fresh_water: row.get::<_, i32>(27)? != 0,
                is_boat_dive: row.get::<_, i32>(28)? != 0,
                is_drift_dive: row.get::<_, i32>(29)? != 0,
                is_night_dive: row.get::<_, i32>(30)? != 0,
                is_training_dive: row.get::<_, i32>(31)? != 0,
                created_at: row.get(32)?,
                updated_at: row.get(33)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        // Search photos by filename, or photos tagged with matching species/tags
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT p.id, p.trip_id, p.dive_id, p.file_path, p.thumbnail_path, p.filename,
                    p.capture_time, p.width, p.height, p.file_size_bytes, p.is_processed,
                    p.raw_photo_id, p.rating, p.camera_make, p.camera_model, p.lens_info,
                    p.focal_length_mm, p.aperture, p.shutter_speed, p.iso,
                    p.exposure_compensation, p.white_balance, p.flash_fired, p.metering_mode,
                    p.gps_latitude, p.gps_longitude, p.created_at, p.updated_at
             FROM photos p
             LEFT JOIN photo_species_tags pst ON pst.photo_id = p.id
             LEFT JOIN species_tags st ON st.id = pst.species_tag_id
             LEFT JOIN photo_general_tags pgt ON pgt.photo_id = p.id
             LEFT JOIN general_tags gt ON gt.id = pgt.general_tag_id
             WHERE LOWER(p.filename) LIKE ?1
                   OR LOWER(st.name) LIKE ?1 OR LOWER(st.scientific_name) LIKE ?1
                   OR LOWER(gt.name) LIKE ?1
             ORDER BY p.capture_time DESC
             LIMIT 100"
        )?;
        let photos: Vec<Photo> = stmt.query_map([&search_pattern], |row| {
            Ok(Photo {
                id: row.get(0)?,
                trip_id: row.get(1)?,
                dive_id: row.get(2)?,
                file_path: row.get(3)?,
                thumbnail_path: row.get(4)?,
                filename: row.get(5)?,
                capture_time: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                file_size_bytes: row.get(9)?,
                is_processed: row.get(10)?,
                raw_photo_id: row.get(11)?,
                rating: row.get(12)?,
                camera_make: row.get(13)?,
                camera_model: row.get(14)?,
                lens_info: row.get(15)?,
                focal_length_mm: row.get(16)?,
                aperture: row.get(17)?,
                shutter_speed: row.get(18)?,
                iso: row.get(19)?,
                exposure_compensation: row.get(20)?,
                white_balance: row.get(21)?,
                flash_fired: row.get::<_, Option<i32>>(22)?.map(|i| i != 0),
                metering_mode: row.get(23)?,
                gps_latitude: row.get(24)?,
                gps_longitude: row.get(25)?,
                created_at: row.get(26)?,
                updated_at: row.get(27)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        // Search species
        let mut stmt = self.conn.prepare(
            "SELECT id, name, category, scientific_name
             FROM species_tags
             WHERE LOWER(name) LIKE ?1 OR LOWER(scientific_name) LIKE ?1 OR LOWER(category) LIKE ?1
             ORDER BY name
             LIMIT 20"
        )?;
        let species: Vec<SpeciesTag> = stmt.query_map([&search_pattern], |row| {
            Ok(SpeciesTag {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                scientific_name: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        // Search general tags
        let mut stmt = self.conn.prepare(
            "SELECT id, name
             FROM general_tags
             WHERE LOWER(name) LIKE ?1
             ORDER BY name
             LIMIT 20"
        )?;
        let tags: Vec<GeneralTag> = stmt.query_map([&search_pattern], |row| {
            Ok(GeneralTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        // Search dive sites
        let dive_sites = self.search_dive_sites(query)?;
        
        Ok(SearchResults { trips, dives, photos, species, tags, dive_sites })
    }
    
    /// Move photos to a different dive
    pub fn move_photos_to_dive(&self, photo_ids: &[i64], dive_id: Option<i64>) -> Result<usize> {
        if photo_ids.is_empty() {
            return Ok(0);
        }
        
        let placeholders: String = photo_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "UPDATE photos SET dive_id = ?1, updated_at = datetime('now') WHERE id IN ({})",
            placeholders
        );
        
        let mut params: Vec<&dyn rusqlite::ToSql> = vec![&dive_id];
        for id in photo_ids {
            params.push(id);
        }
        
        let count = self.conn.execute(&query, rusqlite::params_from_iter(params.iter()))?;
        Ok(count)
    }
    
    // ==================== Equipment Catalogue Operations ====================
    
    /// Get all equipment categories
    pub fn get_equipment_categories(&self) -> Result<Vec<EquipmentCategory>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, icon, sort_order FROM equipment_categories ORDER BY sort_order, name"
        )?;
        
        let categories = stmt.query_map([], |row| {
            Ok(EquipmentCategory {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                sort_order: row.get(3)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(categories)
    }
    
    /// Create a new equipment category
    pub fn create_equipment_category(&self, name: &str, icon: Option<&str>, sort_order: i32) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO equipment_categories (name, icon, sort_order) VALUES (?, ?, ?)",
            params![name, icon, sort_order],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Update an equipment category
    pub fn update_equipment_category(&self, id: i64, name: &str, icon: Option<&str>, sort_order: i32) -> Result<()> {
        self.conn.execute(
            "UPDATE equipment_categories SET name = ?, icon = ?, sort_order = ? WHERE id = ?",
            params![name, icon, sort_order, id],
        )?;
        Ok(())
    }
    
    /// Delete an equipment category (cascade deletes equipment in that category)
    pub fn delete_equipment_category(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM equipment_categories WHERE id = ?", [id])?;
        Ok(())
    }
    
    /// Get all equipment items
    pub fn get_all_equipment(&self) -> Result<Vec<EquipmentWithCategory>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.category_id, c.name as category_name, e.name, e.brand, e.model,
                    e.serial_number, e.purchase_date, e.notes, e.is_retired, e.created_at, e.updated_at
             FROM equipment e
             JOIN equipment_categories c ON e.category_id = c.id
             ORDER BY c.sort_order, c.name, e.name"
        )?;
        
        let equipment = stmt.query_map([], |row| {
            Ok(EquipmentWithCategory {
                id: row.get(0)?,
                category_id: row.get(1)?,
                category_name: row.get(2)?,
                name: row.get(3)?,
                brand: row.get(4)?,
                model: row.get(5)?,
                serial_number: row.get(6)?,
                purchase_date: row.get(7)?,
                notes: row.get(8)?,
                is_retired: row.get::<_, i32>(9)? != 0,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(equipment)
    }
    
    /// Get equipment items by category
    pub fn get_equipment_by_category(&self, category_id: i64) -> Result<Vec<Equipment>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, category_id, name, brand, model, serial_number, purchase_date, notes, 
                    is_retired, created_at, updated_at
             FROM equipment 
             WHERE category_id = ?
             ORDER BY name"
        )?;
        
        let equipment = stmt.query_map([category_id], |row| {
            Ok(Equipment {
                id: row.get(0)?,
                category_id: row.get(1)?,
                name: row.get(2)?,
                brand: row.get(3)?,
                model: row.get(4)?,
                serial_number: row.get(5)?,
                purchase_date: row.get(6)?,
                notes: row.get(7)?,
                is_retired: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(equipment)
    }
    
    /// Get a single equipment item
    pub fn get_equipment(&self, id: i64) -> Result<Option<EquipmentWithCategory>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.category_id, c.name as category_name, e.name, e.brand, e.model,
                    e.serial_number, e.purchase_date, e.notes, e.is_retired, e.created_at, e.updated_at
             FROM equipment e
             JOIN equipment_categories c ON e.category_id = c.id
             WHERE e.id = ?"
        )?;
        
        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(EquipmentWithCategory {
                id: row.get(0)?,
                category_id: row.get(1)?,
                category_name: row.get(2)?,
                name: row.get(3)?,
                brand: row.get(4)?,
                model: row.get(5)?,
                serial_number: row.get(6)?,
                purchase_date: row.get(7)?,
                notes: row.get(8)?,
                is_retired: row.get::<_, i32>(9)? != 0,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            }))
        } else {
            Ok(None)
        }
    }
    
    /// Create new equipment
    pub fn create_equipment(
        &self,
        category_id: i64,
        name: &str,
        brand: Option<&str>,
        model: Option<&str>,
        serial_number: Option<&str>,
        purchase_date: Option<&str>,
        notes: Option<&str>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO equipment (category_id, name, brand, model, serial_number, purchase_date, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![category_id, name, brand, model, serial_number, purchase_date, notes],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Update equipment
    pub fn update_equipment(
        &self,
        id: i64,
        category_id: i64,
        name: &str,
        brand: Option<&str>,
        model: Option<&str>,
        serial_number: Option<&str>,
        purchase_date: Option<&str>,
        notes: Option<&str>,
        is_retired: bool,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE equipment SET 
                category_id = ?, name = ?, brand = ?, model = ?, serial_number = ?,
                purchase_date = ?, notes = ?, is_retired = ?, updated_at = datetime('now')
             WHERE id = ?",
            params![category_id, name, brand, model, serial_number, purchase_date, notes, is_retired as i32, id],
        )?;
        Ok(())
    }
    
    /// Delete equipment
    pub fn delete_equipment(&self, id: i64) -> Result<()> {
        // Remove from any sets first
        self.conn.execute("DELETE FROM equipment_set_items WHERE equipment_id = ?", [id])?;
        // Delete the equipment
        self.conn.execute("DELETE FROM equipment WHERE id = ?", [id])?;
        Ok(())
    }
    
    // ==================== Equipment Set Operations ====================
    
    /// Get all equipment sets
    pub fn get_equipment_sets(&self) -> Result<Vec<EquipmentSet>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, set_type, is_default, created_at, updated_at
             FROM equipment_sets
             ORDER BY set_type, name"
        )?;
        
        let sets = stmt.query_map([], |row| {
            Ok(EquipmentSet {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                set_type: row.get(3)?,
                is_default: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(sets)
    }
    
    /// Get equipment sets by type ('dive' or 'camera')
    pub fn get_equipment_sets_by_type(&self, set_type: &str) -> Result<Vec<EquipmentSet>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, set_type, is_default, created_at, updated_at
             FROM equipment_sets
             WHERE set_type = ?
             ORDER BY is_default DESC, name"
        )?;
        
        let sets = stmt.query_map([set_type], |row| {
            Ok(EquipmentSet {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                set_type: row.get(3)?,
                is_default: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(sets)
    }
    
    /// Get equipment set with its items
    pub fn get_equipment_set_with_items(&self, id: i64) -> Result<Option<EquipmentSetWithItems>> {
        // Get the set
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, set_type, is_default, created_at, updated_at
             FROM equipment_sets WHERE id = ?"
        )?;
        
        let set: Option<EquipmentSet> = stmt.query_row([id], |row| {
            Ok(EquipmentSet {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                set_type: row.get(3)?,
                is_default: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        }).ok();
        
        if let Some(set) = set {
            // Get items in this set
            let mut stmt = self.conn.prepare(
                "SELECT e.id, e.category_id, c.name as category_name, e.name, e.brand, e.model,
                        e.serial_number, e.purchase_date, e.notes, e.is_retired, e.created_at, e.updated_at
                 FROM equipment e
                 JOIN equipment_categories c ON e.category_id = c.id
                 JOIN equipment_set_items esi ON esi.equipment_id = e.id
                 WHERE esi.equipment_set_id = ?
                 ORDER BY c.sort_order, c.name, e.name"
            )?;
            
            let items = stmt.query_map([id], |row| {
                Ok(EquipmentWithCategory {
                    id: row.get(0)?,
                    category_id: row.get(1)?,
                    category_name: row.get(2)?,
                    name: row.get(3)?,
                    brand: row.get(4)?,
                    model: row.get(5)?,
                    serial_number: row.get(6)?,
                    purchase_date: row.get(7)?,
                    notes: row.get(8)?,
                    is_retired: row.get::<_, i32>(9)? != 0,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            })?.collect::<Result<Vec<_>>>()?;
            
            Ok(Some(EquipmentSetWithItems {
                id: set.id,
                name: set.name,
                description: set.description,
                set_type: set.set_type,
                is_default: set.is_default,
                items,
                created_at: set.created_at,
                updated_at: set.updated_at,
            }))
        } else {
            Ok(None)
        }
    }
    
    /// Create a new equipment set
    pub fn create_equipment_set(&self, name: &str, description: Option<&str>, set_type: &str, is_default: bool) -> Result<i64> {
        // If this is set as default, unset any existing default for this type
        if is_default {
            self.conn.execute(
                "UPDATE equipment_sets SET is_default = 0 WHERE set_type = ?",
                [set_type],
            )?;
        }
        
        self.conn.execute(
            "INSERT INTO equipment_sets (name, description, set_type, is_default) VALUES (?, ?, ?, ?)",
            params![name, description, set_type, is_default as i32],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Update an equipment set
    pub fn update_equipment_set(&self, id: i64, name: &str, description: Option<&str>, set_type: &str, is_default: bool) -> Result<()> {
        // If this is set as default, unset any existing default for this type
        if is_default {
            self.conn.execute(
                "UPDATE equipment_sets SET is_default = 0 WHERE set_type = ? AND id != ?",
                params![set_type, id],
            )?;
        }
        
        self.conn.execute(
            "UPDATE equipment_sets SET name = ?, description = ?, set_type = ?, is_default = ?, updated_at = datetime('now') WHERE id = ?",
            params![name, description, set_type, is_default as i32, id],
        )?;
        Ok(())
    }
    
    /// Delete an equipment set
    pub fn delete_equipment_set(&self, id: i64) -> Result<()> {
        // Remove from dive associations
        self.conn.execute("DELETE FROM dive_equipment_sets WHERE equipment_set_id = ?", [id])?;
        // Remove items from set
        self.conn.execute("DELETE FROM equipment_set_items WHERE equipment_set_id = ?", [id])?;
        // Delete the set
        self.conn.execute("DELETE FROM equipment_sets WHERE id = ?", [id])?;
        Ok(())
    }
    
    /// Add equipment to a set
    pub fn add_equipment_to_set(&self, set_id: i64, equipment_id: i64) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO equipment_set_items (equipment_set_id, equipment_id) VALUES (?, ?)",
            params![set_id, equipment_id],
        )?;
        self.conn.execute(
            "UPDATE equipment_sets SET updated_at = datetime('now') WHERE id = ?",
            [set_id],
        )?;
        Ok(())
    }
    
    /// Remove equipment from a set
    pub fn remove_equipment_from_set(&self, set_id: i64, equipment_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM equipment_set_items WHERE equipment_set_id = ? AND equipment_id = ?",
            params![set_id, equipment_id],
        )?;
        self.conn.execute(
            "UPDATE equipment_sets SET updated_at = datetime('now') WHERE id = ?",
            [set_id],
        )?;
        Ok(())
    }
    
    /// Set all equipment items in a set (replaces existing items)
    pub fn set_equipment_set_items(&self, set_id: i64, equipment_ids: &[i64]) -> Result<()> {
        // Remove all existing items
        self.conn.execute("DELETE FROM equipment_set_items WHERE equipment_set_id = ?", [set_id])?;
        
        // Add new items
        for &equip_id in equipment_ids {
            self.conn.execute(
                "INSERT INTO equipment_set_items (equipment_set_id, equipment_id) VALUES (?, ?)",
                params![set_id, equip_id],
            )?;
        }
        
        self.conn.execute(
            "UPDATE equipment_sets SET updated_at = datetime('now') WHERE id = ?",
            [set_id],
        )?;
        Ok(())
    }
    
    // ==================== Dive Equipment Assignment Operations ====================
    
    /// Get equipment sets for a dive
    pub fn get_equipment_sets_for_dive(&self, dive_id: i64) -> Result<Vec<EquipmentSet>> {
        let mut stmt = self.conn.prepare(
            "SELECT es.id, es.name, es.description, es.set_type, es.is_default, es.created_at, es.updated_at
             FROM equipment_sets es
             JOIN dive_equipment_sets des ON des.equipment_set_id = es.id
             WHERE des.dive_id = ?
             ORDER BY es.set_type, es.name"
        )?;
        
        let sets = stmt.query_map([dive_id], |row| {
            Ok(EquipmentSet {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                set_type: row.get(3)?,
                is_default: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(sets)
    }
    
    /// Assign an equipment set to a dive
    pub fn add_equipment_set_to_dive(&self, dive_id: i64, set_id: i64) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO dive_equipment_sets (dive_id, equipment_set_id) VALUES (?, ?)",
            params![dive_id, set_id],
        )?;
        Ok(())
    }
    
    /// Remove an equipment set from a dive
    pub fn remove_equipment_set_from_dive(&self, dive_id: i64, set_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM dive_equipment_sets WHERE dive_id = ? AND equipment_set_id = ?",
            params![dive_id, set_id],
        )?;
        Ok(())
    }
    
    /// Set all equipment sets for a dive (replaces existing)
    pub fn set_dive_equipment_sets(&self, dive_id: i64, set_ids: &[i64]) -> Result<()> {
        // Remove all existing assignments
        self.conn.execute("DELETE FROM dive_equipment_sets WHERE dive_id = ?", [dive_id])?;
        
        // Add new assignments
        for &set_id in set_ids {
            self.conn.execute(
                "INSERT INTO dive_equipment_sets (dive_id, equipment_set_id) VALUES (?, ?)",
                params![dive_id, set_id],
            )?;
        }
        Ok(())
    }
    
    /// Get default equipment set for a type
    pub fn get_default_equipment_set(&self, set_type: &str) -> Result<Option<EquipmentSet>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, set_type, is_default, created_at, updated_at
             FROM equipment_sets
             WHERE set_type = ? AND is_default = 1
             LIMIT 1"
        )?;
        
        let set = stmt.query_row([set_type], |row| {
            Ok(EquipmentSet {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                set_type: row.get(3)?,
                is_default: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        }).ok();
        
        Ok(set)
    }
}

// Statistics structs
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Statistics {
    pub total_trips: i64,
    pub total_dives: i64,
    pub total_bottom_time_seconds: i64,
    pub total_photos: i64,
    pub total_species: i64,
    pub deepest_dive_m: Option<f64>,
    pub avg_depth_m: Option<f64>,
    pub coldest_water_c: Option<f64>,
    pub warmest_water_c: Option<f64>,
    pub photos_with_species: i64,
    pub rated_photos: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiveStats {
    pub photo_count: i64,
    pub species_count: i64,
}

/// Extended dive info with stats and thumbnail paths for batch loading
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiveWithDetails {
    #[serde(flatten)]
    pub dive: Dive,
    pub photo_count: i64,
    pub species_count: i64,
    pub thumbnail_paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiveMapPoint {
    pub dive_id: i64,
    pub trip_id: i64,
    pub dive_number: i32,
    pub location: Option<String>,
    pub latitude: f64,
    pub longitude: f64,
    pub date: String,
    pub max_depth_m: f64,
    pub trip_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpeciesCount {
    pub id: i64,
    pub name: String,
    pub category: Option<String>,
    pub scientific_name: Option<String>,
    pub photo_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CameraStat {
    pub camera_model: String,
    pub photo_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YearlyStat {
    pub year: String,
    pub dive_count: i64,
    pub total_time_seconds: i64,
    pub avg_depth_m: Option<f64>,
}

// Export data structures
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TripExport {
    pub trip: Trip,
    pub dives: Vec<DiveExport>,
    pub photo_count: i64,
    pub species_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiveExport {
    pub dive: Dive,
    pub photo_count: i64,
    pub species: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpeciesExport {
    pub name: String,
    pub scientific_name: Option<String>,
    pub category: Option<String>,
    pub photo_count: i64,
    pub dive_count: i64,
    pub trip_count: i64,
}