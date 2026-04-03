//! libdivecomputer FFI bindings and safe Rust wrappers.
//!
//! This module provides:
//! 1. Raw `extern "C"` declarations matching the libdivecomputer C API.
//! 2. Safe Rust wrapper types with RAII (Drop) cleanup.
//! 3. High-level functions for listing supported dive computers and
//!    parsing raw dive data into the existing `ParsedDivePreview` structs.
//!
//! Transport I/O (serial, USB HID, BLE) is provided from Rust side via
//! `dc_custom_open()` callbacks — the C transport backends are compiled
//! as stubs only. This keeps external C dependencies at zero.

#![allow(non_camel_case_types, dead_code)]

use std::ffi::{c_char, c_int, c_uint, c_void, CStr};
use std::ptr;

// ============================================================================
// Raw FFI declarations
// ============================================================================

/// dc_status_t — error codes returned by all libdivecomputer functions.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum dc_status_t {
    DC_STATUS_SUCCESS = 0,
    DC_STATUS_DONE = 1,
    DC_STATUS_UNSUPPORTED = -1,
    DC_STATUS_INVALIDARGS = -2,
    DC_STATUS_NOMEMORY = -3,
    DC_STATUS_NODEVICE = -4,
    DC_STATUS_NOACCESS = -5,
    DC_STATUS_IO = -6,
    DC_STATUS_TIMEOUT = -7,
    DC_STATUS_PROTOCOL = -8,
    DC_STATUS_DATAFORMAT = -9,
    DC_STATUS_CANCELLED = -10,
}

/// dc_transport_t — bitmask of supported transport types.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum dc_transport_t {
    DC_TRANSPORT_NONE = 0,
    DC_TRANSPORT_SERIAL = 1,
    DC_TRANSPORT_USB = 2,
    DC_TRANSPORT_USBHID = 4,
    DC_TRANSPORT_IRDA = 8,
    DC_TRANSPORT_BLUETOOTH = 16,
    DC_TRANSPORT_BLE = 32,
}

/// dc_family_t — device family identifiers.
/// We represent this as i32 since the C enum uses (N << 16) | offset encoding.
pub type dc_family_t = c_int;

// Opaque C types
#[repr(C)]
pub struct dc_context_t {
    _opaque: [u8; 0],
}
#[repr(C)]
pub struct dc_descriptor_t {
    _opaque: [u8; 0],
}
#[repr(C)]
pub struct dc_iterator_t {
    _opaque: [u8; 0],
}
#[repr(C)]
pub struct dc_device_t {
    _opaque: [u8; 0],
}
#[repr(C)]
pub struct dc_parser_t {
    _opaque: [u8; 0],
}
#[repr(C)]
pub struct dc_iostream_t {
    _opaque: [u8; 0],
}

/// dc_datetime_t
#[repr(C)]
#[derive(Debug, Default, Clone)]
pub struct dc_datetime_t {
    pub year: c_int,
    pub month: c_int,
    pub day: c_int,
    pub hour: c_int,
    pub minute: c_int,
    pub second: c_int,
    pub timezone: c_int,
}

pub type dc_ticks_t = i64;

/// dc_sample_type_t
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum dc_sample_type_t {
    DC_SAMPLE_TIME = 0,
    DC_SAMPLE_DEPTH = 1,
    DC_SAMPLE_PRESSURE = 2,
    DC_SAMPLE_TEMPERATURE = 3,
    DC_SAMPLE_EVENT = 4,
    DC_SAMPLE_RBT = 5,
    DC_SAMPLE_HEARTBEAT = 6,
    DC_SAMPLE_BEARING = 7,
    DC_SAMPLE_VENDOR = 8,
    DC_SAMPLE_SETPOINT = 9,
    DC_SAMPLE_PPO2 = 10,
    DC_SAMPLE_CNS = 11,
    DC_SAMPLE_DECO = 12,
    DC_SAMPLE_GASMIX = 13,
}

/// dc_field_type_t
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum dc_field_type_t {
    DC_FIELD_DIVETIME = 0,
    DC_FIELD_MAXDEPTH = 1,
    DC_FIELD_AVGDEPTH = 2,
    DC_FIELD_GASMIX_COUNT = 3,
    DC_FIELD_GASMIX = 4,
    DC_FIELD_SALINITY = 5,
    DC_FIELD_ATMOSPHERIC = 6,
    DC_FIELD_TEMPERATURE_SURFACE = 7,
    DC_FIELD_TEMPERATURE_MINIMUM = 8,
    DC_FIELD_TEMPERATURE_MAXIMUM = 9,
    DC_FIELD_TANK_COUNT = 10,
    DC_FIELD_TANK = 11,
    DC_FIELD_DIVEMODE = 12,
    DC_FIELD_DECOMODEL = 13,
    DC_FIELD_LOCATION = 14,
}

/// dc_divemode_t
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum dc_divemode_t {
    DC_DIVEMODE_FREEDIVE = 0,
    DC_DIVEMODE_GAUGE = 1,
    DC_DIVEMODE_OC = 2,
    DC_DIVEMODE_CCR = 3,
    DC_DIVEMODE_SCR = 4,
}

/// dc_usage_t — gas usage type
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum dc_usage_t {
    DC_USAGE_NONE = 0,
    DC_USAGE_OXYGEN = 1,
    DC_USAGE_DILUENT = 2,
    DC_USAGE_SIDEMOUNT = 3,
}

/// dc_gasmix_t
#[repr(C)]
#[derive(Debug, Clone)]
pub struct dc_gasmix_t {
    pub helium: f64,
    pub oxygen: f64,
    pub nitrogen: f64,
    pub usage: dc_usage_t,
}

/// dc_tankvolume_t
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum dc_tankvolume_t {
    DC_TANKVOLUME_NONE = 0,
    DC_TANKVOLUME_METRIC = 1,
    DC_TANKVOLUME_IMPERIAL = 2,
}

/// dc_tank_t
#[repr(C)]
#[derive(Debug, Clone)]
pub struct dc_tank_t {
    pub gasmix: c_uint,
    pub r#type: dc_tankvolume_t,
    pub volume: f64,
    pub workpressure: f64,
    pub beginpressure: f64,
    pub endpressure: f64,
    pub usage: dc_usage_t,
}

/// dc_salinity_t
#[repr(C)]
#[derive(Debug, Clone)]
pub struct dc_salinity_t {
    pub r#type: c_int, // dc_water_t
    pub density: f64,
}

/// dc_location_t
#[repr(C)]
#[derive(Debug, Clone)]
pub struct dc_location_t {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude: f64,
}

/// dc_event_type_t bitmask
pub const DC_EVENT_WAITING: c_uint = 1;
pub const DC_EVENT_PROGRESS: c_uint = 2;
pub const DC_EVENT_DEVINFO: c_uint = 4;
pub const DC_EVENT_CLOCK: c_uint = 8;
pub const DC_EVENT_VENDOR: c_uint = 16;

/// dc_event_progress_t
#[repr(C)]
#[derive(Debug, Clone)]
pub struct dc_event_progress_t {
    pub current: c_uint,
    pub maximum: c_uint,
}

/// dc_event_devinfo_t
#[repr(C)]
#[derive(Debug, Clone)]
pub struct dc_event_devinfo_t {
    pub model: c_uint,
    pub firmware: c_uint,
    pub serial: c_uint,
}

/// dc_event_clock_t
#[repr(C)]
#[derive(Debug, Clone)]
pub struct dc_event_clock_t {
    pub devtime: c_uint,
    pub systime: dc_ticks_t,
}

/// dc_parity_t
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub enum dc_parity_t {
    DC_PARITY_NONE = 0,
    DC_PARITY_ODD = 1,
    DC_PARITY_EVEN = 2,
    DC_PARITY_MARK = 3,
    DC_PARITY_SPACE = 4,
}

/// dc_stopbits_t
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub enum dc_stopbits_t {
    DC_STOPBITS_ONE = 0,
    DC_STOPBITS_ONEPOINTFIVE = 1,
    DC_STOPBITS_TWO = 2,
}

/// dc_flowcontrol_t
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub enum dc_flowcontrol_t {
    DC_FLOWCONTROL_NONE = 0,
    DC_FLOWCONTROL_HARDWARE = 1,
    DC_FLOWCONTROL_SOFTWARE = 2,
}

/// dc_direction_t
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub enum dc_direction_t {
    DC_DIRECTION_INPUT = 0x01,
    DC_DIRECTION_OUTPUT = 0x02,
    DC_DIRECTION_ALL = 0x03,
}

/// dc_deco_type_t — used inside dc_sample_value_t.deco
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum dc_deco_type_t {
    DC_DECO_NDL = 0,
    DC_DECO_SAFETYSTOP = 1,
    DC_DECO_DECOSTOP = 2,
    DC_DECO_DEEPSTOP = 3,
}

// ── dc_sample_value_t ──────────────────────────────────────────────────
// This is a C union with many variants. We model it as a #[repr(C)]
// union so the callback can transmute based on dc_sample_type_t.
#[repr(C)]
#[derive(Copy, Clone)]
pub union dc_sample_value_t {
    pub time: c_uint,
    pub depth: f64,
    pub pressure: dc_sample_pressure_t,
    pub temperature: f64,
    pub event: dc_sample_event_t,
    pub rbt: c_uint,
    pub heartbeat: c_uint,
    pub bearing: c_uint,
    pub vendor: dc_sample_vendor_t,
    pub setpoint: f64,
    pub ppo2: dc_sample_ppo2_t,
    pub cns: f64,
    pub deco: dc_sample_deco_t,
    pub gasmix: c_uint,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct dc_sample_pressure_t {
    pub tank: c_uint,
    pub value: f64,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct dc_sample_event_t {
    pub r#type: c_uint,
    pub time: c_uint,
    pub flags: c_uint,
    pub value: c_uint,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct dc_sample_vendor_t {
    pub r#type: c_uint,
    pub size: c_uint,
    pub data: *const c_void,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct dc_sample_ppo2_t {
    pub sensor: c_uint,
    pub value: f64,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct dc_sample_deco_t {
    pub r#type: c_uint,
    pub time: c_uint,
    pub depth: f64,
    pub tts: c_uint,
}

/// dc_custom_cbs_t — callback vtable for custom I/O streams.
#[repr(C)]
pub struct dc_custom_cbs_t {
    pub set_timeout: Option<unsafe extern "C" fn(*mut c_void, c_int) -> dc_status_t>,
    pub set_break: Option<unsafe extern "C" fn(*mut c_void, c_uint) -> dc_status_t>,
    pub set_dtr: Option<unsafe extern "C" fn(*mut c_void, c_uint) -> dc_status_t>,
    pub set_rts: Option<unsafe extern "C" fn(*mut c_void, c_uint) -> dc_status_t>,
    pub get_lines: Option<unsafe extern "C" fn(*mut c_void, *mut c_uint) -> dc_status_t>,
    pub get_available: Option<unsafe extern "C" fn(*mut c_void, *mut usize) -> dc_status_t>,
    pub configure: Option<
        unsafe extern "C" fn(
            *mut c_void,
            c_uint,
            c_uint,
            dc_parity_t,
            dc_stopbits_t,
            dc_flowcontrol_t,
        ) -> dc_status_t,
    >,
    pub poll: Option<unsafe extern "C" fn(*mut c_void, c_int) -> dc_status_t>,
    pub read: Option<
        unsafe extern "C" fn(*mut c_void, *mut c_void, usize, *mut usize) -> dc_status_t,
    >,
    pub write: Option<
        unsafe extern "C" fn(*mut c_void, *const c_void, usize, *mut usize) -> dc_status_t,
    >,
    pub ioctl: Option<
        unsafe extern "C" fn(*mut c_void, c_uint, *mut c_void, usize) -> dc_status_t,
    >,
    pub flush: Option<unsafe extern "C" fn(*mut c_void) -> dc_status_t>,
    pub purge: Option<unsafe extern "C" fn(*mut c_void, dc_direction_t) -> dc_status_t>,
    pub sleep: Option<unsafe extern "C" fn(*mut c_void, c_uint) -> dc_status_t>,
    pub close: Option<unsafe extern "C" fn(*mut c_void) -> dc_status_t>,
}

/// Callback types
pub type dc_sample_callback_t = unsafe extern "C" fn(
    dc_sample_type_t,
    *const dc_sample_value_t,
    *mut c_void,
);

pub type dc_dive_callback_t = unsafe extern "C" fn(
    *const u8,  // data
    c_uint,     // size
    *const u8,  // fingerprint
    c_uint,     // fsize
    *mut c_void,
) -> c_int;

pub type dc_event_callback_t = unsafe extern "C" fn(
    *mut dc_device_t,
    c_uint, // dc_event_type_t
    *const c_void,
    *mut c_void,
);

pub type dc_cancel_callback_t = unsafe extern "C" fn(*mut c_void) -> c_int;

// Log function callback
pub type dc_logfunc_t = unsafe extern "C" fn(
    *mut dc_context_t,
    c_int, // loglevel
    *const c_char,
    *mut c_void,
);

// ── Extern C functions ─────────────────────────────────────────────────
extern "C" {
    // Context
    pub fn dc_context_new(context: *mut *mut dc_context_t) -> dc_status_t;
    pub fn dc_context_free(context: *mut dc_context_t) -> dc_status_t;
    pub fn dc_context_set_loglevel(context: *mut dc_context_t, loglevel: c_int) -> dc_status_t;
    pub fn dc_context_set_logfunc(
        context: *mut dc_context_t,
        logfunc: dc_logfunc_t,
        userdata: *mut c_void,
    ) -> dc_status_t;

    // Descriptor iteration
    pub fn dc_descriptor_iterator(iterator: *mut *mut dc_iterator_t) -> dc_status_t;
    pub fn dc_iterator_next(iterator: *mut dc_iterator_t, item: *mut *mut c_void) -> dc_status_t;
    pub fn dc_iterator_free(iterator: *mut dc_iterator_t) -> dc_status_t;

    // Descriptor accessors
    pub fn dc_descriptor_get_vendor(descriptor: *mut dc_descriptor_t) -> *const c_char;
    pub fn dc_descriptor_get_product(descriptor: *mut dc_descriptor_t) -> *const c_char;
    pub fn dc_descriptor_get_type(descriptor: *mut dc_descriptor_t) -> dc_family_t;
    pub fn dc_descriptor_get_model(descriptor: *mut dc_descriptor_t) -> c_uint;
    pub fn dc_descriptor_get_transports(descriptor: *mut dc_descriptor_t) -> c_uint;
    pub fn dc_descriptor_free(descriptor: *mut dc_descriptor_t);

    // Device
    pub fn dc_device_open(
        device: *mut *mut dc_device_t,
        context: *mut dc_context_t,
        descriptor: *mut dc_descriptor_t,
        iostream: *mut dc_iostream_t,
    ) -> dc_status_t;
    pub fn dc_device_set_cancel(
        device: *mut dc_device_t,
        callback: dc_cancel_callback_t,
        userdata: *mut c_void,
    ) -> dc_status_t;
    pub fn dc_device_set_events(
        device: *mut dc_device_t,
        events: c_uint,
        callback: dc_event_callback_t,
        userdata: *mut c_void,
    ) -> dc_status_t;
    pub fn dc_device_set_fingerprint(
        device: *mut dc_device_t,
        data: *const u8,
        size: c_uint,
    ) -> dc_status_t;
    pub fn dc_device_foreach(
        device: *mut dc_device_t,
        callback: dc_dive_callback_t,
        userdata: *mut c_void,
    ) -> dc_status_t;
    pub fn dc_device_close(device: *mut dc_device_t) -> dc_status_t;

    // Parser
    pub fn dc_parser_new2(
        parser: *mut *mut dc_parser_t,
        context: *mut dc_context_t,
        descriptor: *mut dc_descriptor_t,
        data: *const u8,
        size: usize,
    ) -> dc_status_t;
    pub fn dc_parser_set_clock(
        parser: *mut dc_parser_t,
        devtime: c_uint,
        systime: dc_ticks_t,
    ) -> dc_status_t;
    pub fn dc_parser_get_datetime(
        parser: *mut dc_parser_t,
        datetime: *mut dc_datetime_t,
    ) -> dc_status_t;
    pub fn dc_parser_get_field(
        parser: *mut dc_parser_t,
        field_type: dc_field_type_t,
        flags: c_uint,
        value: *mut c_void,
    ) -> dc_status_t;
    pub fn dc_parser_samples_foreach(
        parser: *mut dc_parser_t,
        callback: dc_sample_callback_t,
        userdata: *mut c_void,
    ) -> dc_status_t;
    pub fn dc_parser_destroy(parser: *mut dc_parser_t) -> dc_status_t;

    // Custom I/O
    pub fn dc_custom_open(
        iostream: *mut *mut dc_iostream_t,
        context: *mut dc_context_t,
        transport: dc_transport_t,
        callbacks: *const dc_custom_cbs_t,
        userdata: *mut c_void,
    ) -> dc_status_t;

    // I/O stream
    pub fn dc_iostream_close(iostream: *mut dc_iostream_t) -> dc_status_t;

    // Serial port enumeration (platform native)
    pub fn dc_serial_iterator_new(
        iterator: *mut *mut dc_iterator_t,
        context: *mut dc_context_t,
        descriptor: *mut dc_descriptor_t,
    ) -> dc_status_t;
}

// ============================================================================
// Error handling
// ============================================================================

impl dc_status_t {
    pub fn to_result(self) -> Result<(), LibDCError> {
        match self {
            dc_status_t::DC_STATUS_SUCCESS | dc_status_t::DC_STATUS_DONE => Ok(()),
            other => Err(LibDCError(other)),
        }
    }

    pub fn is_success(self) -> bool {
        matches!(
            self,
            dc_status_t::DC_STATUS_SUCCESS | dc_status_t::DC_STATUS_DONE
        )
    }
}

#[derive(Debug)]
pub struct LibDCError(pub dc_status_t);

impl std::fmt::Display for LibDCError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let msg = match self.0 {
            dc_status_t::DC_STATUS_UNSUPPORTED => "unsupported operation",
            dc_status_t::DC_STATUS_INVALIDARGS => "invalid arguments",
            dc_status_t::DC_STATUS_NOMEMORY => "out of memory",
            dc_status_t::DC_STATUS_NODEVICE => "no device found",
            dc_status_t::DC_STATUS_NOACCESS => "access denied",
            dc_status_t::DC_STATUS_IO => "I/O error",
            dc_status_t::DC_STATUS_TIMEOUT => "timeout",
            dc_status_t::DC_STATUS_PROTOCOL => "protocol error",
            dc_status_t::DC_STATUS_DATAFORMAT => "data format error",
            dc_status_t::DC_STATUS_CANCELLED => "cancelled",
            _ => "unknown error",
        };
        write!(f, "libdivecomputer: {}", msg)
    }
}

impl std::error::Error for LibDCError {}

// ============================================================================
// Safe wrapper types
// ============================================================================

/// RAII wrapper for `dc_context_t*`.
pub struct Context {
    ptr: *mut dc_context_t,
}

// libdivecomputer context is single-threaded but we send it across the
// Tauri async boundary in a controlled fashion.
unsafe impl Send for Context {}

impl Context {
    pub fn new() -> Result<Self, LibDCError> {
        let mut ptr: *mut dc_context_t = ptr::null_mut();
        unsafe { dc_context_new(&mut ptr).to_result()? };
        Ok(Self { ptr })
    }

    pub fn set_loglevel(&self, level: c_int) -> Result<(), LibDCError> {
        unsafe { dc_context_set_loglevel(self.ptr, level).to_result() }
    }

    pub fn as_ptr(&self) -> *mut dc_context_t {
        self.ptr
    }
}

impl Drop for Context {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            unsafe {
                dc_context_free(self.ptr);
            }
        }
    }
}

/// Info about one supported dive computer model from the descriptor database.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DeviceDescriptorInfo {
    pub vendor: String,
    pub product: String,
    pub family: i32,
    pub model: u32,
    /// Bitmask of `dc_transport_t` values.
    pub transports: u32,
}

impl DeviceDescriptorInfo {
    pub fn supports_serial(&self) -> bool {
        self.transports & (dc_transport_t::DC_TRANSPORT_SERIAL as u32) != 0
    }
    pub fn supports_usb(&self) -> bool {
        self.transports & (dc_transport_t::DC_TRANSPORT_USB as u32) != 0
    }
    pub fn supports_usbhid(&self) -> bool {
        self.transports & (dc_transport_t::DC_TRANSPORT_USBHID as u32) != 0
    }
    pub fn supports_bluetooth(&self) -> bool {
        self.transports & (dc_transport_t::DC_TRANSPORT_BLUETOOTH as u32) != 0
    }
    pub fn supports_ble(&self) -> bool {
        self.transports & (dc_transport_t::DC_TRANSPORT_BLE as u32) != 0
    }
}

// ============================================================================
// High-level functions
// ============================================================================

/// Enumerate all dive computer models known to libdivecomputer.
/// Returns a sorted list of (vendor, product, family, model, transports).
pub fn list_supported_devices() -> Result<Vec<DeviceDescriptorInfo>, LibDCError> {
    unsafe {
        let mut iter: *mut dc_iterator_t = ptr::null_mut();
        dc_descriptor_iterator(&mut iter).to_result()?;

        let mut devices = Vec::new();
        loop {
            let mut desc: *mut dc_descriptor_t = ptr::null_mut();
            let rc = dc_iterator_next(iter, &mut desc as *mut *mut _ as *mut *mut c_void);
            if rc == dc_status_t::DC_STATUS_DONE {
                break;
            }
            rc.to_result()?;

            let vendor_c = dc_descriptor_get_vendor(desc);
            let product_c = dc_descriptor_get_product(desc);
            let vendor = if vendor_c.is_null() {
                "Unknown".to_string()
            } else {
                CStr::from_ptr(vendor_c).to_string_lossy().into_owned()
            };
            let product = if product_c.is_null() {
                "Unknown".to_string()
            } else {
                CStr::from_ptr(product_c).to_string_lossy().into_owned()
            };
            let family = dc_descriptor_get_type(desc);
            let model = dc_descriptor_get_model(desc);
            let transports = dc_descriptor_get_transports(desc);

            devices.push(DeviceDescriptorInfo {
                vendor,
                product,
                family,
                model,
                transports,
            });

            dc_descriptor_free(desc);
        }
        dc_iterator_free(iter);

        // Sort by vendor then product for UI display
        devices.sort_by(|a, b| {
            a.vendor
                .to_lowercase()
                .cmp(&b.vendor.to_lowercase())
                .then_with(|| a.product.to_lowercase().cmp(&b.product.to_lowercase()))
        });

        Ok(devices)
    }
}

/// Find a descriptor matching the given vendor+product names.
/// The caller must call `dc_descriptor_free` when done — but we return
/// it wrapped in a helper that does this.
pub fn find_descriptor(vendor: &str, product: &str) -> Result<Option<OwnedDescriptor>, LibDCError> {
    unsafe {
        let mut iter: *mut dc_iterator_t = ptr::null_mut();
        dc_descriptor_iterator(&mut iter).to_result()?;

        let result = loop {
            let mut desc: *mut dc_descriptor_t = ptr::null_mut();
            let rc = dc_iterator_next(iter, &mut desc as *mut *mut _ as *mut *mut c_void);
            if rc == dc_status_t::DC_STATUS_DONE {
                break None;
            }
            rc.to_result()?;

            let v = CStr::from_ptr(dc_descriptor_get_vendor(desc))
                .to_string_lossy();
            let p = CStr::from_ptr(dc_descriptor_get_product(desc))
                .to_string_lossy();
            if v == vendor && p == product {
                break Some(OwnedDescriptor { ptr: desc });
            }
            dc_descriptor_free(desc);
        };
        dc_iterator_free(iter);
        Ok(result)
    }
}

/// Find a descriptor matching family + model number.
pub fn find_descriptor_by_model(
    family: dc_family_t,
    model: c_uint,
) -> Result<Option<OwnedDescriptor>, LibDCError> {
    unsafe {
        let mut iter: *mut dc_iterator_t = ptr::null_mut();
        dc_descriptor_iterator(&mut iter).to_result()?;

        let result = loop {
            let mut desc: *mut dc_descriptor_t = ptr::null_mut();
            let rc = dc_iterator_next(iter, &mut desc as *mut *mut _ as *mut *mut c_void);
            if rc == dc_status_t::DC_STATUS_DONE {
                break None;
            }
            rc.to_result()?;

            if dc_descriptor_get_type(desc) == family && dc_descriptor_get_model(desc) == model {
                break Some(OwnedDescriptor { ptr: desc });
            }
            dc_descriptor_free(desc);
        };
        dc_iterator_free(iter);
        Ok(result)
    }
}

/// RAII wrapper for a descriptor pointer.
pub struct OwnedDescriptor {
    ptr: *mut dc_descriptor_t,
}

unsafe impl Send for OwnedDescriptor {}

impl OwnedDescriptor {
    pub fn as_ptr(&self) -> *mut dc_descriptor_t {
        self.ptr
    }

    pub fn vendor(&self) -> String {
        unsafe {
            let c = dc_descriptor_get_vendor(self.ptr);
            if c.is_null() {
                "Unknown".into()
            } else {
                CStr::from_ptr(c).to_string_lossy().into_owned()
            }
        }
    }

    pub fn product(&self) -> String {
        unsafe {
            let c = dc_descriptor_get_product(self.ptr);
            if c.is_null() {
                "Unknown".into()
            } else {
                CStr::from_ptr(c).to_string_lossy().into_owned()
            }
        }
    }
}

impl Drop for OwnedDescriptor {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            unsafe {
                dc_descriptor_free(self.ptr);
            }
        }
    }
}

// ============================================================================
// Dive data parsing
// ============================================================================

use crate::commands::{ParsedDivePreview, ParsedDiveSample, ParsedTank, ParsedTankPressure};

/// Intermediate state collected during the sample callback.
struct SampleCollector {
    samples: Vec<ParsedDiveSample>,
    tank_pressures: Vec<ParsedTankPressure>,
    // Running state while iterating samples
    current_time_ms: u32,
    current_depth: f64,
    current_temp: Option<f64>,
    current_ndl: Option<i32>,
    current_rbt: Option<i32>,
    // Track whether we've seen a depth sample at the current time
    pending_depth: bool,
    // Last CNS% value seen in the sample stream (cumulative, take final value)
    last_cns: Option<f64>,
}

impl SampleCollector {
    fn new() -> Self {
        Self {
            samples: Vec::new(),
            tank_pressures: Vec::new(),
            current_time_ms: 0,
            current_depth: 0.0,
            current_temp: None,
            current_ndl: None,
            current_rbt: None,
            pending_depth: false,
            last_cns: None,
        }
    }

    /// Flush the current sample accumulation as a ParsedDiveSample.
    fn flush_sample(&mut self) {
        if !self.pending_depth {
            return;
        }
        self.samples.push(ParsedDiveSample {
            time_seconds: (self.current_time_ms / 1000) as i32,
            depth_m: self.current_depth,
            temp_c: self.current_temp,
            pressure_bar: None, // pressures go to tank_pressures vec
            ndl_seconds: self.current_ndl,
            rbt_seconds: self.current_rbt,
        });
        self.pending_depth = false;
    }
}

/// C callback invoked by dc_parser_samples_foreach for each sample datum.
unsafe extern "C" fn sample_callback(
    sample_type: dc_sample_type_t,
    value: *const dc_sample_value_t,
    userdata: *mut c_void,
) {
    let collector = &mut *(userdata as *mut SampleCollector);
    let v = &*value;

    match sample_type {
        dc_sample_type_t::DC_SAMPLE_TIME => {
            // Flush previous sample before starting a new time step
            collector.flush_sample();
            collector.current_time_ms = v.time;
            collector.pending_depth = false;
        }
        dc_sample_type_t::DC_SAMPLE_DEPTH => {
            collector.current_depth = v.depth;
            collector.pending_depth = true;
        }
        dc_sample_type_t::DC_SAMPLE_TEMPERATURE => {
            collector.current_temp = Some(v.temperature);
        }
        dc_sample_type_t::DC_SAMPLE_PRESSURE => {
            let p = v.pressure;
            collector.tank_pressures.push(ParsedTankPressure {
                sensor_id: p.tank as i64,
                sensor_name: None,
                time_seconds: (collector.current_time_ms / 1000) as i32,
                pressure_bar: p.value,
            });
        }
        dc_sample_type_t::DC_SAMPLE_RBT => {
            collector.current_rbt = Some(v.rbt as i32);
        }
        dc_sample_type_t::DC_SAMPLE_DECO => {
            let deco = v.deco;
            if deco.r#type == dc_deco_type_t::DC_DECO_NDL as c_uint {
                collector.current_ndl = Some(deco.time as i32);
            }
        }
        dc_sample_type_t::DC_SAMPLE_CNS => {
            collector.last_cns = Some(v.cns * 100.0);
        }
        // Events, PPO2, gasmix changes, etc. — skip for now.
        _ => {}
    }
}

/// Parse raw dive data (as returned by dc_device_foreach) using libdivecomputer's
/// parser and convert to our ParsedDivePreview struct.
///
/// The `descriptor` identifies the dive computer type. `data` is the raw binary
/// dive blob from the device.
pub fn parse_dive_data(
    context: &Context,
    descriptor: &OwnedDescriptor,
    data: &[u8],
) -> Result<ParsedDivePreview, String> {
    unsafe {
        // Create parser
        let mut parser: *mut dc_parser_t = ptr::null_mut();
        dc_parser_new2(
            &mut parser,
            context.as_ptr(),
            descriptor.as_ptr(),
            data.as_ptr(),
            data.len(),
        )
        .to_result()
        .map_err(|e| format!("Failed to create parser: {}", e))?;

        // Get datetime
        let mut dt = dc_datetime_t::default();
        let dt_result = dc_parser_get_datetime(parser, &mut dt).to_result();
        let (date_str, time_str) = if dt_result.is_ok() {
            (
                format!("{:04}-{:02}-{:02}", dt.year, dt.month, dt.day),
                format!("{:02}:{:02}:{:02}", dt.hour, dt.minute, dt.second),
            )
        } else {
            ("1970-01-01".to_string(), "00:00:00".to_string())
        };

        // Get fields
        let mut divetime: c_uint = 0;
        let _ = dc_parser_get_field(
            parser,
            dc_field_type_t::DC_FIELD_DIVETIME,
            0,
            &mut divetime as *mut _ as *mut c_void,
        );

        let mut maxdepth: f64 = 0.0;
        let _ = dc_parser_get_field(
            parser,
            dc_field_type_t::DC_FIELD_MAXDEPTH,
            0,
            &mut maxdepth as *mut _ as *mut c_void,
        );

        let mut avgdepth: f64 = 0.0;
        let avg_ok = dc_parser_get_field(
            parser,
            dc_field_type_t::DC_FIELD_AVGDEPTH,
            0,
            &mut avgdepth as *mut _ as *mut c_void,
        )
        .is_success();

        let mut temp_min: f64 = 0.0;
        let temp_ok = dc_parser_get_field(
            parser,
            dc_field_type_t::DC_FIELD_TEMPERATURE_MINIMUM,
            0,
            &mut temp_min as *mut _ as *mut c_void,
        )
        .is_success();

        // Surface (air) temperature
        let mut temp_surface: f64 = 0.0;
        let temp_surface_ok = dc_parser_get_field(
            parser,
            dc_field_type_t::DC_FIELD_TEMPERATURE_SURFACE,
            0,
            &mut temp_surface as *mut _ as *mut c_void,
        )
        .is_success();

        // Atmospheric / surface pressure
        let mut atmospheric: f64 = 0.0;
        let atmospheric_ok = dc_parser_get_field(
            parser,
            dc_field_type_t::DC_FIELD_ATMOSPHERIC,
            0,
            &mut atmospheric as *mut _ as *mut c_void,
        )
        .is_success();

        // GPS location (few dive computers support this)
        let mut location = dc_location_t {
            latitude: 0.0,
            longitude: 0.0,
            altitude: 0.0,
        };
        let location_ok = dc_parser_get_field(
            parser,
            dc_field_type_t::DC_FIELD_LOCATION,
            0,
            &mut location as *mut _ as *mut c_void,
        )
        .is_success();

        // Gas mixes
        let mut gasmix_count: c_uint = 0;
        let _ = dc_parser_get_field(
            parser,
            dc_field_type_t::DC_FIELD_GASMIX_COUNT,
            0,
            &mut gasmix_count as *mut _ as *mut c_void,
        );

        // Tanks
        let mut tank_count: c_uint = 0;
        let _ = dc_parser_get_field(
            parser,
            dc_field_type_t::DC_FIELD_TANK_COUNT,
            0,
            &mut tank_count as *mut _ as *mut c_void,
        );

        let mut tanks = Vec::new();
        for i in 0..tank_count {
            let mut tank = dc_tank_t {
                gasmix: 0xFFFFFFFF,
                r#type: dc_tankvolume_t::DC_TANKVOLUME_NONE,
                volume: 0.0,
                workpressure: 0.0,
                beginpressure: 0.0,
                endpressure: 0.0,
                usage: dc_usage_t::DC_USAGE_NONE,
            };
            let tank_ok = dc_parser_get_field(
                parser,
                dc_field_type_t::DC_FIELD_TANK,
                i,
                &mut tank as *mut _ as *mut c_void,
            )
            .is_success();
            if tank_ok {
                // Get gas mix for this tank
                let (o2, he) = if tank.gasmix != 0xFFFFFFFF && tank.gasmix < gasmix_count {
                    let mut gm = dc_gasmix_t {
                        helium: 0.0,
                        oxygen: 0.0,
                        nitrogen: 0.0,
                        usage: dc_usage_t::DC_USAGE_NONE,
                    };
                    let gm_ok = dc_parser_get_field(
                        parser,
                        dc_field_type_t::DC_FIELD_GASMIX,
                        tank.gasmix,
                        &mut gm as *mut _ as *mut c_void,
                    )
                    .is_success();
                    if gm_ok {
                        (Some(gm.oxygen * 100.0), Some(gm.helium * 100.0))
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                };

                tanks.push(ParsedTank {
                    sensor_id: i as i64,
                    gas_index: tank.gasmix as i32,
                    o2_percent: o2,
                    he_percent: he,
                    start_pressure_bar: if tank.beginpressure > 0.0 {
                        Some(tank.beginpressure)
                    } else {
                        None
                    },
                    end_pressure_bar: if tank.endpressure > 0.0 {
                        Some(tank.endpressure)
                    } else {
                        None
                    },
                    volume_used_liters: None,
                });
            }
        }

        // Collect samples
        let mut collector = SampleCollector::new();
        let _ = dc_parser_samples_foreach(
            parser,
            sample_callback,
            &mut collector as *mut _ as *mut c_void,
        );
        // Flush the last sample
        collector.flush_sample();

        // Compute mean depth from samples if parser didn't provide it
        let mean_depth = if avg_ok && avgdepth > 0.0 {
            avgdepth
        } else if !collector.samples.is_empty() {
            let sum: f64 = collector.samples.iter().map(|s| s.depth_m).sum();
            sum / collector.samples.len() as f64
        } else {
            0.0
        };

        let model_name = format!("{} {}", descriptor.vendor(), descriptor.product());

        dc_parser_destroy(parser);

        Ok(ParsedDivePreview {
            date: date_str,
            time: time_str,
            duration_seconds: divetime as i32,
            max_depth_m: maxdepth,
            mean_depth_m: mean_depth,
            water_temp_c: if temp_ok { Some(temp_min) } else { None },
            air_temp_c: if temp_surface_ok { Some(temp_surface) } else { None },
            surface_pressure_bar: if atmospheric_ok { Some(atmospheric) } else { None },
            cns_percent: collector.last_cns,
            dive_computer_model: Some(model_name),
            latitude: if location_ok && (location.latitude != 0.0 || location.longitude != 0.0) { Some(location.latitude) } else { None },
            longitude: if location_ok && (location.latitude != 0.0 || location.longitude != 0.0) { Some(location.longitude) } else { None },
            samples: collector.samples,
            tank_pressures: collector.tank_pressures,
            tanks,
        })
    }
}

// ============================================================================
// Download session management
// ============================================================================

/// State for a dive download session — collects raw dive blobs from the
/// dc_device_foreach callback, plus progress/device-info events.
pub struct DownloadSession {
    /// Raw dive data blobs returned by the device protocol.
    pub dives: Vec<Vec<u8>>,
    /// Fingerprints matching each dive (parallel with `dives`).
    pub fingerprints: Vec<Vec<u8>>,
    /// Device info received via event callback.
    pub devinfo: Option<dc_event_devinfo_t>,
    /// Progress percentage (0–100).
    pub progress_percent: u8,
    /// Set to true to request cancellation.
    pub cancel_requested: bool,
    /// Optional callback invoked on progress/devinfo events (from C thread).
    pub on_event: Option<Box<dyn Fn(&DownloadSessionEvent) + Send>>,
    /// Pre-loaded fingerprint from previous sync (set before download to
    /// skip already-imported dives).
    pub fingerprint: Option<Vec<u8>>,
}

/// Events emitted during download for the progress callback.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum DownloadSessionEvent {
    #[serde(rename = "progress")]
    Progress { percent: u8 },
    #[serde(rename = "device_info")]
    DeviceInfo { model: u32, firmware: u32, serial: u32 },
    #[serde(rename = "dive")]
    DiveReceived { index: usize },
}

impl DownloadSession {
    pub fn new() -> Self {
        Self {
            dives: Vec::new(),
            fingerprints: Vec::new(),
            devinfo: None,
            progress_percent: 0,
            cancel_requested: false,
            on_event: None,
            fingerprint: None,
        }
    }

    /// Attach a progress callback.
    pub fn with_event_callback<F: Fn(&DownloadSessionEvent) + Send + 'static>(mut self, cb: F) -> Self {
        self.on_event = Some(Box::new(cb));
        self
    }

    /// Set a fingerprint for incremental download (skip already-seen dives).
    pub fn with_fingerprint(mut self, fp: Vec<u8>) -> Self {
        self.fingerprint = Some(fp);
        self
    }
}

/// C callback for dc_device_foreach — collects each raw dive blob + fingerprint.
pub unsafe extern "C" fn dive_callback(
    data: *const u8,
    size: c_uint,
    fingerprint: *const u8,
    fsize: c_uint,
    userdata: *mut c_void,
) -> c_int {
    let session = &mut *(userdata as *mut DownloadSession);
    if session.cancel_requested {
        return 0; // stop iteration
    }
    let slice = std::slice::from_raw_parts(data, size as usize);
    session.dives.push(slice.to_vec());

    // Capture the fingerprint
    if !fingerprint.is_null() && fsize > 0 {
        let fp = std::slice::from_raw_parts(fingerprint, fsize as usize);
        session.fingerprints.push(fp.to_vec());
    } else {
        session.fingerprints.push(Vec::new());
    }

    // Notify progress callback
    if let Some(ref cb) = session.on_event {
        cb(&DownloadSessionEvent::DiveReceived { index: session.dives.len() - 1 });
    }
    1 // continue
}

/// C callback for dc_device_set_events — captures progress + devinfo.
pub unsafe extern "C" fn event_callback(
    _device: *mut dc_device_t,
    event: c_uint,
    data: *const c_void,
    userdata: *mut c_void,
) {
    let session = &mut *(userdata as *mut DownloadSession);
    if event & DC_EVENT_PROGRESS != 0 {
        let progress = &*(data as *const dc_event_progress_t);
        if progress.maximum > 0 {
            session.progress_percent =
                ((progress.current as u64 * 100) / progress.maximum as u64).min(100) as u8;
        }
        if let Some(ref cb) = session.on_event {
            cb(&DownloadSessionEvent::Progress { percent: session.progress_percent });
        }
    }
    if event & DC_EVENT_DEVINFO != 0 {
        let info = &*(data as *const dc_event_devinfo_t);
        session.devinfo = Some(info.clone());
        if let Some(ref cb) = session.on_event {
            cb(&DownloadSessionEvent::DeviceInfo {
                model: info.model,
                firmware: info.firmware,
                serial: info.serial,
            });
        }
    }
}

/// C callback for dc_device_set_cancel — checks the cancel flag.
pub unsafe extern "C" fn cancel_callback(userdata: *mut c_void) -> c_int {
    let session = &*(userdata as *const DownloadSession);
    if session.cancel_requested { 1 } else { 0 }
}

/// Full download-and-parse pipeline: open device → download all dives → parse each.
///
/// `iostream` must already be an opened I/O stream (created via `dc_custom_open`
/// or a native serial/USB open).
///
/// Returns a list of parsed dive previews ready for the import review UI.
pub fn download_and_parse_dives(
    context: &Context,
    descriptor: &OwnedDescriptor,
    iostream: *mut dc_iostream_t,
    session: &mut DownloadSession,
) -> Result<Vec<ParsedDivePreview>, String> {
    unsafe {
        // Open device
        let mut device: *mut dc_device_t = ptr::null_mut();
        dc_device_open(
            &mut device,
            context.as_ptr(),
            descriptor.as_ptr(),
            iostream,
        )
        .to_result()
        .map_err(|e| format!("Failed to open device: {}", e))?;

        // Set up callbacks
        let session_ptr = session as *mut DownloadSession as *mut c_void;
        dc_device_set_events(
            device,
            DC_EVENT_PROGRESS | DC_EVENT_DEVINFO,
            event_callback,
            session_ptr,
        )
        .to_result()
        .map_err(|e| format!("Failed to set event callback: {}", e))?;

        dc_device_set_cancel(device, cancel_callback, session_ptr)
            .to_result()
            .map_err(|e| format!("Failed to set cancel callback: {}", e))?;

        // Set fingerprint for incremental download (skip already-seen dives)
        if let Some(ref fp) = session.fingerprint {
            log::info!("Setting device fingerprint ({} bytes) for incremental download", fp.len());
            dc_device_set_fingerprint(device, fp.as_ptr(), fp.len() as c_uint)
                .to_result()
                .map_err(|e| format!("Failed to set fingerprint: {}", e))?;
        }

        // Download dives
        let rc = dc_device_foreach(device, dive_callback, session_ptr);
        dc_device_close(device);

        if !rc.is_success() && rc != dc_status_t::DC_STATUS_DONE {
            return Err(format!(
                "Download failed: {}",
                LibDCError(rc)
            ));
        }

        // Parse each dive
        let mut previews = Vec::new();
        for dive_data in &session.dives {
            match parse_dive_data(context, descriptor, dive_data) {
                Ok(preview) => previews.push(preview),
                Err(e) => {
                    log::warn!("Failed to parse dive: {}", e);
                    // Continue with remaining dives
                }
            }
        }

        // Reverse so newest dive is last (libdc returns newest first)
        previews.reverse();

        Ok(previews)
    }
}
