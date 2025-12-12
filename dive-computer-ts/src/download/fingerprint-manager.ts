// SPDX-License-Identifier: GPL-2.0
/**
 * Fingerprint Manager
 * Handles dive computer fingerprints for incremental downloads
 */

import type { DCDescriptor } from '../types/interfaces.js';

/**
 * Fingerprint entry for a specific device
 */
export interface FingerprintEntry {
  /** Device vendor name */
  vendor: string;
  /** Device product name */
  product: string;
  /** Device model number */
  model: number;
  /** Device serial number */
  serial: number;
  /** Device firmware version */
  firmware?: string;
  /** Fingerprint data */
  fingerprint: Uint8Array;
  /** Timestamp when fingerprint was saved */
  timestamp: Date;
  /** Device time when dive was recorded */
  deviceTime?: number;
  /** Number of dives at time of fingerprint */
  diveCount?: number;
}

/**
 * Fingerprint storage interface
 */
export interface FingerprintStorage {
  /** Load fingerprint for a device */
  load(vendor: string, product: string, serial: number): Promise<FingerprintEntry | null>;
  /** Save fingerprint for a device */
  save(entry: FingerprintEntry): Promise<void>;
  /** Remove fingerprint for a device */
  remove(vendor: string, product: string, serial: number): Promise<void>;
  /** List all fingerprints */
  list(): Promise<FingerprintEntry[]>;
  /** Clear all fingerprints */
  clear(): Promise<void>;
}

/**
 * In-memory fingerprint storage
 */
export class MemoryFingerprintStorage implements FingerprintStorage {
  private fingerprints: Map<string, FingerprintEntry> = new Map();

  private makeKey(vendor: string, product: string, serial: number): string {
    return `${vendor}|${product}|${serial}`;
  }

  async load(vendor: string, product: string, serial: number): Promise<FingerprintEntry | null> {
    const key = this.makeKey(vendor, product, serial);
    return this.fingerprints.get(key) ?? null;
  }

  async save(entry: FingerprintEntry): Promise<void> {
    const key = this.makeKey(entry.vendor, entry.product, entry.serial);
    this.fingerprints.set(key, entry);
  }

  async remove(vendor: string, product: string, serial: number): Promise<void> {
    const key = this.makeKey(vendor, product, serial);
    this.fingerprints.delete(key);
  }

  async list(): Promise<FingerprintEntry[]> {
    return Array.from(this.fingerprints.values());
  }

  async clear(): Promise<void> {
    this.fingerprints.clear();
  }
}

/**
 * LocalStorage-based fingerprint storage for browsers
 */
export class LocalStorageFingerprintStorage implements FingerprintStorage {
  private readonly storageKey = 'dive-computer-fingerprints';

  private loadAll(): Map<string, FingerprintEntry> {
    try {
      if (typeof localStorage === 'undefined') {
        return new Map();
      }
      const data = localStorage.getItem(this.storageKey);
      if (!data) {
        return new Map();
      }
      const parsed = JSON.parse(data);
      const map = new Map<string, FingerprintEntry>();
      
      for (const [key, value] of Object.entries(parsed)) {
        const entry = value as FingerprintEntry & { fingerprint: number[] };
        map.set(key, {
          ...entry,
          fingerprint: new Uint8Array(entry.fingerprint),
          timestamp: new Date(entry.timestamp),
        });
      }
      
      return map;
    } catch {
      return new Map();
    }
  }

  private saveAll(fingerprints: Map<string, FingerprintEntry>): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    
    const obj: Record<string, unknown> = {};
    for (const [key, entry] of fingerprints) {
      obj[key] = {
        ...entry,
        fingerprint: Array.from(entry.fingerprint),
      };
    }
    
    localStorage.setItem(this.storageKey, JSON.stringify(obj));
  }

  private makeKey(vendor: string, product: string, serial: number): string {
    return `${vendor}|${product}|${serial}`;
  }

  async load(vendor: string, product: string, serial: number): Promise<FingerprintEntry | null> {
    const key = this.makeKey(vendor, product, serial);
    const fingerprints = this.loadAll();
    return fingerprints.get(key) ?? null;
  }

  async save(entry: FingerprintEntry): Promise<void> {
    const key = this.makeKey(entry.vendor, entry.product, entry.serial);
    const fingerprints = this.loadAll();
    fingerprints.set(key, entry);
    this.saveAll(fingerprints);
  }

  async remove(vendor: string, product: string, serial: number): Promise<void> {
    const key = this.makeKey(vendor, product, serial);
    const fingerprints = this.loadAll();
    fingerprints.delete(key);
    this.saveAll(fingerprints);
  }

  async list(): Promise<FingerprintEntry[]> {
    return Array.from(this.loadAll().values());
  }

  async clear(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.storageKey);
    }
  }
}

/**
 * Fingerprint Manager
 * Handles loading and saving fingerprints for incremental downloads
 */
export class FingerprintManager {
  private storage: FingerprintStorage;

  constructor(storage?: FingerprintStorage) {
    this.storage = storage ?? new MemoryFingerprintStorage();
  }

  /**
   * Get fingerprint for a device
   */
  async getFingerprint(descriptor: DCDescriptor, serial: number): Promise<Uint8Array | null> {
    const entry = await this.storage.load(descriptor.vendor, descriptor.product, serial);
    return entry?.fingerprint ?? null;
  }

  /**
   * Save fingerprint for a device
   */
  async saveFingerprint(
    descriptor: DCDescriptor,
    serial: number,
    fingerprint: Uint8Array,
    options?: {
      firmware?: string;
      deviceTime?: number;
      diveCount?: number;
    }
  ): Promise<void> {
    const entry: FingerprintEntry = {
      vendor: descriptor.vendor,
      product: descriptor.product,
      model: descriptor.model,
      serial,
      fingerprint,
      timestamp: new Date(),
      ...options,
    };
    
    await this.storage.save(entry);
  }

  /**
   * Remove fingerprint for a device
   */
  async removeFingerprint(descriptor: DCDescriptor, serial: number): Promise<void> {
    await this.storage.remove(descriptor.vendor, descriptor.product, serial);
  }

  /**
   * Get all fingerprints
   */
  async getAllFingerprints(): Promise<FingerprintEntry[]> {
    return this.storage.list();
  }

  /**
   * Clear all fingerprints
   */
  async clearAllFingerprints(): Promise<void> {
    await this.storage.clear();
  }

  /**
   * Check if a fingerprint exists for a device
   */
  async hasFingerprint(descriptor: DCDescriptor, serial: number): Promise<boolean> {
    const entry = await this.storage.load(descriptor.vendor, descriptor.product, serial);
    return entry !== null;
  }

  /**
   * Compare two fingerprints
   */
  static compareFingerprints(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
}
