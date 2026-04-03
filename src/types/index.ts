// Core data models for Pelagic

export interface Trip {
  id: number;
  name: string;
  location: string;
  resort?: string;
  date_start: string; // ISO date
  date_end: string;   // ISO date
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Dive {
  id: number;
  trip_id: number;
  dive_number: number;
  
  // From dive computer
  date: string;       // ISO date
  time: string;       // HH:MM:SS
  duration_seconds: number;
  max_depth_m: number;
  mean_depth_m: number;
  water_temp_c?: number;
  air_temp_c?: number;
  surface_pressure_bar?: number;
  otu?: number;
  cns_percent?: number;
  dive_computer_model?: string;
  dive_computer_serial?: string;
  
  // User-editable fields
  location?: string;
  ocean?: string;
  visibility_m?: number;
  gear_profile_id?: number;
  buddy?: string;
  divemaster?: string;
  guide?: string;
  instructor?: string;
  comments?: string;
  
  // GPS coordinates
  latitude?: number;
  longitude?: number;
  dive_site_id?: number;
  
  // Dive type flags
  is_fresh_water: boolean;
  is_boat_dive: boolean;
  is_drift_dive: boolean;
  is_night_dive: boolean;
  is_training_dive: boolean;
  
  created_at: string;
  updated_at: string;
}

export interface DiveSample {
  id: number;
  dive_id: number;
  time_seconds: number;
  depth_m: number;
  temp_c?: number;
  pressure_bar?: number;
  ndl_seconds?: number;
  rbt_seconds?: number;
}

export interface TankPressure {
  id: number;
  dive_id: number;
  sensor_id: number;  // Matches Rust i64 - Garmin sensor serial numbers
  sensor_name?: string;
  time_seconds: number;
  pressure_bar: number;
}

export interface DiveTank {
  id: number;
  dive_id: number;
  sensor_id: number;        // Matches TankPressure.sensor_id
  sensor_name?: string;
  gas_index: number;        // Gas mix index (0=primary, 1=secondary, etc)
  o2_percent?: number;      // Oxygen percentage (21 for air, 32 for EAN32, etc)
  he_percent?: number;      // Helium percentage (0 for nitrox, >0 for trimix)
  start_pressure_bar?: number;
  end_pressure_bar?: number;
  volume_used_liters?: number;
}

export interface DiveEvent {
  id: number;
  dive_id: number;
  time_seconds: number;
  event_type: number;
  name: string;
  flags?: number;
  value?: number;
}

export interface PhotoDiveContext {
  depth_at_capture_m?: number;
  temp_at_capture_c?: number;
  time_into_dive_seconds?: number;
  dive_date: string;
  dive_time: string;
  dive_duration_seconds: number;
  max_depth_m: number;
  mean_depth_m: number;
  water_temp_c?: number;
  dive_location?: string;
  dive_site?: string;
}

export interface GearProfile {
  id: number;
  name: string;
  bcd?: string;
  wetsuit?: string;
  fins?: string;
  weights_kg?: number;
  cylinder_liters?: number;
  cylinder_material?: 'steel' | 'aluminium';
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Equipment Catalogue types

export interface EquipmentCategory {
  id: number;
  name: string;
  icon?: string;
  sort_order: number;
  category_type: 'dive' | 'camera' | 'both';
}

export interface Equipment {
  id: number;
  category_id: number;
  name?: string;  // Optional - can use brand+model as display name
  brand?: string;
  model?: string;
  serial_number?: string;
  purchase_date?: string;
  notes?: string;
  is_retired: boolean;
  created_at: string;
  updated_at: string;
}

export interface EquipmentWithCategory extends Equipment {
  category_name: string;
  category_type: 'dive' | 'camera' | 'both';
}

export interface EquipmentSet {
  id: number;
  name: string;
  description?: string;
  set_type: 'dive' | 'camera';
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface EquipmentSetWithItems extends EquipmentSet {
  items: EquipmentWithCategory[];
}

export interface Photo {
  id: number;
  trip_id: number;
  dive_id?: number;        // null for trip-level photos
  file_path: string;
  thumbnail_path?: string;
  filename: string;
  capture_time?: string;   // ISO datetime from EXIF
  width?: number;
  height?: number;
  file_size_bytes?: number;
  
  // RAW + processed versioning
  is_processed: boolean;
  raw_photo_id?: number;   // FK to parent RAW if this is processed
  
  // Rating (0-5 stars)
  rating?: number;
  
  // Metadata
  camera_make?: string;
  camera_model?: string;
  lens_info?: string;
  focal_length_mm?: number;
  aperture?: number;
  shutter_speed?: string;
  iso?: number;
  exposure_compensation?: number;  // EV stops (e.g., +0.7, -1.3)
  white_balance?: string;           // Auto, Manual, etc.
  flash_fired?: boolean;
  metering_mode?: string;           // Spot, Matrix, Center-weighted
  gps_latitude?: number;
  gps_longitude?: number;
  caption?: string;
  
  created_at: string;
  updated_at: string;
}

export interface DiveStats {
  photo_count: number;
  species_count: number;
}

/**
 * Extended dive info with stats and thumbnail paths for batch loading
 * Reduces IPC calls from 2N to 1 when loading dive cards
 */
export interface DiveWithDetails extends Dive {
  photo_count: number;
  species_count: number;
  thumbnail_paths: string[];
}

export interface SpeciesTag {
  id: number;
  name: string;
  category?: string;       // e.g., "Fish", "Invertebrate", "Coral"
  scientific_name?: string;
}

export interface GeneralTag {
  id: number;
  name: string;
}

export interface PhotoSpeciesTag {
  photo_id: number;
  species_tag_id: number;
}

export interface PhotoGeneralTag {
  photo_id: number;
  general_tag_id: number;
}

// UI state types

export type ViewMode = 'trips' | 'trip' | 'dive' | 'search';

export type SidebarGroupMode = 'trips' | 'timeline' | 'location' | 'type';

export type ContentLayout = 'default' | 'side-by-side' | 'photo-focus' | 'chart-focus';

export interface AppState {
  viewMode: ViewMode;
  selectedTripId: number | null;
  selectedDiveId: number | null;
  selectedPhotoId: number | null;
}

export interface TripWithStats extends Trip {
  dive_count: number;
  photo_count: number;
  deepest_dive_m?: number;
  total_underwater_seconds: number;
  species_count: number;
}

export interface DiveWithStats extends Dive {
  photo_count: number;
  species_count: number;
}

// Grid item types
export type GridItem = 
  | { type: 'dive'; dive: DiveWithStats }
  | { type: 'photo'; photo: Photo };

// Photo import types
export interface ScannedPhoto {
  file_path: string;
  filename: string;
  capture_time?: string;
  camera_make?: string;
  camera_model?: string;
  file_size_bytes: number;
}

export interface PhotoGroup {
  photos: ScannedPhoto[];
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  suggested_dive_id?: number;
  suggested_dive_number?: number;
}

export interface PhotoImportPreview {
  groups: PhotoGroup[];
  unmatched_photos: ScannedPhoto[];
  photos_without_time: ScannedPhoto[];
}

export interface PhotoAssignment {
  file_path: string;
  dive_id?: number;
}

// Sort options
export type PhotoSortField = 'capture_time' | 'filename' | 'rating';
export type SortDirection = 'asc' | 'desc';

// Filter options
export interface PhotoFilter {
  dateFrom?: string;     // ISO date
  dateTo?: string;       // ISO date
  ratingMin?: number;    // 0-5
  ratingMax?: number;    // 0-5
  cameraModel?: string;
  lensModel?: string;    // Lens description
  isoMin?: number;
  isoMax?: number;
  apertureMin?: number;  // f-stop
  apertureMax?: number;  // f-stop
  focalLengthMin?: number; // mm
  focalLengthMax?: number; // mm
  widthMin?: number;
  widthMax?: number;
  heightMin?: number;
  heightMax?: number;
  hasRaw?: boolean;      // true = only RAW pairs, false = only without RAW, undefined = all
  isProcessed?: boolean; // true = only processed, false = only RAW, undefined = all
  exposureCompensationMin?: number;
  exposureCompensationMax?: number;
  whiteBalance?: string;
  flashFired?: boolean;
  meteringMode?: string;
  tripId?: number;
  diveId?: number;
}

// Statistics types
export interface Statistics {
  total_trips: number;
  total_dives: number;
  total_bottom_time_seconds: number;
  total_photos: number;
  total_species: number;
  deepest_dive_m?: number;
  avg_depth_m?: number;
  coldest_water_c?: number;
  warmest_water_c?: number;
  photos_with_species: number;
  rated_photos: number;
}

export interface SpeciesCount {
  id: number;
  name: string;
  category?: string;
  scientific_name?: string;
  photo_count: number;
}

export interface CameraStat {
  camera_model: string;
  photo_count: number;
}

export interface YearlyStat {
  year: string;
  dive_count: number;
  total_time_seconds: number;
  avg_depth_m?: number;
}

// Export types
export interface TripExport {
  trip: Trip;
  dives: DiveExport[];
  photo_count: number;
  species_count: number;
}

export interface DiveExport {
  dive: Dive;
  photo_count: number;
  species: string[];
}

export interface SpeciesExport {
  name: string;
  scientific_name?: string;
  category?: string;
  photo_count: number;
  dive_count: number;
  trip_count: number;
}

// Search types
export interface SearchResults {
  trips: Trip[];
  dives: Dive[];
  photos: Photo[];
  species: SpeciesTag[];
  tags: GeneralTag[];
  dive_sites: DiveSite[];
}

export interface DiveSite {
  id: number;
  name: string;
  lat: number;
  lon: number;
  is_user_created: boolean;
}

// Community search types
export interface CommunitySearchResults {
  sites: CommunityDiveSiteSearchResult[];
  species_sites: SpeciesSiteMatch[];
}

export interface CommunityDiveSiteSearchResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country?: string;
  region?: string;
  max_depth?: number;
  observation_count: number;
  species_count: number;
}

export interface SpeciesSiteMatch {
  species_name: string;
  scientific_name?: string;
  category?: string;
  sighting_count: number;
  sites: CommunityDiveSiteBrief[];
}

export interface CommunityDiveSiteBrief {
  id: string;
  name: string;
  country?: string;
  region?: string;
}

// Map types
export interface DiveMapPoint {
  dive_id: number;
  trip_id: number;
  dive_number: number;
  location?: string;
  latitude: number;
  longitude: number;
  date: string;
  max_depth_m: number;
  trip_name: string;
}

// AI Species Identification types
export interface SpeciesInfo {
  common_name: string;
  scientific_name?: string;
  category?: string;
  confidence?: string;
}

export interface SpeciesIdentification {
  common_name?: string;
  scientific_name?: string;
  category?: string;
  confidence?: string;
  description?: string;
  multiple_species: SpeciesInfo[];
}

export interface IdentificationResult {
  photo_id: number;
  identification?: SpeciesIdentification;
  error?: string;
}

// External image editor types
export interface ImageEditor {
  name: string;
  path: string;
}

// ── Citizen Science / Biodiversity types ───────────────────────────────────

export interface ExternalSubmission {
  id: number;
  photo_id?: number;
  dive_id?: number;
  platform: string;       // 'inaturalist' | 'sharkbook' | etc.
  external_url?: string;
  external_id?: string;
  status: string;
  submitted_at: string;
}

export interface SpeciesEnrichmentCache {
  species_tag_id: number;
  gbif_taxon_key?: number;
  iucn_status?: string;   // 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD' | 'NE'
  kingdom?: string;
  phylum?: string;
  class_name?: string;
  order_name?: string;
  family?: string;
  genus?: string;
  fetched_at: string;
}

export interface NearbySighting {
  source: string;        // 'gbif' | 'obis'
  scientific_name?: string;
  latitude?: number;
  longitude?: number;
  date?: string;
  year?: number;
  depth?: number;
  country?: string;
  dataset?: string;
}

export interface INatTaxonSimple {
  id: number;
  scientific_name: string;
  common_name?: string;
  rank?: string;
  iconic_group?: string;
  photo_url?: string;
  observations_count?: number;
}

export interface INatSubmissionResult {
  observation_id: number;
  url: string;
}

// IUCN status display helpers
export const IUCN_LABELS: Record<string, string> = {
  LC: 'Least Concern',
  NT: 'Near Threatened',
  VU: 'Vulnerable',
  EN: 'Endangered',
  CR: 'Critically Endangered',
  EW: 'Extinct in the Wild',
  EX: 'Extinct',
  DD: 'Data Deficient',
  NE: 'Not Evaluated',
};

export const IUCN_COLORS: Record<string, string> = {
  LC: '#4caf50',
  NT: '#8bc34a',
  VU: '#ff9800',
  EN: '#f44336',
  CR: '#b71c1c',
  EW: '#4a148c',
  EX: '#000000',
  DD: '#9e9e9e',
  NE: '#bdbdbd',
};

// Megafauna species for deep-linking to Sharkbook/MantaMatcher
export const MEGAFAUNA_DEEP_LINKS: Record<string, { name: string; sharkbookUrl?: string; mantaMatcherUrl?: string }> = {
  'Rhincodon typus': {
    name: 'Whale Shark',
    sharkbookUrl: 'https://www.sharkbook.ai/',
  },
  'Mobula alfredi': {
    name: 'Reef Manta Ray',
    mantaMatcherUrl: 'https://www.mantamatcher.org/',
  },
  'Mobula birostris': {
    name: 'Giant Oceanic Manta Ray',
    mantaMatcherUrl: 'https://www.mantamatcher.org/',
  },
};
