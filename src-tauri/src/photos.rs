use std::path::{Path, PathBuf};
use std::fs::File;
use std::io::BufReader;
use chrono::{NaiveDateTime, Duration};
use exif::{In, Tag, Reader as ExifReader};
use serde::{Deserialize, Serialize};
use image::{ImageFormat, DynamicImage};
use rexif::ExifTag;
use crate::db::{Database, Dive};

/// Represents a scanned photo file with its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedPhoto {
    pub file_path: String,
    pub filename: String,
    pub capture_time: Option<String>,  // ISO datetime
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
    pub file_size_bytes: i64,
    pub is_processed: bool,  // true for TIFF/PNG processed versions
}

/// A group of photos that appear to be from the same dive session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoGroup {
    pub photos: Vec<ScannedPhoto>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub duration_minutes: Option<i64>,
    pub suggested_dive_id: Option<i64>,
    pub suggested_dive_number: Option<i32>,
}

/// Preview of how photos will be matched to dives
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoImportPreview {
    pub groups: Vec<PhotoGroup>,
    pub unmatched_photos: Vec<ScannedPhoto>,
    pub photos_without_time: Vec<ScannedPhoto>,
}

/// Final import assignment after user confirmation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoAssignment {
    pub file_path: String,
    pub dive_id: Option<i64>,
}

/// Scan a directory or list of files for photos and extract metadata
pub fn scan_photos(paths: &[String]) -> Result<Vec<ScannedPhoto>, String> {
    let mut photos = Vec::new();
    
    for path_str in paths {
        let path = Path::new(path_str);
        
        if path.is_dir() {
            // Scan directory for image files
            scan_directory(path, &mut photos)?;
        } else if path.is_file() {
            // Single file
            if let Some(photo) = scan_single_file(path) {
                photos.push(photo);
            }
        }
    }
    
    // Sort by capture time
    photos.sort_by(|a, b| {
        match (&a.capture_time, &b.capture_time) {
            (Some(ta), Some(tb)) => ta.cmp(tb),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.filename.cmp(&b.filename),
        }
    });
    
    Ok(photos)
}

fn scan_directory(dir: &Path, photos: &mut Vec<ScannedPhoto>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        
        if path.is_dir() {
            // Recursively scan subdirectories
            scan_directory(&path, photos)?;
        } else if is_image_file(&path) {
            if let Some(photo) = scan_single_file(&path) {
                photos.push(photo);
            }
        }
    }
    
    Ok(())
}

fn is_image_file(path: &Path) -> bool {
    let extensions = ["jpg", "jpeg", "png", "tiff", "tif", "raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2"];
    
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| extensions.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Scan a single file and extract its metadata
pub fn scan_single_file(path: &Path) -> Option<ScannedPhoto> {
    let filename = path.file_name()?.to_str()?.to_string();
    let file_path = path.to_str()?.to_string();
    
    let metadata = std::fs::metadata(path).ok()?;
    let file_size_bytes = metadata.len() as i64;
    
    // Check if this is a processed file (TIFF/PNG)
    let is_processed = is_processed_file(path);
    
    // Try to read EXIF data
    let exif_data = read_exif_data(path);
    
    Some(ScannedPhoto {
        file_path,
        filename,
        capture_time: exif_data.capture_time,
        camera_make: exif_data.camera_make,
        camera_model: exif_data.camera_model,
        lens_info: exif_data.lens_info,
        focal_length_mm: exif_data.focal_length_mm,
        aperture: exif_data.aperture,
        shutter_speed: exif_data.shutter_speed,
        iso: exif_data.iso,
        exposure_compensation: exif_data.exposure_compensation,
        white_balance: exif_data.white_balance,
        flash_fired: exif_data.flash_fired,
        metering_mode: exif_data.metering_mode,
        gps_latitude: exif_data.gps_latitude,
        gps_longitude: exif_data.gps_longitude,
        file_size_bytes,
        is_processed,
    })
}

/// Check if file is a processed version (TIFF/PNG)
fn is_processed_file(path: &Path) -> bool {
    let processed_extensions = ["tiff", "tif", "png"];
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| processed_extensions.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

#[derive(Default)]
struct ExifData {
    capture_time: Option<String>,
    camera_make: Option<String>,
    camera_model: Option<String>,
    lens_info: Option<String>,
    focal_length_mm: Option<f64>,
    aperture: Option<f64>,
    shutter_speed: Option<String>,
    iso: Option<i32>,
    exposure_compensation: Option<f64>,
    white_balance: Option<String>,
    flash_fired: Option<bool>,
    metering_mode: Option<String>,
    gps_latitude: Option<f64>,
    gps_longitude: Option<f64>,
}

/// Helper to get a field from any IFD (PRIMARY, then THUMBNAIL, then others)
fn get_field_any_ifd<'a>(exif: &'a exif::Exif, tag: Tag) -> Option<&'a exif::Field> {
    // Try PRIMARY (IFD0) first
    exif.get_field(tag, In::PRIMARY)
        // Then try THUMBNAIL (IFD1)
        .or_else(|| exif.get_field(tag, In::THUMBNAIL))
        // For DNG files, EXIF data is often in a sub-IFD
        .or_else(|| {
            // Iterate through all fields to find the tag
            exif.fields().find(|f| f.tag == tag)
        })
}

/// Read EXIF data using rexif (better DNG support)
fn read_exif_with_rexif(path: &Path) -> ExifData {
    let exif_result = rexif::parse_file(path);
    
    let entries = match exif_result {
        Ok(exif) => exif.entries,
        Err(e) => {
            log::warn!("rexif failed to parse {:?}: {:?}", path, e);
            return ExifData::default();
        }
    };
    
    log::info!("rexif found {} EXIF entries in {:?}", entries.len(), path.file_name());
    
    let mut data = ExifData::default();
    
    for entry in &entries {
        // Log exposure-related tags for debugging
        match entry.tag {
            ExifTag::FNumber | ExifTag::ApertureValue | ExifTag::ExposureTime | 
            ExifTag::ShutterSpeedValue | ExifTag::ISOSpeedRatings | ExifTag::FocalLength => {
                log::info!("  {:?}: {}", entry.tag, entry.value_more_readable);
            }
            _ => {}
        }
        
        match entry.tag {
            ExifTag::DateTimeOriginal | ExifTag::DateTime => {
                if data.capture_time.is_none() {
                    data.capture_time = parse_exif_datetime(&entry.value_more_readable);
                }
            }
            ExifTag::Make => {
                data.camera_make = Some(entry.value_more_readable.trim().to_string());
            }
            ExifTag::Model => {
                data.camera_model = Some(entry.value_more_readable.trim().to_string());
            }
            ExifTag::LensModel => {
                data.lens_info = Some(entry.value_more_readable.trim().to_string());
            }
            ExifTag::FocalLength => {
                // Format: "60 mm" or "60/1"
                let val = entry.value_more_readable.replace(" mm", "").replace("mm", "");
                if let Some(focal) = parse_rational_or_float(&val) {
                    data.focal_length_mm = Some(focal);
                }
            }
            ExifTag::FocalLengthIn35mmFilm => {
                // Prefer 35mm equivalent if available - Format: "100 mm" or "100"
                let val = entry.value_more_readable
                    .trim()
                    .replace(" mm", "")
                    .replace("mm", "");
                if let Some(focal) = parse_rational_or_float(&val) {
                    data.focal_length_mm = Some(focal);
                }
            }
            ExifTag::FNumber => {
                // Format: "f/2.8" or "2.8" or "28/10"
                let val = entry.value_more_readable
                    .trim()
                    .trim_start_matches("f/")
                    .trim_start_matches("F/");
                if let Some(aperture) = parse_rational_or_float(val) {
                    data.aperture = Some(aperture);
                }
            }
            ExifTag::ApertureValue => {
                // APEX format - only use if FNumber not available
                if data.aperture.is_none() {
                    if let Some(apex) = parse_rational_or_float(&entry.value_more_readable) {
                        // Convert APEX to f-number: f = sqrt(2^apex)
                        let fnumber = (2.0_f64).powf(apex / 2.0);
                        data.aperture = Some((fnumber * 10.0).round() / 10.0);
                    }
                }
            }
            ExifTag::ExposureTime => {
                // Format: "1/200 s" or "1/200" or "0.005"
                let val = entry.value_more_readable
                    .trim()
                    .trim_end_matches(" s")
                    .trim_end_matches("s");
                data.shutter_speed = Some(val.to_string());
            }
            ExifTag::ShutterSpeedValue => {
                // APEX format - only use if ExposureTime not available
                if data.shutter_speed.is_none() {
                    if let Some(apex) = parse_rational_or_float(&entry.value_more_readable) {
                        let time = 1.0 / (2.0_f64).powf(apex);
                        if time >= 1.0 {
                            data.shutter_speed = Some(format!("{:.1}s", time));
                        } else {
                            let denom = (1.0 / time).round() as i32;
                            data.shutter_speed = Some(format!("1/{}", denom));
                        }
                    }
                }
            }
            ExifTag::ISOSpeedRatings => {
                // Format: "ISO 250" or "250"
                let val = entry.value_more_readable
                    .trim()
                    .trim_start_matches("ISO ")
                    .trim_start_matches("ISO");
                if let Ok(iso) = val.trim().parse::<i32>() {
                    data.iso = Some(iso);
                }
            }
            ExifTag::ExposureBiasValue => {
                // Exposure compensation in stops (e.g., "+1.0", "-0.7", "0")
                if let Some(ev) = parse_rational_or_float(&entry.value_more_readable) {
                    data.exposure_compensation = Some(ev);
                }
            }
            // Note: rexif uses LightSource for white balance
            ExifTag::LightSource => {
                // White balance/light source mode
                data.white_balance = Some(entry.value_more_readable.trim().to_string());
            }
            ExifTag::Flash => {
                // Flash fired (various values, check for "fired" in string)
                let flash_str = entry.value_more_readable.to_lowercase();
                data.flash_fired = Some(flash_str.contains("fired") || flash_str.contains("yes") || flash_str.contains("on"));
            }
            ExifTag::MeteringMode => {
                // Metering mode (Spot, Center-weighted, Matrix, etc.)
                data.metering_mode = Some(entry.value_more_readable.trim().to_string());
            }
            ExifTag::GPSLatitude => {
                // GPS latitude - format varies, try to parse
                if let Some(lat) = parse_gps_coordinate(&entry.value_more_readable) {
                    data.gps_latitude = Some(lat);
                }
            }
            ExifTag::GPSLongitude => {
                // GPS longitude - format varies, try to parse
                if let Some(lon) = parse_gps_coordinate(&entry.value_more_readable) {
                    data.gps_longitude = Some(lon);
                }
            }
            _ => {}
        }
    }
    
    data
}

/// Parse GPS coordinates from EXIF (handles various formats)
fn parse_gps_coordinate(s: &str) -> Option<f64> {
    // Try direct float parse first
    if let Ok(coord) = s.trim().parse::<f64>() {
        return Some(coord);
    }
    
    // Try to parse DMS format (degrees/minutes/seconds)
    // Format examples: "37° 23' 10.8\" N" or "122/1 25/1 51/100"
    let cleaned = s.replace("°", " ").replace("'", " ").replace("\"", " ");
    let parts: Vec<&str> = cleaned.split_whitespace().collect();
    
    if parts.len() >= 3 {
        let degrees = parse_rational_or_float(parts[0])?;
        let minutes = parse_rational_or_float(parts[1])?;
        let seconds = parse_rational_or_float(parts[2])?;
        
        let decimal = degrees + minutes / 60.0 + seconds / 3600.0;
        
        // Check for direction (S and W are negative)
        let direction = parts.last().unwrap_or(&"").to_uppercase();
        if direction == "S" || direction == "W" {
            return Some(-decimal);
        }
        return Some(decimal);
    }
    
    None
}

/// Parse a string that might be a rational (like "28/10") or a float
fn parse_rational_or_float(s: &str) -> Option<f64> {
    let s = s.trim();
    if s.contains('/') {
        let parts: Vec<&str> = s.split('/').collect();
        if parts.len() == 2 {
            let num: f64 = parts[0].trim().parse().ok()?;
            let denom: f64 = parts[1].trim().parse().ok()?;
            if denom != 0.0 {
                return Some(num / denom);
            }
        }
    }
    s.parse().ok()
}

fn read_exif_data(path: &Path) -> ExifData {
    // First try rexif which has better DNG/TIFF support
    let rexif_data = read_exif_with_rexif(path);
    
    // If we got good data from rexif, use it
    if rexif_data.capture_time.is_some() || rexif_data.aperture.is_some() || rexif_data.iso.is_some() {
        return rexif_data;
    }
    
    // Fallback to kamadak-exif for JPEG files
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return rexif_data, // Return whatever rexif got
    };
    
    let mut bufreader = BufReader::new(&file);
    let exif = match ExifReader::new().read_from_container(&mut bufreader) {
        Ok(e) => e,
        Err(_) => return rexif_data,
    };
    
    // Get capture time - check multiple possible tags and IFDs
    let capture_time = rexif_data.capture_time.or_else(|| {
        get_field_any_ifd(&exif, Tag::DateTimeOriginal)
            .or_else(|| get_field_any_ifd(&exif, Tag::DateTimeDigitized))
            .or_else(|| get_field_any_ifd(&exif, Tag::DateTime))
            .and_then(|f| {
                let value = f.display_value().to_string();
                parse_exif_datetime(&value)
            })
    });
    
    // Get camera info
    let camera_make = rexif_data.camera_make.or_else(|| {
        get_field_any_ifd(&exif, Tag::Make)
            .map(|f| f.display_value().to_string().trim_matches('"').trim().to_string())
    });
    
    let camera_model = rexif_data.camera_model.or_else(|| {
        get_field_any_ifd(&exif, Tag::Model)
            .map(|f| f.display_value().to_string().trim_matches('"').trim().to_string())
    });
    
    // Get lens info
    let lens_info = rexif_data.lens_info.or_else(|| {
        get_field_any_ifd(&exif, Tag::LensModel)
            .or_else(|| get_field_any_ifd(&exif, Tag::LensSpecification))
            .map(|f| f.display_value().to_string().trim_matches('"').trim().to_string())
    });
    
    // Get focal length
    let focal_length_mm = rexif_data.focal_length_mm.or_else(|| {
        get_field_any_ifd(&exif, Tag::FocalLengthIn35mmFilm)
            .and_then(|f| {
                let val = f.display_value().to_string();
                val.split_whitespace().next()
                    .and_then(|s| s.parse::<f64>().ok())
            })
            .or_else(|| {
                get_field_any_ifd(&exif, Tag::FocalLength)
                    .and_then(|f| {
                        let val = f.display_value().to_string();
                        val.split_whitespace().next()
                            .and_then(|s| s.parse::<f64>().ok())
                    })
            })
    });
    
    // Get aperture
    let aperture = rexif_data.aperture.or_else(|| {
        get_field_any_ifd(&exif, Tag::FNumber)
            .and_then(|f| {
                let val = f.display_value().to_string();
                val.trim_start_matches("f/")
                    .split_whitespace().next()
                    .and_then(|s| s.parse::<f64>().ok())
            })
    });
    
    // Get shutter speed
    let shutter_speed = rexif_data.shutter_speed.or_else(|| {
        get_field_any_ifd(&exif, Tag::ExposureTime)
            .map(|f| {
                let val = f.display_value().to_string();
                val.trim_end_matches(" s").trim_end_matches("s").trim().to_string()
            })
    });
    
    // Get ISO
    let iso = rexif_data.iso.or_else(|| {
        get_field_any_ifd(&exif, Tag::PhotographicSensitivity)
            .or_else(|| get_field_any_ifd(&exif, Tag::StandardOutputSensitivity))
            .and_then(|f| {
                match &f.value {
                    exif::Value::Short(vals) => vals.first().map(|v| *v as i32),
                    exif::Value::Long(vals) => vals.first().map(|v| *v as i32),
                    _ => f.display_value().to_string().parse::<i32>().ok(),
                }
            })
    });
    
    // Get exposure compensation
    let exposure_compensation = rexif_data.exposure_compensation.or_else(|| {
        get_field_any_ifd(&exif, Tag::ExposureBiasValue)
            .and_then(|f| {
                let val = f.display_value().to_string();
                parse_rational_or_float(&val)
            })
    });
    
    // Get white balance
    let white_balance = rexif_data.white_balance.or_else(|| {
        get_field_any_ifd(&exif, Tag::WhiteBalance)
            .map(|f| f.display_value().to_string().trim().to_string())
    });
    
    // Get flash info
    let flash_fired = rexif_data.flash_fired.or_else(|| {
        get_field_any_ifd(&exif, Tag::Flash)
            .map(|f| {
                let flash_str = f.display_value().to_string().to_lowercase();
                flash_str.contains("fired") || flash_str.contains("yes")
            })
    });
    
    // Get metering mode
    let metering_mode = rexif_data.metering_mode.or_else(|| {
        get_field_any_ifd(&exif, Tag::MeteringMode)
            .map(|f| f.display_value().to_string().trim().to_string())
    });
    
    // Get GPS coordinates
    let gps_latitude = rexif_data.gps_latitude.or_else(|| {
        get_field_any_ifd(&exif, Tag::GPSLatitude)
            .and_then(|f| {
                let val = f.display_value().to_string();
                parse_gps_coordinate(&val)
            })
    });
    
    let gps_longitude = rexif_data.gps_longitude.or_else(|| {
        get_field_any_ifd(&exif, Tag::GPSLongitude)
            .and_then(|f| {
                let val = f.display_value().to_string();
                parse_gps_coordinate(&val)
            })
    });
    
    ExifData {
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
        flash_fired,
        metering_mode,
        gps_latitude,
        gps_longitude,
    }
}

fn parse_exif_datetime(exif_date: &str) -> Option<String> {
    // EXIF format: "2024:01:15 10:30:00" or "2024-01-15 10:30:00"
    let normalized = exif_date.replace(":", "-").replace(" ", "T");
    
    // Try parsing different formats
    let formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y:%m:%d %H:%M:%S",
    ];
    
    for format in &formats {
        if let Ok(dt) = NaiveDateTime::parse_from_str(exif_date, format) {
            return Some(dt.format("%Y-%m-%dT%H:%M:%S").to_string());
        }
    }
    
    // Try the normalized version
    if let Ok(dt) = NaiveDateTime::parse_from_str(&normalized, "%Y-%m-%dT%H-%M-%S") {
        return Some(dt.format("%Y-%m-%dT%H:%M:%S").to_string());
    }
    
    None
}

/// Group photos by time gaps - photos with >60 min gap are considered different groups
pub fn group_photos_by_time(photos: Vec<ScannedPhoto>, gap_minutes: i64) -> (Vec<PhotoGroup>, Vec<ScannedPhoto>) {
    let gap_duration = Duration::minutes(gap_minutes);
    
    let mut groups: Vec<PhotoGroup> = Vec::new();
    let mut photos_without_time: Vec<ScannedPhoto> = Vec::new();
    
    // Separate photos with and without timestamps
    let (mut timed_photos, no_time): (Vec<_>, Vec<_>) = photos.into_iter()
        .partition(|p| p.capture_time.is_some());
    
    photos_without_time.extend(no_time);
    
    if timed_photos.is_empty() {
        return (groups, photos_without_time);
    }
    
    // Sort by time
    timed_photos.sort_by(|a, b| a.capture_time.cmp(&b.capture_time));
    
    let mut current_group: Vec<ScannedPhoto> = vec![timed_photos.remove(0)];
    
    for photo in timed_photos {
        let current_last_time = current_group.last()
            .and_then(|p| p.capture_time.as_ref())
            .and_then(|t| NaiveDateTime::parse_from_str(t, "%Y-%m-%dT%H:%M:%S").ok());
        
        let photo_time = photo.capture_time.as_ref()
            .and_then(|t| NaiveDateTime::parse_from_str(t, "%Y-%m-%dT%H:%M:%S").ok());
        
        let is_same_group = match (current_last_time, photo_time) {
            (Some(last), Some(current)) => (current - last) < gap_duration,
            _ => true, // Keep in same group if we can't compare
        };
        
        if is_same_group {
            current_group.push(photo);
        } else {
            // Save current group and start new one
            groups.push(create_photo_group(current_group));
            current_group = vec![photo];
        }
    }
    
    // Don't forget the last group
    if !current_group.is_empty() {
        groups.push(create_photo_group(current_group));
    }
    
    (groups, photos_without_time)
}

fn create_photo_group(photos: Vec<ScannedPhoto>) -> PhotoGroup {
    let start_time = photos.first().and_then(|p| p.capture_time.clone());
    let end_time = photos.last().and_then(|p| p.capture_time.clone());
    
    let duration_minutes = match (&start_time, &end_time) {
        (Some(start), Some(end)) => {
            let start_dt = NaiveDateTime::parse_from_str(start, "%Y-%m-%dT%H:%M:%S").ok();
            let end_dt = NaiveDateTime::parse_from_str(end, "%Y-%m-%dT%H:%M:%S").ok();
            match (start_dt, end_dt) {
                (Some(s), Some(e)) => Some((e - s).num_minutes()),
                _ => None,
            }
        },
        _ => None,
    };
    
    PhotoGroup {
        photos,
        start_time,
        end_time,
        duration_minutes,
        suggested_dive_id: None,
        suggested_dive_number: None,
    }
}

/// Match photo groups to dives using relative ordering
/// This doesn't rely on absolute timestamps, just the order of groups matching order of dives
pub fn match_groups_to_dives(
    mut groups: Vec<PhotoGroup>,
    dives: &[Dive],
) -> Vec<PhotoGroup> {
    if groups.is_empty() || dives.is_empty() {
        return groups;
    }
    
    // Sort dives by dive number (chronological order)
    let mut sorted_dives: Vec<&Dive> = dives.iter().collect();
    sorted_dives.sort_by_key(|d| d.dive_number);
    
    // Simple 1:1 matching based on order
    // First group of photos -> First dive, etc.
    for (i, group) in groups.iter_mut().enumerate() {
        if i < sorted_dives.len() {
            group.suggested_dive_id = Some(sorted_dives[i].id);
            group.suggested_dive_number = Some(sorted_dives[i].dive_number);
        }
    }
    
    groups
}

/// Create a preview of how photos will be imported
pub fn create_import_preview(
    paths: &[String],
    dives: &[Dive],
    gap_minutes: i64,
) -> Result<PhotoImportPreview, String> {
    // Scan all photos
    let photos = scan_photos(paths)?;
    
    // Group by time
    let (mut groups, photos_without_time) = group_photos_by_time(photos, gap_minutes);
    
    // Match to dives
    groups = match_groups_to_dives(groups, dives);
    
    // Find unmatched (groups beyond number of dives)
    let dive_count = dives.len();
    let unmatched_photos: Vec<ScannedPhoto> = groups.iter()
        .skip(dive_count)
        .flat_map(|g| g.photos.clone())
        .collect();
    
    // Keep only matched groups
    groups.truncate(dive_count);
    
    Ok(PhotoImportPreview {
        groups,
        unmatched_photos,
        photos_without_time,
    })
}

/// Get the thumbnails directory path
pub fn get_thumbnails_dir() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Pelagic");
    path.push("thumbnails");
    std::fs::create_dir_all(&path).ok();
    path
}

/// Generate a thumbnail for an image file
pub fn generate_thumbnail(source_path: &Path, photo_id: i64) -> Option<String> {
    let thumb_dir = get_thumbnails_dir();
    let thumb_filename = format!("{}.jpg", photo_id);
    let thumb_path = thumb_dir.join(&thumb_filename);
    
    // Try to load and resize the image
    // For RAW files, try to extract embedded JPEG first
    let image = if is_raw_file(source_path) {
        extract_raw_thumbnail(source_path)
    } else {
        image::open(source_path).ok()
    };
    
    if let Some(img) = image {
        // Resize to max 400px on longest side, maintaining aspect ratio
        let thumb = img.thumbnail(400, 400);
        
        if thumb.save_with_format(&thumb_path, ImageFormat::Jpeg).is_ok() {
            return Some(thumb_path.to_string_lossy().to_string());
        }
    }
    
    None
}

/// Check if a file is a RAW image format
fn is_raw_file(path: &Path) -> bool {
    let raw_extensions = ["raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2", "raf", "pef"];
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| raw_extensions.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Try to extract embedded JPEG thumbnail from RAW file
fn extract_raw_thumbnail(path: &Path) -> Option<DynamicImage> {
    // Most RAW files (including DNG) contain an embedded JPEG preview
    // Limit file size to avoid hanging on huge files
    let metadata = std::fs::metadata(path).ok()?;
    if metadata.len() > 100_000_000 {
        // Skip files larger than 100MB
        return None;
    }
    
    // First, try to read the file and look for JPEG markers
    let data = std::fs::read(path).ok()?;
    
    // Look for embedded JPEG - use load_from_memory which auto-detects format
    if let Some(jpeg_data) = find_embedded_jpeg(&data) {
        if let Ok(img) = image::load_from_memory(jpeg_data) {
            return Some(img);
        }
    }
    
    None
}

/// Search for embedded JPEG in RAW file data (public for fallback use)
pub fn find_embedded_jpeg(data: &[u8]) -> Option<&[u8]> {
    let len = data.len();
    if len < 1000 {
        return None;
    }
    
    // Find JPEG by looking for SOI (FFD8) and EOI (FFD9) markers
    // Be permissive - just look for FFD8 followed eventually by FFD9
    let mut best_start = 0;
    let mut best_end = 0;
    let mut best_size = 0usize;
    
    let mut i = 0;
    while i < len.saturating_sub(2) {
        // Look for JPEG SOI marker (0xFFD8)
        if data[i] == 0xFF && data[i + 1] == 0xD8 {
            let start = i;
            
            // Find the matching EOI (0xFFD9)
            let mut j = i + 2;
            while j < len.saturating_sub(1) {
                if data[j] == 0xFF && data[j + 1] == 0xD9 {
                    let size = j - start + 2;
                    // Keep the largest JPEG that's at least 10KB (skip tiny thumbnails)
                    if size > best_size && size > 10_000 {
                        best_start = start;
                        best_end = j + 2;
                        best_size = size;
                    }
                    break;
                }
                j += 1;
            }
            // Move past this potential JPEG
            i = if j > i + 2 { j + 1 } else { i + 1 };
        } else {
            i += 1;
        }
        
        // Stop after checking first 60MB to avoid being too slow
        if i > 60_000_000 {
            break;
        }
    }
    
    if best_size > 0 {
        Some(&data[best_start..best_end])
    } else {
        None
    }
}

/// Import photos to the database with the given assignments
/// If overwrite is true, existing photos with the same file_path will be deleted first
pub fn import_photos(
    db: &Database,
    trip_id: i64,
    assignments: Vec<PhotoAssignment>,
    overwrite: bool,
) -> Result<i64, String> {
    let mut count = 0;
    // Maps base filename -> (photo_id, dive_id) for matching processed to RAW
    let mut raw_photo_map: std::collections::HashMap<String, (i64, Option<i64>)> = std::collections::HashMap::new();
    
    // If overwrite mode, delete existing photos first
    if overwrite {
        for assignment in &assignments {
            db.delete_photo_by_path(&assignment.file_path)
                .map_err(|e| format!("Failed to delete existing photo: {}", e))?;
        }
    }
    
    // First pass: import all RAW files (and JPEGs which aren't "processed")
    for assignment in &assignments {
        let path = Path::new(&assignment.file_path);
        
        if let Some(photo) = scan_single_file(path) {
            if !photo.is_processed {
                // Insert RAW photo
                let photo_id = db.insert_photo_full(
                    trip_id,
                    assignment.dive_id,
                    &photo.file_path,
                    &photo.filename,
                    photo.capture_time.as_deref(),
                    photo.camera_make.as_deref(),
                    photo.camera_model.as_deref(),
                    photo.lens_info.as_deref(),
                    photo.focal_length_mm,
                    photo.aperture,
                    photo.shutter_speed.as_deref(),
                    photo.iso,
                    photo.file_size_bytes,
                    false,
                    None,
                    photo.exposure_compensation,
                    photo.white_balance.as_deref(),
                    photo.flash_fired,
                    photo.metering_mode.as_deref(),
                    photo.gps_latitude,
                    photo.gps_longitude,
                ).map_err(|e| format!("Failed to insert photo: {}", e))?;
                
                // Generate thumbnail from RAW
                if let Some(thumb_path) = generate_thumbnail(path, photo_id) {
                    db.update_photo_thumbnail(photo_id, &thumb_path)
                        .map_err(|e| format!("Failed to update thumbnail: {}", e))?;
                }
                
                // Store base filename -> (photo_id, dive_id) mapping
                let base_name = get_base_filename(&photo.filename);
                raw_photo_map.insert(base_name, (photo_id, assignment.dive_id));
                
                count += 1;
            }
        }
    }
    
    // Second pass: import processed files (TIFF/PNG) and link to their RAW
    for assignment in &assignments {
        let path = Path::new(&assignment.file_path);
        
        if let Some(photo) = scan_single_file(path) {
            if photo.is_processed {
                // Find matching RAW photo by base filename
                let base_name = get_base_filename(&photo.filename);
                
                // First check the current import batch
                let (raw_photo_id, raw_dive_id) = if let Some((id, dive)) = raw_photo_map.get(&base_name) {
                    (Some(*id), *dive)
                } else {
                    // If not found in current batch, check the database for existing RAW photos
                    match db.find_photo_by_base_filename(trip_id, &base_name) {
                        Ok(Some(existing_raw)) => (Some(existing_raw.id), existing_raw.dive_id),
                        _ => (None, assignment.dive_id)
                    }
                };
                
                // Use the RAW's dive_id if we found a match, otherwise use assignment
                let dive_id = raw_dive_id.or(assignment.dive_id);
                
                // Insert processed photo linked to RAW
                let photo_id = db.insert_photo_full(
                    trip_id,
                    dive_id,
                    &photo.file_path,
                    &photo.filename,
                    photo.capture_time.as_deref(),
                    photo.camera_make.as_deref(),
                    photo.camera_model.as_deref(),
                    photo.lens_info.as_deref(),
                    photo.focal_length_mm,
                    photo.aperture,
                    photo.shutter_speed.as_deref(),
                    photo.iso,
                    photo.file_size_bytes,
                    true,
                    raw_photo_id,
                    photo.exposure_compensation,
                    photo.white_balance.as_deref(),
                    photo.flash_fired,
                    photo.metering_mode.as_deref(),
                    photo.gps_latitude,
                    photo.gps_longitude,
                ).map_err(|e| format!("Failed to insert photo: {}", e))?;
                
                // Generate thumbnail from processed version
                if let Some(thumb_path) = generate_thumbnail(path, photo_id) {
                    db.update_photo_thumbnail(photo_id, &thumb_path)
                        .map_err(|e| format!("Failed to update thumbnail: {}", e))?;
                }
                
                count += 1;
            }
        }
    }
    
    Ok(count)
}

/// Get base filename without extension (for matching RAW to processed)
fn get_base_filename(filename: &str) -> String {
    Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename)
        .to_lowercase()
}

/// Decode a RAW file (DNG, CR2, NEF, etc.) to JPEG bytes
/// This actually processes the raw sensor data, not just extracting the embedded preview
pub fn decode_raw_to_jpeg(path: &Path) -> Result<Vec<u8>, String> {
    use rawloader::RawLoader;
    use imagepipe::{Pipeline, ImageSource};
    
    // Load the RAW file
    let raw_image = RawLoader::new()
        .decode_file(path)
        .map_err(|e| format!("Failed to decode RAW file: {}", e))?;
    
    // Create processing pipeline
    let source = ImageSource::Raw(raw_image);
    let mut pipeline = Pipeline::new_from_source(source)
        .map_err(|e| format!("Failed to create pipeline: {}", e))?;
    
    // Process the image (demosaic, color correction, etc.)
    let processed = pipeline.output_8bit(None)
        .map_err(|e| format!("Failed to process RAW: {}", e))?;
    
    // Convert to image::DynamicImage
    let img = image::RgbImage::from_raw(
        processed.width as u32,
        processed.height as u32,
        processed.data,
    ).ok_or_else(|| "Failed to create image from processed data".to_string())?;
    
    let dynamic_img = DynamicImage::ImageRgb8(img);
    
    // Encode to JPEG
    let mut jpeg_bytes = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
    dynamic_img.write_to(&mut cursor, ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
    
    Ok(jpeg_bytes)
}

/// Extract embedded JPEG from RAW file data (public wrapper)
#[allow(dead_code)]
pub fn extract_embedded_jpeg(data: &[u8]) -> Option<Vec<u8>> {
    find_embedded_jpeg(data).map(|slice| slice.to_vec())
}
