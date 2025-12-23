use std::env;
use std::path::Path;
use std::fs::File;
use std::io::{BufReader, Cursor};
use rexif::ExifTag;
use exif::{Tag, In, Reader as ExifReader};

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        println!("Usage: dump_exif <file_path>");
        return;
    }
    
    let path = Path::new(&args[1]);
    println!("=== Inspecting: {:?} ===\n", path);
    
    // Check for special file types
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if ext == "orf" {
        println!("=== ORF FILE DETECTED - Using patched header approach ===\n");
        test_orf_patched(path);
        return;
    }
    
    if ext == "cr3" {
        println!("=== CR3 FILE DETECTED - Searching for embedded TIFF ===\n");
        test_cr3_embedded(path);
        return;
    }
    
    // Try rexif first
    println!("=== REXIF ===");
    match rexif::parse_file(path) {
        Ok(exif) => {
            println!("Found {} entries total\n", exif.entries.len());
            for entry in &exif.entries {
                match entry.tag {
                    ExifTag::FNumber | ExifTag::ApertureValue | 
                    ExifTag::ExposureTime | ExifTag::ShutterSpeedValue |
                    ExifTag::ISOSpeedRatings | ExifTag::FocalLength |
                    ExifTag::FocalLengthIn35mmFilm | ExifTag::Make |
                    ExifTag::Model | ExifTag::DateTime | ExifTag::DateTimeOriginal |
                    ExifTag::LensModel => {
                        println!("  {:?}: '{}'", entry.tag, entry.value_more_readable);
                    }
                    _ => {}
                }
            }
        }
        Err(e) => {
            println!("rexif error: {:?}", e);
        }
    }
    
    // Try kamadak-exif
    println!("\n=== KAMADAK-EXIF ===");
    match File::open(path) {
        Ok(file) => {
            let mut bufreader = BufReader::new(&file);
            match ExifReader::new().read_from_container(&mut bufreader) {
                Ok(exif) => {
                    println!("Found {} fields total\n", exif.fields().count());
                    
                    // Print exposure-related fields
                    let tags = [
                        Tag::Make, Tag::Model, Tag::DateTime, Tag::DateTimeOriginal,
                        Tag::FNumber, Tag::ExposureTime, Tag::PhotographicSensitivity,
                        Tag::FocalLength, Tag::FocalLengthIn35mmFilm, Tag::LensModel,
                        Tag::ExposureBiasValue, Tag::Flash, Tag::MeteringMode, Tag::WhiteBalance,
                    ];
                    
                    for tag in &tags {
                        if let Some(field) = exif.get_field(*tag, In::PRIMARY) {
                            println!("  {:?}: '{}'", tag, field.display_value());
                        } else if let Some(field) = exif.fields().find(|f| f.tag == *tag) {
                            println!("  {:?} (other IFD): '{}'", tag, field.display_value());
                        }
                    }
                }
                Err(e) => {
                    println!("kamadak-exif error: {:?}", e);
                }
            }
        }
        Err(e) => {
            println!("Failed to open file: {:?}", e);
        }
    }
}

fn test_orf_patched(path: &Path) {
    // Read the entire file
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(e) => {
            println!("Failed to read file: {:?}", e);
            return;
        }
    };
    
    println!("File size: {} bytes", data.len());
    println!("First 16 bytes: {:02X?}", &data[..16.min(data.len())]);
    
    // Check ORF signature
    if data.len() < 8 || data[0..4] != [0x49, 0x49, 0x52, 0x4F] {
        println!("Not a valid ORF file (expected IIRO header)");
        return;
    }
    
    println!("ORF header verified: IIRO");
    
    // Create patched copy
    let mut patched = data.clone();
    patched[2] = 0x2A; // Replace 'R' with '*'
    patched[3] = 0x00; // Replace 'O' with null
    
    println!("Patched header: {:02X?}", &patched[..16.min(patched.len())]);
    
    // Try kamadak-exif with patched buffer
    println!("\n=== KAMADAK-EXIF (patched header) ===");
    let mut cursor = Cursor::new(&patched);
    match ExifReader::new().read_from_container(&mut cursor) {
        Ok(exif) => {
            println!("SUCCESS! Found {} fields\n", exif.fields().count());
            
            // Print all fields for debugging
            for field in exif.fields() {
                println!("  [{:?}] {:?}: '{}'", field.ifd_num, field.tag, field.display_value());
            }
        }
        Err(e) => {
            println!("kamadak-exif error: {:?}", e);
        }
    }
    
    // Try rexif with patched buffer
    println!("\n=== REXIF (patched header) ===");
    match rexif::parse_buffer(&patched) {
        Ok(exif) => {
            println!("SUCCESS! Found {} entries\n", exif.entries.len());
            
            // Print relevant fields
            for entry in &exif.entries {
                match entry.tag {
                    ExifTag::FNumber | ExifTag::ApertureValue | 
                    ExifTag::ExposureTime | ExifTag::ShutterSpeedValue |
                    ExifTag::ISOSpeedRatings | ExifTag::FocalLength |
                    ExifTag::FocalLengthIn35mmFilm | ExifTag::Make |
                    ExifTag::Model | ExifTag::DateTime | ExifTag::DateTimeOriginal |
                    ExifTag::LensModel | ExifTag::ExposureBiasValue |
                    ExifTag::Flash | ExifTag::MeteringMode | ExifTag::WhiteBalanceMode => {
                        println!("  {:?}: '{}'", entry.tag, entry.value_more_readable);
                    }
                    _ => {}
                }
            }
        }
        Err(e) => {
            println!("rexif error: {:?}", e);
        }
    }
}

fn test_cr3_embedded(path: &Path) {
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(e) => {
            println!("Failed to read file: {:?}", e);
            return;
        }
    };
    
    println!("File size: {} bytes", data.len());
    println!("First 32 bytes: {:02X?}", &data[..32.min(data.len())]);
    
    // Search for TIFF headers
    let mut found_count = 0;
    for i in 0..data.len().saturating_sub(8) {
        let is_little_endian = data[i] == 0x49 && data[i+1] == 0x49 && data[i+2] == 0x2A && data[i+3] == 0x00;
        let is_big_endian = data[i] == 0x4D && data[i+1] == 0x4D && data[i+2] == 0x00 && data[i+3] == 0x2A;
        
        if is_little_endian || is_big_endian {
            found_count += 1;
            let endian = if is_little_endian { "LE" } else { "BE" };
            println!("\n=== Found TIFF {} header at offset {} ===", endian, i);
            
            // Extract chunk and try to parse
            let end = std::cmp::min(i + 65536, data.len());
            let tiff_data = &data[i..end];
            
            println!("TIFF chunk size: {} bytes", tiff_data.len());
            println!("First 16 bytes of chunk: {:02X?}", &tiff_data[..16.min(tiff_data.len())]);
            
            // Try rexif
            println!("\n--- REXIF on chunk ---");
            match rexif::parse_buffer(tiff_data) {
                Ok(exif) => {
                    println!("SUCCESS! Found {} entries", exif.entries.len());
                    
                    // Check for camera info
                    let has_camera = exif.entries.iter().any(|e| 
                        matches!(e.tag, ExifTag::Make | ExifTag::Model | ExifTag::DateTimeOriginal)
                    );
                    println!("Has camera info: {}", has_camera);
                    
                    // Print relevant fields
                    for entry in &exif.entries {
                        match entry.tag {
                            ExifTag::FNumber | ExifTag::ApertureValue | 
                            ExifTag::ExposureTime | ExifTag::ShutterSpeedValue |
                            ExifTag::ISOSpeedRatings | ExifTag::FocalLength |
                            ExifTag::FocalLengthIn35mmFilm | ExifTag::Make |
                            ExifTag::Model | ExifTag::DateTime | ExifTag::DateTimeOriginal |
                            ExifTag::LensModel | ExifTag::ExposureBiasValue |
                            ExifTag::Flash | ExifTag::MeteringMode | ExifTag::WhiteBalanceMode => {
                                println!("  {:?}: '{}'", entry.tag, entry.value_more_readable);
                            }
                            _ => {}
                        }
                    }
                    
                    if has_camera {
                        println!("\n*** This is the main EXIF block! ***");
                    }
                }
                Err(e) => {
                    println!("rexif error: {:?}", e);
                }
            }
            
            // Try kamadak-exif
            println!("\n--- KAMADAK-EXIF on chunk ---");
            match ExifReader::new().read_raw(tiff_data.to_vec()) {
                Ok(exif) => {
                    println!("SUCCESS! Found {} fields", exif.fields().count());
                    
                    let tags = [
                        Tag::Make, Tag::Model, Tag::DateTime, Tag::DateTimeOriginal,
                        Tag::FNumber, Tag::ExposureTime, Tag::PhotographicSensitivity,
                        Tag::FocalLength, Tag::FocalLengthIn35mmFilm, Tag::LensModel,
                        Tag::ExposureBiasValue, Tag::Flash, Tag::MeteringMode, Tag::WhiteBalance,
                    ];
                    
                    for tag in &tags {
                        if let Some(field) = exif.get_field(*tag, In::PRIMARY) {
                            println!("  {:?}: '{}'", tag, field.display_value());
                        } else if let Some(field) = exif.fields().find(|f| f.tag == *tag) {
                            println!("  {:?} (other IFD): '{}'", tag, field.display_value());
                        }
                    }
                }
                Err(e) => {
                    println!("kamadak-exif error: {:?}", e);
                }
            }
            
            // Only show first 5 TIFF blocks
            if found_count >= 5 {
                println!("\n... stopping after 5 TIFF blocks ...");
                break;
            }
        }
        
        // Limit search
        if i > 2_000_000 {
            break;
        }
    }
    
    if found_count == 0 {
        println!("No TIFF headers found in first 2MB");
    }
}
