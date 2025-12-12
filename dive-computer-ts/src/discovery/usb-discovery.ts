// SPDX-License-Identifier: GPL-2.0
/**
 * USB Device Discovery
 * Scans for and identifies USB dive computers
 */

import { TransportType } from '../types/enums.js';
import type { USBDeviceDescriptor, DCDescriptor } from '../types/interfaces.js';
import { findDescriptor, diveComputerDescriptors } from '../descriptors/descriptors.js';
import { isKnownSerialAdapter } from '../transport/serial.js';
import { findDiveComputerByHID } from '../transport/usb-hid.js';

/**
 * USB discovery event types
 */
export type USBDiscoveryEventType = 
  | 'deviceConnected'
  | 'deviceDisconnected'
  | 'error';

/**
 * USB discovery event handler
 */
export type USBDiscoveryEventHandler<T = unknown> = (data: T) => void;

/**
 * Discovered USB device
 */
export interface DiscoveredUSBDevice {
  /** USB device descriptor */
  usbDescriptor: USBDeviceDescriptor;
  /** Is this a serial adapter */
  isSerialAdapter: boolean;
  /** Is this a HID device */
  isHID: boolean;
  /** Matched vendor name */
  vendor?: string;
  /** Matched product name */
  product?: string;
  /** Matched dive computer descriptor */
  descriptor?: DCDescriptor;
  /** Device path (for serial) */
  devicePath?: string;
}

/**
 * Known USB dive computer vendor/product IDs
 * These are direct USB connections (not serial adapters)
 */
const USB_DIRECT_DEVICES = [
  // Uemis
  { vendorId: 0x1234, productId: 0x5678, vendor: 'Uemis', product: 'Zurich' },
  // Add more as needed
];

/**
 * USB Device Discovery class
 */
export class USBDiscovery {
  private devices: Map<string, DiscoveredUSBDevice> = new Map();
  private eventHandlers: Map<USBDiscoveryEventType, Set<USBDiscoveryEventHandler>> = new Map();

  /**
   * Scan for USB devices
   */
  async scan(): Promise<DiscoveredUSBDevice[]> {
    const discovered: DiscoveredUSBDevice[] = [];

    try {
      // In Node.js using 'usb' package:
      // const usb = require('usb');
      // const devices = usb.getDeviceList();
      // 
      // for (const device of devices) {
      //   const desc = device.deviceDescriptor;
      //   const result = this.identifyDevice({
      //     vendorId: desc.idVendor,
      //     productId: desc.idProduct,
      //   });
      //   if (result) {
      //     discovered.push(result);
      //   }
      // }

      // In browser using WebUSB:
      // const devices = await navigator.usb.getDevices();
      // for (const device of devices) {
      //   const result = this.identifyDevice({
      //     vendorId: device.vendorId,
      //     productId: device.productId,
      //     manufacturer: device.manufacturerName,
      //     product: device.productName,
      //     serialNumber: device.serialNumber,
      //   });
      //   if (result) {
      //     discovered.push(result);
      //   }
      // }

      console.log('USB scanning...');
    } catch (error) {
      this.emit('error', error);
    }

    return discovered;
  }

  /**
   * Request access to a USB device (WebUSB)
   */
  async requestDevice(_vendorId?: number, _productId?: number): Promise<DiscoveredUSBDevice | null> {
    try {
      // In browser:
      // const filters = [];
      // if (_vendorId !== undefined) {
      //   filters.push({ vendorId: _vendorId, productId: _productId });
      // } else {
      //   // Add filters for known dive computers
      //   for (const device of USB_HID_DEVICES) {
      //     filters.push({ vendorId: device.vendorId, productId: device.productId });
      //   }
      // }
      // 
      // const device = await navigator.usb.requestDevice({ filters });
      // return this.identifyDevice({
      //   vendorId: device.vendorId,
      //   productId: device.productId,
      //   manufacturer: device.manufacturerName,
      //   product: device.productName,
      //   serialNumber: device.serialNumber,
      // });
      
      return null;
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Identify a USB device
   */
  identifyDevice(usbDescriptor: USBDeviceDescriptor): DiscoveredUSBDevice | null {
    const { vendorId, productId } = usbDescriptor;
    
    // Check if it's a known serial adapter
    const isSerialAdapter = isKnownSerialAdapter(vendorId, productId);
    
    // Check if it's a known HID dive computer
    const hidMatch = findDiveComputerByHID(vendorId, productId);
    
    // Check if it's a direct USB dive computer
    const directMatch = USB_DIRECT_DEVICES.find(
      d => d.vendorId === vendorId && d.productId === productId
    );

    if (isSerialAdapter) {
      return {
        usbDescriptor,
        isSerialAdapter: true,
        isHID: false,
        // Serial adapters could be any serial dive computer
      };
    }

    if (hidMatch) {
      const descriptor = findDescriptor(hidMatch.vendor, hidMatch.product);
      return {
        usbDescriptor,
        isSerialAdapter: false,
        isHID: true,
        vendor: hidMatch.vendor,
        product: hidMatch.product,
        descriptor,
      };
    }

    if (directMatch) {
      const descriptor = findDescriptor(directMatch.vendor, directMatch.product);
      return {
        usbDescriptor,
        isSerialAdapter: false,
        isHID: false,
        vendor: directMatch.vendor,
        product: directMatch.product,
        descriptor,
      };
    }

    return null;
  }

  /**
   * Get all discovered devices
   */
  getDevices(): DiscoveredUSBDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get discovered dive computers (not just serial adapters)
   */
  getDiveComputers(): DiscoveredUSBDevice[] {
    return Array.from(this.devices.values()).filter(d => d.vendor !== undefined);
  }

  /**
   * Clear discovered devices
   */
  clearDevices(): void {
    this.devices.clear();
  }

  /**
   * Add event listener
   */
  on<T>(event: USBDiscoveryEventType, handler: USBDiscoveryEventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as USBDiscoveryEventHandler);
  }

  /**
   * Remove event listener
   */
  off(event: USBDiscoveryEventType, handler: USBDiscoveryEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event
   */
  private emit<T>(event: USBDiscoveryEventType, data: T): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  /**
   * Start watching for USB connect/disconnect events
   */
  startWatching(): void {
    // In browser using WebUSB:
    // navigator.usb.addEventListener('connect', (event) => {
    //   const device = this.identifyDevice({
    //     vendorId: event.device.vendorId,
    //     productId: event.device.productId,
    //   });
    //   if (device) {
    //     this.devices.set(`${event.device.vendorId}:${event.device.productId}`, device);
    //     this.emit('deviceConnected', device);
    //   }
    // });
    // 
    // navigator.usb.addEventListener('disconnect', (event) => {
    //   const key = `${event.device.vendorId}:${event.device.productId}`;
    //   const device = this.devices.get(key);
    //   if (device) {
    //     this.devices.delete(key);
    //     this.emit('deviceDisconnected', device);
    //   }
    // });

    console.log('USB watching started');
  }

  /**
   * Stop watching for USB events
   */
  stopWatching(): void {
    console.log('USB watching stopped');
  }

  /**
   * Get all known USB-capable dive computers
   */
  static getUSBCapableDevices(): DCDescriptor[] {
    return diveComputerDescriptors.filter(d =>
      (d.transports & TransportType.USB) ||
      (d.transports & TransportType.USBHID)
    );
  }

  /**
   * Get all known USB HID dive computers
   */
  static getUSBHIDDevices(): DCDescriptor[] {
    return diveComputerDescriptors.filter(d =>
      d.transports & TransportType.USBHID
    );
  }

  /**
   * Get all known serial dive computers
   */
  static getSerialDevices(): DCDescriptor[] {
    return diveComputerDescriptors.filter(d =>
      d.transports & TransportType.SERIAL
    );
  }
}

/**
 * Find serial port for a USB-serial device
 * Platform-specific implementation needed
 */
export async function findSerialPort(_vendorId: number, _productId: number): Promise<string | null> {
  // On Windows, look in registry
  // On macOS, look in /dev/cu.* or /dev/tty.*
  // On Linux, look in /dev/ttyUSB* or /dev/ttyACM*
  
  // In Node.js:
  // const SerialPort = require('serialport');
  // const ports = await SerialPort.list();
  // return ports.find(p => 
  //   parseInt(p.vendorId, 16) === vendorId &&
  //   parseInt(p.productId, 16) === productId
  // )?.path ?? null;
  
  return null;
}

/**
 * Get all available serial ports
 */
export async function listSerialPorts(): Promise<{ path: string; vendorId?: number; productId?: number }[]> {
  // In Node.js:
  // const SerialPort = require('serialport');
  // return SerialPort.list();
  
  return [];
}
