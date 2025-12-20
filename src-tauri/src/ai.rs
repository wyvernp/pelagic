use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct SpeciesIdentification {
    pub common_name: Option<String>,
    pub scientific_name: Option<String>,
    pub category: Option<String>,
    pub confidence: Option<String>,
    pub description: Option<String>,
    pub reasoning: Option<String>,
    pub alternatives_considered: Option<Vec<String>>,
    pub multiple_species: Vec<SpeciesInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpeciesInfo {
    pub common_name: String,
    pub scientific_name: Option<String>,
    pub category: Option<String>,
    pub confidence: Option<String>,
}

#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    generation_config: GenerationConfig,
}

#[derive(Debug, Serialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum GeminiPart {
    Text { text: String },
    InlineData { inline_data: InlineData },
}

#[derive(Debug, Serialize)]
struct InlineData {
    mime_type: String,
    data: String,
}

#[derive(Debug, Serialize)]
struct GenerationConfig {
    temperature: f32,
    max_output_tokens: u32,
    response_mime_type: String,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    error: Option<GeminiError>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiResponseContent,
}

#[derive(Debug, Deserialize)]
struct GeminiResponseContent {
    parts: Vec<GeminiResponsePart>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponsePart {
    text: String,
}

#[derive(Debug, Deserialize)]
struct GeminiError {
    message: String,
    code: Option<i32>,
}

/// Identify species in a photo using Google Gemini Vision API
pub async fn identify_species(
    api_key: &str,
    photo_path: &str,
    location_context: Option<&str>,
) -> Result<SpeciesIdentification, String> {
    // Read and encode the image
    let path = Path::new(photo_path);
    
    // Determine mime type from extension
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    
    let mime_type = match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" | "heif" => "image/heic",
        // For RAW files, we need to use the thumbnail or converted version
        _ => "image/jpeg", // Default to jpeg for processed thumbnails
    };
    
    // Read the image file asynchronously
    let photo_path_owned = photo_path.to_string();
    let image_data = tokio::task::spawn_blocking(move || {
        std::fs::read(&photo_path_owned)
    }).await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to read image file: {}", e))?;
    
    // Encode to base64
    let base64_image = STANDARD.encode(&image_data);
    
    // Build the prompt with location context
    let location_hint = location_context
        .map(|loc| format!("The photo was taken at or near: {}. Use this location to help narrow down the species identification, as it indicates the geographic region and typical fauna. ", loc))
        .unwrap_or_default();
    
    let prompt = format!(
        r#"You are Dr. Marina Santos, a world-renowned marine taxonomist with 30 years of field experience identifying underwater species. You have published extensively on Indo-Pacific reef fish, nudibranchs, and invertebrates. You are known for your meticulous attention to diagnostic features and your refusal to make hasty identifications.

CRITICAL: Do NOT default to the most common species. Many genera contain dozens of similar-looking species. Take time to consider ALL possibilities.

{}

## Your Identification Process

STEP 1 - DETAILED OBSERVATION
Carefully examine and describe:
- Body shape, size proportions, and overall silhouette
- Exact coloration: base color, pattern type (spots, stripes, bars, reticulations), color gradients
- Fin structure: dorsal fin shape/spines, pectoral fin position, tail shape
- Head features: mouth position, eye size/color, any appendages or lures
- Texture: smooth, warty, hairy, spiny
- Any behavioral cues visible in the image

STEP 2 - GENERATE CANDIDATE SPECIES
Based on the location and observed features, list 3-5 possible species this could be. For each candidate, note:
- Why it could be this species (matching features)
- Why it might NOT be this species (contradicting features)

STEP 3 - DIFFERENTIAL DIAGNOSIS
Compare your top candidates systematically. What specific feature would definitively distinguish between them? Can you see that feature clearly in this image?

STEP 4 - FINAL DETERMINATION
Choose your identification. If the diagnostic features aren't clearly visible, identify only to Genus or Family level with high confidence rather than guessing a species with low confidence.

## Example: Frogfish Identification
For frogfish specifically, key diagnostic features include:
- Skin texture (smooth vs warty vs hairy)
- Esca (lure) shape and color
- Illicium (fishing rod) length relative to second dorsal spine
- Presence/absence of ocelli (eyespots)
- Exact coloration and pattern
- Geographic range

Antennarius species to consider: A. commerson (giant), A. pictus (painted), A. striatus (striated/hairy), A. maculatus (warty), A. hispidus (shaggy), A. randalli (Randall's), and many others depending on location.

## Response Format (JSON)

{{
  "reasoning": "Your detailed step-by-step analysis following the process above. This should be 2-4 paragraphs explaining your observation and thinking.",
  "alternatives_considered": ["Species 1 you ruled out and why", "Species 2 you ruled out and why"],
  "common_name": "the most accurate common English name",
  "scientific_name": "Genus species (or just Genus sp. if species uncertain)",
  "category": "one of: fish, invertebrate, coral, mammal, reptile, shark, ray, cephalopod, crustacean, nudibranch, other",
  "confidence": "high (diagnostic features clearly visible) | medium (likely but some uncertainty) | low (best guess, features unclear)",
  "description": "Key identifying features that led to this ID",
  "multiple_species": []
}}

IMPORTANT RULES:
1. If you cannot see diagnostic features clearly, use "Genus sp." (e.g., "Antennarius sp." for an unidentifiable frogfish)
2. Never guess a specific species just because it's common - prove it with visible features
3. Your reasoning field should show your work - this helps the user understand and verify your ID
4. Consider that the user may be an expert who will verify your identification"#,
        location_hint
    );

    // Build the Gemini API request
    let request = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![
                GeminiPart::Text { text: prompt },
                GeminiPart::InlineData {
                    inline_data: InlineData {
                        mime_type: mime_type.to_string(),
                        data: base64_image,
                    },
                },
            ],
        }],
        generation_config: GenerationConfig {
            temperature: 0.2,
            max_output_tokens: 8192,
            response_mime_type: "application/json".to_string(),
        },
    };

    // Make the API call - using gemini-3-pro-preview for best multimodal understanding
    let client = Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key={}",
        api_key
    );

    let response = client
        .post(&url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to call Gemini API: {}", e))?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Gemini API error ({}): {}", status, response_text));
    }

    // Parse the response
    let gemini_response: GeminiResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse Gemini response: {} - Raw: {}", e, response_text))?;

    if let Some(error) = gemini_response.error {
        return Err(format!("Gemini API error: {}", error.message));
    }

    let text = gemini_response
        .candidates
        .and_then(|c| c.into_iter().next())
        .map(|c| c.content.parts.into_iter().next())
        .flatten()
        .map(|p| p.text)
        .ok_or_else(|| "No response from Gemini".to_string())?;

    // Parse the JSON response from Gemini
    let identification: SpeciesIdentification = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse species identification: {} - Raw: {}", e, text))?;

    Ok(identification)
}

/// Identify species from a thumbnail (for faster processing)
pub async fn identify_species_from_thumbnail(
    api_key: &str,
    thumbnail_path: &str,
    location_context: Option<&str>,
) -> Result<SpeciesIdentification, String> {
    identify_species(api_key, thumbnail_path, location_context).await
}
