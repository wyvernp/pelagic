// SPDX-License-Identifier: GPL-2.0
/**
 * Dive Computer TypeScript Library
 * 
 * A TypeScript implementation for communicating with dive computers
 * Based on the libdivecomputer library
 * 
 * @example
 * ```typescript
 * import { 
 *   DownloadManager,
 *   BluetoothDiscovery,
 *   findDescriptor,
 *   BLETransport,
 *   TransportType
 * } from 'dive-computer-ts';
 * 
 * // Find a dive computer descriptor
 * const descriptor = findDescriptor('Shearwater', 'Perdix');
 * 
 * // Discover Bluetooth devices
 * const discovery = new BluetoothDiscovery();
 * discovery.on('deviceFound', (device) => {
 *   console.log('Found:', device.name);
 * });
 * await discovery.startBLEScan();
 * 
 * // Download dives
 * const manager = new DownloadManager();
 * manager.on('progress', (p) => console.log(`${p.current}/${p.maximum}`));
 * manager.on('dive', (dive) => console.log('Downloaded dive:', dive.id));
 * 
 * const transport = new BLETransport(device.address);
 * const result = await manager.download({
 *   descriptor,
 *   transport,
 *   forceDownload: false,
 * });
 * 
 * console.log(`Downloaded ${result.dives.length} dives`);
 * ```
 */

// Types
export * from './types/index.js';

// Descriptors
export * from './descriptors/index.js';

// Transport
export * from './transport/index.js';

// Download
export * from './download/index.js';

// Discovery
export * from './discovery/index.js';

// Re-export commonly used items at top level for convenience
export { TransportType, DCStatus, DiveMode } from './types/enums.js';
export { 
  findDescriptor, 
  getVendors, 
  getProducts, 
  supportsBluetooth, 
  isBLEOnly,
  supportsUSB
} from './descriptors/descriptors.js';
export { DownloadManager, DownloadState } from './download/download-manager.js';
export { BluetoothDiscovery } from './discovery/bluetooth-discovery.js';
export { matchBLEDeviceName } from './transport/ble.js';
export { USBDiscovery } from './discovery/usb-discovery.js';

/**
 * Library version
 */
export const VERSION = '0.1.0';

/**
 * Check if running in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/**
 * Check if running in Node.js environment
 */
export function isNode(): boolean {
  return typeof process !== 'undefined' && 
         process.versions != null && 
         process.versions.node != null;
}

/**
 * Check if Web Bluetooth is available
 */
export function hasWebBluetooth(): boolean {
  return isBrowser() && 'bluetooth' in navigator;
}

/**
 * Check if WebUSB is available
 */
export function hasWebUSB(): boolean {
  return isBrowser() && 'usb' in navigator;
}

/**
 * Check if Web Serial is available
 */
export function hasWebSerial(): boolean {
  return isBrowser() && 'serial' in navigator;
}
