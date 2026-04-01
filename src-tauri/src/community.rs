use reqwest::Client;
use serde::{Deserialize, Serialize};

// ── Supabase config ─────────────────────────────────────────────────────────

const SUPABASE_URL: &str = "https://nkojyogxqmaswhqheuvw.supabase.co";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rb2p5b2d4cW1hc3docWhldXZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNjg5ODgsImV4cCI6MjA5MDY0NDk4OH0.kert6Zvs0ooAo0REgmzeCtJiEbIFui7MRCeNNN9f-Jg";

// ── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommunityDiveSite {
    pub id: Option<String>,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub country: Option<String>,
    pub region: Option<String>,
    pub max_depth: Option<f32>,
    pub description: Option<String>,
    pub submitted_by: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommunityObservation {
    pub id: Option<String>,
    pub dive_site_id: Option<String>,
    pub species_name: String,
    pub scientific_name: Option<String>,
    pub category: Option<String>,
    pub depth: Option<f32>,
    pub observed_date: String,
    pub submitted_by: Option<String>,
    pub created_at: Option<String>,
}

/// Lightweight observation for display (no user IDs)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SiteSpeciesSummary {
    pub species_name: String,
    pub scientific_name: Option<String>,
    pub category: Option<String>,
    pub sighting_count: i64,
    pub last_seen: Option<String>,
    pub min_depth: Option<f32>,
    pub max_depth: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub refresh_token: String,
    pub user: AuthUser,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthUser {
    pub id: String,
    pub email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthRefreshResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub refresh_token: String,
    pub user: AuthUser,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommunityStats {
    pub total_sites: i64,
    pub total_observations: i64,
    pub total_species: i64,
}

// ── Auth ────────────────────────────────────────────────────────────────────

/// Sign up with email + password
pub async fn sign_up(email: &str, password: &str) -> Result<AuthResponse, String> {
    let client = Client::new();
    let url = format!("{}/auth/v1/signup", SUPABASE_URL);

    let body = serde_json::json!({
        "email": email,
        "password": password,
    });

    let response = client
        .post(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Sign up request failed: {}", e))?;

    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read sign up response: {}", e))?;

    if !status.is_success() {
        // Try to extract error message from Supabase response
        if let Ok(err) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(msg) = err.get("msg").or(err.get("error_description")).or(err.get("message")) {
                return Err(format!("Sign up failed: {}", msg.as_str().unwrap_or(&text)));
            }
        }
        return Err(format!("Sign up failed ({}): {}", status, text));
    }

    // Supabase signup response varies:
    // - If auto-confirm is enabled: returns full session with access_token
    // - If email confirmation required: returns user object without access_token
    if let Ok(auth) = serde_json::from_str::<AuthResponse>(&text) {
        return Ok(auth);
    }

    // No session returned — email confirmation is likely required.
    // Try to sign in immediately (works if auto-confirm is on at the project level
    // but the response shape is still different), otherwise tell the user.
    // First check if the response has a user id (signup succeeded but needs confirmation)
    let parsed: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse sign up response: {}", e))?;

    if parsed.get("id").is_some() {
        // User was created — try signing in directly
        match sign_in(email, password).await {
            Ok(auth) => Ok(auth),
            Err(_) => Err("Account created! Please check your email to confirm, then sign in.".to_string()),
        }
    } else {
        Err(format!("Unexpected sign up response: {}", text))
    }
}

/// Sign in with email + password
pub async fn sign_in(email: &str, password: &str) -> Result<AuthResponse, String> {
    let client = Client::new();
    let url = format!("{}/auth/v1/token?grant_type=password", SUPABASE_URL);

    let body = serde_json::json!({
        "email": email,
        "password": password,
    });

    let response = client
        .post(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Sign in request failed: {}", e))?;

    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read sign in response: {}", e))?;

    if !status.is_success() {
        if let Ok(err) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(msg) = err.get("error_description").or(err.get("msg")).or(err.get("message")) {
                return Err(format!("Sign in failed: {}", msg.as_str().unwrap_or(&text)));
            }
        }
        return Err(format!("Sign in failed ({}): {}", status, text));
    }

    serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse sign in response: {}", e))
}

/// Refresh an access token using a refresh token
pub async fn refresh_token(refresh_token: &str) -> Result<AuthRefreshResponse, String> {
    let client = Client::new();
    let url = format!("{}/auth/v1/token?grant_type=refresh_token", SUPABASE_URL);

    let body = serde_json::json!({
        "refresh_token": refresh_token,
    });

    let response = client
        .post(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read refresh response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Token refresh failed ({}): {}", status, text));
    }

    serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse refresh response: {}", e))
}

// ── Dive Sites ──────────────────────────────────────────────────────────────

/// Fetch all community dive sites (public, no auth needed)
pub async fn get_community_dive_sites() -> Result<Vec<CommunityDiveSite>, String> {
    let client = Client::new();
    let url = format!(
        "{}/rest/v1/dive_sites?select=id,name,lat,lon,country,region,max_depth,description,created_at&order=name.asc",
        SUPABASE_URL
    );

    let response = client
        .get(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch community dive sites: {}", e))?;

    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read dive sites response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Failed to fetch dive sites ({}): {}", status, text));
    }

    serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse dive sites: {} - {}", e, &text[..text.len().min(500)]))
}

/// Fetch community dive sites near a coordinate (within ~radius_km)
pub async fn get_nearby_dive_sites(lat: f64, lon: f64, radius_km: f64) -> Result<Vec<CommunityDiveSite>, String> {
    let deg = radius_km / 111.0; // rough km to degrees
    let client = Client::new();
    let url = format!(
        "{}/rest/v1/dive_sites?select=id,name,lat,lon,country,region,max_depth,description,created_at&lat=gte.{}&lat=lte.{}&lon=gte.{}&lon=lte.{}&order=name.asc",
        SUPABASE_URL,
        lat - deg, lat + deg, lon - deg, lon + deg
    );

    let response = client
        .get(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch nearby dive sites: {}", e))?;

    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read nearby sites response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Nearby sites query failed ({}): {}", status, text));
    }

    serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse nearby sites: {}", e))
}

/// Submit a new community dive site (requires auth token)
pub async fn submit_dive_site(token: &str, site: &CommunityDiveSite) -> Result<CommunityDiveSite, String> {
    let client = Client::new();
    let url = format!("{}/rest/v1/dive_sites", SUPABASE_URL);

    let body = serde_json::json!({
        "name": site.name,
        "lat": site.lat,
        "lon": site.lon,
        "country": site.country,
        "region": site.region,
        "max_depth": site.max_depth,
        "description": site.description,
        "submitted_by": site.submitted_by,
    });

    let response = client
        .post(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to submit dive site: {}", e))?;

    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read submit response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Failed to submit dive site ({}): {}", status, text));
    }

    let sites: Vec<CommunityDiveSite> = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse submitted site: {}", e))?;

    sites.into_iter().next()
        .ok_or_else(|| "No site returned after submission".to_string())
}

// ── Observations ────────────────────────────────────────────────────────────

/// Fetch observations for a specific dive site (public, no auth needed)
pub async fn get_site_observations(dive_site_id: &str) -> Result<Vec<CommunityObservation>, String> {
    let client = Client::new();
    let url = format!(
        "{}/rest/v1/observations?dive_site_id=eq.{}&select=id,dive_site_id,species_name,scientific_name,category,depth,observed_date,created_at&order=observed_date.desc",
        SUPABASE_URL, dive_site_id
    );

    let response = client
        .get(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch observations: {}", e))?;

    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read observations response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Failed to fetch observations ({}): {}", status, text));
    }

    serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse observations: {}", e))
}

/// Get species summary for a dive site — aggregated counts, last seen, depth range
pub async fn get_site_species_summary(dive_site_id: &str) -> Result<Vec<SiteSpeciesSummary>, String> {
    // Fetch all observations for the site, then aggregate client-side
    // (Supabase REST doesn't support GROUP BY directly)
    let observations = get_site_observations(dive_site_id).await?;

    let mut species_map: std::collections::HashMap<String, SiteSpeciesSummary> = std::collections::HashMap::new();

    for obs in &observations {
        let key = obs.scientific_name.clone().unwrap_or_else(|| obs.species_name.clone());
        let entry = species_map.entry(key).or_insert_with(|| SiteSpeciesSummary {
            species_name: obs.species_name.clone(),
            scientific_name: obs.scientific_name.clone(),
            category: obs.category.clone(),
            sighting_count: 0,
            last_seen: None,
            min_depth: None,
            max_depth: None,
        });

        entry.sighting_count += 1;

        // Track last seen
        if entry.last_seen.is_none() || entry.last_seen.as_ref() < Some(&obs.observed_date) {
            entry.last_seen = Some(obs.observed_date.clone());
        }

        // Track depth range
        if let Some(d) = obs.depth {
            entry.min_depth = Some(entry.min_depth.map_or(d, |m: f32| m.min(d)));
            entry.max_depth = Some(entry.max_depth.map_or(d, |m: f32| m.max(d)));
        }
    }

    let mut summaries: Vec<SiteSpeciesSummary> = species_map.into_values().collect();
    summaries.sort_by(|a, b| b.sighting_count.cmp(&a.sighting_count));
    Ok(summaries)
}

/// Submit an observation (requires auth token)
pub async fn submit_observation(token: &str, obs: &CommunityObservation) -> Result<CommunityObservation, String> {
    let client = Client::new();
    let url = format!("{}/rest/v1/observations", SUPABASE_URL);

    let body = serde_json::json!({
        "dive_site_id": obs.dive_site_id,
        "species_name": obs.species_name,
        "scientific_name": obs.scientific_name,
        "category": obs.category,
        "depth": obs.depth,
        "observed_date": obs.observed_date,
        "submitted_by": obs.submitted_by,
    });

    let response = client
        .post(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to submit observation: {}", e))?;

    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read submit response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Failed to submit observation ({}): {}", status, text));
    }

    let results: Vec<CommunityObservation> = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse submitted observation: {}", e))?;

    results.into_iter().next()
        .ok_or_else(|| "No observation returned after submission".to_string())
}

/// Submit multiple observations at once (batch, requires auth token)
pub async fn submit_observations_batch(
    token: &str,
    observations: &[CommunityObservation],
) -> Result<Vec<CommunityObservation>, String> {
    let client = Client::new();
    let url = format!("{}/rest/v1/observations", SUPABASE_URL);

    let body: Vec<serde_json::Value> = observations.iter().map(|obs| {
        serde_json::json!({
            "dive_site_id": obs.dive_site_id,
            "species_name": obs.species_name,
            "scientific_name": obs.scientific_name,
            "category": obs.category,
            "depth": obs.depth,
            "observed_date": obs.observed_date,
            "submitted_by": obs.submitted_by,
        })
    }).collect();

    let response = client
        .post(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to submit observations batch: {}", e))?;

    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read batch response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Failed to submit observations ({}): {}", status, text));
    }

    serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse batch results: {}", e))
}

/// Get community stats (public)
pub async fn get_community_stats() -> Result<CommunityStats, String> {
    let client = Client::new();

    // Get site count
    let sites_url = format!(
        "{}/rest/v1/dive_sites?select=id&head=true",
        SUPABASE_URL
    );
    let sites_resp = client
        .head(&sites_url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| format!("Failed to count sites: {}", e))?;

    let total_sites = sites_resp
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split('/').last())
        .and_then(|n| n.parse::<i64>().ok())
        .unwrap_or(0);

    // Get observation count
    let obs_url = format!(
        "{}/rest/v1/observations?select=id&head=true",
        SUPABASE_URL
    );
    let obs_resp = client
        .head(&obs_url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| format!("Failed to count observations: {}", e))?;

    let total_observations = obs_resp
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split('/').last())
        .and_then(|n| n.parse::<i64>().ok())
        .unwrap_or(0);

    // Get unique species count from observations
    let species_url = format!(
        "{}/rest/v1/observations?select=scientific_name",
        SUPABASE_URL
    );
    let species_resp = client
        .get(&species_url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch species: {}", e))?;

    let species_text = species_resp.text().await.unwrap_or_default();
    let species_list: Vec<serde_json::Value> = serde_json::from_str(&species_text).unwrap_or_default();
    let unique_species: std::collections::HashSet<String> = species_list
        .iter()
        .filter_map(|v| v.get("scientific_name").and_then(|s| s.as_str()).map(|s| s.to_string()))
        .collect();

    Ok(CommunityStats {
        total_sites,
        total_observations,
        total_species: unique_species.len() as i64,
    })
}
