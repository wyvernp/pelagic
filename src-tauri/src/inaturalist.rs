use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

// ── iNaturalist OAuth config ────────────────────────────────────────────────

const INAT_API_BASE: &str = "https://api.inaturalist.org/v1";
const INAT_WEB_BASE: &str = "https://www.inaturalist.org";
// iNaturalist OAuth application — users register at inaturalist.org/oauth/applications
// For a desktop app, use the Authorization Code flow with PKCE
const INAT_REDIRECT_URI: &str = "http://127.0.0.1:19821/callback";

// ── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatTokenResponse {
    pub access_token: String,
    pub token_type: Option<String>,
    pub created_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatUser {
    pub id: Option<i64>,
    pub login: Option<String>,
    pub name: Option<String>,
    pub icon_url: Option<String>,
    pub observations_count: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatUserResult {
    pub results: Vec<INatUser>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatTaxon {
    pub id: i64,
    pub name: String,
    pub rank: Option<String>,
    pub preferred_common_name: Option<String>,
    pub matched_term: Option<String>,
    pub iconic_taxon_name: Option<String>,
    pub default_photo: Option<INatPhoto>,
    pub conservation_status: Option<INatConservationStatus>,
    pub observations_count: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatPhoto {
    pub square_url: Option<String>,
    pub medium_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatConservationStatus {
    pub status_name: Option<String>,
    pub iucn: Option<i32>,
    pub authority: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatTaxaResult {
    pub total_results: Option<i64>,
    pub results: Vec<INatTaxon>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatObservation {
    pub id: i64,
    pub uri: Option<String>,
    pub quality_grade: Option<String>,
    pub taxon: Option<INatTaxon>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatObservationResult {
    pub total_results: Option<i64>,
    pub results: Vec<INatObservation>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatCreateResult {
    pub id: Option<i64>,
    pub uri: Option<String>,
}

// ── Simplified types for the frontend ───────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatTaxonSimple {
    pub id: i64,
    pub scientific_name: String,
    pub common_name: Option<String>,
    pub rank: Option<String>,
    pub iconic_group: Option<String>,
    pub photo_url: Option<String>,
    pub observations_count: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct INatSubmissionResult {
    pub observation_id: i64,
    pub url: String,
}

// ── OAuth flow ──────────────────────────────────────────────────────────────

/// Build the authorization URL that the user should open in their browser.
pub fn get_auth_url(client_id: &str) -> String {
    format!(
        "{}/oauth/authorize?client_id={}&redirect_uri={}&response_type=code",
        INAT_WEB_BASE,
        urlencoding::encode(client_id),
        urlencoding::encode(INAT_REDIRECT_URI),
    )
}

/// Start a local HTTP server on port 19821, wait for the OAuth callback,
/// extract the authorization code. Times out after 120 seconds.
pub async fn wait_for_auth_code() -> Result<String, String> {
    // Bind the listener in a blocking context
    let listener = tokio::task::spawn_blocking(|| {
        TcpListener::bind("127.0.0.1:19821")
            .map_err(|e| format!("Failed to bind local auth server: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    listener
        .set_nonblocking(false)
        .map_err(|e| format!("Failed to set blocking mode: {}", e))?;

    // Use tokio timeout
    let result = tokio::time::timeout(std::time::Duration::from_secs(120), async {
        tokio::task::spawn_blocking(move || {
            // Accept one connection
            let (mut stream, _) = listener
                .accept()
                .map_err(|e| format!("Failed to accept connection: {}", e))?;

            // Read the HTTP request
            let reader = BufReader::new(&stream);
            let request_line = reader
                .lines()
                .next()
                .ok_or_else(|| "No request received".to_string())?
                .map_err(|e| format!("Failed to read request: {}", e))?;

            // Parse the code from: GET /callback?code=XXXXX HTTP/1.1
            let code = request_line
                .split_whitespace()
                .nth(1) // the path
                .and_then(|path| {
                    url::Url::parse(&format!("http://localhost{}", path)).ok()
                })
                .and_then(|url| {
                    url.query_pairs()
                        .find(|(k, _)| k == "code")
                        .map(|(_, v)| v.to_string())
                })
                .ok_or_else(|| "No authorization code in callback".to_string())?;

            // Send a nice HTML response
            let body = r#"<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:60px">
                <h2>✅ Authorization successful!</h2>
                <p>You can close this tab and return to Pelagic.</p>
                <script>setTimeout(()=>window.close(),2000)</script>
            </body></html>"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream
                .write_all(response.as_bytes())
                .map_err(|e| format!("Failed to send response: {}", e))?;

            Ok(code)
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))?
    })
    .await;

    match result {
        Ok(code) => code,
        Err(_) => Err("OAuth timeout: no callback received within 120 seconds".to_string()),
    }
}

/// Exchange the authorization code for an access token.
pub async fn exchange_code(
    client_id: &str,
    client_secret: &str,
    code: &str,
) -> Result<INatTokenResponse, String> {
    let client = Client::new();

    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("code", code),
        ("redirect_uri", INAT_REDIRECT_URI),
        ("grant_type", "authorization_code"),
    ];

    let response = client
        .post(&format!("{}/oauth/token", INAT_WEB_BASE))
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read token response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Token exchange error ({}): {}", status, body));
    }

    serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse token response: {} - Body: {}", e, &body[..body.len().min(500)]))
}

/// Get the JWT API token from an OAuth access token.
/// iNaturalist requires this extra step: POST /users/api_token with Bearer auth.
pub async fn get_api_token(oauth_token: &str) -> Result<String, String> {
    let client = Client::new();

    let response = client
        .get(&format!("{}/users/api_token", INAT_WEB_BASE))
        .bearer_auth(oauth_token)
        .send()
        .await
        .map_err(|e| format!("API token request failed: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read API token response: {}", e))?;

    if !status.is_success() {
        return Err(format!("API token error ({}): {}", status, body));
    }

    // Response is {"api_token": "JWT..."}
    let parsed: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse API token response: {}", e))?;

    parsed
        .get("api_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "No api_token in response".to_string())
}

// ── API calls (read) ────────────────────────────────────────────────────────

/// Search iNaturalist taxa by name. No auth required.
pub async fn search_taxa(query: &str, limit: u32) -> Result<Vec<INatTaxonSimple>, String> {
    let client = Client::new();
    let url = format!(
        "{}/taxa?q={}&per_page={}&is_active=true",
        INAT_API_BASE,
        urlencoding::encode(query),
        limit.min(30)
    );

    let response = client
        .get(&url)
        .header("User-Agent", "PelagicDesktop/0.2 (dive photo manager)")
        .send()
        .await
        .map_err(|e| format!("iNaturalist taxa search failed: {}", e))?;

    if !response.status().is_success() {
        return Ok(vec![]);
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read iNat taxa response: {}", e))?;

    let result: INatTaxaResult = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse iNat taxa: {} - Body: {}", e, &body[..body.len().min(500)]))?;

    Ok(result
        .results
        .into_iter()
        .map(|t| INatTaxonSimple {
            id: t.id,
            scientific_name: t.name,
            common_name: t.preferred_common_name,
            rank: t.rank,
            iconic_group: t.iconic_taxon_name,
            photo_url: t.default_photo.and_then(|p| p.square_url),
            observations_count: t.observations_count,
        })
        .collect())
}

/// Get the current authenticated user info.
pub async fn get_current_user(api_token: &str) -> Result<INatUser, String> {
    let client = Client::new();
    let response = client
        .get(&format!("{}/users/me", INAT_API_BASE))
        .header("Authorization", format!("Bearer {}", api_token))
        .header("User-Agent", "PelagicDesktop/0.2 (dive photo manager)")
        .send()
        .await
        .map_err(|e| format!("Failed to get iNat user: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read iNat user response: {}", e))?;

    if !status.is_success() {
        return Err(format!("iNat user API error ({}): {}", status, body));
    }

    let result: INatUserResult = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse iNat user: {}", e))?;

    result
        .results
        .into_iter()
        .next()
        .ok_or_else(|| "No user in response".to_string())
}

// ── API calls (write — requires auth) ───────────────────────────────────────

/// Submit a new observation to iNaturalist.
/// Returns the observation ID and URL.
pub async fn submit_observation(
    api_token: &str,
    photo_path: &str,
    taxon_name: Option<&str>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    observed_on: Option<&str>, // ISO date: "2025-09-16"
    description: Option<&str>,
) -> Result<INatSubmissionResult, String> {
    let client = Client::new();

    // Step 1: Create the observation (without photo first)
    let mut obs = serde_json::Map::new();
    if let Some(name) = taxon_name {
        obs.insert("species_guess".to_string(), serde_json::json!(name));
    }
    if let (Some(lat), Some(lon)) = (latitude, longitude) {
        obs.insert("latitude".to_string(), serde_json::json!(lat));
        obs.insert("longitude".to_string(), serde_json::json!(lon));
    }
    if let Some(date) = observed_on {
        obs.insert("observed_on_string".to_string(), serde_json::json!(date));
    }
    if let Some(desc) = description {
        obs.insert("description".to_string(), serde_json::json!(desc));
    }

    let create_body = serde_json::json!({ "observation": obs });

    let create_response = client
        .post(&format!("{}/observations", INAT_API_BASE))
        .header("Authorization", format!("Bearer {}", api_token))
        .header("User-Agent", "PelagicDesktop/0.2 (dive photo manager)")
        .json(&create_body)
        .send()
        .await
        .map_err(|e| format!("Failed to create iNat observation: {}", e))?;

    let create_status = create_response.status();
    let create_body_text = create_response
        .text()
        .await
        .map_err(|e| format!("Failed to read create response: {}", e))?;

    if !create_status.is_success() {
        return Err(format!(
            "iNat observation creation failed ({}): {}",
            create_status, create_body_text
        ));
    }

    // Parse the created observation to get its ID
    let created: serde_json::Value = serde_json::from_str(&create_body_text)
        .map_err(|e| format!("Failed to parse created observation: {}", e))?;

    let observation_id = created
        .get("id")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| format!("No observation ID in response: {}", &create_body_text[..create_body_text.len().min(500)]))?;

    // Step 2: Upload the photo and attach it to the observation
    let photo_path_owned = photo_path.to_string();
    let photo_data = tokio::task::spawn_blocking(move || std::fs::read(&photo_path_owned))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to read photo file: {}", e))?;

    let filename = std::path::Path::new(photo_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("photo.jpg")
        .to_string();

    let file_part = reqwest::multipart::Part::bytes(photo_data)
        .file_name(filename)
        .mime_str("image/jpeg")
        .map_err(|e| format!("Failed to create multipart: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .text(
            "observation_photo[observation_id]",
            observation_id.to_string(),
        )
        .part("file", file_part);

    let photo_response = client
        .post(&format!("{}/observation_photos", INAT_API_BASE))
        .header("Authorization", format!("Bearer {}", api_token))
        .header("User-Agent", "PelagicDesktop/0.2 (dive photo manager)")
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to upload photo to iNat: {}", e))?;

    if !photo_response.status().is_success() {
        let err_body = photo_response.text().await.unwrap_or_default();
        log::warn!(
            "Photo upload to iNat observation {} failed: {}",
            observation_id,
            err_body
        );
        // Don't fail the whole submission — the observation was still created
    }

    let url = format!("{}/observations/{}", INAT_WEB_BASE, observation_id);

    Ok(INatSubmissionResult {
        observation_id,
        url,
    })
}
