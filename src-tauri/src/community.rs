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

/// Paginated response wrapper
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaginatedDiveSites {
    pub sites: Vec<CommunityDiveSite>,
    pub total: i64,
    pub offset: i64,
    pub limit: i64,
}

/// Paginated observations response
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaginatedObservations {
    pub observations: Vec<CommunityObservation>,
    pub total: i64,
    pub offset: i64,
    pub limit: i64,
}

/// Contributor info for a site
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SiteContributorInfo {
    pub contributor_count: i64,
    pub observation_count: i64,
}

// ── Community Search Types ──────────────────────────────────────────────────

/// Combined community search results returned to the frontend
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommunitySearchResults {
    pub sites: Vec<CommunityDiveSiteSearchResult>,
    pub species_sites: Vec<SpeciesSiteMatch>,
}

/// A community dive site enriched with observation/species counts
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommunityDiveSiteSearchResult {
    pub id: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub country: Option<String>,
    pub region: Option<String>,
    pub max_depth: Option<f32>,
    pub observation_count: i64,
    pub species_count: i64,
}

/// A species matched by search, with the community dive sites where it's been observed
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpeciesSiteMatch {
    pub species_name: String,
    pub scientific_name: Option<String>,
    pub category: Option<String>,
    pub sighting_count: i64,
    pub sites: Vec<CommunityDiveSiteBrief>,
}

/// Minimal dive site info for species-to-site mapping
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommunityDiveSiteBrief {
    pub id: String,
    pub name: String,
    pub country: Option<String>,
    pub region: Option<String>,
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

    // Don't send submitted_by — let Supabase set it from auth.uid() via a default or trigger
    let mut body = serde_json::json!({
        "name": site.name,
        "lat": site.lat,
        "lon": site.lon,
    });

    // Only include optional fields if they're not null
    if let Some(ref country) = site.country {
        body["country"] = serde_json::json!(country);
    }
    if let Some(ref region) = site.region {
        body["region"] = serde_json::json!(region);
    }
    if let Some(max_depth) = site.max_depth {
        body["max_depth"] = serde_json::json!(max_depth);
    }
    if let Some(ref description) = site.description {
        body["description"] = serde_json::json!(description);
    }

    log::info!("Community: submitting dive site '{}' ({}, {})", site.name, site.lat, site.lon);

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

    // If duplicate (409 Conflict), fetch the existing site by name+coords
    if status.as_u16() == 409 {
        log::info!("Community: site '{}' already exists, fetching existing", site.name);
        let fetch_url = format!(
            "{}/rest/v1/dive_sites?name=eq.{}&lat=eq.{}&lon=eq.{}&select=id,name,lat,lon,country,region,max_depth,description,created_at&limit=1",
            SUPABASE_URL,
            urlencoding::encode(&site.name),
            site.lat,
            site.lon
        );
        let fetch_resp = client
            .get(&fetch_url)
            .header("apikey", SUPABASE_ANON_KEY)
            .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch existing site: {}", e))?;
        let fetch_text = fetch_resp.text().await
            .map_err(|e| format!("Failed to read fetch response: {}", e))?;
        let existing: Vec<CommunityDiveSite> = serde_json::from_str(&fetch_text)
            .map_err(|e| format!("Failed to parse existing site: {}", e))?;
        return existing.into_iter().next()
            .ok_or_else(|| "Site exists but could not be fetched".to_string());
    }

    if !status.is_success() {
        log::error!("Community: submit failed ({}): {}", status, text);
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

    let mut body = serde_json::json!({
        "dive_site_id": obs.dive_site_id,
        "species_name": obs.species_name,
    });
    if let Some(ref v) = obs.scientific_name { body["scientific_name"] = serde_json::json!(v); }
    if let Some(ref v) = obs.category { body["category"] = serde_json::json!(v); }
    if let Some(v) = obs.depth { body["depth"] = serde_json::json!(v); }
    body["observed_date"] = serde_json::json!(obs.observed_date);

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

    // 409 = duplicate, that's fine — observation already exists
    if status.as_u16() == 409 {
        return Err("duplicate".to_string());
    }

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
        let mut row = serde_json::json!({
            "dive_site_id": obs.dive_site_id,
            "species_name": obs.species_name,
        });
        if let Some(ref v) = obs.scientific_name { row["scientific_name"] = serde_json::json!(v); }
        if let Some(ref v) = obs.category { row["category"] = serde_json::json!(v); }
        if let Some(v) = obs.depth { row["depth"] = serde_json::json!(v); }
        row["observed_date"] = serde_json::json!(&obs.observed_date);
        row
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

    // Get site count — use GET with Range 0-0 so content-range is reliably returned
    let sites_url = format!(
        "{}/rest/v1/dive_sites?select=id",
        SUPABASE_URL
    );
    let sites_resp = client
        .get(&sites_url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .header("Range", "0-0")
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| format!("Failed to count sites: {}", e))?;

    let total_sites = parse_content_range_total(sites_resp.headers());

    // Get observation count
    let obs_url = format!(
        "{}/rest/v1/observations?select=id",
        SUPABASE_URL
    );
    let obs_resp = client
        .get(&obs_url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .header("Range", "0-0")
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| format!("Failed to count observations: {}", e))?;

    let total_observations = parse_content_range_total(obs_resp.headers());

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

// ── Paginated / Search endpoints ────────────────────────────────────────────

/// Helper: parse total count from Supabase content-range header (e.g. "0-49/123")
fn parse_content_range_total(headers: &reqwest::header::HeaderMap) -> i64 {
    headers
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split('/').last())
        .and_then(|n| n.parse::<i64>().ok())
        .unwrap_or(0)
}

/// Fetch community dive sites with pagination and optional search
pub async fn get_dive_sites_paginated(
    offset: i64,
    limit: i64,
    search: Option<&str>,
) -> Result<PaginatedDiveSites, String> {
    let client = Client::new();
    let limit = limit.min(100).max(1); // clamp 1..100
    let offset = offset.max(0);

    let mut url = format!(
        "{}/rest/v1/dive_sites?select=id,name,lat,lon,country,region,max_depth,description,created_at&order=name.asc",
        SUPABASE_URL
    );

    // Server-side search: filter by name, country, or region using Supabase ilike
    if let Some(q) = search {
        let q = q.trim();
        if !q.is_empty() {
            let encoded = urlencoding::encode(q);
            url.push_str(&format!(
                "&or=(name.ilike.*{}*,country.ilike.*{}*,region.ilike.*{}*)",
                encoded, encoded, encoded
            ));
        }
    }

    let response = client
        .get(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .header("Range", format!("{}-{}", offset, offset + limit - 1))
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch dive sites: {}", e))?;

    let total = parse_content_range_total(response.headers());
    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read dive sites response: {}", e))?;

    // 206 Partial Content or 200 OK are both valid
    if !status.is_success() && status.as_u16() != 206 {
        return Err(format!("Failed to fetch dive sites ({}): {}", status, text));
    }

    let sites: Vec<CommunityDiveSite> = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse dive sites: {}", e))?;

    Ok(PaginatedDiveSites {
        sites,
        total,
        offset,
        limit,
    })
}

/// Fetch observations for a dive site with pagination
pub async fn get_site_observations_paginated(
    dive_site_id: &str,
    offset: i64,
    limit: i64,
) -> Result<PaginatedObservations, String> {
    let client = Client::new();
    let limit = limit.min(200).max(1);
    let offset = offset.max(0);

    let url = format!(
        "{}/rest/v1/observations?dive_site_id=eq.{}&select=id,dive_site_id,species_name,scientific_name,category,depth,observed_date,created_at&order=observed_date.desc",
        SUPABASE_URL, dive_site_id
    );

    let response = client
        .get(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .header("Range", format!("{}-{}", offset, offset + limit - 1))
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch observations: {}", e))?;

    let total = parse_content_range_total(response.headers());
    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Failed to read observations response: {}", e))?;

    if !status.is_success() && status.as_u16() != 206 {
        return Err(format!("Failed to fetch observations ({}): {}", status, text));
    }

    let observations: Vec<CommunityObservation> = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse observations: {}", e))?;

    Ok(PaginatedObservations {
        observations,
        total,
        offset,
        limit,
    })
}

/// Get contributor info for a site: distinct submitters + total observation count
pub async fn get_site_contributor_info(dive_site_id: &str) -> Result<SiteContributorInfo, String> {
    let client = Client::new();
    let url = format!(
        "{}/rest/v1/observations?dive_site_id=eq.{}&select=submitted_by",
        SUPABASE_URL, dive_site_id
    );

    let response = client
        .get(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch contributor info: {}", e))?;

    let total = parse_content_range_total(response.headers());
    let text = response.text().await.unwrap_or_default();
    let rows: Vec<serde_json::Value> = serde_json::from_str(&text).unwrap_or_default();

    let unique_contributors: std::collections::HashSet<String> = rows
        .iter()
        .filter_map(|v| v.get("submitted_by").and_then(|s| s.as_str()).map(|s| s.to_string()))
        .collect();

    Ok(SiteContributorInfo {
        contributor_count: unique_contributors.len() as i64,
        observation_count: total,
    })
}

/// Get distinct species names for autocomplete
pub async fn get_distinct_species() -> Result<Vec<String>, String> {
    let client = Client::new();
    let url = format!(
        "{}/rest/v1/observations?select=species_name&order=species_name.asc",
        SUPABASE_URL
    );

    let response = client
        .get(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch species: {}", e))?;

    let text = response.text().await.unwrap_or_default();
    let rows: Vec<serde_json::Value> = serde_json::from_str(&text).unwrap_or_default();

    let mut species: Vec<String> = rows
        .iter()
        .filter_map(|v| v.get("species_name").and_then(|s| s.as_str()).map(|s| s.to_string()))
        .collect::<std::collections::HashSet<String>>()
        .into_iter()
        .collect();
    species.sort();
    Ok(species)
}

// ── Community Search ────────────────────────────────────────────────────────

/// Search community dive sites and species observations in parallel.
/// Returns matching sites (with counts) and species-to-site mappings.
pub async fn community_search(query: &str) -> Result<CommunitySearchResults, String> {
    let query = query.trim();
    if query.is_empty() || query.len() < 2 {
        return Ok(CommunitySearchResults {
            sites: vec![],
            species_sites: vec![],
        });
    }

    let encoded = urlencoding::encode(query);
    let client = Client::new();

    // Run site search and species/observation search in parallel
    let (sites_result, species_result) = tokio::join!(
        search_community_sites(&client, &encoded),
        search_community_species(&client, &encoded),
    );

    Ok(CommunitySearchResults {
        sites: sites_result.unwrap_or_default(),
        species_sites: species_result.unwrap_or_default(),
    })
}

/// Search community dive sites by name/country/region, enriched with observation + species counts
async fn search_community_sites(
    client: &Client,
    encoded_query: &str,
) -> Result<Vec<CommunityDiveSiteSearchResult>, String> {
    let url = format!(
        "{}/rest/v1/dive_sites?select=id,name,lat,lon,country,region,max_depth&or=(name.ilike.*{}*,country.ilike.*{}*,region.ilike.*{}*)&order=name.asc&limit=20",
        SUPABASE_URL, encoded_query, encoded_query, encoded_query
    );

    let response = client
        .get(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .map_err(|e| format!("Community site search failed: {}", e))?;

    let text = response.text().await.unwrap_or_default();
    let sites: Vec<serde_json::Value> = serde_json::from_str(&text).unwrap_or_default();

    if sites.is_empty() {
        return Ok(vec![]);
    }

    // Collect site IDs for batch observation query
    let site_ids: Vec<String> = sites
        .iter()
        .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

    // Fetch observation counts per site in one query
    let ids_param = site_ids.join(",");
    let obs_url = format!(
        "{}/rest/v1/observations?dive_site_id=in.({})\
        &select=dive_site_id,species_name",
        SUPABASE_URL, ids_param
    );

    let obs_response = client
        .get(&obs_url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .ok();

    // Build per-site observation + species counts
    let mut obs_counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut species_counts: std::collections::HashMap<String, std::collections::HashSet<String>> =
        std::collections::HashMap::new();

    if let Some(resp) = obs_response {
        if let Ok(obs_text) = resp.text().await {
            let obs: Vec<serde_json::Value> = serde_json::from_str(&obs_text).unwrap_or_default();
            for o in &obs {
                if let Some(sid) = o.get("dive_site_id").and_then(|v| v.as_str()) {
                    *obs_counts.entry(sid.to_string()).or_insert(0) += 1;
                    if let Some(sp) = o.get("species_name").and_then(|v| v.as_str()) {
                        species_counts
                            .entry(sid.to_string())
                            .or_default()
                            .insert(sp.to_string());
                    }
                }
            }
        }
    }

    // Build enriched results
    let results = sites
        .iter()
        .filter_map(|s| {
            let id = s.get("id").and_then(|v| v.as_str())?.to_string();
            Some(CommunityDiveSiteSearchResult {
                id: id.clone(),
                name: s.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                lat: s.get("lat").and_then(|v| v.as_f64()).unwrap_or(0.0),
                lon: s.get("lon").and_then(|v| v.as_f64()).unwrap_or(0.0),
                country: s.get("country").and_then(|v| v.as_str()).map(|s| s.to_string()),
                region: s.get("region").and_then(|v| v.as_str()).map(|s| s.to_string()),
                max_depth: s.get("max_depth").and_then(|v| v.as_f64()).map(|d| d as f32),
                observation_count: obs_counts.get(&id).copied().unwrap_or(0),
                species_count: species_counts.get(&id).map(|s| s.len() as i64).unwrap_or(0),
            })
        })
        .collect();

    Ok(results)
}

/// Search observations by species name, group by species, and resolve the dive sites where each was observed
async fn search_community_species(
    client: &Client,
    encoded_query: &str,
) -> Result<Vec<SpeciesSiteMatch>, String> {
    // Search observations matching species name or scientific name
    let url = format!(
        "{}/rest/v1/observations?select=species_name,scientific_name,category,dive_site_id\
        &or=(species_name.ilike.*{}*,scientific_name.ilike.*{}*)\
        &limit=200",
        SUPABASE_URL, encoded_query, encoded_query
    );

    let response = client
        .get(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .map_err(|e| format!("Community species search failed: {}", e))?;

    let text = response.text().await.unwrap_or_default();
    let obs: Vec<serde_json::Value> = serde_json::from_str(&text).unwrap_or_default();

    if obs.is_empty() {
        return Ok(vec![]);
    }

    // Group by species_name → { scientific_name, category, sighting_count, dive_site_ids }
    struct SpeciesAgg {
        scientific_name: Option<String>,
        category: Option<String>,
        count: i64,
        site_ids: std::collections::HashSet<String>,
    }

    let mut species_map: std::collections::HashMap<String, SpeciesAgg> =
        std::collections::HashMap::new();

    for o in &obs {
        let name = match o.get("species_name").and_then(|v| v.as_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let entry = species_map.entry(name).or_insert_with_key(|_| SpeciesAgg {
            scientific_name: o.get("scientific_name").and_then(|v| v.as_str()).map(|s| s.to_string()),
            category: o.get("category").and_then(|v| v.as_str()).map(|s| s.to_string()),
            count: 0,
            site_ids: std::collections::HashSet::new(),
        });
        entry.count += 1;
        if let Some(sid) = o.get("dive_site_id").and_then(|v| v.as_str()) {
            entry.site_ids.insert(sid.to_string());
        }
    }

    // Collect all unique site IDs across all matched species
    let all_site_ids: std::collections::HashSet<String> = species_map
        .values()
        .flat_map(|a| a.site_ids.iter().cloned())
        .collect();

    if all_site_ids.is_empty() {
        // Species matched but no site links — return species without sites
        let results = species_map
            .into_iter()
            .map(|(name, agg)| SpeciesSiteMatch {
                species_name: name,
                scientific_name: agg.scientific_name,
                category: agg.category,
                sighting_count: agg.count,
                sites: vec![],
            })
            .collect();
        return Ok(results);
    }

    // Fetch the dive sites by ID
    let ids_param: String = all_site_ids.into_iter().collect::<Vec<_>>().join(",");
    let sites_url = format!(
        "{}/rest/v1/dive_sites?id=in.({})\
        &select=id,name,country,region",
        SUPABASE_URL, ids_param
    );

    let sites_response = client
        .get(&sites_url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .ok();

    let mut sites_lookup: std::collections::HashMap<String, CommunityDiveSiteBrief> =
        std::collections::HashMap::new();

    if let Some(resp) = sites_response {
        if let Ok(sites_text) = resp.text().await {
            let sites: Vec<serde_json::Value> =
                serde_json::from_str(&sites_text).unwrap_or_default();
            for s in &sites {
                if let Some(id) = s.get("id").and_then(|v| v.as_str()) {
                    sites_lookup.insert(
                        id.to_string(),
                        CommunityDiveSiteBrief {
                            id: id.to_string(),
                            name: s.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            country: s.get("country").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            region: s.get("region").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        },
                    );
                }
            }
        }
    }

    // Build final results: species with their resolved sites, sorted by sighting count
    let mut results: Vec<SpeciesSiteMatch> = species_map
        .into_iter()
        .map(|(name, agg)| {
            let sites: Vec<CommunityDiveSiteBrief> = agg
                .site_ids
                .iter()
                .filter_map(|sid| sites_lookup.get(sid).cloned())
                .collect();
            SpeciesSiteMatch {
                species_name: name,
                scientific_name: agg.scientific_name,
                category: agg.category,
                sighting_count: agg.count,
                sites,
            }
        })
        .collect();

    results.sort_by(|a, b| b.sighting_count.cmp(&a.sighting_count));
    Ok(results)
}
