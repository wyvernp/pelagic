// SPDX-License-Identifier: GPL-2.0
/**
 * Remembered Devices Manager
 * Handles remembering dive computers that have been used before
 */

import type { DCDescriptor } from '../types/interfaces.js';
import { TransportType } from '../types/enums.js';

/**
 * Remembered device entry
 */
export interface RememberedDevice {
  /** Device vendor name */
  vendor: string;
  /** Device product name */
  product: string;
  /** Device model number */
  model: number;
  /** Device serial number (may be 0 if unknown) */
  serial: number;
  /** Device firmware version */
  firmware?: string;
  /** Device nickname */
  nickname?: string;
  /** Bluetooth address (if applicable) */
  bluetoothAddress?: string;
  /** Bluetooth device name (if applicable) */
  bluetoothName?: string;
  /** USB vendor ID (if applicable) */
  usbVendorId?: number;
  /** USB product ID (if applicable) */
  usbProductId?: number;
  /** Serial port path (if applicable) */
  serialPort?: string;
  /** Transport type used */
  transportType: TransportType;
  /** Last used timestamp */
  lastUsed: Date;
  /** Number of times used */
  useCount: number;
}

/**
 * Device storage interface
 */
export interface DeviceStorage {
  load(): Promise<RememberedDevice[]>;
  save(devices: RememberedDevice[]): Promise<void>;
}

/**
 * In-memory device storage
 */
export class MemoryDeviceStorage implements DeviceStorage {
  private devices: RememberedDevice[] = [];

  async load(): Promise<RememberedDevice[]> {
    return [...this.devices];
  }

  async save(devices: RememberedDevice[]): Promise<void> {
    this.devices = [...devices];
  }
}

/**
 * LocalStorage-based device storage for browsers
 */
export class LocalStorageDeviceStorage implements DeviceStorage {
  private readonly storageKey = 'dive-computer-devices';

  async load(): Promise<RememberedDevice[]> {
    try {
      if (typeof localStorage === 'undefined') {
        return [];
      }
      const data = localStorage.getItem(this.storageKey);
      if (!data) {
        return [];
      }
      const parsed = JSON.parse(data) as RememberedDevice[];
      return parsed.map(d => ({
        ...d,
        lastUsed: new Date(d.lastUsed),
      }));
    } catch {
      return [];
    }
  }

  async save(devices: RememberedDevice[]): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, JSON.stringify(devices));
    }
  }
}

/**
 * Remembered Devices Manager
 * Tracks dive computers that have been used before
 */
export class RememberedDevicesManager {
  private storage: DeviceStorage;
  private devices: RememberedDevice[] = [];
  private loaded: boolean = false;

  constructor(storage?: DeviceStorage) {
    this.storage = storage ?? new MemoryDeviceStorage();
  }

  /**
   * Load devices from storage
   */
  async load(): Promise<void> {
    this.devices = await this.storage.load();
    this.loaded = true;
  }

  /**
   * Save devices to storage
   */
  async save(): Promise<void> {
    await this.storage.save(this.devices);
  }

  /**
   * Ensure devices are loaded
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
  }

  /**
   * Add or update a remembered device
   */
  async remember(
    descriptor: DCDescriptor,
    info: {
      serial?: number;
      firmware?: string;
      nickname?: string;
      bluetoothAddress?: string;
      bluetoothName?: string;
      usbVendorId?: number;
      usbProductId?: number;
      serialPort?: string;
      transportType: TransportType;
    }
  ): Promise<void> {
    await this.ensureLoaded();

    // Find existing device
    const existingIndex = this.devices.findIndex(d =>
      d.vendor === descriptor.vendor &&
      d.product === descriptor.product &&
      (info.serial === undefined || d.serial === info.serial || d.serial === 0)
    );

    if (existingIndex >= 0) {
      // Update existing device
      const existing = this.devices[existingIndex];
      this.devices[existingIndex] = {
        ...existing,
        ...info,
        serial: info.serial ?? existing.serial,
        lastUsed: new Date(),
        useCount: existing.useCount + 1,
      };
    } else {
      // Add new device
      this.devices.push({
        vendor: descriptor.vendor,
        product: descriptor.product,
        model: descriptor.model,
        serial: info.serial ?? 0,
        firmware: info.firmware,
        nickname: info.nickname,
        bluetoothAddress: info.bluetoothAddress,
        bluetoothName: info.bluetoothName,
        usbVendorId: info.usbVendorId,
        usbProductId: info.usbProductId,
        serialPort: info.serialPort,
        transportType: info.transportType,
        lastUsed: new Date(),
        useCount: 1,
      });
    }

    await this.save();
  }

  /**
   * Get all remembered devices
   */
  async getAll(): Promise<RememberedDevice[]> {
    await this.ensureLoaded();
    return [...this.devices];
  }

  /**
   * Get remembered devices sorted by most recently used
   */
  async getRecent(): Promise<RememberedDevice[]> {
    await this.ensureLoaded();
    return [...this.devices].sort((a, b) => 
      b.lastUsed.getTime() - a.lastUsed.getTime()
    );
  }

  /**
   * Get remembered devices sorted by most frequently used
   */
  async getFrequent(): Promise<RememberedDevice[]> {
    await this.ensureLoaded();
    return [...this.devices].sort((a, b) => b.useCount - a.useCount);
  }

  /**
   * Find device by vendor and product
   */
  async findByProduct(vendor: string, product: string): Promise<RememberedDevice[]> {
    await this.ensureLoaded();
    return this.devices.filter(d =>
      d.vendor === vendor && d.product === product
    );
  }

  /**
   * Find device by Bluetooth address
   */
  async findByBluetoothAddress(address: string): Promise<RememberedDevice | null> {
    await this.ensureLoaded();
    return this.devices.find(d =>
      d.bluetoothAddress?.toLowerCase() === address.toLowerCase()
    ) ?? null;
  }

  /**
   * Find device by USB IDs
   */
  async findByUSBIds(vendorId: number, productId: number): Promise<RememberedDevice | null> {
    await this.ensureLoaded();
    return this.devices.find(d =>
      d.usbVendorId === vendorId && d.usbProductId === productId
    ) ?? null;
  }

  /**
   * Remove a remembered device
   */
  async forget(vendor: string, product: string, serial?: number): Promise<void> {
    await this.ensureLoaded();
    this.devices = this.devices.filter(d =>
      !(d.vendor === vendor && d.product === product &&
        (serial === undefined || d.serial === serial))
    );
    await this.save();
  }

  /**
   * Clear all remembered devices
   */
  async clear(): Promise<void> {
    this.devices = [];
    await this.save();
  }

  /**
   * Get count of remembered devices
   */
  async count(): Promise<number> {
    await this.ensureLoaded();
    return this.devices.length;
  }

  /**
   * Set nickname for a device
   */
  async setNickname(vendor: string, product: string, serial: number, nickname: string): Promise<void> {
    await this.ensureLoaded();
    const device = this.devices.find(d =>
      d.vendor === vendor && d.product === product && d.serial === serial
    );
    if (device) {
      device.nickname = nickname;
      await this.save();
    }
  }
}
