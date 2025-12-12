// SPDX-License-Identifier: GPL-2.0
/**
 * Bluetooth Discovery
 * Scans for and identifies Bluetooth dive computers
 * Based on btdiscovery.cpp patterns
 */

import { TransportType } from '../types/enums.js';
import type { BluetoothDeviceInfo, DCDescriptor } from '../types/interfaces.js';
import { 
  matchBLEDeviceName, 
  BLE_SERIAL_SERVICES, 
  isKnownSerialService, 
  shouldIgnoreService 
} from '../transport/ble.js';
import { findDescriptor, diveComputerDescriptors, getProducts } from '../descriptors/descriptors.js';

/**
 * Discovery event types
 */
export type DiscoveryEventType = 
  | 'deviceFound'
  | 'scanStarted'
  | 'scanStopped'
  | 'error';

/**
 * Discovery event handler
 */
export type DiscoveryEventHandler<T = unknown> = (data: T) => void;

/**
 * Discovered dive computer device
 */
export interface DiscoveredDevice {
  /** Bluetooth address or UUID */
  address: string;
  /** Device name from Bluetooth */
  name?: string;
  /** Is this a BLE device */
  isBLE: boolean;
  /** Signal strength */
  rssi?: number;
  /** Matched vendor name */
  vendor?: string;
  /** Matched product name */
  product?: string;
  /** Matched descriptor */
  descriptor?: DCDescriptor;
  /** Detected serial services */
  services?: string[];
}

/**
 * Bluetooth name patterns for classic Bluetooth dive computers
 */
const BT_CLASSIC_PATTERNS: { pattern: RegExp; vendor: string; products?: string[] }[] = [
  // Heinrichs Weikamp
  { pattern: /^OSTC/, vendor: 'Heinrichs Weikamp' },
  { pattern: /^HW OSTC/, vendor: 'Heinrichs Weikamp' },
  // Shearwater (some older models use classic BT)
  { pattern: /^Petrel/, vendor: 'Shearwater' },
  { pattern: /^Predator/, vendor: 'Shearwater' },
  // Oceanic/Aeris/Hollis/Aqualung etc
  { pattern: /^OC\./, vendor: 'Oceanic' },
  { pattern: /^Atom/, vendor: 'Oceanic' },
];

/**
 * Bluetooth Discovery class
 * Handles scanning for and identifying Bluetooth dive computers
 */
export class BluetoothDiscovery {
  private scanning: boolean = false;
  private devices: Map<string, DiscoveredDevice> = new Map();
  private eventHandlers: Map<DiscoveryEventType, Set<DiscoveryEventHandler>> = new Map();
  private scanTimeout: number = 30000; // 30 seconds default

  /**
   * Start scanning for BLE devices
   */
  async startBLEScan(): Promise<void> {
    if (this.scanning) {
      return;
    }

    this.scanning = true;
    this.emit('scanStarted', { type: 'ble' });

    try {
      // Web Bluetooth API
      if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
        // Request device with known dive computer services
        const serviceFilters = Object.values(BLE_SERIAL_SERVICES)
          .filter(uuid => !shouldIgnoreService(uuid));
        
        // Note: Web Bluetooth requires user gesture for requestDevice
        // This is a simplified example - real implementation would use
        // the device event from requestDevice
        console.log('BLE scanning with services:', serviceFilters);
        
        // In a real implementation:
        // const device = await navigator.bluetooth.requestDevice({
        //   filters: [{ services: serviceFilters }],
        //   optionalServices: serviceFilters,
        // });
        // this.handleBLEDevice(device);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Stop scanning
   */
  stopScan(): void {
    this.scanning = false;
    this.emit('scanStopped', {});
  }

  /**
   * Check if currently scanning
   */
  isScanning(): boolean {
    return this.scanning;
  }

  /**
   * Get all discovered devices
   */
  getDevices(): DiscoveredDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get discovered devices that are identified as dive computers
   */
  getDiveComputers(): DiscoveredDevice[] {
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
  on<T>(event: DiscoveryEventType, handler: DiscoveryEventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as DiscoveryEventHandler);
  }

  /**
   * Remove event listener
   */
  off(event: DiscoveryEventType, handler: DiscoveryEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event
   */
  private emit<T>(event: DiscoveryEventType, data: T): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  /**
   * Handle a discovered BLE device
   */
  handleBLEDevice(info: BluetoothDeviceInfo): void {
    const existing = this.devices.get(info.address);
    
    // Try to identify the device
    let vendor: string | undefined;
    let product: string | undefined;
    let descriptor: DCDescriptor | undefined;
    
    // Try name matching first
    if (info.name) {
      const match = matchBLEDeviceName(info.name);
      if (match) {
        vendor = match.vendor;
        product = match.product;
        descriptor = findDescriptor(vendor, product);
      }
    }
    
    // Try service UUID matching if name didn't work
    if (!vendor && info.serviceUUIDs) {
      for (const uuid of info.serviceUUIDs) {
        const serviceName = isKnownSerialService(uuid);
        if (serviceName && !shouldIgnoreService(uuid)) {
          // Service tells us it's likely a dive computer but not which one
          // Some services are vendor-specific
          if (serviceName === 'SHEARWATER') {
            vendor = 'Shearwater';
          } else if (serviceName === 'SUUNTO') {
            vendor = 'Suunto';
          } else if (serviceName === 'SCUBAPRO') {
            vendor = 'Scubapro';
          } else if (serviceName === 'MARES') {
            vendor = 'Mares';
          } else if (serviceName.startsWith('HW_')) {
            vendor = 'Heinrichs Weikamp';
          }
          break;
        }
      }
    }

    const device: DiscoveredDevice = {
      address: info.address,
      name: info.name ?? existing?.name,
      isBLE: true,
      rssi: info.rssi ?? existing?.rssi,
      vendor,
      product,
      descriptor,
      services: info.serviceUUIDs,
    };

    this.devices.set(info.address, device);
    this.emit('deviceFound', device);
  }

  /**
   * Handle a discovered classic Bluetooth device
   */
  handleBluetoothDevice(address: string, name?: string): void {
    const existing = this.devices.get(address);
    
    let vendor: string | undefined;
    let product: string | undefined;
    let descriptor: DCDescriptor | undefined;
    
    // Try name matching
    if (name) {
      for (const pattern of BT_CLASSIC_PATTERNS) {
        if (pattern.pattern.test(name)) {
          vendor = pattern.vendor;
          // Try to find specific product from available products
          if (vendor) {
            const products = getProducts(vendor).filter(p => {
              const desc = findDescriptor(vendor!, p);
              return desc && (desc.transports & TransportType.BLUETOOTH);
            });
            if (products.length === 1) {
              product = products[0];
              descriptor = findDescriptor(vendor, product);
            }
          }
          break;
        }
      }
    }

    const device: DiscoveredDevice = {
      address,
      name: name ?? existing?.name,
      isBLE: false,
      vendor,
      product,
      descriptor,
    };

    this.devices.set(address, device);
    this.emit('deviceFound', device);
  }

  /**
   * Match a device name to find vendor/product
   * Uses both BLE and classic patterns
   */
  matchDeviceName(name: string): { vendor: string; product: string; descriptor?: DCDescriptor } | null {
    // Try BLE patterns first
    const bleMatch = matchBLEDeviceName(name);
    if (bleMatch) {
      const descriptor = findDescriptor(bleMatch.vendor, bleMatch.product);
      return { ...bleMatch, descriptor };
    }

    // Try classic Bluetooth patterns
    for (const pattern of BT_CLASSIC_PATTERNS) {
      if (pattern.pattern.test(name)) {
        const vendor = pattern.vendor;
        // Find first matching product with BT support
        const products = getProducts(vendor).filter(p => {
          const desc = findDescriptor(vendor, p);
          return desc && (desc.transports & TransportType.BLUETOOTH);
        });
        if (products.length > 0) {
          const product = products[0];
          return { vendor, product, descriptor: findDescriptor(vendor, product) };
        }
        return { vendor, product: '' };
      }
    }

    return null;
  }

  /**
   * Get all known BLE-capable dive computers
   */
  static getBLECapableDevices(): DCDescriptor[] {
    return diveComputerDescriptors.filter(d => 
      d.transports & TransportType.BLE
    );
  }

  /**
   * Get all known Bluetooth classic-capable dive computers
   */
  static getBluetoothCapableDevices(): DCDescriptor[] {
    return diveComputerDescriptors.filter(d => 
      d.transports & TransportType.BLUETOOTH
    );
  }

  /**
   * Set scan timeout
   */
  setScanTimeout(ms: number): void {
    this.scanTimeout = ms;
  }

  /**
   * Get scan timeout
   */
  getScanTimeout(): number {
    return this.scanTimeout;
  }
}

/**
 * Check if a Bluetooth address is in BLE format
 * BLE addresses are often prefixed with "LE:" or are UUIDs on iOS/macOS
 */
export function isBLEAddress(address: string): boolean {
  // Check for LE: prefix
  if (address.startsWith('LE:')) {
    return true;
  }
  
  // Check for UUID format (iOS/macOS)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(address)) {
    return true;
  }
  
  return false;
}

/**
 * Format a Bluetooth address consistently
 */
export function formatBluetoothAddress(address: string): string {
  // Remove LE: prefix if present
  let clean = address.startsWith('LE:') ? address.substring(3) : address;
  
  // Convert to uppercase
  clean = clean.toUpperCase();
  
  return clean;
}

/**
 * Parse address and name from combined format "Name (Address)"
 */
export function parseBluetoothNameAddress(text: string): { name: string; address: string } | null {
  const match = text.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    return {
      name: match[1].trim(),
      address: match[2].trim(),
    };
  }
  
  // Check if it's just an address
  if (/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(text.trim())) {
    return { name: '', address: text.trim() };
  }
  
  return null;
}
