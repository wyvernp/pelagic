mod db;
mod import;
mod commands;
mod photos;
mod ai;

use db::Database;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Database>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Database::new().expect("Failed to initialize database");
    
    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(db),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            // Auto-import dive sites on first run
            let app_state: tauri::State<AppState> = app.state();
            if let Ok(db) = app_state.db.lock() {
                if let Ok(true) = db.dive_sites_empty() {
                    // Try to load bundled dive sites CSV
                    if let Ok(resource_path) = app.path().resolve("divesites_filtered.csv", tauri::path::BaseDirectory::Resource) {
                        if let Ok(csv_content) = std::fs::read_to_string(&resource_path) {
                            match db.import_dive_sites_from_csv(&csv_content) {
                                Ok(count) => println!("Auto-imported {} dive sites", count),
                                Err(e) => eprintln!("Failed to auto-import dive sites: {}", e),
                            }
                        }
                    }
                }
            }
            
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
            commands::get_dive_samples,
            commands::insert_dive_samples,
            commands::import_ssrf_file,
            commands::import_dive_file,
            commands::create_dive_from_computer,
            commands::get_photos_for_dive,
            commands::get_photos_for_trip,
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
            // General tag commands
            commands::get_all_general_tags,
            commands::search_general_tags,
            commands::get_or_create_general_tag,
            commands::get_general_tags_for_photo,
            commands::add_general_tag_to_photos,
            commands::remove_general_tag_from_photo,
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
            // Map commands
            commands::get_dive_map_points,
            // AI species identification
            commands::identify_species_in_photo,
            commands::identify_species_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
