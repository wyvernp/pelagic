use std::env;
use std::path::Path;
use rexif::ExifTag;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        println!("Usage: dump_exif <file_path>");
        return;
    }
    
    let path = Path::new(&args[1]);
    println!("=== Inspecting: {:?} ===\n", path);
    
    // Try rexif
    println!("=== REXIF - Exposure Data ===");
    match rexif::parse_file(path) {
        Ok(exif) => {
            println!("Found {} entries total\n", exif.entries.len());
            
            println!("--- Raw Values ---");
            for entry in &exif.entries {
                match entry.tag {
                    ExifTag::FNumber | ExifTag::ApertureValue | 
                    ExifTag::ExposureTime | ExifTag::ShutterSpeedValue |
                    ExifTag::ISOSpeedRatings | ExifTag::FocalLength |
                    ExifTag::FocalLengthIn35mmFilm | ExifTag::Make |
                    ExifTag::Model | ExifTag::DateTime | ExifTag::DateTimeOriginal => {
                        println!("  {:?}: '{}'", entry.tag, entry.value_more_readable);
                    }
                    _ => {}
                }
            }
            
            println!("\n--- Parsed Values ---");
            for entry in &exif.entries {
                match entry.tag {
                    ExifTag::FNumber => {
                        let val = entry.value_more_readable
                            .trim()
                            .trim_start_matches("f/")
                            .trim_start_matches("F/");
                        if let Some(aperture) = parse_rational_or_float(val) {
                            println!("  Aperture: f/{}", aperture);
                        } else {
                            println!("  Aperture: PARSE FAILED from '{}'", entry.value_more_readable);
                        }
                    }
                    ExifTag::ExposureTime => {
                        let val = entry.value_more_readable
                            .trim()
                            .trim_end_matches(" s")
                            .trim_end_matches("s");
                        println!("  Shutter: {}", val);
                    }
                    ExifTag::ISOSpeedRatings => {
                        let val = entry.value_more_readable
                            .trim()
                            .trim_start_matches("ISO ")
                            .trim_start_matches("ISO");
                        if let Ok(iso) = val.trim().parse::<i32>() {
                            println!("  ISO: {}", iso);
                        } else {
                            println!("  ISO: PARSE FAILED from '{}'", entry.value_more_readable);
                        }
                    }
                    ExifTag::FocalLengthIn35mmFilm => {
                        let val = entry.value_more_readable
                            .trim()
                            .replace(" mm", "")
                            .replace("mm", "");
                        if let Some(focal) = parse_rational_or_float(&val) {
                            println!("  Focal Length (35mm eq): {}mm", focal);
                        } else {
                            println!("  Focal Length: PARSE FAILED from '{}'", entry.value_more_readable);
                        }
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
