// SPDX-License-Identifier: GPL-2.0
/**
 * Download Manager
 * Handles downloading dive data from dive computers
 */

import { DCStatus, DiveMode } from '../types/enums.js';
import type { 
  Dive, 
  DiveSample, 
  DiveEvent, 
  DiveComputer, 
  DeviceInfo,
  GasMix,
  Cylinder,
  Depth,
  Duration,
  Temperature,
  Pressure,
  DownloadOptions,
  ProgressEvent,
  DCDescriptor
} from '../types/interfaces.js';
import type { Transport } from '../transport/transport.js';

/**
 * Download state
 */
export enum DownloadState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  DOWNLOADING = 'downloading',
  PARSING = 'parsing',
  COMPLETE = 'complete',
  ERROR = 'error',
  CANCELLED = 'cancelled',
}

/**
 * Download event types
 */
export type DownloadEventType = 
  | 'progress'
  | 'dive'
  | 'error'
  | 'state'
  | 'deviceInfo'
  | 'complete';

/**
 * Download event handler
 */
export type DownloadEventHandler<T = unknown> = (data: T) => void;

/**
 * Fingerprint for dive identification
 */
export interface Fingerprint {
  data: Uint8Array;
  serial: number;
  deviceTime: number;
}

/**
 * Download result
 */
export interface DownloadResult {
  success: boolean;
  dives: Dive[];
  deviceInfo?: DeviceInfo;
  fingerprint?: Fingerprint;
  error?: Error;
  status: DCStatus;
}

/**
 * Dive computer device instance
 */
export interface DeviceInstance {
  descriptor: DCDescriptor;
  transport: Transport;
  serial?: number;
  firmware?: string;
  fingerprint?: Uint8Array;
}

/**
 * Download Manager class
 * Manages the download of dives from a dive computer
 */
export class DownloadManager {
  private device: DeviceInstance | null = null;
  private state: DownloadState = DownloadState.IDLE;
  private cancelled: boolean = false;
  private dives: Dive[] = [];
  private eventHandlers: Map<DownloadEventType, Set<DownloadEventHandler>> = new Map();

  /**
   * Start downloading dives from a device
   */
  async download(options: DownloadOptions): Promise<DownloadResult> {
    this.cancelled = false;
    this.dives = [];
    this.setState(DownloadState.CONNECTING);

    try {
      // Open the transport connection
      const connectStatus = await options.transport!.open();
      if (connectStatus !== DCStatus.SUCCESS) {
        throw new Error(`Failed to connect: ${DCStatus[connectStatus]}`);
      }

      this.device = {
        descriptor: options.descriptor,
        transport: options.transport!,
        fingerprint: options.fingerprint,
      };

      this.setState(DownloadState.DOWNLOADING);

      // In a real implementation, this would call the appropriate
      // device-specific download handler based on the descriptor family
      const result = await this.performDownload(options);

      if (this.cancelled) {
        this.setState(DownloadState.CANCELLED);
        return {
          success: false,
          dives: this.dives,
          status: DCStatus.CANCELLED,
        };
      }

      this.setState(DownloadState.COMPLETE);
      this.emit('complete', { dives: this.dives });

      return result;
    } catch (error) {
      this.setState(DownloadState.ERROR);
      this.emit('error', error);
      return {
        success: false,
        dives: this.dives,
        error: error as Error,
        status: DCStatus.IO,
      };
    } finally {
      // Close the transport
      if (this.device?.transport) {
        await this.device.transport.close();
      }
    }
  }

  /**
   * Cancel the current download
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Get current download state
   */
  getState(): DownloadState {
    return this.state;
  }

  /**
   * Get downloaded dives
   */
  getDives(): Dive[] {
    return this.dives;
  }

  /**
   * Add event listener
   */
  on<T>(event: DownloadEventType, handler: DownloadEventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as DownloadEventHandler);
  }

  /**
   * Remove event listener
   */
  off(event: DownloadEventType, handler: DownloadEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event
   */
  private emit<T>(event: DownloadEventType, data?: T): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  /**
   * Set the download state
   */
  private setState(state: DownloadState): void {
    this.state = state;
    this.emit('state', state);
  }

  /**
   * Report download progress
   */
  private reportProgress(progress: ProgressEvent): void {
    this.emit('progress', progress);
  }

  /**
   * Add a downloaded dive
   */
  private addDive(dive: Dive): void {
    this.dives.push(dive);
    this.emit('dive', dive);
  }

  /**
   * Perform the actual download
   * This is a placeholder - real implementation would dispatch to device-specific handlers
   */
  private async performDownload(_options: DownloadOptions): Promise<DownloadResult> {
    // Simulate progress
    for (let i = 0; i <= 100; i += 10) {
      if (this.cancelled) break;
      
      this.reportProgress({
        current: i,
        maximum: 100,
        step: i < 50 ? 0 : 1,
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Create sample dive for demonstration
    const sampleDive = this.createSampleDive();
    this.addDive(sampleDive);

    return {
      success: true,
      dives: this.dives,
      status: DCStatus.SUCCESS,
    };
  }

  /**
   * Create a sample dive for demonstration
   */
  private createSampleDive(): Dive {
    const now = new Date();
    const diveStart = new Date(now.getTime() - 3600000); // 1 hour ago
    
    const samples: DiveSample[] = [];
    const duration = 45 * 60; // 45 minutes
    
    // Generate sample profile
    for (let t = 0; t <= duration; t += 10) {
      const time: Duration = { seconds: t };
      let depthValue: number;
      
      if (t < 5 * 60) {
        // Descent
        depthValue = (t / (5 * 60)) * 30;
      } else if (t < 35 * 60) {
        // Bottom time
        depthValue = 30 - Math.sin((t - 5 * 60) / 300) * 2;
      } else {
        // Ascent
        const ascentTime = t - 35 * 60;
        depthValue = 30 * (1 - ascentTime / (10 * 60));
      }
      
      const depth: Depth = { mm: Math.max(0, Math.round(depthValue * 1000)) };
      const temperature: Temperature = { mkelvin: 285150 }; // ~12°C
      const tankPressure = Math.round(200000 - (t / duration) * 50000);
      
      samples.push({
        time,
        depth,
        temperature,
        pressure: [{ tank: 0, pressure: { mbar: tankPressure } }],
      });
    }

    const events: DiveEvent[] = [
      {
        type: 0, // ascent rate
        time: { seconds: 35 * 60 },
        value: 0,
      },
    ];

    const gasMix: GasMix = {
      oxygen: { permille: 320 },
      helium: { permille: 0 },
      nitrogen: { permille: 680 },
    };

    const cylinder: Cylinder = {
      type: { description: 'AL80' },
      gasmix: gasMix,
      start: { mbar: 200000 },
      end: { mbar: 50000 },
      workingPressure: { mbar: 207000 },
      cylinderUse: 0,
    };

    const dc: DiveComputer = {
      model: 'Sample DC',
      serial: '123456',
      firmware: '1.0',
      samples,
      events,
    };

    return {
      id: 1,
      number: 1,
      when: diveStart,
      duration: { seconds: duration },
      maxDepth: { mm: 30000 },
      meanDepth: { mm: 25000 },
      surfaceTemperature: { mkelvin: 293150 },
      waterTemperature: { mkelvin: 285150 },
      cylinders: [cylinder],
      diveComputers: [dc],
      diveMode: DiveMode.OC,
    };
  }
}

/**
 * Device memory data parser
 */
export class DeviceDataParser {
  /**
   * Parse a 16-bit little-endian value
   */
  static readUint16LE(data: Uint8Array, offset: number): number {
    return data[offset] | (data[offset + 1] << 8);
  }

  /**
   * Parse a 16-bit big-endian value
   */
  static readUint16BE(data: Uint8Array, offset: number): number {
    return (data[offset] << 8) | data[offset + 1];
  }

  /**
   * Parse a 32-bit little-endian value
   */
  static readUint32LE(data: Uint8Array, offset: number): number {
    return (
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)
    ) >>> 0;
  }

  /**
   * Parse a 32-bit big-endian value
   */
  static readUint32BE(data: Uint8Array, offset: number): number {
    return (
      (data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]
    ) >>> 0;
  }

  /**
   * Parse a null-terminated string
   */
  static readString(data: Uint8Array, offset: number, maxLength: number): string {
    let end = offset;
    while (end < offset + maxLength && data[end] !== 0) {
      end++;
    }
    return new TextDecoder().decode(data.slice(offset, end));
  }

  /**
   * Parse a BCD (Binary Coded Decimal) value
   */
  static readBCD(value: number): number {
    return ((value >> 4) & 0x0f) * 10 + (value & 0x0f);
  }

  /**
   * Convert depth from various formats
   */
  static convertDepth(value: number, unit: 'feet' | 'meters' | 'centimeters' | 'millimeters'): Depth {
    let mm: number;
    switch (unit) {
      case 'feet':
        mm = Math.round(value * 304.8);
        break;
      case 'meters':
        mm = Math.round(value * 1000);
        break;
      case 'centimeters':
        mm = Math.round(value * 10);
        break;
      case 'millimeters':
        mm = Math.round(value);
        break;
    }
    return { mm };
  }

  /**
   * Convert temperature from various formats
   */
  static convertTemperature(value: number, unit: 'celsius' | 'fahrenheit' | 'kelvin' | 'decicelsius'): Temperature {
    let mkelvin: number;
    switch (unit) {
      case 'celsius':
        mkelvin = Math.round((value + 273.15) * 1000);
        break;
      case 'fahrenheit':
        mkelvin = Math.round(((value - 32) * 5 / 9 + 273.15) * 1000);
        break;
      case 'kelvin':
        mkelvin = Math.round(value * 1000);
        break;
      case 'decicelsius':
        mkelvin = Math.round((value / 10 + 273.15) * 1000);
        break;
    }
    return { mkelvin };
  }

  /**
   * Convert pressure from various formats
   */
  static convertPressure(value: number, unit: 'bar' | 'psi' | 'mbar'): Pressure {
    let mbar: number;
    switch (unit) {
      case 'bar':
        mbar = Math.round(value * 1000);
        break;
      case 'psi':
        mbar = Math.round(value * 68.948);
        break;
      case 'mbar':
        mbar = Math.round(value);
        break;
    }
    return { mbar };
  }

  /**
   * Parse a datetime from various formats
   */
  static parseDateTime(data: Uint8Array, offset: number, format: 'ymd' | 'dmy' | 'mdy'): Date {
    let year: number, month: number, day: number, hour: number, minute: number, second: number;
    
    switch (format) {
      case 'ymd':
        year = this.readUint16LE(data, offset);
        month = data[offset + 2];
        day = data[offset + 3];
        hour = data[offset + 4];
        minute = data[offset + 5];
        second = data[offset + 6];
        break;
      case 'dmy':
        day = data[offset];
        month = data[offset + 1];
        year = this.readUint16LE(data, offset + 2);
        hour = data[offset + 4];
        minute = data[offset + 5];
        second = data[offset + 6];
        break;
      case 'mdy':
        month = data[offset];
        day = data[offset + 1];
        year = this.readUint16LE(data, offset + 2);
        hour = data[offset + 4];
        minute = data[offset + 5];
        second = data[offset + 6];
        break;
    }
    
    return new Date(year, month - 1, day, hour, minute, second);
  }
}

/**
 * Calculate checksum for data verification
 */
export function calculateChecksum(data: Uint8Array, algorithm: 'crc16' | 'crc32' | 'sum8'): number {
  switch (algorithm) {
    case 'sum8':
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum = (sum + data[i]) & 0xff;
      }
      return sum;
      
    case 'crc16':
      // CRC-16-CCITT
      let crc16 = 0xffff;
      for (let i = 0; i < data.length; i++) {
        crc16 ^= data[i] << 8;
        for (let j = 0; j < 8; j++) {
          if (crc16 & 0x8000) {
            crc16 = (crc16 << 1) ^ 0x1021;
          } else {
            crc16 <<= 1;
          }
          crc16 &= 0xffff;
        }
      }
      return crc16;
      
    case 'crc32':
      // CRC-32 (ISO 3309)
      let crc32 = 0xffffffff;
      for (let i = 0; i < data.length; i++) {
        crc32 ^= data[i];
        for (let j = 0; j < 8; j++) {
          if (crc32 & 1) {
            crc32 = (crc32 >>> 1) ^ 0xedb88320;
          } else {
            crc32 >>>= 1;
          }
        }
      }
      return (crc32 ^ 0xffffffff) >>> 0;
  }
}
