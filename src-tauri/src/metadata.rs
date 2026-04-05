//! XMP metadata writing for photos.
//!
//! Writes rating, species tags, and general tags both:
//!   1. **Embedded** directly into the image file (JPEG, PNG, TIFF) — so the
//!      metadata travels with the file and is readable by any photo app.
//!   2. **Sidecar** `.xmp` file alongside the image — as a universal fallback
//!      and for formats we can't safely modify (PSD, RAW, etc.).
//!
//! The embedded approach writes an XMP packet into the file's native metadata
//! container (JPEG APP1 marker, PNG iTXt chunk, TIFF tag 700). This is the
//! same mechanism Adobe products, darktable, and other editors use.

use crate::db::{Db, Dive, DiveSample, GeneralTag, Photo, SpeciesTag};
use log;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Dive context information for a photo, computed from the dive profile.
#[derive(Debug, Clone, Serialize)]
pub struct PhotoDiveContext {
    pub depth_at_capture_m: Option<f64>,
    pub temp_at_capture_c: Option<f64>,
    pub time_into_dive_seconds: Option<i32>,
    pub dive_date: String,
    pub dive_time: String,
    pub dive_duration_seconds: i32,
    pub max_depth_m: f64,
    pub mean_depth_m: f64,
    pub water_temp_c: Option<f64>,
    pub dive_location: Option<String>,
    pub dive_site: Option<String>,
}

/// Compute dive context for a photo by interpolating the dive profile.
pub fn compute_photo_dive_context(
    photo: &Photo,
    dive: &Dive,
    samples: &[DiveSample],
) -> PhotoDiveContext {
    let mut ctx = PhotoDiveContext {
        depth_at_capture_m: None,
        temp_at_capture_c: None,
        time_into_dive_seconds: None,
        dive_date: dive.date.clone(),
        dive_time: dive.time.clone(),
        dive_duration_seconds: dive.duration_seconds,
        max_depth_m: dive.max_depth_m,
        mean_depth_m: dive.mean_depth_m,
        water_temp_c: dive.water_temp_c,
        dive_location: dive.location.clone(),
        dive_site: dive.location.clone(),
    };

    // Try to compute depth at capture time
    if let Some(ref capture_time) = photo.capture_time {
        if let Some(elapsed) = compute_elapsed_seconds(capture_time, &dive.date, &dive.time) {
            // Only if the photo was taken during the dive (with some tolerance)
            if elapsed >= -30 && elapsed <= dive.duration_seconds as i64 + 60 {
                let elapsed_i32 = elapsed.max(0) as i32;
                ctx.time_into_dive_seconds = Some(elapsed_i32);
                ctx.depth_at_capture_m = interpolate_value(samples, elapsed_i32, |s| Some(s.depth_m));
                ctx.temp_at_capture_c = interpolate_value(samples, elapsed_i32, |s| s.temp_c);
            }
        }
    }

    ctx
}

/// Parse a capture time and dive start, returning elapsed seconds since dive start.
fn compute_elapsed_seconds(capture_time: &str, dive_date: &str, dive_time: &str) -> Option<i64> {
    // Parse dive start: "2025-01-15" + "10:30:00" → naive datetime
    let dive_start_str = format!("{}T{}", dive_date, dive_time);
    let dive_start = parse_naive_datetime(&dive_start_str)?;
    let photo_time = parse_naive_datetime(capture_time)?;
    Some(photo_time - dive_start)
}

/// Parse an ISO-ish datetime string into seconds since epoch (naive, no timezone).
/// Handles: "2025-01-15T10:30:00", "2025-01-15 10:30:00", "2025-01-15T10:30:00.000"
fn parse_naive_datetime(s: &str) -> Option<i64> {
    let s = s.trim();
    // Strip timezone suffix if present (e.g., "+00:00", "Z")
    let s = s.trim_end_matches('Z');
    let s = if let Some(pos) = s.rfind('+') {
        if pos > 10 { &s[..pos] } else { s }
    } else if let Some(pos) = s.rfind('-') {
        // Only strip if it's a timezone offset (after the time part)
        if pos > 16 { &s[..pos] } else { s }
    } else {
        s
    };

    let parts: Vec<&str> = s.splitn(2, |c| c == 'T' || c == ' ').collect();
    if parts.len() != 2 {
        return None;
    }

    let date_parts: Vec<i64> = parts[0].split('-').filter_map(|p| p.parse().ok()).collect();
    if date_parts.len() != 3 {
        return None;
    }
    let (year, month, day) = (date_parts[0], date_parts[1], date_parts[2]);

    // Strip fractional seconds
    let time_str = parts[1].split('.').next().unwrap_or(parts[1]);
    let time_parts: Vec<i64> = time_str.split(':').filter_map(|p| p.parse().ok()).collect();
    if time_parts.len() < 2 {
        return None;
    }
    let (hour, min) = (time_parts[0], time_parts[1]);
    let sec = if time_parts.len() >= 3 { time_parts[2] } else { 0 };

    // Simple days-since-epoch calculation (good enough for computing differences)
    let days = days_from_civil(year, month, day);
    Some(days * 86400 + hour * 3600 + min * 60 + sec)
}

/// Convert a civil date to days since epoch (algorithm from Howard Hinnant).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as i64;
    let m = month;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// Linearly interpolate a value from dive samples at a given time.
fn interpolate_value<F>(samples: &[DiveSample], time_seconds: i32, extract: F) -> Option<f64>
where
    F: Fn(&DiveSample) -> Option<f64>,
{
    if samples.is_empty() {
        return None;
    }

    // Find the two samples that bracket the requested time
    let mut prev: Option<&DiveSample> = None;
    for sample in samples {
        if sample.time_seconds == time_seconds {
            return extract(sample).or_else(|| Some(sample.depth_m));
        }
        if sample.time_seconds > time_seconds {
            if let Some(p) = prev {
                // Interpolate between prev and current
                let t_range = (sample.time_seconds - p.time_seconds) as f64;
                let t_offset = (time_seconds - p.time_seconds) as f64;
                let ratio = if t_range > 0.0 { t_offset / t_range } else { 0.0 };

                let v1 = extract(p);
                let v2 = extract(sample);
                match (v1, v2) {
                    (Some(a), Some(b)) => return Some(a + (b - a) * ratio),
                    (Some(a), None) => return Some(a),
                    (None, Some(b)) => return Some(b),
                    (None, None) => return None,
                }
            } else {
                // Before first sample — use the first sample's value
                return extract(sample);
            }
        }
        prev = Some(sample);
    }

    // After last sample — use the last sample's value
    prev.and_then(|p| extract(p))
}

/// File extensions that support embedded XMP writing.
const EMBEDDABLE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "tif", "tiff", "dng"];

/// Get the XMP sidecar path for a given photo file path.
/// e.g., `/photos/IMG_1234.CR3` → `/photos/IMG_1234.xmp`
fn xmp_sidecar_path(photo_path: &str) -> PathBuf {
    let p = Path::new(photo_path);
    p.with_extension("xmp")
}

/// XML-escape a string for safe inclusion in XMP.
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Build a complete XMP sidecar document from the given metadata.
fn build_xmp_document(
    rating: Option<i32>,
    species_tags: &[SpeciesTag],
    general_tags: &[GeneralTag],
    dive_context: Option<&PhotoDiveContext>,
    caption: Option<&str>,
) -> String {
    let mut xmp = String::new();

    xmp.push_str(r#"<?xml version="1.0" encoding="UTF-8"?>"#);
    xmp.push('\n');
    xmp.push_str(r#"<x:xmpmeta xmlns:x="adobe:ns:meta/">"#);
    xmp.push('\n');
    xmp.push_str(r#" <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">"#);
    xmp.push('\n');
    xmp.push_str(r#"  <rdf:Description"#);
    xmp.push('\n');
    xmp.push_str(r#"    xmlns:xmp="http://ns.adobe.com/xap/1.0/""#);
    xmp.push('\n');
    xmp.push_str(r#"    xmlns:dc="http://purl.org/dc/elements/1.1/""#);
    xmp.push('\n');
    xmp.push_str(r#"    xmlns:lr="http://ns.adobe.com/lightroom/1.0/""#);
    xmp.push('\n');
    xmp.push_str(r#"    xmlns:digiKam="http://www.digikam.org/ns/1.0/""#);
    xmp.push('\n');
    xmp.push_str(r#"    xmlns:pelagic="http://pelagic.app/ns/1.0/">"#);
    xmp.push('\n');

    // Rating (XMP standard: xmp:Rating, 0-5)
    if let Some(r) = rating {
        xmp.push_str(&format!("   <xmp:Rating>{}</xmp:Rating>\n", r));
    }

    // Caption / description (dc:description)
    if let Some(cap) = caption {
        if !cap.is_empty() {
            xmp.push_str("   <dc:description>\n");
            xmp.push_str("    <rdf:Alt>\n");
            xmp.push_str(&format!("     <rdf:li xml:lang=\"x-default\">{}</rdf:li>\n", xml_escape(cap)));
            xmp.push_str("    </rdf:Alt>\n");
            xmp.push_str("   </dc:description>\n");
        }
    }

    // Collect all keywords: general tags + species names
    let mut keywords: Vec<String> = Vec::new();
    for tag in general_tags {
        keywords.push(tag.name.clone());
    }
    for tag in species_tags {
        keywords.push(tag.name.clone());
        // Also add scientific name as a separate keyword if present
        if let Some(ref sci) = tag.scientific_name {
            if !sci.is_empty() {
                keywords.push(sci.clone());
            }
        }
    }

    // dc:subject — Dublin Core subject/keywords (the universal standard for tags)
    // This is what Lightroom, Capture One, darktable, etc. all read
    if !keywords.is_empty() {
        xmp.push_str("   <dc:subject>\n");
        xmp.push_str("    <rdf:Bag>\n");
        for kw in &keywords {
            xmp.push_str(&format!("     <rdf:li>{}</rdf:li>\n", xml_escape(kw)));
        }
        xmp.push_str("    </rdf:Bag>\n");
        xmp.push_str("   </dc:subject>\n");
    }

    // Lightroom hierarchical keywords (lr:hierarchicalSubject)
    // Species get stored as "Species|Category|Name" for Lightroom hierarchy
    let mut hierarchical: Vec<String> = Vec::new();
    for tag in general_tags {
        hierarchical.push(format!("Pelagic|{}", tag.name));
    }
    for tag in species_tags {
        if let Some(ref cat) = tag.category {
            if !cat.is_empty() {
                hierarchical.push(format!("Species|{}|{}", cat, tag.name));
            } else {
                hierarchical.push(format!("Species|{}", tag.name));
            }
        } else {
            hierarchical.push(format!("Species|{}", tag.name));
        }
    }

    if !hierarchical.is_empty() {
        xmp.push_str("   <lr:hierarchicalSubject>\n");
        xmp.push_str("    <rdf:Bag>\n");
        for h in &hierarchical {
            xmp.push_str(&format!("     <rdf:li>{}</rdf:li>\n", xml_escape(h)));
        }
        xmp.push_str("    </rdf:Bag>\n");
        xmp.push_str("   </lr:hierarchicalSubject>\n");
    }

    // Dive context metadata (Pelagic custom namespace)
    if let Some(ctx) = dive_context {
        if let Some(depth) = ctx.depth_at_capture_m {
            xmp.push_str(&format!("   <pelagic:depthAtCapture>{:.1}</pelagic:depthAtCapture>\n", depth));
        }
        if let Some(temp) = ctx.temp_at_capture_c {
            xmp.push_str(&format!("   <pelagic:tempAtCapture>{:.1}</pelagic:tempAtCapture>\n", temp));
        }
        if let Some(time_in) = ctx.time_into_dive_seconds {
            let mins = time_in / 60;
            let secs = time_in % 60;
            xmp.push_str(&format!("   <pelagic:timeIntoDive>{}:{:02}</pelagic:timeIntoDive>\n", mins, secs));
        }
        xmp.push_str(&format!("   <pelagic:diveDate>{}</pelagic:diveDate>\n", xml_escape(&ctx.dive_date)));
        xmp.push_str(&format!("   <pelagic:diveMaxDepth>{:.1}</pelagic:diveMaxDepth>\n", ctx.max_depth_m));
        xmp.push_str(&format!("   <pelagic:diveMeanDepth>{:.1}</pelagic:diveMeanDepth>\n", ctx.mean_depth_m));
        xmp.push_str(&format!("   <pelagic:diveDuration>{}</pelagic:diveDuration>\n", ctx.dive_duration_seconds));
        if let Some(ref loc) = ctx.dive_location {
            xmp.push_str(&format!("   <pelagic:diveLocation>{}</pelagic:diveLocation>\n", xml_escape(loc)));
        }
        if let Some(temp) = ctx.water_temp_c {
            xmp.push_str(&format!("   <pelagic:waterTemp>{:.1}</pelagic:waterTemp>\n", temp));
        }
    }

    // Pelagic-specific structured data (for round-tripping without data loss)
    if !species_tags.is_empty() {
        xmp.push_str("   <pelagic:speciesTags>\n");
        xmp.push_str("    <rdf:Bag>\n");
        for tag in species_tags {
            let sci = tag
                .scientific_name
                .as_deref()
                .unwrap_or("");
            let cat = tag.category.as_deref().unwrap_or("");
            xmp.push_str(&format!(
                "     <rdf:li>{} | {} | {}</rdf:li>\n",
                xml_escape(&tag.name),
                xml_escape(sci),
                xml_escape(cat)
            ));
        }
        xmp.push_str("    </rdf:Bag>\n");
        xmp.push_str("   </pelagic:speciesTags>\n");
    }

    xmp.push_str("  </rdf:Description>\n");
    xmp.push_str(" </rdf:RDF>\n");
    xmp.push_str("</x:xmpmeta>\n");

    xmp
}

// ====================== Embedded XMP Writing ======================

/// Build an XMP packet with padding, suitable for embedding into image files.
/// The padding allows in-place edits without rewriting the entire file.
fn build_xmp_packet(
    rating: Option<i32>,
    species_tags: &[SpeciesTag],
    general_tags: &[GeneralTag],
    dive_context: Option<&PhotoDiveContext>,
    caption: Option<&str>,
) -> Vec<u8> {
    let xmp_body = build_xmp_document(rating, species_tags, general_tags, dive_context, caption);

    let mut packet = String::new();
    // XMP packet header (required for embedded XMP)
    packet.push_str("<?xpacket begin=\"\u{feff}\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n");
    packet.push_str(&xmp_body);
    // Padding — allows future edits to expand without rewriting the file.
    // 2KB padding is standard practice.
    for _ in 0..40 {
        packet.push_str("                                                  \n");
    }
    packet.push_str("<?xpacket end=\"w\"?>");

    packet.into_bytes()
}

/// Try to embed XMP metadata directly into an image file.
/// Returns Ok(true) if embedded successfully, Ok(false) if the format is not supported,
/// or Err on I/O failure.
fn embed_xmp_in_file(file_path: &Path, xmp_packet: &[u8]) -> Result<bool, String> {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "jpg" | "jpeg" => {
            embed_xmp_in_jpeg(file_path, xmp_packet)?;
            Ok(true)
        }
        "png" => {
            embed_xmp_in_png(file_path, xmp_packet)?;
            Ok(true)
        }
        "tif" | "tiff" | "dng" => {
            embed_xmp_in_tiff(file_path, xmp_packet)?;
            Ok(true)
        }
        _ => Ok(false), // Unsupported format — fall back to sidecar
    }
}

// ---- JPEG XMP embedding ----
// JPEG structure: SOI (FF D8) followed by marker segments (FF xx + 2-byte length + data).
// XMP is stored in an APP1 marker (FF E1) with the namespace "http://ns.adobe.com/xap/1.0/\0".
// We find any existing XMP APP1, remove it, and insert our new one right after SOI.

const JPEG_XMP_NAMESPACE: &[u8] = b"http://ns.adobe.com/xap/1.0/\0";

fn embed_xmp_in_jpeg(file_path: &Path, xmp_packet: &[u8]) -> Result<(), String> {
    let data = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read JPEG {}: {}", file_path.display(), e))?;

    if data.len() < 2 || data[0] != 0xFF || data[1] != 0xD8 {
        return Err(format!("Not a valid JPEG: {}", file_path.display()));
    }

    // Build new APP1 segment: FF E1 + length(2 bytes) + namespace + xmp_packet
    let payload_len = JPEG_XMP_NAMESPACE.len() + xmp_packet.len();
    if payload_len + 2 > 0xFFFF {
        return Err("XMP packet too large for JPEG APP1 segment".to_string());
    }
    let segment_length = (payload_len + 2) as u16; // +2 for the length field itself

    let mut new_app1 = Vec::with_capacity(4 + payload_len);
    new_app1.push(0xFF);
    new_app1.push(0xE1); // APP1 marker
    new_app1.push((segment_length >> 8) as u8);
    new_app1.push((segment_length & 0xFF) as u8);
    new_app1.extend_from_slice(JPEG_XMP_NAMESPACE);
    new_app1.extend_from_slice(xmp_packet);

    // Parse existing markers, skipping any existing XMP APP1 segments
    let mut output = Vec::with_capacity(data.len() + new_app1.len());
    output.push(0xFF);
    output.push(0xD8); // SOI

    // Insert our XMP APP1 right after SOI
    output.extend_from_slice(&new_app1);

    // Copy the rest of the markers, skipping existing XMP APP1(s)
    let mut pos = 2; // Skip SOI
    while pos + 1 < data.len() {
        if data[pos] != 0xFF {
            // Not a marker — this is image data (SOS reached); copy the rest
            output.extend_from_slice(&data[pos..]);
            break;
        }

        let marker = data[pos + 1];

        // SOS (Start of Scan) — everything from here to EOF is image data
        if marker == 0xDA {
            output.extend_from_slice(&data[pos..]);
            break;
        }

        // Skip standalone markers (no length field)
        if marker == 0xD8 || marker == 0xD9 || (0xD0..=0xD7).contains(&marker) {
            output.push(data[pos]);
            output.push(data[pos + 1]);
            pos += 2;
            continue;
        }

        // Read segment length
        if pos + 3 >= data.len() {
            output.extend_from_slice(&data[pos..]);
            break;
        }
        let seg_len = ((data[pos + 2] as usize) << 8) | (data[pos + 3] as usize);
        let total_seg = 2 + seg_len; // marker(2) + length includes itself

        if pos + total_seg > data.len() {
            // Truncated segment — copy what we have
            output.extend_from_slice(&data[pos..]);
            break;
        }

        // Check if this is an XMP APP1 segment — skip it (we already inserted ours)
        if marker == 0xE1 && seg_len >= JPEG_XMP_NAMESPACE.len() + 2 {
            let ns_start = pos + 4; // After marker(2) + length(2)
            let ns_end = ns_start + JPEG_XMP_NAMESPACE.len();
            if ns_end <= data.len() && &data[ns_start..ns_end] == JPEG_XMP_NAMESPACE {
                // Skip this old XMP APP1, we've already written the new one
                pos += total_seg;
                continue;
            }
        }

        // Keep this segment
        output.extend_from_slice(&data[pos..pos + total_seg]);
        pos += total_seg;
    }

    // Write atomically: write to temp file then rename
    let temp_path = file_path.with_extension("tmp_xmp");
    std::fs::write(&temp_path, &output)
        .map_err(|e| format!("Failed to write temp JPEG: {}", e))?;
    std::fs::rename(&temp_path, file_path)
        .map_err(|e| {
            let _ = std::fs::remove_file(&temp_path);
            format!("Failed to rename temp JPEG: {}", e)
        })?;

    log::info!("Embedded XMP into JPEG: {}", file_path.display());
    Ok(())
}

// ---- PNG XMP embedding ----
// PNG structure: 8-byte signature, then chunks (4-byte length + 4-byte type + data + 4-byte CRC).
// XMP is stored in an iTXt chunk with keyword "XML:com.adobe.xmp".

const PNG_SIGNATURE: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const PNG_XMP_KEYWORD: &[u8] = b"XML:com.adobe.xmp";

fn embed_xmp_in_png(file_path: &Path, xmp_packet: &[u8]) -> Result<(), String> {
    let data = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read PNG {}: {}", file_path.display(), e))?;

    if data.len() < 8 || &data[0..8] != PNG_SIGNATURE {
        return Err(format!("Not a valid PNG: {}", file_path.display()));
    }

    // Build the iTXt chunk for XMP:
    //   keyword: "XML:com.adobe.xmp\0"
    //   compression flag: 0
    //   compression method: 0
    //   language tag: "" (terminated by \0)
    //   translated keyword: "" (terminated by \0)
    //   text: xmp_packet bytes
    let mut itxt_data = Vec::new();
    itxt_data.extend_from_slice(PNG_XMP_KEYWORD);
    itxt_data.push(0); // null terminator for keyword
    itxt_data.push(0); // compression flag (uncompressed)
    itxt_data.push(0); // compression method
    itxt_data.push(0); // language tag (empty, null-terminated)
    itxt_data.push(0); // translated keyword (empty, null-terminated)
    itxt_data.extend_from_slice(xmp_packet);

    let chunk_type = b"iTXt";

    // Build the complete chunk: length(4) + type(4) + data + crc(4)
    let chunk_len = itxt_data.len() as u32;
    let mut chunk = Vec::with_capacity(12 + itxt_data.len());
    chunk.extend_from_slice(&chunk_len.to_be_bytes());
    chunk.extend_from_slice(chunk_type);
    chunk.extend_from_slice(&itxt_data);
    // CRC covers type + data
    let crc = png_crc32(chunk_type, &itxt_data);
    chunk.extend_from_slice(&crc.to_be_bytes());

    // Parse chunks: keep everything except existing XMP iTXt, insert ours before IDAT
    let mut output = Vec::with_capacity(data.len() + chunk.len());
    output.extend_from_slice(&data[0..8]); // PNG signature

    let mut pos = 8;
    let mut inserted = false;

    while pos + 12 <= data.len() {
        let chunk_data_len = u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
        let ctype = &data[pos + 4..pos + 8];
        let total_chunk_size = 12 + chunk_data_len; // length(4) + type(4) + data + crc(4)

        if pos + total_chunk_size > data.len() {
            // Truncated — copy remaining
            output.extend_from_slice(&data[pos..]);
            break;
        }

        let chunk_data_start = pos + 8;
        let chunk_data_slice = &data[chunk_data_start..chunk_data_start + chunk_data_len];

        // Skip existing XMP iTXt chunks
        if ctype == b"iTXt" && chunk_data_len > PNG_XMP_KEYWORD.len() + 1 {
            if chunk_data_slice.starts_with(PNG_XMP_KEYWORD)
                && chunk_data_slice.get(PNG_XMP_KEYWORD.len()) == Some(&0)
            {
                pos += total_chunk_size;
                continue;
            }
        }

        // Insert our XMP chunk before the first IDAT chunk
        if ctype == b"IDAT" && !inserted {
            output.extend_from_slice(&chunk);
            inserted = true;
        }

        // Copy this chunk as-is
        output.extend_from_slice(&data[pos..pos + total_chunk_size]);
        pos += total_chunk_size;
    }

    // If we never hit IDAT (shouldn't happen in valid PNG), insert before end
    if !inserted {
        // Insert before the last 12 bytes (IEND chunk)
        let iend_start = output.len().saturating_sub(12);
        let iend = output[iend_start..].to_vec();
        output.truncate(iend_start);
        output.extend_from_slice(&chunk);
        output.extend_from_slice(&iend);
    }

    // Write atomically
    let temp_path = file_path.with_extension("tmp_xmp");
    std::fs::write(&temp_path, &output)
        .map_err(|e| format!("Failed to write temp PNG: {}", e))?;
    std::fs::rename(&temp_path, file_path)
        .map_err(|e| {
            let _ = std::fs::remove_file(&temp_path);
            format!("Failed to rename temp PNG: {}", e)
        })?;

    log::info!("Embedded XMP into PNG: {}", file_path.display());
    Ok(())
}

/// CRC32 for PNG chunks (using the PNG/zlib polynomial).
fn png_crc32(chunk_type: &[u8], data: &[u8]) -> u32 {
    // PNG CRC32 table
    let mut table = [0u32; 256];
    for n in 0..256u32 {
        let mut c = n;
        for _ in 0..8 {
            if c & 1 != 0 {
                c = 0xEDB88320 ^ (c >> 1);
            } else {
                c >>= 1;
            }
        }
        table[n as usize] = c;
    }

    let mut crc = 0xFFFFFFFFu32;
    for &byte in chunk_type.iter().chain(data.iter()) {
        crc = table[((crc ^ byte as u32) & 0xFF) as usize] ^ (crc >> 8);
    }
    crc ^ 0xFFFFFFFF
}

// ---- TIFF XMP embedding ----
// TIFF stores XMP in tag 700 (0x02BC) as a byte array.
// TIFF structure: header (8 bytes: byte order + magic + IFD offset), then IFD entries.
// We find the first IFD, look for tag 700, and update or add it.

const TIFF_XMP_TAG: u16 = 0x02BC;

fn embed_xmp_in_tiff(file_path: &Path, xmp_packet: &[u8]) -> Result<(), String> {
    let data = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read TIFF {}: {}", file_path.display(), e))?;

    if data.len() < 8 {
        return Err(format!("File too small for TIFF: {}", file_path.display()));
    }

    // Determine byte order
    let le = match (data[0], data[1]) {
        (0x49, 0x49) => true,  // Little-endian (II)
        (0x4D, 0x4D) => false, // Big-endian (MM)
        _ => return Err(format!("Not a valid TIFF: {}", file_path.display())),
    };

    let read_u16 = |d: &[u8], off: usize| -> u16 {
        if le {
            u16::from_le_bytes([d[off], d[off + 1]])
        } else {
            u16::from_be_bytes([d[off], d[off + 1]])
        }
    };
    let read_u32 = |d: &[u8], off: usize| -> u32 {
        if le {
            u32::from_le_bytes([d[off], d[off + 1], d[off + 2], d[off + 3]])
        } else {
            u32::from_be_bytes([d[off], d[off + 1], d[off + 2], d[off + 3]])
        }
    };

    // Check magic number
    let magic = read_u16(&data, 2);
    if magic != 42 {
        return Err(format!("Not a valid TIFF (bad magic {}): {}", magic, file_path.display()));
    }

    let ifd_offset = read_u32(&data, 4) as usize;
    if ifd_offset + 2 > data.len() {
        return Err("TIFF IFD offset out of bounds".to_string());
    }

    let num_entries = read_u16(&data, ifd_offset) as usize;
    let entries_start = ifd_offset + 2;
    let entries_end = entries_start + num_entries * 12;

    if entries_end + 4 > data.len() {
        return Err("TIFF IFD entries out of bounds".to_string());
    }

    // Strategy: remove old tag 700 data, append new XMP data at end of file,
    // and update/add the IFD entry for tag 700.
    // This is a simplified approach that works for standard single-IFD TIFFs.

    // Find existing tag 700
    let mut tag_700_entry_offset: Option<usize> = None;
    for i in 0..num_entries {
        let entry_off = entries_start + i * 12;
        let tag = read_u16(&data, entry_off);
        if tag == TIFF_XMP_TAG {
            tag_700_entry_offset = Some(entry_off);
            break;
        }
    }

    let write_u16 = |buf: &mut Vec<u8>, val: u16| {
        if le {
            buf.extend_from_slice(&val.to_le_bytes());
        } else {
            buf.extend_from_slice(&val.to_be_bytes());
        }
    };
    let write_u32 = |buf: &mut Vec<u8>, val: u32| {
        if le {
            buf.extend_from_slice(&val.to_le_bytes());
        } else {
            buf.extend_from_slice(&val.to_be_bytes());
        }
    };
    let write_u32_at = |buf: &mut Vec<u8>, off: usize, val: u32| {
        let bytes = if le { val.to_le_bytes() } else { val.to_be_bytes() };
        buf[off..off + 4].copy_from_slice(&bytes);
    };

    let mut output = data.clone();

    // Append XMP data at the end of the file
    let xmp_data_offset = output.len() as u32;
    output.extend_from_slice(xmp_packet);
    let xmp_count = xmp_packet.len() as u32;

    if let Some(entry_off) = tag_700_entry_offset {
        // Update existing tag 700 entry: type=1 (BYTE), count=len, offset=new_offset
        // Entry format: tag(2) + type(2) + count(4) + value/offset(4)
        // Keep tag as-is (already 0x02BC)
        let type_bytes: [u8; 2] = if le { 1u16.to_le_bytes() } else { 1u16.to_be_bytes() };
        output[entry_off + 2..entry_off + 4].copy_from_slice(&type_bytes);
        write_u32_at(&mut output, entry_off + 4, xmp_count);
        write_u32_at(&mut output, entry_off + 8, xmp_data_offset);
    } else {
        // Need to add a new IFD entry for tag 700.
        // Build a new IFD with the extra entry and append it.
        let next_ifd_offset = read_u32(&data, entries_end) as u32;

        // Build new IFD at the current end of output
        let new_ifd_offset = output.len() as u32;
        let new_num_entries = (num_entries + 1) as u16;

        let mut new_ifd = Vec::new();
        write_u16(&mut new_ifd, new_num_entries);

        // Copy existing entries
        for i in 0..num_entries {
            let entry_off = entries_start + i * 12;
            new_ifd.extend_from_slice(&data[entry_off..entry_off + 12]);
        }

        // Add tag 700 entry
        write_u16(&mut new_ifd, TIFF_XMP_TAG);
        write_u16(&mut new_ifd, 1); // type = BYTE
        write_u32(&mut new_ifd, xmp_count);
        write_u32(&mut new_ifd, xmp_data_offset);

        // Next IFD offset
        write_u32(&mut new_ifd, next_ifd_offset);

        output.extend_from_slice(&new_ifd);

        // Update the IFD pointer in the header to point to our new IFD
        write_u32_at(&mut output, 4, new_ifd_offset);
    }

    // Write atomically
    let temp_path = file_path.with_extension("tmp_xmp");
    std::fs::write(&temp_path, &output)
        .map_err(|e| format!("Failed to write temp TIFF: {}", e))?;
    std::fs::rename(&temp_path, file_path)
        .map_err(|e| {
            let _ = std::fs::remove_file(&temp_path);
            format!("Failed to rename temp TIFF: {}", e)
        })?;

    log::info!("Embedded XMP into TIFF: {}", file_path.display());
    Ok(())
}

/// Check if a file extension supports embedded XMP.
fn supports_embedded_xmp(file_path: &str) -> bool {
    let ext = Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    EMBEDDABLE_EXTENSIONS.contains(&ext.as_str())
}

// ====================== EXIF ImageDescription Writing ======================

const IMAGE_DESCRIPTION_TAG: u16 = 0x010E;
const JPEG_EXIF_NAMESPACE: &[u8] = b"Exif\0\0";

/// Build comma-separated key:value string for EXIF ImageDescription.
fn build_image_description(
    caption: Option<&str>,
    species_tags: &[SpeciesTag],
    general_tags: &[GeneralTag],
    dive_context: Option<&PhotoDiveContext>,
) -> String {
    let mut pairs: Vec<String> = Vec::new();

    if let Some(cap) = caption {
        if !cap.is_empty() {
            pairs.push(format!("caption:{}", cap));
        }
    }

    for tag in species_tags {
        pairs.push(format!("species:{}", tag.name));
        if let Some(ref sci) = tag.scientific_name {
            if !sci.is_empty() {
                pairs.push(format!("scientific_name:{}", sci));
            }
        }
    }

    for tag in general_tags {
        pairs.push(format!("general_tag:{}", tag.name));
    }

    if let Some(ctx) = dive_context {
        if let Some(depth) = ctx.depth_at_capture_m {
            pairs.push(format!("depth:{:.1}", depth));
        }
        if let Some(temp) = ctx.temp_at_capture_c {
            pairs.push(format!("temp:{:.1}", temp));
        }
        if let Some(time_in) = ctx.time_into_dive_seconds {
            let mins = time_in / 60;
            let secs = time_in % 60;
            pairs.push(format!("time_into_dive:{}:{:02}", mins, secs));
        }
        pairs.push(format!("dive_date:{}", ctx.dive_date));
        if let Some(ref loc) = ctx.dive_location {
            if !loc.is_empty() {
                pairs.push(format!("dive_location:{}", loc));
            }
        }
        pairs.push(format!("max_depth:{:.1}", ctx.max_depth_m));
        pairs.push(format!("mean_depth:{:.1}", ctx.mean_depth_m));
        pairs.push(format!("duration:{}", ctx.dive_duration_seconds));
        if let Some(temp) = ctx.water_temp_c {
            pairs.push(format!("water_temp:{:.1}", temp));
        }
    }

    pairs.join(",")
}

/// Set an ASCII tag value in a TIFF IFD0. Returns the modified TIFF data.
fn set_tiff_ifd0_ascii_tag(data: &[u8], tag_id: u16, value: &str) -> Result<Vec<u8>, String> {
    if data.len() < 8 {
        return Err("TIFF data too short".into());
    }

    let le = match (data[0], data[1]) {
        (0x49, 0x49) => true,
        (0x4D, 0x4D) => false,
        _ => return Err("Invalid TIFF byte order".into()),
    };

    let read_u16 = |d: &[u8], off: usize| -> u16 {
        if le { u16::from_le_bytes([d[off], d[off + 1]]) }
        else { u16::from_be_bytes([d[off], d[off + 1]]) }
    };
    let read_u32 = |d: &[u8], off: usize| -> u32 {
        if le { u32::from_le_bytes([d[off], d[off + 1], d[off + 2], d[off + 3]]) }
        else { u32::from_be_bytes([d[off], d[off + 1], d[off + 2], d[off + 3]]) }
    };
    let write_u16_bytes = |val: u16| -> [u8; 2] {
        if le { val.to_le_bytes() } else { val.to_be_bytes() }
    };
    let write_u32_bytes = |val: u32| -> [u8; 4] {
        if le { val.to_le_bytes() } else { val.to_be_bytes() }
    };

    let magic = read_u16(data, 2);
    if magic != 42 {
        return Err(format!("Bad TIFF magic: {}", magic));
    }

    let ifd_offset = read_u32(data, 4) as usize;
    if ifd_offset + 2 > data.len() {
        return Err("IFD offset out of bounds".into());
    }

    let num_entries = read_u16(data, ifd_offset) as usize;
    let entries_start = ifd_offset + 2;
    let entries_end = entries_start + num_entries * 12;
    if entries_end + 4 > data.len() {
        return Err("IFD entries out of bounds".into());
    }

    // ASCII value with null terminator
    let mut ascii_bytes = value.as_bytes().to_vec();
    ascii_bytes.push(0);
    let ascii_count = ascii_bytes.len() as u32;

    // Find existing tag
    let mut tag_entry_offset: Option<usize> = None;
    for i in 0..num_entries {
        let entry_off = entries_start + i * 12;
        if read_u16(data, entry_off) == tag_id {
            tag_entry_offset = Some(entry_off);
            break;
        }
    }

    let mut output = data.to_vec();

    if let Some(entry_off) = tag_entry_offset {
        // Update existing entry: append string at end, update entry fields
        let string_offset = output.len() as u32;
        output.extend_from_slice(&ascii_bytes);

        output[entry_off + 2..entry_off + 4].copy_from_slice(&write_u16_bytes(2)); // ASCII type
        output[entry_off + 4..entry_off + 8].copy_from_slice(&write_u32_bytes(ascii_count));
        if ascii_count <= 4 {
            let mut val = [0u8; 4];
            val[..ascii_bytes.len()].copy_from_slice(&ascii_bytes);
            output[entry_off + 8..entry_off + 12].copy_from_slice(&val);
            output.truncate(string_offset as usize);
        } else {
            output[entry_off + 8..entry_off + 12].copy_from_slice(&write_u32_bytes(string_offset));
        }
    } else {
        // Append string data, then build new IFD with the extra entry
        let string_offset = output.len() as u32;
        output.extend_from_slice(&ascii_bytes);

        let next_ifd = read_u32(data, entries_end);
        let new_ifd_offset = output.len() as u32;
        let new_count = (num_entries + 1) as u16;

        output.extend_from_slice(&write_u16_bytes(new_count));
        // Copy existing entries
        output.extend_from_slice(&data[entries_start..entries_end]);
        // New entry
        output.extend_from_slice(&write_u16_bytes(tag_id));
        output.extend_from_slice(&write_u16_bytes(2)); // ASCII type
        output.extend_from_slice(&write_u32_bytes(ascii_count));
        if ascii_count <= 4 {
            let mut val = [0u8; 4];
            val[..ascii_bytes.len()].copy_from_slice(&ascii_bytes);
            output.extend_from_slice(&val);
        } else {
            output.extend_from_slice(&write_u32_bytes(string_offset));
        }
        // Next IFD offset
        output.extend_from_slice(&write_u32_bytes(next_ifd));
        // Update header to point to new IFD
        output[4..8].copy_from_slice(&write_u32_bytes(new_ifd_offset));
    }

    Ok(output)
}

/// Build a minimal little-endian TIFF with just one IFD0 entry for ImageDescription.
fn build_minimal_exif_tiff(description: &str) -> Vec<u8> {
    let mut ascii_bytes = description.as_bytes().to_vec();
    ascii_bytes.push(0);
    let count = ascii_bytes.len() as u32;

    let mut tiff = Vec::new();
    tiff.extend_from_slice(b"II");                         // Little-endian
    tiff.extend_from_slice(&42u16.to_le_bytes());          // TIFF magic
    tiff.extend_from_slice(&8u32.to_le_bytes());           // IFD0 at offset 8

    // IFD0: 1 entry
    tiff.extend_from_slice(&1u16.to_le_bytes());
    tiff.extend_from_slice(&IMAGE_DESCRIPTION_TAG.to_le_bytes());
    tiff.extend_from_slice(&2u16.to_le_bytes());           // ASCII type
    tiff.extend_from_slice(&count.to_le_bytes());
    if count <= 4 {
        let mut val = [0u8; 4];
        val[..ascii_bytes.len()].copy_from_slice(&ascii_bytes);
        tiff.extend_from_slice(&val);
    } else {
        // String offset: header(8) + count(2) + entry(12) + next_ifd(4) = 26
        tiff.extend_from_slice(&26u32.to_le_bytes());
    }
    tiff.extend_from_slice(&0u32.to_le_bytes());           // Next IFD: none
    if count > 4 {
        tiff.extend_from_slice(&ascii_bytes);
    }

    tiff
}

/// Write EXIF ImageDescription into a JPEG file.
fn write_image_description_jpeg(file_path: &Path, description: &str) -> Result<(), String> {
    let data = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read JPEG {}: {}", file_path.display(), e))?;

    if data.len() < 2 || data[0] != 0xFF || data[1] != 0xD8 {
        return Err(format!("Not a valid JPEG: {}", file_path.display()));
    }

    // Find existing EXIF APP1 segment
    let mut exif_seg_start: Option<usize> = None;
    let mut exif_seg_total: Option<usize> = None;
    let mut pos = 2;

    while pos + 1 < data.len() {
        if data[pos] != 0xFF { break; }
        let marker = data[pos + 1];
        if marker == 0xDA || marker == 0xD9 { break; }
        if marker == 0xD8 || (0xD0..=0xD7).contains(&marker) {
            pos += 2;
            continue;
        }
        if pos + 3 >= data.len() { break; }
        let seg_len = ((data[pos + 2] as usize) << 8) | (data[pos + 3] as usize);
        let total = 2 + seg_len;

        if marker == 0xE1 && seg_len >= JPEG_EXIF_NAMESPACE.len() + 2 {
            let ns_start = pos + 4;
            let ns_end = ns_start + JPEG_EXIF_NAMESPACE.len();
            if ns_end <= data.len() && &data[ns_start..ns_end] == JPEG_EXIF_NAMESPACE {
                exif_seg_start = Some(pos);
                exif_seg_total = Some(total);
            }
        }
        pos += total;
    }

    let new_tiff_data = if let (Some(start), Some(total)) = (exif_seg_start, exif_seg_total) {
        let tiff_start = start + 4 + JPEG_EXIF_NAMESPACE.len();
        let tiff_end = start + total;
        if tiff_start >= tiff_end || tiff_end > data.len() {
            return Err("Invalid EXIF APP1 structure".into());
        }
        set_tiff_ifd0_ascii_tag(&data[tiff_start..tiff_end], IMAGE_DESCRIPTION_TAG, description)?
    } else {
        build_minimal_exif_tiff(description)
    };

    // Build new EXIF APP1 segment
    let payload_len = JPEG_EXIF_NAMESPACE.len() + new_tiff_data.len();
    if payload_len + 2 > 0xFFFF {
        return Err("EXIF data too large for JPEG APP1".into());
    }
    let segment_length = (payload_len + 2) as u16;

    let mut new_app1 = Vec::with_capacity(4 + payload_len);
    new_app1.push(0xFF);
    new_app1.push(0xE1);
    new_app1.push((segment_length >> 8) as u8);
    new_app1.push((segment_length & 0xFF) as u8);
    new_app1.extend_from_slice(JPEG_EXIF_NAMESPACE);
    new_app1.extend_from_slice(&new_tiff_data);

    // Rebuild JPEG: SOI + new EXIF APP1 + remaining segments (minus old EXIF APP1)
    let mut output = Vec::with_capacity(data.len() + new_app1.len());
    output.extend_from_slice(&[0xFF, 0xD8]);
    output.extend_from_slice(&new_app1);

    pos = 2;
    while pos + 1 < data.len() {
        if data[pos] != 0xFF {
            output.extend_from_slice(&data[pos..]);
            break;
        }
        let marker = data[pos + 1];
        if marker == 0xDA {
            output.extend_from_slice(&data[pos..]);
            break;
        }
        if marker == 0xD8 || (0xD0..=0xD7).contains(&marker) {
            output.push(data[pos]);
            output.push(data[pos + 1]);
            pos += 2;
            continue;
        }
        if pos + 3 >= data.len() {
            output.extend_from_slice(&data[pos..]);
            break;
        }
        let seg_len = ((data[pos + 2] as usize) << 8) | (data[pos + 3] as usize);
        let total = 2 + seg_len;

        // Skip old EXIF APP1
        if Some(pos) == exif_seg_start {
            pos += total;
            continue;
        }

        if pos + total > data.len() {
            output.extend_from_slice(&data[pos..]);
            break;
        }
        output.extend_from_slice(&data[pos..pos + total]);
        pos += total;
    }

    // Atomic write
    let temp_path = file_path.with_extension("tmp_exifdesc");
    std::fs::write(&temp_path, &output)
        .map_err(|e| format!("Failed to write temp JPEG: {}", e))?;
    std::fs::rename(&temp_path, file_path)
        .map_err(|e| {
            let _ = std::fs::remove_file(&temp_path);
            format!("Failed to rename temp JPEG: {}", e)
        })?;

    log::info!("Wrote EXIF ImageDescription to JPEG: {}", file_path.display());
    Ok(())
}

/// Write EXIF ImageDescription into a TIFF file.
fn write_image_description_tiff(file_path: &Path, description: &str) -> Result<(), String> {
    let data = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read TIFF {}: {}", file_path.display(), e))?;

    let output = set_tiff_ifd0_ascii_tag(&data, IMAGE_DESCRIPTION_TAG, description)?;

    let temp_path = file_path.with_extension("tmp_exifdesc");
    std::fs::write(&temp_path, &output)
        .map_err(|e| format!("Failed to write temp TIFF: {}", e))?;
    std::fs::rename(&temp_path, file_path)
        .map_err(|e| {
            let _ = std::fs::remove_file(&temp_path);
            format!("Failed to rename temp TIFF: {}", e)
        })?;

    log::info!("Wrote EXIF ImageDescription to TIFF: {}", file_path.display());
    Ok(())
}

/// Write EXIF ImageDescription to a file (dispatches by format).
fn write_image_description(file_path: &Path, description: &str) -> Result<(), String> {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "jpg" | "jpeg" => write_image_description_jpeg(file_path, description),
        "tif" | "tiff" | "dng" => write_image_description_tiff(file_path, description),
        _ => Ok(()), // PNG and others: no EXIF ImageDescription support
    }
}

/// Write metadata for a single photo. For JPEG/PNG/TIFF, embeds XMP directly
/// into the file. For other formats (RAW, PSD, etc.), writes an XMP sidecar.
///
/// This is the core function called after any metadata change.
/// Silently logs errors rather than failing — metadata writeback is a best-effort
/// side effect and should never block the main operation.
pub fn write_xmp_sidecar_for_photo(db: &Db, photo_id: i64) {
    let result = (|| -> Result<(), String> {
        // Get the photo record to find the file path
        let photo = db
            .get_photo(photo_id)
            .map_err(|e| format!("Failed to get photo {}: {}", photo_id, e))?
            .ok_or_else(|| format!("Photo {} not found", photo_id))?;

        // Get current tags from DB
        let species_tags = db
            .get_species_tags_for_photo(photo_id)
            .map_err(|e| format!("Failed to get species tags: {}", e))?;
        let general_tags = db
            .get_general_tags_for_photo(photo_id)
            .map_err(|e| format!("Failed to get general tags: {}", e))?;

        // Compute dive context if the photo is associated with a dive
        let dive_context = if let Some(dive_id) = photo.dive_id {
            match db.get_dive(dive_id) {
                Ok(Some(dive)) => {
                    let samples = db.get_dive_samples(dive_id).unwrap_or_default();
                    Some(compute_photo_dive_context(&photo, &dive, &samples))
                }
                _ => None,
            }
        } else {
            None
        };

        let has_metadata = photo.rating.unwrap_or(0) > 0
            || !species_tags.is_empty()
            || !general_tags.is_empty()
            || dive_context.is_some()
            || photo.caption.as_ref().map_or(false, |c| !c.is_empty());

        let can_embed = supports_embedded_xmp(&photo.file_path);

        // --- Embedded metadata (preferred for JPEG/PNG/TIFF) ---
        if can_embed {
            let file_path = Path::new(&photo.file_path);
            if has_metadata && file_path.exists() {
                // Write EXIF ImageDescription (comma-separated key:value pairs)
                let description = build_image_description(
                    photo.caption.as_deref(),
                    &species_tags,
                    &general_tags,
                    dive_context.as_ref(),
                );
                if !description.is_empty() {
                    if let Err(e) = write_image_description(file_path, &description) {
                        log::warn!("Failed to write EXIF ImageDescription to {}: {}", photo.file_path, e);
                    }
                }

                // Write XMP (structured metadata for photo apps)
                let xmp_packet = build_xmp_packet(photo.rating, &species_tags, &general_tags, dive_context.as_ref(), photo.caption.as_deref());
                match embed_xmp_in_file(file_path, &xmp_packet) {
                    Ok(true) => log::info!("Embedded XMP metadata into: {}", photo.file_path),
                    Ok(false) => {}
                    Err(e) => log::warn!("Failed to embed XMP into {}: {}", photo.file_path, e),
                }
            }
            // No sidecar needed for embeddable formats — clean up any stale one
            let sidecar_path = xmp_sidecar_path(&photo.file_path);
            if sidecar_path.exists() {
                let _ = std::fs::remove_file(&sidecar_path);
            }
            return Ok(());
        }

        // --- Sidecar file (fallback for RAW, PSD, etc.) ---
        let sidecar_path = xmp_sidecar_path(&photo.file_path);

        if !has_metadata {
            if sidecar_path.exists() {
                std::fs::remove_file(&sidecar_path)
                    .map_err(|e| format!("Failed to remove empty sidecar: {}", e))?;
                log::info!("Removed empty XMP sidecar: {}", sidecar_path.display());
            }
        } else {
            let xmp_content = build_xmp_document(photo.rating, &species_tags, &general_tags, dive_context.as_ref(), photo.caption.as_deref());
            std::fs::write(&sidecar_path, xmp_content.as_bytes())
                .map_err(|e| format!("Failed to write XMP sidecar {}: {}", sidecar_path.display(), e))?;
            log::info!("Wrote XMP sidecar: {}", sidecar_path.display());
        }

        Ok(())
    })();

    if let Err(e) = result {
        log::warn!("XMP metadata writeback failed: {}", e);
    }
}

/// Write XMP sidecars for multiple photos (batch operation).
pub fn write_xmp_sidecars_for_photos(db: &Db, photo_ids: &[i64]) {
    for &photo_id in photo_ids {
        write_xmp_sidecar_for_photo(db, photo_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xmp_sidecar_path() {
        assert_eq!(
            xmp_sidecar_path("C:\\Photos\\IMG_1234.CR3"),
            PathBuf::from("C:\\Photos\\IMG_1234.xmp")
        );
        assert_eq!(
            xmp_sidecar_path("/home/user/photos/dive.jpg"),
            PathBuf::from("/home/user/photos/dive.xmp")
        );
    }

    #[test]
    fn test_build_xmp_empty() {
        let doc = build_xmp_document(None, &[], &[], None, None);
        assert!(doc.contains("x:xmpmeta"));
        assert!(!doc.contains("xmp:Rating"));
        assert!(!doc.contains("dc:subject"));
    }

    #[test]
    fn test_build_xmp_with_rating() {
        let doc = build_xmp_document(Some(4), &[], &[], None, None);
        assert!(doc.contains("<xmp:Rating>4</xmp:Rating>"));
    }

    #[test]
    fn test_build_xmp_with_tags() {
        let species = vec![SpeciesTag {
            id: 1,
            name: "Manta Ray".to_string(),
            category: Some("Shark/Ray".to_string()),
            scientific_name: Some("Mobula birostris".to_string()),
        }];
        let general = vec![GeneralTag {
            id: 1,
            name: "Wide Angle".to_string(),
        }];

        let doc = build_xmp_document(Some(5), &species, &general, None, None);

        // Check standard keywords
        assert!(doc.contains("<rdf:li>Wide Angle</rdf:li>"));
        assert!(doc.contains("<rdf:li>Manta Ray</rdf:li>"));
        assert!(doc.contains("<rdf:li>Mobula birostris</rdf:li>"));

        // Check Lightroom hierarchy
        assert!(doc.contains("<rdf:li>Pelagic|Wide Angle</rdf:li>"));
        assert!(doc.contains("<rdf:li>Species|Shark/Ray|Manta Ray</rdf:li>"));

        // Check Pelagic-specific species data
        assert!(doc.contains("pelagic:speciesTags"));
        assert!(doc.contains("Manta Ray | Mobula birostris | Shark/Ray"));
    }

    #[test]
    fn test_xml_escape() {
        assert_eq!(xml_escape("A & B"), "A &amp; B");
        assert_eq!(xml_escape("<tag>"), "&lt;tag&gt;");
        assert_eq!(xml_escape(r#"he said "hi""#), "he said &quot;hi&quot;");
    }
}
