use reqwest::Client;
use serde::{Deserialize, Serialize};

// ── GBIF types ──────────────────────────────────────────────────────────────

#[allow(non_snake_case)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GbifSpeciesMatch {
    pub usageKey: Option<i64>,
    pub scientificName: Option<String>,
    pub canonicalName: Option<String>,
    pub rank: Option<String>,
    pub status: Option<String>,
    pub confidence: Option<i32>,
    pub kingdom: Option<String>,
    pub phylum: Option<String>,
    #[serde(rename = "class")]
    pub class_name: Option<String>,
    pub order: Option<String>,
    pub family: Option<String>,
    pub genus: Option<String>,
    pub species: Option<String>,
    pub matchType: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GbifOccurrenceResult {
    pub offset: Option<i64>,
    pub limit: Option<i64>,
    pub count: Option<i64>,
    pub results: Vec<GbifOccurrence>,
}

#[allow(non_snake_case)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GbifOccurrence {
    pub key: Option<i64>,
    pub scientificName: Option<String>,
    pub decimalLatitude: Option<f64>,
    pub decimalLongitude: Option<f64>,
    pub eventDate: Option<String>,
    pub year: Option<i32>,
    pub month: Option<i32>,
    pub country: Option<String>,
    pub basisOfRecord: Option<String>,
    pub datasetName: Option<String>,
    pub iucnRedListCategory: Option<String>,
}

#[allow(non_snake_case, dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GbifSpeciesDetail {
    pub key: Option<i64>,
    pub scientificName: Option<String>,
    pub canonicalName: Option<String>,
    pub kingdom: Option<String>,
    pub phylum: Option<String>,
    #[serde(rename = "class")]
    pub class_name: Option<String>,
    pub order: Option<String>,
    pub family: Option<String>,
    pub genus: Option<String>,
    pub species: Option<String>,
    pub taxonomicStatus: Option<String>,
    pub rank: Option<String>,
}

// ── OBIS types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ObisOccurrenceResult {
    pub total: Option<i64>,
    pub results: Vec<ObisOccurrence>,
}

#[allow(non_snake_case)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ObisOccurrence {
    pub id: Option<String>,
    pub scientificName: Option<String>,
    #[serde(rename = "decimalLatitude")]
    pub decimal_latitude: Option<f64>,
    #[serde(rename = "decimalLongitude")]
    pub decimal_longitude: Option<f64>,
    pub eventDate: Option<String>,
    pub year: Option<i32>,
    pub depth: Option<f64>,
    pub sst: Option<f64>,
    pub sss: Option<f64>,
    pub bathymetry: Option<f64>,
    pub shoredistance: Option<f64>,
    pub dataset_id: Option<String>,
}

// ── Unified output types for the frontend ───────────────────────────────────

/// Enrichment data for a species, returned to the frontend
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpeciesEnrichment {
    pub scientific_name: String,
    pub gbif_taxon_key: Option<i64>,
    pub iucn_status: Option<String>,
    pub kingdom: Option<String>,
    pub phylum: Option<String>,
    pub class_name: Option<String>,
    pub order: Option<String>,
    pub family: Option<String>,
    pub genus: Option<String>,
}

/// A nearby sighting from GBIF or OBIS
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NearbySighting {
    pub source: String, // "gbif" or "obis"
    pub scientific_name: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub date: Option<String>,
    pub year: Option<i32>,
    pub depth: Option<f64>,
    pub country: Option<String>,
    pub dataset: Option<String>,
}

// ── GBIF API calls ──────────────────────────────────────────────────────────

/// Match a species name to GBIF taxonomy. Returns taxonomy info + GBIF taxon key.
/// No auth required.
pub async fn gbif_species_match(scientific_name: &str) -> Result<GbifSpeciesMatch, String> {
    let client = Client::new();
    let url = format!(
        "https://api.gbif.org/v1/species/match?name={}&verbose=true",
        urlencoding::encode(scientific_name)
    );

    let response = client
        .get(&url)
        .header("User-Agent", "PelagicDesktop/0.2 (dive photo manager)")
        .send()
        .await
        .map_err(|e| format!("GBIF API request failed: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read GBIF response: {}", e))?;

    if !status.is_success() {
        return Err(format!("GBIF API error ({}): {}", status, body));
    }

    serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse GBIF species match: {} - Body: {}", e, &body[..body.len().min(500)]))
}

/// Get IUCN threat status for a taxon from GBIF.
/// Uses the IUCN Red List dataset on GBIF (datasetKey=19491596-35ae-4a91-9a98-85cf505f1571).
pub async fn gbif_iucn_status(taxon_key: i64) -> Result<Option<String>, String> {
    let client = Client::new();
    let url = format!(
        "https://api.gbif.org/v1/occurrence/search?taxonKey={}&datasetKey=19491596-35ae-4a91-9a98-85cf505f1571&limit=1",
        taxon_key
    );

    let response = client
        .get(&url)
        .header("User-Agent", "PelagicDesktop/0.2 (dive photo manager)")
        .send()
        .await
        .map_err(|e| format!("GBIF IUCN request failed: {}", e))?;

    if !response.status().is_success() {
        // Not critical — just return None
        return Ok(None);
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read GBIF IUCN response: {}", e))?;

    let result: GbifOccurrenceResult = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse GBIF IUCN result: {}", e))?;

    Ok(result
        .results
        .first()
        .and_then(|occ| occ.iucnRedListCategory.clone()))
}

/// Search for species occurrences near a location.
/// `radius_deg` is approximate radius in decimal degrees (0.5 ≈ 55 km).
pub async fn gbif_occurrences_nearby(
    taxon_key: i64,
    lat: f64,
    lon: f64,
    radius_deg: f64,
    limit: u32,
) -> Result<Vec<NearbySighting>, String> {
    let client = Client::new();
    // GBIF uses a WKT geometry filter via the `geometry` param
    let wkt = format!(
        "POLYGON(({} {},{} {},{} {},{} {},{} {}))",
        lon - radius_deg, lat - radius_deg,
        lon + radius_deg, lat - radius_deg,
        lon + radius_deg, lat + radius_deg,
        lon - radius_deg, lat + radius_deg,
        lon - radius_deg, lat - radius_deg,
    );
    
    let url = format!(
        "https://api.gbif.org/v1/occurrence/search?taxonKey={}&geometry={}&limit={}&hasCoordinate=true",
        taxon_key,
        urlencoding::encode(&wkt),
        limit.min(300)
    );

    let response = client
        .get(&url)
        .header("User-Agent", "PelagicDesktop/0.2 (dive photo manager)")
        .send()
        .await
        .map_err(|e| format!("GBIF occurrence search failed: {}", e))?;

    if !response.status().is_success() {
        return Ok(vec![]);
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read GBIF occurrence response: {}", e))?;

    let result: GbifOccurrenceResult = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse GBIF occurrences: {}", e))?;

    Ok(result
        .results
        .into_iter()
        .map(|occ| NearbySighting {
            source: "gbif".to_string(),
            scientific_name: occ.scientificName,
            latitude: occ.decimalLatitude,
            longitude: occ.decimalLongitude,
            date: occ.eventDate,
            year: occ.year,
            depth: None,
            country: occ.country,
            dataset: occ.datasetName,
        })
        .collect())
}

// ── OBIS API calls ──────────────────────────────────────────────────────────

/// Search for marine species occurrences near a location via OBIS.
/// Returns enriched data including SST, depth, salinity.
/// No auth required.
pub async fn obis_occurrences_nearby(
    scientific_name: &str,
    lat: f64,
    lon: f64,
    radius_deg: f64,
    limit: u32,
) -> Result<Vec<NearbySighting>, String> {
    let client = Client::new();
    // OBIS uses WKT geometry
    let wkt = format!(
        "POLYGON(({} {},{} {},{} {},{} {},{} {}))",
        lon - radius_deg, lat - radius_deg,
        lon + radius_deg, lat - radius_deg,
        lon + radius_deg, lat + radius_deg,
        lon - radius_deg, lat + radius_deg,
        lon - radius_deg, lat - radius_deg,
    );

    let url = format!(
        "https://api.obis.org/v3/occurrence?scientificname={}&geometry={}&size={}",
        urlencoding::encode(scientific_name),
        urlencoding::encode(&wkt),
        limit.min(300)
    );

    let response = client
        .get(&url)
        .header("User-Agent", "PelagicDesktop/0.2 (dive photo manager)")
        .send()
        .await
        .map_err(|e| format!("OBIS occurrence search failed: {}", e))?;

    if !response.status().is_success() {
        return Ok(vec![]);
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read OBIS response: {}", e))?;

    let result: ObisOccurrenceResult = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse OBIS occurrences: {}", e))?;

    Ok(result
        .results
        .into_iter()
        .map(|occ| NearbySighting {
            source: "obis".to_string(),
            scientific_name: occ.scientificName,
            latitude: occ.decimal_latitude,
            longitude: occ.decimal_longitude,
            date: occ.eventDate,
            year: occ.year,
            depth: occ.depth,
            country: None,
            dataset: occ.dataset_id,
        })
        .collect())
}

// ── Composite enrichment function ───────────────────────────────────────────

/// Full enrichment: match species name on GBIF, get taxonomy + IUCN status.
/// Caches nothing — the caller (commands.rs) handles caching in SQLite.
pub async fn enrich_species(scientific_name: &str) -> Result<SpeciesEnrichment, String> {
    let matched = gbif_species_match(scientific_name).await?;

    let iucn_status = if let Some(key) = matched.usageKey {
        gbif_iucn_status(key).await.unwrap_or(None)
    } else {
        None
    };

    Ok(SpeciesEnrichment {
        scientific_name: scientific_name.to_string(),
        gbif_taxon_key: matched.usageKey,
        iucn_status,
        kingdom: matched.kingdom,
        phylum: matched.phylum,
        class_name: matched.class_name,
        order: matched.order,
        family: matched.family,
        genus: matched.genus,
    })
}
