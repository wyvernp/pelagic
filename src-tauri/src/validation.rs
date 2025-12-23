//! Input validation module for Pelagic Desktop
//!
//! This module provides validation functions for all user inputs before database operations,
//! preventing data corruption, crashes, and malformed data.

use chrono::NaiveDate;
use serde::Serialize;
use std::fmt;
use std::path::Path;

/// Maximum string length for name fields (trip names, dive names, etc.)
pub const MAX_NAME_LENGTH: usize = 255;

/// Maximum string length for location fields
pub const MAX_LOCATION_LENGTH: usize = 500;

/// Maximum string length for notes/comments fields
pub const MAX_NOTES_LENGTH: usize = 10000;

/// Maximum depth in meters (world record is ~332m, allowing buffer)
pub const MAX_DEPTH_M: f64 = 400.0;

/// Minimum reasonable water temperature in Celsius
pub const MIN_WATER_TEMP_C: f64 = -5.0;

/// Maximum reasonable water temperature in Celsius
pub const MAX_WATER_TEMP_C: f64 = 45.0;

/// Minimum reasonable air temperature in Celsius
pub const MIN_AIR_TEMP_C: f64 = -40.0;

/// Maximum reasonable air temperature in Celsius
pub const MAX_AIR_TEMP_C: f64 = 60.0;

/// Maximum tank pressure in bar
pub const MAX_TANK_PRESSURE_BAR: f64 = 350.0;

/// Maximum surface pressure in bar (accounting for altitude)
pub const MAX_SURFACE_PRESSURE_BAR: f64 = 1.2;

/// Minimum surface pressure in bar (high altitude diving)
pub const MIN_SURFACE_PRESSURE_BAR: f64 = 0.5;

/// Maximum CNS percentage (can exceed 100% in technical diving)
pub const MAX_CNS_PERCENT: f64 = 500.0;

/// Maximum dive duration in seconds (24 hours, for rebreather/habitat dives)
pub const MAX_DURATION_SECONDS: i64 = 86400;

/// Maximum number of items in a batch operation
pub const MAX_BATCH_SIZE: usize = 1000;

/// Validation error types with descriptive messages
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "details")]
pub enum ValidationError {
    /// Date string is not in valid YYYY-MM-DD format
    InvalidDateFormat { field: String, value: String },

    /// Time string is not in valid HH:MM:SS or HH:MM format
    InvalidTimeFormat { field: String, value: String },

    /// Depth value is out of acceptable range
    DepthOutOfRange { field: String, value: f64, min: f64, max: f64 },

    /// Temperature value is out of acceptable range
    TemperatureOutOfRange { field: String, value: f64, min: f64, max: f64 },

    /// Pressure value is out of acceptable range
    PressureOutOfRange { field: String, value: f64, min: f64, max: f64 },

    /// GPS latitude is out of range (-90 to 90)
    InvalidLatitude { value: f64 },

    /// GPS longitude is out of range (-180 to 180)
    InvalidLongitude { value: f64 },

    /// Rating is out of range (0-5)
    InvalidRating { value: i32 },

    /// Percentage value is out of acceptable range
    PercentageOutOfRange { field: String, value: f64, min: f64, max: f64 },

    /// Duration is negative or exceeds maximum
    InvalidDuration { field: String, value: i64 },

    /// String exceeds maximum length
    StringTooLong { field: String, max_length: usize, actual_length: usize },

    /// String is empty when it shouldn't be
    StringEmpty { field: String },

    /// File path contains path traversal attempt
    PathTraversal { path: String },

    /// File path is invalid
    InvalidPath { path: String, reason: String },

    /// ID must be positive
    InvalidId { field: String, value: i64 },

    /// Array is empty when it shouldn't be
    ArrayEmpty { field: String },

    /// Array exceeds maximum size for batch operations
    ArrayTooLarge { field: String, max_size: usize, actual_size: usize },

    /// O2 percentage out of valid range (0-100)
    InvalidO2Percentage { value: f64 },

    /// Generic validation error for custom checks
    Custom { message: String },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::InvalidDateFormat { field, value } => {
                write!(f, "Invalid date format for '{}': '{}'. Expected YYYY-MM-DD format.", field, value)
            }
            ValidationError::InvalidTimeFormat { field, value } => {
                write!(f, "Invalid time format for '{}': '{}'. Expected HH:MM:SS or HH:MM format.", field, value)
            }
            ValidationError::DepthOutOfRange { field, value, min, max } => {
                write!(f, "Depth '{}' value {} is out of range ({} to {} meters).", field, value, min, max)
            }
            ValidationError::TemperatureOutOfRange { field, value, min, max } => {
                write!(f, "Temperature '{}' value {}°C is out of range ({}°C to {}°C).", field, value, min, max)
            }
            ValidationError::PressureOutOfRange { field, value, min, max } => {
                write!(f, "Pressure '{}' value {} bar is out of range ({} to {} bar).", field, value, min, max)
            }
            ValidationError::InvalidLatitude { value } => {
                write!(f, "Invalid latitude: {}. Must be between -90 and 90.", value)
            }
            ValidationError::InvalidLongitude { value } => {
                write!(f, "Invalid longitude: {}. Must be between -180 and 180.", value)
            }
            ValidationError::InvalidRating { value } => {
                write!(f, "Invalid rating: {}. Must be between 0 and 5.", value)
            }
            ValidationError::PercentageOutOfRange { field, value, min, max } => {
                write!(f, "Percentage '{}' value {}% is out of range ({}% to {}%).", field, value, min, max)
            }
            ValidationError::InvalidDuration { field, value } => {
                write!(f, "Invalid duration for '{}': {} seconds. Must be non-negative and less than 24 hours.", field, value)
            }
            ValidationError::StringTooLong { field, max_length, actual_length } => {
                write!(f, "Field '{}' is too long: {} characters (maximum: {}).", field, actual_length, max_length)
            }
            ValidationError::StringEmpty { field } => {
                write!(f, "Field '{}' cannot be empty.", field)
            }
            ValidationError::PathTraversal { path } => {
                write!(f, "Invalid file path '{}': path traversal detected.", path)
            }
            ValidationError::InvalidPath { path, reason } => {
                write!(f, "Invalid file path '{}': {}.", path, reason)
            }
            ValidationError::InvalidId { field, value } => {
                write!(f, "Invalid ID for '{}': {}. Must be a positive number.", field, value)
            }
            ValidationError::ArrayEmpty { field } => {
                write!(f, "Field '{}' cannot be empty.", field)
            }
            ValidationError::ArrayTooLarge { field, max_size, actual_size } => {
                write!(f, "Field '{}' has too many items: {} (maximum: {}).", field, actual_size, max_size)
            }
            ValidationError::InvalidO2Percentage { value } => {
                write!(f, "Invalid O2 percentage: {}%. Must be between 0 and 100.", value)
            }
            ValidationError::Custom { message } => {
                write!(f, "{}", message)
            }
        }
    }
}

impl std::error::Error for ValidationError {}

/// Result type for validation operations
pub type ValidationResult<T> = Result<T, Vec<ValidationError>>;

/// Validator that collects multiple errors
#[derive(Debug, Default)]
pub struct Validator {
    errors: Vec<ValidationError>,
}

impl Validator {
    /// Create a new validator
    pub fn new() -> Self {
        Self { errors: Vec::new() }
    }

    /// Add an error to the validator
    pub fn add_error(&mut self, error: ValidationError) {
        self.errors.push(error);
    }

    /// Check if there are any errors
    pub fn has_errors(&self) -> bool {
        !self.errors.is_empty()
    }

    /// Get all errors
    pub fn errors(&self) -> &[ValidationError] {
        &self.errors
    }

    /// Consume the validator and return errors if any
    pub fn finish(self) -> Result<(), Vec<ValidationError>> {
        if self.errors.is_empty() {
            Ok(())
        } else {
            Err(self.errors)
        }
    }

    /// Convert errors to a single error string for legacy compatibility
    pub fn to_error_string(&self) -> String {
        self.errors
            .iter()
            .map(|e| e.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    }

    // =========================================================================
    // Date/Time Validation
    // =========================================================================

    /// Validate a date string in YYYY-MM-DD format
    pub fn validate_date(&mut self, field: &str, date: &str) {
        if NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
            self.add_error(ValidationError::InvalidDateFormat {
                field: field.to_string(),
                value: date.to_string(),
            });
        }
    }

    /// Validate an optional date string
    pub fn validate_date_optional(&mut self, field: &str, date: Option<&str>) {
        if let Some(d) = date {
            if !d.is_empty() {
                self.validate_date(field, d);
            }
        }
    }

    /// Validate a time string in HH:MM:SS or HH:MM format
    pub fn validate_time(&mut self, field: &str, time: &str) {
        let is_valid = chrono::NaiveTime::parse_from_str(time, "%H:%M:%S").is_ok()
            || chrono::NaiveTime::parse_from_str(time, "%H:%M").is_ok();
        
        if !is_valid {
            self.add_error(ValidationError::InvalidTimeFormat {
                field: field.to_string(),
                value: time.to_string(),
            });
        }
    }

    /// Validate an optional time string
    pub fn validate_time_optional(&mut self, field: &str, time: Option<&str>) {
        if let Some(t) = time {
            if !t.is_empty() {
                self.validate_time(field, t);
            }
        }
    }

    // =========================================================================
    // Numeric Validation
    // =========================================================================

    /// Validate a depth value in meters
    pub fn validate_depth(&mut self, field: &str, depth: f64) {
        if depth < 0.0 || depth > MAX_DEPTH_M {
            self.add_error(ValidationError::DepthOutOfRange {
                field: field.to_string(),
                value: depth,
                min: 0.0,
                max: MAX_DEPTH_M,
            });
        }
    }

    /// Validate an optional depth value
    pub fn validate_depth_optional(&mut self, field: &str, depth: Option<f64>) {
        if let Some(d) = depth {
            self.validate_depth(field, d);
        }
    }

    /// Validate a water temperature in Celsius
    pub fn validate_water_temp(&mut self, field: &str, temp: f64) {
        if temp < MIN_WATER_TEMP_C || temp > MAX_WATER_TEMP_C {
            self.add_error(ValidationError::TemperatureOutOfRange {
                field: field.to_string(),
                value: temp,
                min: MIN_WATER_TEMP_C,
                max: MAX_WATER_TEMP_C,
            });
        }
    }

    /// Validate an optional water temperature
    pub fn validate_water_temp_optional(&mut self, field: &str, temp: Option<f64>) {
        if let Some(t) = temp {
            self.validate_water_temp(field, t);
        }
    }

    /// Validate an air temperature in Celsius
    pub fn validate_air_temp(&mut self, field: &str, temp: f64) {
        if temp < MIN_AIR_TEMP_C || temp > MAX_AIR_TEMP_C {
            self.add_error(ValidationError::TemperatureOutOfRange {
                field: field.to_string(),
                value: temp,
                min: MIN_AIR_TEMP_C,
                max: MAX_AIR_TEMP_C,
            });
        }
    }

    /// Validate an optional air temperature
    pub fn validate_air_temp_optional(&mut self, field: &str, temp: Option<f64>) {
        if let Some(t) = temp {
            self.validate_air_temp(field, t);
        }
    }

    /// Validate a tank pressure in bar
    pub fn validate_tank_pressure(&mut self, field: &str, pressure: f64) {
        if pressure < 0.0 || pressure > MAX_TANK_PRESSURE_BAR {
            self.add_error(ValidationError::PressureOutOfRange {
                field: field.to_string(),
                value: pressure,
                min: 0.0,
                max: MAX_TANK_PRESSURE_BAR,
            });
        }
    }

    /// Validate an optional tank pressure
    pub fn validate_tank_pressure_optional(&mut self, field: &str, pressure: Option<f64>) {
        if let Some(p) = pressure {
            self.validate_tank_pressure(field, p);
        }
    }

    /// Validate surface pressure in bar
    pub fn validate_surface_pressure(&mut self, field: &str, pressure: f64) {
        if pressure < MIN_SURFACE_PRESSURE_BAR || pressure > MAX_SURFACE_PRESSURE_BAR {
            self.add_error(ValidationError::PressureOutOfRange {
                field: field.to_string(),
                value: pressure,
                min: MIN_SURFACE_PRESSURE_BAR,
                max: MAX_SURFACE_PRESSURE_BAR,
            });
        }
    }

    /// Validate an optional surface pressure
    pub fn validate_surface_pressure_optional(&mut self, field: &str, pressure: Option<f64>) {
        if let Some(p) = pressure {
            self.validate_surface_pressure(field, p);
        }
    }

    /// Validate GPS latitude (-90 to 90)
    pub fn validate_latitude(&mut self, lat: f64) {
        if lat < -90.0 || lat > 90.0 {
            self.add_error(ValidationError::InvalidLatitude { value: lat });
        }
    }

    /// Validate an optional latitude
    pub fn validate_latitude_optional(&mut self, lat: Option<f64>) {
        if let Some(l) = lat {
            self.validate_latitude(l);
        }
    }

    /// Validate GPS longitude (-180 to 180)
    pub fn validate_longitude(&mut self, lon: f64) {
        if lon < -180.0 || lon > 180.0 {
            self.add_error(ValidationError::InvalidLongitude { value: lon });
        }
    }

    /// Validate an optional longitude
    pub fn validate_longitude_optional(&mut self, lon: Option<f64>) {
        if let Some(l) = lon {
            self.validate_longitude(l);
        }
    }

    /// Validate GPS coordinates (both lat and lon)
    pub fn validate_gps_optional(&mut self, lat: Option<f64>, lon: Option<f64>) {
        self.validate_latitude_optional(lat);
        self.validate_longitude_optional(lon);
    }

    /// Validate a rating (0-5 stars)
    pub fn validate_rating(&mut self, rating: i32) {
        if rating < 0 || rating > 5 {
            self.add_error(ValidationError::InvalidRating { value: rating });
        }
    }

    /// Validate CNS percentage
    pub fn validate_cns_percent(&mut self, field: &str, percent: f64) {
        if percent < 0.0 || percent > MAX_CNS_PERCENT {
            self.add_error(ValidationError::PercentageOutOfRange {
                field: field.to_string(),
                value: percent,
                min: 0.0,
                max: MAX_CNS_PERCENT,
            });
        }
    }

    /// Validate an optional CNS percentage
    pub fn validate_cns_percent_optional(&mut self, field: &str, percent: Option<f64>) {
        if let Some(p) = percent {
            self.validate_cns_percent(field, p);
        }
    }

    /// Validate O2 percentage (0-100, typically 21-100 for breathing gas)
    pub fn validate_o2_percent(&mut self, percent: f64) {
        if percent < 0.0 || percent > 100.0 {
            self.add_error(ValidationError::InvalidO2Percentage { value: percent });
        }
    }

    /// Validate an optional O2 percentage
    pub fn validate_o2_percent_optional(&mut self, percent: Option<f64>) {
        if let Some(p) = percent {
            self.validate_o2_percent(p);
        }
    }

    /// Validate duration in seconds
    pub fn validate_duration(&mut self, field: &str, seconds: i64) {
        if seconds < 0 || seconds > MAX_DURATION_SECONDS {
            self.add_error(ValidationError::InvalidDuration {
                field: field.to_string(),
                value: seconds,
            });
        }
    }

    /// Validate an optional duration
    pub fn validate_duration_optional(&mut self, field: &str, seconds: Option<i64>) {
        if let Some(s) = seconds {
            self.validate_duration(field, s);
        }
    }

    /// Validate a positive ID
    pub fn validate_id(&mut self, field: &str, id: i64) {
        if id <= 0 {
            self.add_error(ValidationError::InvalidId {
                field: field.to_string(),
                value: id,
            });
        }
    }

    /// Validate an optional positive ID
    pub fn validate_id_optional(&mut self, field: &str, id: Option<i64>) {
        if let Some(i) = id {
            self.validate_id(field, i);
        }
    }

    // =========================================================================
    // String Validation
    // =========================================================================

    /// Validate a required non-empty string with max length
    pub fn validate_string_required(&mut self, field: &str, value: &str, max_length: usize) {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            self.add_error(ValidationError::StringEmpty {
                field: field.to_string(),
            });
        } else if trimmed.len() > max_length {
            self.add_error(ValidationError::StringTooLong {
                field: field.to_string(),
                max_length,
                actual_length: trimmed.len(),
            });
        }
    }

    /// Validate an optional string with max length
    pub fn validate_string_optional(&mut self, field: &str, value: Option<&str>, max_length: usize) {
        if let Some(v) = value {
            if !v.is_empty() && v.len() > max_length {
                self.add_error(ValidationError::StringTooLong {
                    field: field.to_string(),
                    max_length,
                    actual_length: v.len(),
                });
            }
        }
    }

    /// Validate a name field (required, max 255 chars)
    pub fn validate_name(&mut self, field: &str, value: &str) {
        self.validate_string_required(field, value, MAX_NAME_LENGTH);
    }

    /// Validate an optional name field
    pub fn validate_name_optional(&mut self, field: &str, value: Option<&str>) {
        self.validate_string_optional(field, value, MAX_NAME_LENGTH);
    }

    /// Validate a location field (optional, max 500 chars)
    pub fn validate_location(&mut self, field: &str, value: &str) {
        self.validate_string_optional(field, Some(value), MAX_LOCATION_LENGTH);
    }

    /// Validate a notes/comments field (optional, max 10000 chars)
    pub fn validate_notes(&mut self, field: &str, value: Option<&str>) {
        self.validate_string_optional(field, value, MAX_NOTES_LENGTH);
    }

    // =========================================================================
    // Path Validation
    // =========================================================================

    /// Validate a file path for path traversal attacks
    pub fn validate_path(&mut self, path: &str) {
        // Check for path traversal patterns
        if path.contains("..") {
            self.add_error(ValidationError::PathTraversal {
                path: path.to_string(),
            });
            return;
        }

        // Check for null bytes
        if path.contains('\0') {
            self.add_error(ValidationError::InvalidPath {
                path: path.to_string(),
                reason: "contains null bytes".to_string(),
            });
            return;
        }

        // Basic path validity check
        let path_obj = Path::new(path);
        if path_obj.to_str().is_none() {
            self.add_error(ValidationError::InvalidPath {
                path: path.to_string(),
                reason: "invalid UTF-8".to_string(),
            });
        }
    }

    /// Validate an optional file path
    pub fn validate_path_optional(&mut self, path: Option<&str>) {
        if let Some(p) = path {
            if !p.is_empty() {
                self.validate_path(p);
            }
        }
    }

    // =========================================================================
    // Array Validation
    // =========================================================================

    /// Validate a required non-empty array
    pub fn validate_array_required<T>(&mut self, field: &str, array: &[T]) {
        if array.is_empty() {
            self.add_error(ValidationError::ArrayEmpty {
                field: field.to_string(),
            });
        }
    }

    /// Validate array size for batch operations
    pub fn validate_array_size<T>(&mut self, field: &str, array: &[T], max_size: usize) {
        if array.len() > max_size {
            self.add_error(ValidationError::ArrayTooLarge {
                field: field.to_string(),
                max_size,
                actual_size: array.len(),
            });
        }
    }

    /// Validate array of IDs
    pub fn validate_id_array(&mut self, field: &str, ids: &[i64]) {
        for (i, id) in ids.iter().enumerate() {
            if *id <= 0 {
                self.add_error(ValidationError::InvalidId {
                    field: format!("{}[{}]", field, i),
                    value: *id,
                });
            }
        }
    }
}

// =========================================================================
// Convenience functions for single-field validation
// =========================================================================

/// Validate a date string, returning an error if invalid
pub fn validate_date(field: &str, date: &str) -> Result<(), ValidationError> {
    if NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
        return Err(ValidationError::InvalidDateFormat {
            field: field.to_string(),
            value: date.to_string(),
        });
    }
    Ok(())
}

/// Validate a rating value, returning an error if invalid
pub fn validate_rating(rating: i32) -> Result<(), ValidationError> {
    if rating < 0 || rating > 5 {
        return Err(ValidationError::InvalidRating { value: rating });
    }
    Ok(())
}

/// Validate a depth value, returning an error if invalid
pub fn validate_depth(field: &str, depth: f64) -> Result<(), ValidationError> {
    if depth < 0.0 || depth > MAX_DEPTH_M {
        return Err(ValidationError::DepthOutOfRange {
            field: field.to_string(),
            value: depth,
            min: 0.0,
            max: MAX_DEPTH_M,
        });
    }
    Ok(())
}

/// Validate GPS coordinates
pub fn validate_gps(lat: f64, lon: f64) -> Result<(), ValidationError> {
    if lat < -90.0 || lat > 90.0 {
        return Err(ValidationError::InvalidLatitude { value: lat });
    }
    if lon < -180.0 || lon > 180.0 {
        return Err(ValidationError::InvalidLongitude { value: lon });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_date_valid() {
        let mut v = Validator::new();
        v.validate_date("test", "2025-12-21");
        assert!(!v.has_errors());
    }

    #[test]
    fn test_validate_date_invalid() {
        let mut v = Validator::new();
        v.validate_date("test", "21-12-2025");
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_date_invalid_format() {
        let mut v = Validator::new();
        v.validate_date("test", "not-a-date");
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_time_valid_long() {
        let mut v = Validator::new();
        v.validate_time("test", "14:30:00");
        assert!(!v.has_errors());
    }

    #[test]
    fn test_validate_time_valid_short() {
        let mut v = Validator::new();
        v.validate_time("test", "14:30");
        assert!(!v.has_errors());
    }

    #[test]
    fn test_validate_time_invalid() {
        let mut v = Validator::new();
        v.validate_time("test", "25:00:00");
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_depth_valid() {
        let mut v = Validator::new();
        v.validate_depth("max_depth", 40.0);
        assert!(!v.has_errors());
    }

    #[test]
    fn test_validate_depth_negative() {
        let mut v = Validator::new();
        v.validate_depth("max_depth", -5.0);
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_depth_too_deep() {
        let mut v = Validator::new();
        v.validate_depth("max_depth", 500.0);
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_rating_valid() {
        for rating in 0..=5 {
            let mut v = Validator::new();
            v.validate_rating(rating);
            assert!(!v.has_errors(), "Rating {} should be valid", rating);
        }
    }

    #[test]
    fn test_validate_rating_invalid() {
        let mut v = Validator::new();
        v.validate_rating(6);
        assert!(v.has_errors());

        let mut v = Validator::new();
        v.validate_rating(-1);
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_latitude_valid() {
        let mut v = Validator::new();
        v.validate_latitude(45.5);
        assert!(!v.has_errors());
    }

    #[test]
    fn test_validate_latitude_invalid() {
        let mut v = Validator::new();
        v.validate_latitude(95.0);
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_longitude_valid() {
        let mut v = Validator::new();
        v.validate_longitude(-122.5);
        assert!(!v.has_errors());
    }

    #[test]
    fn test_validate_longitude_invalid() {
        let mut v = Validator::new();
        v.validate_longitude(200.0);
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_string_required_empty() {
        let mut v = Validator::new();
        v.validate_string_required("name", "", 255);
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_string_required_whitespace() {
        let mut v = Validator::new();
        v.validate_string_required("name", "   ", 255);
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_string_too_long() {
        let mut v = Validator::new();
        let long_string = "a".repeat(300);
        v.validate_string_required("name", &long_string, 255);
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_path_traversal() {
        let mut v = Validator::new();
        v.validate_path("../../../etc/passwd");
        assert!(v.has_errors());
    }

    #[test]
    fn test_validate_path_valid() {
        let mut v = Validator::new();
        v.validate_path("/home/user/photos/dive.jpg");
        assert!(!v.has_errors());
    }

    #[test]
    fn test_validate_water_temp_valid() {
        let mut v = Validator::new();
        v.validate_water_temp("water_temp", 25.0);
        assert!(!v.has_errors());
    }

    #[test]
    fn test_validate_water_temp_too_cold() {
        let mut v = Validator::new();
        v.validate_water_temp("water_temp", -10.0);
        assert!(v.has_errors());
    }

    #[test]
    fn test_multiple_errors() {
        let mut v = Validator::new();
        v.validate_date("date", "invalid");
        v.validate_depth("depth", -5.0);
        v.validate_rating(-1);
        assert_eq!(v.errors().len(), 3);
    }

    #[test]
    fn test_validator_finish_ok() {
        let v = Validator::new();
        assert!(v.finish().is_ok());
    }

    #[test]
    fn test_validator_finish_err() {
        let mut v = Validator::new();
        v.validate_rating(-1);
        assert!(v.finish().is_err());
    }
}
