//! Transport layer bridge: connects libdivecomputer's dc_custom_open()
//! iostream callbacks to native Rust serial/USB-HID I/O.
//!
//! Architecture:
//! - libdivecomputer calls our C callback vtable (set_timeout, read, write, etc.)
//! - Each callback casts the `userdata` pointer back to a Rust trait object
//! - The trait object dispatches to the concrete `SerialTransport` or `HidTransport`
//!
//! This lets libdivecomputer protocol code talk to real hardware through Rust I/O,
//! without any C serial/USB libraries.

use std::ffi::{c_int, c_uint, c_void};
use std::time::Duration;

use crate::libdc::*;

// ============================================================================
// Transport trait — abstraction over serial / USB HID
// ============================================================================

/// Common transport interface that both serial and HID implement.
/// The dc_custom_cbs_t callbacks dispatch to this trait.
pub trait Transport: Send {
    fn set_timeout(&mut self, timeout_ms: i32) -> dc_status_t;
    fn configure(
        &mut self,
        _baudrate: u32,
        _databits: u32,
        _parity: dc_parity_t,
        _stopbits: dc_stopbits_t,
        _flowcontrol: dc_flowcontrol_t,
    ) -> dc_status_t {
        dc_status_t::DC_STATUS_SUCCESS // Default: no-op for non-serial transports
    }
    fn set_dtr(&mut self, _value: u32) -> dc_status_t {
        dc_status_t::DC_STATUS_SUCCESS
    }
    fn set_rts(&mut self, _value: u32) -> dc_status_t {
        dc_status_t::DC_STATUS_SUCCESS
    }
    fn set_break(&mut self, _value: u32) -> dc_status_t {
        dc_status_t::DC_STATUS_SUCCESS
    }
    fn get_lines(&mut self, _value: *mut c_uint) -> dc_status_t {
        dc_status_t::DC_STATUS_UNSUPPORTED
    }
    fn get_available(&mut self, value: *mut usize) -> dc_status_t;
    fn read(&mut self, data: *mut c_void, size: usize, actual: *mut usize) -> dc_status_t;
    fn write(&mut self, data: *const c_void, size: usize, actual: *mut usize) -> dc_status_t;
    fn flush(&mut self) -> dc_status_t {
        dc_status_t::DC_STATUS_SUCCESS
    }
    fn purge(&mut self, _direction: dc_direction_t) -> dc_status_t {
        dc_status_t::DC_STATUS_SUCCESS
    }
    fn sleep(&mut self, milliseconds: u32) -> dc_status_t {
        std::thread::sleep(Duration::from_millis(milliseconds as u64));
        dc_status_t::DC_STATUS_SUCCESS
    }
    fn poll(&mut self, _timeout_ms: i32) -> dc_status_t {
        dc_status_t::DC_STATUS_SUCCESS
    }
    fn ioctl(&mut self, _request: c_uint, _data: *mut c_void, _size: usize) -> dc_status_t {
        dc_status_t::DC_STATUS_UNSUPPORTED
    }
    fn close(&mut self) -> dc_status_t;
}

// ============================================================================
// Serial transport (via `serialport` crate)
// ============================================================================

pub struct SerialTransport {
    port: Box<dyn serialport::SerialPort>,
    timeout: Duration,
}

impl SerialTransport {
    /// Open a serial port by name (e.g. "COM3" on Windows, "/dev/ttyUSB0" on Linux).
    pub fn open(port_name: &str) -> Result<Self, String> {
        let port = serialport::new(port_name, 9600) // Default baud; libdc will call configure()
            .timeout(Duration::from_secs(5))
            .open()
            .map_err(|e| format!("Failed to open serial port '{}': {}", port_name, e))?;
        Ok(Self {
            port,
            timeout: Duration::from_secs(5),
        })
    }
}

impl Transport for SerialTransport {
    fn set_timeout(&mut self, timeout_ms: i32) -> dc_status_t {
        self.timeout = if timeout_ms < 0 {
            Duration::from_secs(60) // "infinite" timeout
        } else {
            Duration::from_millis(timeout_ms as u64)
        };
        if let Err(_) = self.port.set_timeout(self.timeout) {
            return dc_status_t::DC_STATUS_IO;
        }
        dc_status_t::DC_STATUS_SUCCESS
    }

    fn configure(
        &mut self,
        baudrate: u32,
        databits: u32,
        parity: dc_parity_t,
        stopbits: dc_stopbits_t,
        flowcontrol: dc_flowcontrol_t,
    ) -> dc_status_t {
        if let Err(_) = self.port.set_baud_rate(baudrate) {
            return dc_status_t::DC_STATUS_IO;
        }
        let data_bits = match databits {
            5 => serialport::DataBits::Five,
            6 => serialport::DataBits::Six,
            7 => serialport::DataBits::Seven,
            8 => serialport::DataBits::Eight,
            _ => return dc_status_t::DC_STATUS_INVALIDARGS,
        };
        if let Err(_) = self.port.set_data_bits(data_bits) {
            return dc_status_t::DC_STATUS_IO;
        }
        let par = match parity {
            dc_parity_t::DC_PARITY_NONE => serialport::Parity::None,
            dc_parity_t::DC_PARITY_ODD => serialport::Parity::Odd,
            dc_parity_t::DC_PARITY_EVEN => serialport::Parity::Even,
            _ => return dc_status_t::DC_STATUS_UNSUPPORTED,
        };
        if let Err(_) = self.port.set_parity(par) {
            return dc_status_t::DC_STATUS_IO;
        }
        let stop = match stopbits {
            dc_stopbits_t::DC_STOPBITS_ONE => serialport::StopBits::One,
            dc_stopbits_t::DC_STOPBITS_TWO => serialport::StopBits::Two,
            _ => return dc_status_t::DC_STATUS_UNSUPPORTED,
        };
        if let Err(_) = self.port.set_stop_bits(stop) {
            return dc_status_t::DC_STATUS_IO;
        }
        let flow = match flowcontrol {
            dc_flowcontrol_t::DC_FLOWCONTROL_NONE => serialport::FlowControl::None,
            dc_flowcontrol_t::DC_FLOWCONTROL_HARDWARE => serialport::FlowControl::Hardware,
            dc_flowcontrol_t::DC_FLOWCONTROL_SOFTWARE => serialport::FlowControl::Software,
        };
        if let Err(_) = self.port.set_flow_control(flow) {
            return dc_status_t::DC_STATUS_IO;
        }
        dc_status_t::DC_STATUS_SUCCESS
    }

    fn set_dtr(&mut self, value: u32) -> dc_status_t {
        match self.port.write_data_terminal_ready(value != 0) {
            Ok(_) => dc_status_t::DC_STATUS_SUCCESS,
            Err(_) => dc_status_t::DC_STATUS_IO,
        }
    }

    fn set_rts(&mut self, value: u32) -> dc_status_t {
        match self.port.write_request_to_send(value != 0) {
            Ok(_) => dc_status_t::DC_STATUS_SUCCESS,
            Err(_) => dc_status_t::DC_STATUS_IO,
        }
    }

    fn set_break(&mut self, value: u32) -> dc_status_t {
        if value != 0 {
            match self.port.set_break() {
                Ok(_) => dc_status_t::DC_STATUS_SUCCESS,
                Err(_) => dc_status_t::DC_STATUS_IO,
            }
        } else {
            match self.port.clear_break() {
                Ok(_) => dc_status_t::DC_STATUS_SUCCESS,
                Err(_) => dc_status_t::DC_STATUS_IO,
            }
        }
    }

    fn get_available(&mut self, value: *mut usize) -> dc_status_t {
        match self.port.bytes_to_read() {
            Ok(n) => {
                unsafe { *value = n as usize };
                dc_status_t::DC_STATUS_SUCCESS
            }
            Err(_) => dc_status_t::DC_STATUS_IO,
        }
    }

    fn read(&mut self, data: *mut c_void, size: usize, actual: *mut usize) -> dc_status_t {
        let buf = unsafe { std::slice::from_raw_parts_mut(data as *mut u8, size) };
        let mut total = 0usize;
        while total < size {
            match std::io::Read::read(&mut self.port, &mut buf[total..]) {
                Ok(0) => {
                    // EOF / no data available
                    break;
                }
                Ok(n) => {
                    total += n;
                }
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    break;
                }
                Err(_) => {
                    unsafe { *actual = total };
                    return dc_status_t::DC_STATUS_IO;
                }
            }
        }
        unsafe { *actual = total };
        if total == 0 {
            dc_status_t::DC_STATUS_TIMEOUT
        } else {
            dc_status_t::DC_STATUS_SUCCESS
        }
    }

    fn write(&mut self, data: *const c_void, size: usize, actual: *mut usize) -> dc_status_t {
        let buf = unsafe { std::slice::from_raw_parts(data as *const u8, size) };
        match std::io::Write::write_all(&mut self.port, buf) {
            Ok(_) => {
                unsafe { *actual = size };
                dc_status_t::DC_STATUS_SUCCESS
            }
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                unsafe { *actual = 0 };
                dc_status_t::DC_STATUS_TIMEOUT
            }
            Err(_) => {
                unsafe { *actual = 0 };
                dc_status_t::DC_STATUS_IO
            }
        }
    }

    fn flush(&mut self) -> dc_status_t {
        match std::io::Write::flush(&mut self.port) {
            Ok(_) => dc_status_t::DC_STATUS_SUCCESS,
            Err(_) => dc_status_t::DC_STATUS_IO,
        }
    }

    fn purge(&mut self, direction: dc_direction_t) -> dc_status_t {
        match direction {
            dc_direction_t::DC_DIRECTION_INPUT => {
                let _ = self.port.clear(serialport::ClearBuffer::Input);
            }
            dc_direction_t::DC_DIRECTION_OUTPUT => {
                let _ = self.port.clear(serialport::ClearBuffer::Output);
            }
            dc_direction_t::DC_DIRECTION_ALL => {
                let _ = self.port.clear(serialport::ClearBuffer::All);
            }
        }
        dc_status_t::DC_STATUS_SUCCESS
    }

    fn close(&mut self) -> dc_status_t {
        // serialport crate closes on drop; nothing explicit needed
        dc_status_t::DC_STATUS_SUCCESS
    }
}

// ============================================================================
// USB HID transport (via `hidapi` crate)
// ============================================================================

pub struct HidTransport {
    device: hidapi::HidDevice,
    timeout: i32, // milliseconds, -1 = blocking
}

impl HidTransport {
    /// Open a USB HID device by vendor ID and product ID.
    pub fn open(vendor_id: u16, product_id: u16) -> Result<Self, String> {
        let api = hidapi::HidApi::new()
            .map_err(|e| format!("Failed to initialise HID API: {}", e))?;
        let device = api
            .open(vendor_id, product_id)
            .map_err(|e| format!("Failed to open HID device {:04x}:{:04x}: {}", vendor_id, product_id, e))?;
        Ok(Self {
            device,
            timeout: 5000,
        })
    }
}

impl Transport for HidTransport {
    fn set_timeout(&mut self, timeout_ms: i32) -> dc_status_t {
        self.timeout = if timeout_ms < 0 { -1 } else { timeout_ms };
        dc_status_t::DC_STATUS_SUCCESS
    }

    fn get_available(&mut self, value: *mut usize) -> dc_status_t {
        // HID doesn't have a bytes-available query; report 0
        unsafe { *value = 0 };
        dc_status_t::DC_STATUS_SUCCESS
    }

    fn read(&mut self, data: *mut c_void, size: usize, actual: *mut usize) -> dc_status_t {
        let buf = unsafe { std::slice::from_raw_parts_mut(data as *mut u8, size) };
        match self.device.read_timeout(buf, self.timeout) {
            Ok(n) => {
                unsafe { *actual = n };
                if n == 0 {
                    dc_status_t::DC_STATUS_TIMEOUT
                } else {
                    dc_status_t::DC_STATUS_SUCCESS
                }
            }
            Err(_) => {
                unsafe { *actual = 0 };
                dc_status_t::DC_STATUS_IO
            }
        }
    }

    fn write(&mut self, data: *const c_void, size: usize, actual: *mut usize) -> dc_status_t {
        let buf = unsafe { std::slice::from_raw_parts(data as *const u8, size) };
        match self.device.write(buf) {
            Ok(n) => {
                unsafe { *actual = n };
                dc_status_t::DC_STATUS_SUCCESS
            }
            Err(_) => {
                unsafe { *actual = 0 };
                dc_status_t::DC_STATUS_IO
            }
        }
    }

    fn close(&mut self) -> dc_status_t {
        // hidapi closes on drop
        dc_status_t::DC_STATUS_SUCCESS
    }
}

// ============================================================================
// dc_custom_cbs_t callback trampolines
//
// Each extern "C" function casts the userdata pointer back to `&mut dyn Transport`
// and dispatches to the trait method. This is the glue between libdivecomputer's
// C callback vtable and our Rust transport implementations.
// ============================================================================

unsafe extern "C" fn cb_set_timeout(userdata: *mut c_void, timeout: c_int) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.set_timeout(timeout)
}

unsafe extern "C" fn cb_set_break(userdata: *mut c_void, value: c_uint) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.set_break(value)
}

unsafe extern "C" fn cb_set_dtr(userdata: *mut c_void, value: c_uint) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.set_dtr(value)
}

unsafe extern "C" fn cb_set_rts(userdata: *mut c_void, value: c_uint) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.set_rts(value)
}

unsafe extern "C" fn cb_get_lines(userdata: *mut c_void, value: *mut c_uint) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.get_lines(value)
}

unsafe extern "C" fn cb_get_available(userdata: *mut c_void, value: *mut usize) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.get_available(value)
}

unsafe extern "C" fn cb_configure(
    userdata: *mut c_void,
    baudrate: c_uint,
    databits: c_uint,
    parity: dc_parity_t,
    stopbits: dc_stopbits_t,
    flowcontrol: dc_flowcontrol_t,
) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.configure(baudrate, databits, parity, stopbits, flowcontrol)
}

unsafe extern "C" fn cb_poll(userdata: *mut c_void, timeout: c_int) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.poll(timeout)
}

unsafe extern "C" fn cb_read(
    userdata: *mut c_void,
    data: *mut c_void,
    size: usize,
    actual: *mut usize,
) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.read(data, size, actual)
}

unsafe extern "C" fn cb_write(
    userdata: *mut c_void,
    data: *const c_void,
    size: usize,
    actual: *mut usize,
) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.write(data, size, actual)
}

unsafe extern "C" fn cb_ioctl(
    userdata: *mut c_void,
    request: c_uint,
    data: *mut c_void,
    size: usize,
) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.ioctl(request, data, size)
}

unsafe extern "C" fn cb_flush(userdata: *mut c_void) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.flush()
}

unsafe extern "C" fn cb_purge(userdata: *mut c_void, direction: dc_direction_t) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.purge(direction)
}

unsafe extern "C" fn cb_sleep(userdata: *mut c_void, milliseconds: c_uint) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.sleep(milliseconds)
}

unsafe extern "C" fn cb_close(userdata: *mut c_void) -> dc_status_t {
    let transport = &mut *(userdata as *mut Box<dyn Transport>);
    transport.close()
}

/// The static callback vtable passed to dc_custom_open().
static CUSTOM_CBS: dc_custom_cbs_t = dc_custom_cbs_t {
    set_timeout: Some(cb_set_timeout),
    set_break: Some(cb_set_break),
    set_dtr: Some(cb_set_dtr),
    set_rts: Some(cb_set_rts),
    get_lines: Some(cb_get_lines),
    get_available: Some(cb_get_available),
    configure: Some(cb_configure),
    poll: Some(cb_poll),
    read: Some(cb_read),
    write: Some(cb_write),
    ioctl: Some(cb_ioctl),
    flush: Some(cb_flush),
    purge: Some(cb_purge),
    sleep: Some(cb_sleep),
    close: Some(cb_close),
};

// ============================================================================
// Public API — create a dc_iostream_t from a Rust Transport
// ============================================================================

/// Holds the resources for an open custom iostream.
/// The `transport_box` is heap-allocated and its raw pointer is passed as
/// userdata to libdivecomputer. It MUST live as long as the iostream.
pub struct CustomIoStream {
    pub iostream: *mut dc_iostream_t,
    /// Must be kept alive — its raw pointer is the userdata for the callbacks.
    _transport_box: *mut Box<dyn Transport>,
}

unsafe impl Send for CustomIoStream {}

impl CustomIoStream {
    /// Create a libdivecomputer custom iostream backed by a Rust Transport.
    /// The transport type (SERIAL or USBHID) tells libdivecomputer which
    /// protocol framing to expect.
    pub fn new(
        context: &Context,
        transport_type: dc_transport_t,
        transport: Box<dyn Transport>,
    ) -> Result<Self, String> {
        // Heap-allocate the boxed trait object so we have a stable pointer
        let transport_ptr = Box::into_raw(Box::new(transport));

        let mut iostream: *mut dc_iostream_t = std::ptr::null_mut();
        let rc = unsafe {
            dc_custom_open(
                &mut iostream,
                context.as_ptr(),
                transport_type,
                &CUSTOM_CBS,
                transport_ptr as *mut c_void,
            )
        };

        if !rc.is_success() {
            // Clean up on failure
            unsafe {
                let _ = Box::from_raw(transport_ptr);
            }
            return Err(format!("dc_custom_open failed: {:?}", rc));
        }

        Ok(Self {
            iostream,
            _transport_box: transport_ptr,
        })
    }
}

impl Drop for CustomIoStream {
    fn drop(&mut self) {
        unsafe {
            if !self.iostream.is_null() {
                dc_iostream_close(self.iostream);
            }
            // Reclaim the transport box
            let _ = Box::from_raw(self._transport_box);
        }
    }
}

// ============================================================================
// Port enumeration helpers
// ============================================================================

/// Info about an available serial port.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SerialPortInfo {
    pub name: String,
    pub description: String,
    /// USB vendor ID (if USB-serial adapter)
    pub vid: Option<u16>,
    /// USB product ID (if USB-serial adapter)
    pub pid: Option<u16>,
    /// Serial number (if available)
    pub serial_number: Option<String>,
    /// Manufacturer name
    pub manufacturer: Option<String>,
}

/// List available serial ports on this system.
pub fn list_serial_ports() -> Vec<SerialPortInfo> {
    match serialport::available_ports() {
        Ok(ports) => ports
            .into_iter()
            .map(|p| {
                let (vid, pid, serial_number, manufacturer) = match &p.port_type {
                    serialport::SerialPortType::UsbPort(usb) => (
                        Some(usb.vid),
                        Some(usb.pid),
                        usb.serial_number.clone(),
                        usb.manufacturer.clone(),
                    ),
                    _ => (None, None, None, None),
                };
                // Build description
                let desc = match &p.port_type {
                    serialport::SerialPortType::UsbPort(usb) => {
                        let product = usb.product.as_deref().unwrap_or("USB Serial");
                        let mfr = usb.manufacturer.as_deref().unwrap_or("");
                        if mfr.is_empty() {
                            product.to_string()
                        } else {
                            format!("{} ({})", product, mfr)
                        }
                    }
                    serialport::SerialPortType::BluetoothPort => "Bluetooth Serial".to_string(),
                    serialport::SerialPortType::PciPort => "PCI Serial".to_string(),
                    serialport::SerialPortType::Unknown => "Serial Port".to_string(),
                };
                SerialPortInfo {
                    name: p.port_name,
                    description: desc,
                    vid,
                    pid,
                    serial_number,
                    manufacturer,
                }
            })
            .collect(),
        Err(e) => {
            log::warn!("Failed to enumerate serial ports: {}", e);
            Vec::new()
        }
    }
}

/// Info about an available USB HID device.
#[derive(Debug, Clone, serde::Serialize)]
pub struct HidDeviceInfo {
    pub vendor_id: u16,
    pub product_id: u16,
    pub product_name: String,
    pub manufacturer: String,
    pub serial_number: String,
    pub path: String,
}

/// List available USB HID devices on this system.
pub fn list_hid_devices() -> Vec<HidDeviceInfo> {
    match hidapi::HidApi::new() {
        Ok(api) => api
            .device_list()
            .map(|d| HidDeviceInfo {
                vendor_id: d.vendor_id(),
                product_id: d.product_id(),
                product_name: d.product_string().unwrap_or("").to_string(),
                manufacturer: d.manufacturer_string().unwrap_or("").to_string(),
                serial_number: d.serial_number().unwrap_or("").to_string(),
                path: d.path().to_string_lossy().into_owned(),
            })
            .collect(),
        Err(e) => {
            log::warn!("Failed to enumerate HID devices: {}", e);
            Vec::new()
        }
    }
}

// ============================================================================
// BLE transport (via `btleplug` crate)
//
// Architecture:
// - btleplug is async; our Transport trait methods are sync (called from C)
// - We keep a tokio runtime handle and use block_on() from spawn_blocking threads
// - BLE notifications are collected into a shared ring buffer by a background task
// - read() pulls from the ring buffer, write() sends to the TX characteristic
// - ioctl() handles BLE-specific operations (name, characteristic read/write)
// ============================================================================

use btleplug::api::{Central, Manager as _, Peripheral as _, ScanFilter, WriteType, CharPropFlags};
use btleplug::platform::{Manager, Peripheral};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex, Condvar};

/// BLE ioctl request codes (mirrors libdivecomputer/ble.h macros).
const DC_IOCTL_DIR_READ: u32  = 1;
const DC_IOCTL_DIR_WRITE: u32 = 2;

const fn dc_ioctl_ior(typ: u8, nr: u8, size: u16) -> u32 {
    ((DC_IOCTL_DIR_READ as u32) << 30) | ((size as u32) << 16) | ((typ as u32) << 8) | (nr as u32)
}
const fn dc_ioctl_iow(typ: u8, nr: u8, size: u16) -> u32 {
    ((DC_IOCTL_DIR_WRITE as u32) << 30) | ((size as u32) << 16) | ((typ as u32) << 8) | (nr as u32)
}

const BLE_TYPE: u8 = b'b';
const DC_IOCTL_BLE_GET_NAME: u32             = dc_ioctl_ior(BLE_TYPE, 0, 0);
const DC_IOCTL_BLE_CHARACTERISTIC_READ: u32  = dc_ioctl_ior(BLE_TYPE, 3, 0);
const DC_IOCTL_BLE_CHARACTERISTIC_WRITE: u32 = dc_ioctl_iow(BLE_TYPE, 3, 0);

/// Size of a BLE UUID in bytes.
const BLE_UUID_LEN: usize = 16;

pub struct BleTransport {
    peripheral: Peripheral,
    /// Primary TX characteristic (first writable one found).
    tx_char: Option<btleplug::api::Characteristic>,
    /// All discovered characteristics for ioctl lookups.
    all_chars: Vec<btleplug::api::Characteristic>,
    /// Notification data buffer shared with the listener task.
    rx_buf: Arc<(Mutex<VecDeque<u8>>, Condvar)>,
    timeout: Duration,
    device_name: String,
    runtime: tokio::runtime::Handle,
}

/// Discover info about a BLE peripheral (returned by scan).
#[derive(Debug, Clone, serde::Serialize)]
pub struct BleDeviceInfo {
    /// btleplug peripheral ID, serialised for reconnect.
    pub id: String,
    pub name: String,
    pub address: String,
}

impl BleTransport {
    /// Connect to a previously-scanned BLE peripheral.
    /// Must be called from a context where `tokio::runtime::Handle::current()` works
    /// (e.g. inside `spawn_blocking`).
    pub fn connect(peripheral: Peripheral, name: String) -> Result<Self, String> {
        let runtime = tokio::runtime::Handle::current();

        runtime.block_on(async {
            // Connect
            peripheral.connect().await
                .map_err(|e| format!("BLE connect failed: {}", e))?;

            // Discover services
            peripheral.discover_services().await
                .map_err(|e| format!("BLE service discovery failed: {}", e))?;

            let chars = peripheral.characteristics();
            let chars_vec: Vec<_> = chars.into_iter().collect();

            // Find primary TX characteristic (first one that supports Write)
            let tx_char = chars_vec.iter().find(|c| {
                c.properties.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE)
                    || c.properties.contains(CharPropFlags::WRITE)
            }).cloned();

            // Subscribe to all notifiable characteristics
            for ch in &chars_vec {
                if ch.properties.contains(CharPropFlags::NOTIFY)
                    || ch.properties.contains(CharPropFlags::INDICATE)
                {
                    if let Err(e) = peripheral.subscribe(ch).await {
                        log::warn!("BLE: failed to subscribe to {}: {}", ch.uuid, e);
                    }
                }
            }

            // Set up notification buffer
            let rx_buf = Arc::new((Mutex::new(VecDeque::<u8>::with_capacity(4096)), Condvar::new()));
            let rx_clone = Arc::clone(&rx_buf);

            // Spawn notification listener task
            let mut notif_stream = peripheral.notifications().await
                .map_err(|e| format!("BLE notification stream failed: {}", e))?;
            tokio::spawn(async move {
                use tokio_stream::StreamExt;
                while let Some(data) = notif_stream.next().await {
                    let (lock, cvar) = &*rx_clone;
                    if let Ok(mut buf) = lock.lock() {
                        buf.extend(data.value.iter());
                        cvar.notify_all();
                    }
                }
            });

            Ok(Self {
                peripheral,
                tx_char,
                all_chars: chars_vec,
                rx_buf,
                timeout: Duration::from_secs(5),
                device_name: name,
                runtime: tokio::runtime::Handle::current(),
            })
        })
    }

    /// Find a characteristic by its 128-bit UUID (as raw bytes, big-endian).
    fn find_char_by_uuid(&self, uuid_bytes: &[u8; BLE_UUID_LEN]) -> Option<&btleplug::api::Characteristic> {
        let target = uuid::Uuid::from_bytes(*uuid_bytes);
        self.all_chars.iter().find(|c| c.uuid == target)
    }
}

impl Transport for BleTransport {
    fn set_timeout(&mut self, timeout_ms: i32) -> dc_status_t {
        self.timeout = if timeout_ms < 0 {
            Duration::from_secs(60)
        } else {
            Duration::from_millis(timeout_ms as u64)
        };
        dc_status_t::DC_STATUS_SUCCESS
    }

    fn get_available(&mut self, value: *mut usize) -> dc_status_t {
        let (lock, _) = &*self.rx_buf;
        if let Ok(buf) = lock.lock() {
            unsafe { *value = buf.len() };
            dc_status_t::DC_STATUS_SUCCESS
        } else {
            dc_status_t::DC_STATUS_IO
        }
    }

    fn read(&mut self, data: *mut c_void, size: usize, actual: *mut usize) -> dc_status_t {
        let (lock, cvar) = &*self.rx_buf;
        let deadline = std::time::Instant::now() + self.timeout;
        let mut read_total = 0usize;
        let out = unsafe { std::slice::from_raw_parts_mut(data as *mut u8, size) };

        loop {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            if remaining.is_zero() && read_total == 0 {
                unsafe { *actual = 0 };
                return dc_status_t::DC_STATUS_TIMEOUT;
            }

            let mut buf = match cvar.wait_timeout(lock.lock().unwrap(), remaining) {
                Ok((guard, timeout_result)) => {
                    if timeout_result.timed_out() && guard.is_empty() && read_total == 0 {
                        unsafe { *actual = 0 };
                        return dc_status_t::DC_STATUS_TIMEOUT;
                    }
                    guard
                }
                Err(_) => {
                    unsafe { *actual = 0 };
                    return dc_status_t::DC_STATUS_IO;
                }
            };

            let available = buf.len().min(size - read_total);
            for b in buf.drain(..available) {
                out[read_total] = b;
                read_total += 1;
            }

            if read_total >= size {
                break;
            }
        }

        unsafe { *actual = read_total };
        dc_status_t::DC_STATUS_SUCCESS
    }

    fn write(&mut self, data: *const c_void, size: usize, actual: *mut usize) -> dc_status_t {
        let tx = match &self.tx_char {
            Some(c) => c.clone(),
            None => {
                unsafe { *actual = 0 };
                return dc_status_t::DC_STATUS_UNSUPPORTED;
            }
        };
        let buf = unsafe { std::slice::from_raw_parts(data as *const u8, size) };

        let write_type = if tx.properties.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE) {
            WriteType::WithoutResponse
        } else {
            WriteType::WithResponse
        };

        match self.runtime.block_on(self.peripheral.write(&tx, buf, write_type)) {
            Ok(()) => {
                unsafe { *actual = size };
                dc_status_t::DC_STATUS_SUCCESS
            }
            Err(e) => {
                log::error!("BLE write failed: {}", e);
                unsafe { *actual = 0 };
                dc_status_t::DC_STATUS_IO
            }
        }
    }

    fn ioctl(&mut self, request: c_uint, data: *mut c_void, size: usize) -> dc_status_t {
        match request {
            DC_IOCTL_BLE_GET_NAME => {
                let name_bytes = self.device_name.as_bytes();
                let copy_len = name_bytes.len().min(size.saturating_sub(1));
                if copy_len == 0 || size == 0 {
                    return dc_status_t::DC_STATUS_INVALIDARGS;
                }
                let out = unsafe { std::slice::from_raw_parts_mut(data as *mut u8, size) };
                out[..copy_len].copy_from_slice(&name_bytes[..copy_len]);
                out[copy_len] = 0;
                dc_status_t::DC_STATUS_SUCCESS
            }
            DC_IOCTL_BLE_CHARACTERISTIC_READ => {
                if size < BLE_UUID_LEN {
                    return dc_status_t::DC_STATUS_INVALIDARGS;
                }
                let uuid_bytes: &[u8; BLE_UUID_LEN] = unsafe {
                    &*(data as *const [u8; BLE_UUID_LEN])
                };
                let ch = match self.find_char_by_uuid(uuid_bytes).cloned() {
                    Some(c) => c,
                    None => return dc_status_t::DC_STATUS_UNSUPPORTED,
                };
                match self.runtime.block_on(self.peripheral.read(&ch)) {
                    Ok(value) => {
                        let out_offset = BLE_UUID_LEN;
                        let out_avail = size.saturating_sub(out_offset);
                        let copy_len = value.len().min(out_avail);
                        let out = unsafe { std::slice::from_raw_parts_mut(data as *mut u8, size) };
                        out[out_offset..out_offset + copy_len].copy_from_slice(&value[..copy_len]);
                        dc_status_t::DC_STATUS_SUCCESS
                    }
                    Err(e) => {
                        log::error!("BLE characteristic read failed: {}", e);
                        dc_status_t::DC_STATUS_IO
                    }
                }
            }
            DC_IOCTL_BLE_CHARACTERISTIC_WRITE => {
                if size < BLE_UUID_LEN {
                    return dc_status_t::DC_STATUS_INVALIDARGS;
                }
                let uuid_bytes: &[u8; BLE_UUID_LEN] = unsafe {
                    &*(data as *const [u8; BLE_UUID_LEN])
                };
                let ch = match self.find_char_by_uuid(uuid_bytes).cloned() {
                    Some(c) => c,
                    None => return dc_status_t::DC_STATUS_UNSUPPORTED,
                };
                let payload = unsafe {
                    std::slice::from_raw_parts((data as *const u8).add(BLE_UUID_LEN), size - BLE_UUID_LEN)
                };
                let write_type = if ch.properties.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE) {
                    WriteType::WithoutResponse
                } else {
                    WriteType::WithResponse
                };
                match self.runtime.block_on(self.peripheral.write(&ch, payload, write_type)) {
                    Ok(()) => dc_status_t::DC_STATUS_SUCCESS,
                    Err(e) => {
                        log::error!("BLE characteristic write failed: {}", e);
                        dc_status_t::DC_STATUS_IO
                    }
                }
            }
            _ => dc_status_t::DC_STATUS_UNSUPPORTED,
        }
    }

    fn close(&mut self) -> dc_status_t {
        let _ = self.runtime.block_on(self.peripheral.disconnect());
        dc_status_t::DC_STATUS_SUCCESS
    }
}

// ============================================================================
// BLE scanning helpers
// ============================================================================

/// Scan for BLE devices for the given duration.
pub async fn scan_ble_devices(duration_secs: u64) -> Result<Vec<BleDeviceInfo>, String> {
    let manager = Manager::new().await
        .map_err(|e| format!("BLE manager init failed: {}", e))?;
    let adapters = manager.adapters().await
        .map_err(|e| format!("Failed to get BLE adapters: {}", e))?;
    let adapter = adapters.into_iter().next()
        .ok_or_else(|| "No BLE adapter found".to_string())?;

    adapter.start_scan(ScanFilter::default()).await
        .map_err(|e| format!("BLE scan failed: {}", e))?;

    tokio::time::sleep(Duration::from_secs(duration_secs)).await;

    adapter.stop_scan().await.ok();

    let peripherals = adapter.peripherals().await
        .map_err(|e| format!("Failed to list BLE peripherals: {}", e))?;

    let mut devices = Vec::new();
    for p in peripherals {
        if let Ok(Some(props)) = p.properties().await {
            let name = props.local_name.unwrap_or_default();
            if name.is_empty() { continue; }
            devices.push(BleDeviceInfo {
                id: p.id().to_string(),
                name,
                address: props.address.to_string(),
            });
        }
    }

    devices.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(devices)
}

/// Connect to a BLE device by its peripheral ID string (from a previous scan).
pub async fn connect_ble_device(device_id: &str) -> Result<(Peripheral, String), String> {
    let manager = Manager::new().await
        .map_err(|e| format!("BLE manager init failed: {}", e))?;
    let adapters = manager.adapters().await
        .map_err(|e| format!("Failed to get BLE adapters: {}", e))?;
    let adapter = adapters.into_iter().next()
        .ok_or_else(|| "No BLE adapter found".to_string())?;

    let peripherals = adapter.peripherals().await
        .map_err(|e| format!("Failed to list BLE peripherals: {}", e))?;

    for p in peripherals {
        if p.id().to_string() == device_id {
            let name = p.properties().await
                .ok()
                .flatten()
                .and_then(|props| props.local_name)
                .unwrap_or_else(|| "Unknown".to_string());
            return Ok((p, name));
        }
    }

    Err(format!("BLE device '{}' not found. Try scanning again.", device_id))
}
