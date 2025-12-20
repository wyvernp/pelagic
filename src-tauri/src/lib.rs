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
            commands::delete_dive,
            commands::bulk_update_dives,
            commands::get_dive_samples,
            commands::get_tank_pressures,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
