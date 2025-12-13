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
    pub nitrox_o2_percent: Option<f64>,
    pub dive_computer_model: Option<String>,
    pub dive_computer_serial: Option<String>,
    pub location: Option<String>,
    pub ocean: Option<String>,
    pub visibility_m: Option<f64>,
    pub gear_profile_id: Option<i64>,
    pub buddy: Option<String>,
    pub divemaster: Option<String>,
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
}

// Search results
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResults {
    pub trips: Vec<Trip>,
    pub dives: Vec<Dive>,
    pub photos: Vec<Photo>,
    pub species: Vec<SpeciesTag>,
    pub tags: Vec<GeneralTag>,
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

pub struct Database {
    conn: Connection,
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
    
    fn get_db_path() -> PathBuf {
        // Use app data directory
        let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("Pelagic");
        path.push("pelagic.db");
        path
    }
    
    fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch(r#"
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
                nitrox_o2_percent REAL,
                dive_computer_model TEXT,
                dive_computer_serial TEXT,
                location TEXT,
                ocean TEXT,
                visibility_m REAL,
                gear_profile_id INTEGER,
                buddy TEXT,
                divemaster TEXT,
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
                lon REAL NOT NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_dives_trip_id ON dives(trip_id);
            CREATE INDEX IF NOT EXISTS idx_dive_samples_dive_id ON dive_samples(dive_id);
            CREATE INDEX IF NOT EXISTS idx_dive_events_dive_id ON dive_events(dive_id);
            CREATE INDEX IF NOT EXISTS idx_photos_trip_id ON photos(trip_id);
            CREATE INDEX IF NOT EXISTS idx_photos_dive_id ON photos(dive_id);
        "#)?;
        
        Ok(())
    }
    
    fn run_migrations(&self) -> Result<()> {
        // Migration: Add rating column to photos if it doesn't exist
        let has_rating: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('photos') WHERE name = 'rating'",
            [],
            |row| row.get(0)
        ).unwrap_or(false);
        
        if !has_rating {
            self.conn.execute("ALTER TABLE photos ADD COLUMN rating INTEGER DEFAULT 0", [])?;
        }
        
        // Migration: Add GPS coordinate columns to dives if they don't exist
        let has_latitude: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('dives') WHERE name = 'latitude'",
            [],
            |row| row.get(0)
        ).unwrap_or(false);
        
        if !has_latitude {
            self.conn.execute("ALTER TABLE dives ADD COLUMN latitude REAL", [])?;
            self.conn.execute("ALTER TABLE dives ADD COLUMN longitude REAL", [])?;
        }
        
        // Migration: Add new EXIF fields to photos if they don't exist
        let has_exposure_comp: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('photos') WHERE name = 'exposure_compensation'",
            [],
            |row| row.get(0)
        ).unwrap_or(false);
        
        if !has_exposure_comp {
            self.conn.execute("ALTER TABLE photos ADD COLUMN exposure_compensation REAL", [])?;
            self.conn.execute("ALTER TABLE photos ADD COLUMN white_balance TEXT", [])?;
            self.conn.execute("ALTER TABLE photos ADD COLUMN flash_fired INTEGER DEFAULT 0", [])?;
            self.conn.execute("ALTER TABLE photos ADD COLUMN metering_mode TEXT", [])?;
            self.conn.execute("ALTER TABLE photos ADD COLUMN gps_latitude REAL", [])?;
            self.conn.execute("ALTER TABLE photos ADD COLUMN gps_longitude REAL", [])?;
        }
        
        // Migration: Add dive_site_id column to dives if it doesn't exist
        let has_dive_site_id: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('dives') WHERE name = 'dive_site_id'",
            [],
            |row| row.get(0)
        ).unwrap_or(false);
        
        if !has_dive_site_id {
            self.conn.execute("ALTER TABLE dives ADD COLUMN dive_site_id INTEGER REFERENCES dive_sites(id) ON DELETE SET NULL", [])?;
        }
        
        Ok(())
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
    
    pub fn update_dive(
        &self,
        id: i64,
        location: Option<&str>,
        ocean: Option<&str>,
        visibility_m: Option<f64>,
        buddy: Option<&str>,
        divemaster: Option<&str>,
        instructor: Option<&str>,
        comments: Option<&str>,
        latitude: Option<f64>,
        longitude: Option<f64>,
        is_fresh_water: bool,
        is_boat_dive: bool,
        is_drift_dive: bool,
        is_night_dive: bool,
        is_training_dive: bool,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE dives SET 
                location = ?, ocean = ?, visibility_m = ?, 
                buddy = ?, divemaster = ?, instructor = ?, comments = ?,
                latitude = ?, longitude = ?,
                is_fresh_water = ?, is_boat_dive = ?, is_drift_dive = ?, 
                is_night_dive = ?, is_training_dive = ?,
                updated_at = datetime('now') 
             WHERE id = ?",
            params![
                location, ocean, visibility_m,
                buddy, divemaster, instructor, comments,
                latitude, longitude,
                is_fresh_water as i32, is_boat_dive as i32, is_drift_dive as i32,
                is_night_dive as i32, is_training_dive as i32,
                id
            ],
        )?;
        Ok(())
    }
    
    // Dive operations
    pub fn get_dives_for_trip(&self, trip_id: i64) -> Result<Vec<Dive>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                    water_temp_c, air_temp_c, surface_pressure_bar, otu, cns_percent, nitrox_o2_percent,
                    dive_computer_model, dive_computer_serial, location, ocean, visibility_m,
                    gear_profile_id, buddy, divemaster, instructor, comments, latitude, longitude, dive_site_id,
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
                nitrox_o2_percent: row.get(13)?,
                dive_computer_model: row.get(14)?,
                dive_computer_serial: row.get(15)?,
                location: row.get(16)?,
                ocean: row.get(17)?,
                visibility_m: row.get(18)?,
                gear_profile_id: row.get(19)?,
                buddy: row.get(20)?,
                divemaster: row.get(21)?,
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
                    water_temp_c, air_temp_c, surface_pressure_bar, otu, cns_percent, nitrox_o2_percent,
                    dive_computer_model, dive_computer_serial, location, ocean, visibility_m,
                    gear_profile_id, buddy, divemaster, instructor, comments, latitude, longitude, dive_site_id,
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
                nitrox_o2_percent: row.get(13)?,
                dive_computer_model: row.get(14)?,
                dive_computer_serial: row.get(15)?,
                location: row.get(16)?,
                ocean: row.get(17)?,
                visibility_m: row.get(18)?,
                gear_profile_id: row.get(19)?,
                buddy: row.get(20)?,
                divemaster: row.get(21)?,
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
                water_temp_c, air_temp_c, surface_pressure_bar, otu, cns_percent, nitrox_o2_percent,
                dive_computer_model, dive_computer_serial
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                dive.trip_id, dive.dive_number, dive.date, dive.time, dive.duration_seconds,
                dive.max_depth_m, dive.mean_depth_m, dive.water_temp_c, dive.air_temp_c,
                dive.surface_pressure_bar, dive.otu, dive.cns_percent, dive.nitrox_o2_percent,
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
        nitrox_o2_percent: Option<f64>,
        latitude: Option<f64>,
        longitude: Option<f64>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dives (
                trip_id, dive_number, date, time, duration_seconds, max_depth_m, mean_depth_m,
                water_temp_c, air_temp_c, surface_pressure_bar, cns_percent,
                dive_computer_model, dive_computer_serial, nitrox_o2_percent,
                latitude, longitude,
                is_fresh_water, is_boat_dive, is_drift_dive, is_night_dive, is_training_dive
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)",
            params![
                trip_id, dive_number, date, time, duration_seconds,
                max_depth_m, mean_depth_m, water_temp_c, air_temp_c,
                surface_pressure_bar, cns_percent,
                dive_computer_model, dive_computer_serial, nitrox_o2_percent,
                latitude, longitude
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
    
    pub fn insert_dive_event(&self, event: &DiveEvent) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dive_events (dive_id, time_seconds, event_type, name, flags, value)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![event.dive_id, event.time_seconds, event.event_type, event.name, event.flags, event.value],
        )?;
        Ok(self.conn.last_insert_rowid())
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
    
    /// Delete photos by ID
    pub fn delete_photos(&self, photo_ids: &[i64]) -> Result<u64> {
        let mut deleted = 0u64;
        for &id in photo_ids {
            // Delete any processed versions that reference this as raw_photo_id
            self.conn.execute("DELETE FROM photos WHERE raw_photo_id = ?", [id])?;
            // Delete the photo itself
            let changes = self.conn.execute("DELETE FROM photos WHERE id = ?", [id])?;
            deleted += changes as u64;
        }
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
    
    /// Update rating for multiple photos
    pub fn update_photos_rating(&self, photo_ids: &[i64], rating: i32) -> Result<()> {
        for &id in photo_ids {
            self.update_photo_rating(id, rating)?;
        }
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
    
    /// Add a general tag to multiple photos
    pub fn add_general_tag_to_photos(&self, photo_ids: &[i64], general_tag_id: i64) -> Result<i64> {
        let mut count = 0i64;
        for photo_id in photo_ids {
            self.conn.execute(
                "INSERT OR IGNORE INTO photo_general_tags (photo_id, general_tag_id) VALUES (?, ?)",
                params![photo_id, general_tag_id],
            )?;
            count += self.conn.changes() as i64;
        }
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
    
    /// Add a species tag to multiple photos
    pub fn add_species_tag_to_photos(&self, photo_ids: &[i64], species_tag_id: i64) -> Result<i64> {
        let mut count = 0i64;
        for photo_id in photo_ids {
            self.conn.execute(
                "INSERT OR IGNORE INTO photo_species_tags (photo_id, species_tag_id) VALUES (?, ?)",
                params![photo_id, species_tag_id],
            )?;
            count += self.conn.changes() as i64;
        }
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
            "SELECT id, name, lat, lon FROM dive_sites ORDER BY name"
        )?;
        
        let sites = stmt.query_map([], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        
        Ok(sites)
    }
    
    pub fn insert_dive_site(&self, name: &str, lat: f64, lon: f64) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO dive_sites (name, lat, lon) VALUES (?1, ?2, ?3)",
            params![name, lat, lon],
        )?;
        Ok(self.conn.last_insert_rowid())
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
            "SELECT id, name, lat, lon FROM dive_sites WHERE LOWER(name) LIKE ?1 ORDER BY name LIMIT 50"
        )?;
        
        let sites = stmt.query_map([&search_pattern], |row| {
            Ok(DiveSite {
                id: row.get(0)?,
                name: row.get(1)?,
                lat: row.get(2)?,
                lon: row.get(3)?,
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
                    d.otu, d.cns_percent, d.nitrox_o2_percent, d.dive_computer_model, d.dive_computer_serial,
                    d.location, d.ocean, d.visibility_m, d.gear_profile_id, d.buddy, d.divemaster,
                    d.instructor, d.comments, d.latitude, d.longitude, d.dive_site_id, d.is_fresh_water, d.is_boat_dive, d.is_drift_dive,
                    d.is_night_dive, d.is_training_dive, d.created_at, d.updated_at
             FROM dives d
             LEFT JOIN photos p ON p.dive_id = d.id
             LEFT JOIN photo_species_tags pst ON pst.photo_id = p.id
             LEFT JOIN species_tags st ON st.id = pst.species_tag_id
             LEFT JOIN photo_general_tags pgt ON pgt.photo_id = p.id
             LEFT JOIN general_tags gt ON gt.id = pgt.general_tag_id
             WHERE LOWER(d.location) LIKE ?1 OR LOWER(d.ocean) LIKE ?1 OR LOWER(d.buddy) LIKE ?1 
                   OR LOWER(d.comments) LIKE ?1 OR LOWER(d.divemaster) LIKE ?1
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
                nitrox_o2_percent: row.get(13)?,
                dive_computer_model: row.get(14)?,
                dive_computer_serial: row.get(15)?,
                location: row.get(16)?,
                ocean: row.get(17)?,
                visibility_m: row.get(18)?,
                gear_profile_id: row.get(19)?,
                buddy: row.get(20)?,
                divemaster: row.get(21)?,
                instructor: row.get(22)?,
                comments: row.get(23)?,
                latitude: row.get(24)?,
                longitude: row.get(25)?,
                dive_site_id: row.get(26)?,
                is_fresh_water: row.get(27)?,
                is_boat_dive: row.get(28)?,
                is_drift_dive: row.get(29)?,
                is_night_dive: row.get(30)?,
                is_training_dive: row.get(31)?,
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
        
        Ok(SearchResults { trips, dives, photos, species, tags })
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