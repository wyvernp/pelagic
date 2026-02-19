mod db;
mod import;
mod commands;
mod photos;
mod ai;
mod validation;

use db::Database;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use serde::Serialize;
use tauri::{Emitter, Manager};
use std::sync::OnceLock;
use std::path::PathBuf;

pub type DbPool = Pool<SqliteConnectionManager>;

pub struct AppState {
    pub db: DbPool,
}

/// Global storage base path (set once at startup from store or default)
static STORAGE_BASE_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Get the storage base path (e.g., %LOCALAPPDATA%/Pelagic or custom)
pub fn get_storage_base_path() -> PathBuf {
    STORAGE_BASE_PATH.get().cloned().unwrap_or_else(|| {
        let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("Pelagic");
        path
    })
}

/// Migration progress event payload
#[derive(Clone, Serialize)]
pub struct MigrationProgress {
    pub step: String,
    pub current_version: i64,
    pub target_version: i64,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            // Initialize database connection pool
            let startup_start = std::time::Instant::now();
            
            // Read custom storage path from store if set
            {
                use tauri_plugin_store::StoreExt;
                if let Ok(store) = app.store("secure-settings.json") {
                    if let Some(custom_path) = store.get("storagePath").and_then(|v| v.as_str().map(|s| s.to_string())) {
                        if !custom_path.is_empty() {
                            let path = PathBuf::from(&custom_path);
                            std::fs::create_dir_all(&path).ok();
                            let _ = STORAGE_BASE_PATH.set(path);
                            log::info!("Using custom storage path: {}", custom_path);
                        }
                    }
                }
                // If no custom path was set, initialize with default
                if STORAGE_BASE_PATH.get().is_none() {
                    let mut default_path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
                    default_path.push("Pelagic");
                    let _ = STORAGE_BASE_PATH.set(default_path);
                }
            }
            
            let db_path = Database::get_db_path();
            
            // Create parent directory if it doesn't exist
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            
            // Create connection manager and pool
            let manager = SqliteConnectionManager::file(&db_path);
            let pool = Pool::builder()
                .max_size(10)  // Allow up to 10 concurrent connections
                .build(manager)
                .expect("Failed to create database connection pool");
            
            let pool_time = startup_start.elapsed();
            log::info!("Database pool created in {:?}", pool_time);
            
            // Initialize schema and run migrations on first connection
            {
                let schema_start = std::time::Instant::now();
                let conn = pool.get().expect("Failed to get connection from pool");
                Database::init_schema_on_conn(&conn).expect("Failed to initialize schema");
                log::info!("Schema init took {:?}", schema_start.elapsed());
                
                let migration_start = std::time::Instant::now();
                
                // Check if migrations are needed
                let needs_migration = Database::needs_migration(&conn);
                let current_version = Database::get_schema_version(&conn);
                let target_version = Database::CURRENT_SCHEMA_VERSION;
                
                if needs_migration {
                    log::info!("Database migration needed: v{} -> v{}", current_version, target_version);
                    
                    // Get main window handle for emitting events
                    let app_handle = app.handle().clone();
                    
                    // Run migrations with progress reporting
                    Database::run_migrations_on_conn_with_progress(&conn, |step| {
                        let progress = MigrationProgress {
                            step: step.to_string(),
                            current_version,
                            target_version,
                        };
                        // Emit to all windows - the frontend will listen for this
                        let _ = app_handle.emit("migration-progress", progress);
                    }).expect("Failed to run migrations");
                    
                    // Emit migration complete event
                    let _ = app.handle().emit("migration-complete", ());
                }
                
                log::info!("Migrations took {:?}", migration_start.elapsed());
                
                // Enable WAL mode for better concurrent read/write performance
                conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
                    .expect("Failed to enable WAL mode");
            }
            
            // Auto-import dive sites on first run
            {
                let sites_start = std::time::Instant::now();
                let conn = pool.get().expect("Failed to get connection from pool");
                if let Ok(true) = Database::dive_sites_empty_on_conn(&conn) {
                    // Try to load bundled dive sites CSV
                    if let Ok(resource_path) = app.path().resolve("divesites_filtered.csv", tauri::path::BaseDirectory::Resource) {
                        if let Ok(csv_content) = std::fs::read_to_string(&resource_path) {
                            match Database::import_dive_sites_from_csv_on_conn(&conn, &csv_content) {
                                Ok(count) => log::info!("Auto-imported {} dive sites in {:?}", count, sites_start.elapsed()),
                                Err(e) => log::error!("Failed to auto-import dive sites: {}", e),
                            }
                        }
                    }
                }
            }
            
            log::info!("Total startup time: {:?}", startup_start.elapsed());
            app.manage(AppState { db: pool });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_trips,
            commands::get_trip,
            commands::create_trip,
            commands::update_trip,
            commands::delete_trip,
            commands::get_dives_for_trip,
            commands::get_dive,
            commands::update_dive,
            commands::delete_dive,
            commands::move_dive_to_trip,
            commands::bulk_update_dives,
            commands::get_dive_samples,
            commands::get_tank_pressures,
            commands::get_dive_tanks,
            commands::insert_dive_samples,
            commands::insert_tank_pressures,
            commands::import_ssrf_file,
            commands::import_dive_file,
            commands::import_dive_file_data,
            commands::parse_dive_file_data,
            commands::bulk_import_dives,
            commands::create_dive_from_computer,
            commands::create_manual_dive,
            commands::get_photos_for_dive,
            commands::get_photos_for_trip,
            commands::get_all_photos_for_trip,
            commands::get_dive_thumbnail_photos,
            commands::get_dive_stats,
            commands::get_dives_with_details,
            commands::get_photo,
            commands::scan_photos_for_import,
            commands::import_photos,
            commands::regenerate_thumbnails,
            commands::get_photos_needing_thumbnails,
            commands::generate_single_thumbnail,
            commands::rescan_photo_exif,
            commands::rescan_trip_exif,
            commands::rescan_all_exif,
            commands::debug_dump_exif,
            commands::get_image_data,
            commands::get_processed_version,
            commands::get_raw_version,
            commands::get_display_version,
            commands::link_orphan_processed_photos,
            // Photo management commands
            commands::delete_photos,
            commands::update_photo_rating,
            commands::update_photos_rating,
            // Species tag commands
            commands::get_all_species_tags,
            commands::search_species_tags,
            commands::create_species_tag,
            commands::get_or_create_species_tag,
            commands::get_species_tags_for_photo,
            commands::add_species_tag_to_photos,
            commands::remove_species_tag_from_photo,
            commands::remove_species_tag_from_photos,
            commands::get_distinct_species_categories,
            commands::update_species_tag_category,
            commands::get_common_species_tags_for_photos,
            // General tag commands
            commands::get_all_general_tags,
            commands::search_general_tags,
            commands::get_or_create_general_tag,
            commands::get_general_tags_for_photo,
            commands::add_general_tag_to_photos,
            commands::remove_general_tag_from_photo,
            commands::get_common_general_tags_for_photos,
            commands::remove_general_tag_from_photos,
            // Statistics commands
            commands::get_statistics,
            commands::get_species_with_counts,
            commands::get_camera_stats,
            commands::get_yearly_stats,
            commands::get_trip_species_count,
            // Export commands
            commands::get_trip_export,
            commands::get_species_export,
            commands::export_photos,
            // Search commands
            commands::search,
            commands::filter_photos,
            // Batch operations
            commands::move_photos_to_dive,
            // Dive sites commands
            commands::get_dive_sites,
            commands::import_dive_sites_csv,
            commands::search_dive_sites,
            commands::create_dive_site,
            commands::update_dive_site,
            commands::delete_dive_site,
            commands::find_or_create_dive_site,
            commands::get_dive_site,
            // Map commands
            commands::get_dive_map_points,
            // AI species identification
            commands::identify_species_in_photo,
            commands::identify_species_batch,
            // System utilities
            commands::open_url,
            // Equipment commands
            commands::get_equipment_categories,
            commands::create_equipment_category,
            commands::update_equipment_category,
            commands::delete_equipment_category,
            commands::get_all_equipment,
            commands::get_equipment_by_category,
            commands::get_equipment,
            commands::create_equipment,
            commands::update_equipment,
            commands::delete_equipment,
            // Equipment set commands
            commands::get_equipment_sets,
            commands::get_equipment_sets_by_type,
            commands::get_equipment_set_with_items,
            commands::create_equipment_set,
            commands::update_equipment_set,
            commands::delete_equipment_set,
            commands::add_equipment_to_set,
            commands::remove_equipment_from_set,
            commands::set_equipment_set_items,
            // Dive equipment commands
            commands::get_equipment_sets_for_dive,
            commands::add_equipment_set_to_dive,
            commands::remove_equipment_set_from_dive,
            commands::set_dive_equipment_sets,
            commands::get_default_equipment_set,
            // External editor commands
            commands::detect_image_editors,
            commands::open_in_editor,
            // Caption template commands
            commands::get_caption_templates,
            commands::save_caption_template,
            commands::update_caption_template,
            commands::delete_caption_template,
            // Secure settings commands
            commands::get_secure_setting,
            commands::set_secure_setting,
            // Storage path commands
            commands::get_storage_path,
            commands::set_storage_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
