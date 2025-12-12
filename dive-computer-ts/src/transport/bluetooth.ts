// SPDX-License-Identifier: GPL-2.0
/**
 * Bluetooth Classic (RFCOMM) Transport
 * Handles Bluetooth Serial Port Profile communication
 */

import { Transport } from './transport.js';
import { DCStatus, DCDirection } from '../types/index.js';

/**
 * Standard Bluetooth Serial Port Profile UUID
 */
export const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';

/**
 * Bluetooth RFCOMM Transport implementation
 */
export class BluetoothTransport extends Transport {
  private socket: unknown = null;
  private address: string;
  private receiveBuffer: Uint8Array[] = [];

  constructor(address: string) {
    super();
    this.address = address;
  }

  async open(): Promise<DCStatus> {
    try {
      console.log(`Opening Bluetooth connection to: ${this.address}`);
      
      // In Node.js, you would use a library like bluetooth-serial-port
      // const BluetoothSerialPort = require('bluetooth-serial-port').BluetoothSerialPort;
      // this.socket = new BluetoothSerialPort();
      // 
      // await new Promise((resolve, reject) => {
      //   this.socket.connect(this.address, 1, () => {
      //     resolve(undefined);
      //   }, (err) => {
      //     reject(err);
      //   });
      // });
      // 
      // this.socket.on('data', (data: Buffer) => {
      //   this.receiveBuffer.push(new Uint8Array(data));
      //   this.emit('data', data);
      // });
      // 
      // this.socket.on('failure', (err: Error) => {
      //   this.emit('error', err);
      // });
      // 
      // this.socket.on('closed', () => {
      //   this.connected = false;
      //   this.emit('disconnect');
      // });

      this.connected = true;
      this.emit('connect');
      return DCStatus.SUCCESS;
    } catch (error) {
      console.error('Failed to open Bluetooth connection:', error);
      if ((error as Error).message?.includes('not found')) {
        return DCStatus.NODEVICE;
      }
      return DCStatus.IO;
    }
  }

  async close(): Promise<DCStatus> {
    if (!this.socket) {
      return DCStatus.SUCCESS;
    }

    try {
      // In Node.js:
      // this.socket.close();
      
      this.connected = false;
      this.socket = null;
      this.emit('disconnect');
      return DCStatus.SUCCESS;
    } catch (error) {
      return DCStatus.IO;
    }
  }

  async read(size: number): Promise<[DCStatus, Uint8Array, number]> {
    if (!this.connected) {
      return [DCStatus.IO, new Uint8Array(0), 0];
    }

    const startTime = Date.now();
    const result = new Uint8Array(size);
    let bytesRead = 0;

    while (bytesRead < size) {
      if (Date.now() - startTime > this.timeout) {
        return [DCStatus.TIMEOUT, result.slice(0, bytesRead), bytesRead];
      }

      if (this.receiveBuffer.length > 0) {
        const chunk = this.receiveBuffer.shift()!;
        const copyLength = Math.min(chunk.length, size - bytesRead);
        result.set(chunk.slice(0, copyLength), bytesRead);
        bytesRead += copyLength;
        
        if (copyLength < chunk.length) {
          this.receiveBuffer.unshift(chunk.slice(copyLength));
        }
      } else {
        await this.sleep(10);
      }
    }

    return [DCStatus.SUCCESS, result, bytesRead];
  }

  async write(data: Uint8Array): Promise<[DCStatus, number]> {
    if (!this.connected || !this.socket) {
      return [DCStatus.IO, 0];
    }

    try {
      // In Node.js:
      // await new Promise((resolve, reject) => {
      //   this.socket.write(Buffer.from(data), (err, bytesWritten) => {
      //     if (err) reject(err);
      //     else resolve(bytesWritten);
      //   });
      // });
      
      return [DCStatus.SUCCESS, data.length];
    } catch (error) {
      return [DCStatus.IO, 0];
    }
  }

  async poll(timeout: number): Promise<DCStatus> {
    const startTime = Date.now();
    
    while (this.receiveBuffer.length === 0) {
      if (Date.now() - startTime > timeout) {
        return DCStatus.TIMEOUT;
      }
      await this.sleep(10);
    }
    
    return DCStatus.SUCCESS;
  }

  async purge(direction: DCDirection): Promise<DCStatus> {
    if (direction & DCDirection.INPUT) {
      this.receiveBuffer = [];
    }
    return DCStatus.SUCCESS;
  }

  /**
   * List paired Bluetooth devices
   */
  static async listPairedDevices(): Promise<{ address: string; name: string }[]> {
    // In Node.js:
    // const BluetoothSerialPort = require('bluetooth-serial-port').BluetoothSerialPort;
    // const btSerial = new BluetoothSerialPort();
    // 
    // return new Promise((resolve) => {
    //   const devices: { address: string; name: string }[] = [];
    //   btSerial.listPairedDevices((pairedDevices) => {
    //     for (const device of pairedDevices) {
    //       devices.push({
    //         address: device.address,
    //         name: device.name,
    //       });
    //     }
    //     resolve(devices);
    //   });
    // });
    
    return [];
  }

  /**
   * Discover nearby Bluetooth devices
   */
  static async discoverDevices(_timeout: number = 10000): Promise<{ address: string; name: string }[]> {
    // In Node.js:
    // const BluetoothSerialPort = require('bluetooth-serial-port').BluetoothSerialPort;
    // const btSerial = new BluetoothSerialPort();
    // 
    // return new Promise((resolve) => {
    //   const devices: { address: string; name: string }[] = [];
    //   
    //   btSerial.on('found', (address: string, name: string) => {
    //     devices.push({ address, name });
    //   });
    //   
    //   btSerial.on('finished', () => {
    //     resolve(devices);
    //   });
    //   
    //   btSerial.inquire();
    //   
    //   setTimeout(() => {
    //     btSerial.close();
    //     resolve(devices);
    //   }, _timeout);
    // });
    
    return [];
  }
}

/**
 * Parse a Bluetooth address string
 * Handles formats like "AA:BB:CC:DD:EE:FF" or "LE:AA:BB:CC:DD:EE:FF"
 */
export function parseBluetoothAddress(address: string): { address: string; isBLE: boolean } | null {
  const bleMatch = address.match(/^LE:([0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2})$/);
  if (bleMatch) {
    return { address: bleMatch[1].toUpperCase(), isBLE: true };
  }
  
  const btMatch = address.match(/^([0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2})$/);
  if (btMatch) {
    return { address: btMatch[1].toUpperCase(), isBLE: false };
  }
  
  // UUID format (used on iOS/macOS)
  const uuidMatch = address.match(/^\{?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}?$/);
  if (uuidMatch) {
    return { address: address.toUpperCase(), isBLE: true };
  }
  
  return null;
}

/**
 * Check if a string is a valid Bluetooth address
 */
export function isBluetoothAddress(address: string): boolean {
  return parseBluetoothAddress(address) !== null;
}

/**
 * Extract Bluetooth address from a "Name (Address)" format string
 */
export function extractBluetoothNameAddress(text: string): { address: string; name: string } | null {
  // Try "Name (Address)" format
  const match = text.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    const parsed = parseBluetoothAddress(match[2]);
    if (parsed) {
      return { address: parsed.address, name: match[1].trim() };
    }
  }
  
  // Try just address
  const parsed = parseBluetoothAddress(text.trim());
  if (parsed) {
    return { address: parsed.address, name: '' };
  }
  
  return null;
}
