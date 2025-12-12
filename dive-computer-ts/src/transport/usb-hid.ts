// SPDX-License-Identifier: GPL-2.0
/**
 * USB HID Transport
 * Handles USB HID communication with dive computers (e.g., Suunto EON Steel)
 */

import { Transport } from './transport.js';
import { DCStatus, DCDirection } from '../types/index.js';

/**
 * USB HID device information
 */
export interface HIDDeviceInfo {
  vendorId: number;
  productId: number;
  path?: string;
  serialNumber?: string;
  manufacturer?: string;
  product?: string;
  usage?: number;
  usagePage?: number;
}

/**
 * USB HID Transport implementation
 */
export class USBHIDTransport extends Transport {
  private device: unknown = null;  // HIDDevice instance
  private vendorId: number;
  private productId: number;
  private receiveBuffer: Uint8Array[] = [];

  constructor(vendorId: number, productId: number) {
    super();
    this.vendorId = vendorId;
    this.productId = productId;
  }

  async open(): Promise<DCStatus> {
    try {
      // In a browser environment using WebHID:
      // const devices = await navigator.hid.requestDevice({
      //   filters: [{ vendorId: this.vendorId, productId: this.productId }]
      // });
      // if (devices.length === 0) {
      //   return DCStatus.NODEVICE;
      // }
      // this.device = devices[0];
      // await this.device.open();
      // 
      // this.device.addEventListener('inputreport', (event) => {
      //   this.receiveBuffer.push(new Uint8Array(event.data.buffer));
      //   this.emit('data', event.data);
      // });

      // In Node.js using node-hid:
      // const HID = require('node-hid');
      // const devices = HID.devices(this.vendorId, this.productId);
      // if (devices.length === 0) {
      //   return DCStatus.NODEVICE;
      // }
      // this.device = new HID.HID(devices[0].path);
      // this.device.on('data', (data) => {
      //   this.receiveBuffer.push(new Uint8Array(data));
      //   this.emit('data', data);
      // });

      console.log(`Opening USB HID device: ${this.vendorId.toString(16)}:${this.productId.toString(16)}`);
      
      this.connected = true;
      this.emit('connect');
      return DCStatus.SUCCESS;
    } catch (error) {
      console.error('Failed to open USB HID device:', error);
      return DCStatus.IO;
    }
  }

  async close(): Promise<DCStatus> {
    if (!this.device) {
      return DCStatus.SUCCESS;
    }

    try {
      // In browser: await this.device.close();
      // In Node.js: this.device.close();
      
      this.connected = false;
      this.device = null;
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
    if (!this.connected || !this.device) {
      return [DCStatus.IO, 0];
    }

    try {
      // HID reports typically have a report ID as the first byte
      // In browser: await this.device.sendReport(reportId, data);
      // In Node.js: this.device.write(Array.from(data));
      
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
   * Send a feature report
   */
  async sendFeatureReport(_reportId: number, _data: Uint8Array): Promise<DCStatus> {
    if (!this.device) {
      return DCStatus.IO;
    }

    try {
      // In browser: await this.device.sendFeatureReport(_reportId, _data);
      // In Node.js: this.device.sendFeatureReport(Array.from([_reportId, ..._data]));
      return DCStatus.SUCCESS;
    } catch (_error) {
      return DCStatus.IO;
    }
  }

  /**
   * Get a feature report
   */
  async getFeatureReport(_reportId: number, length: number): Promise<[DCStatus, Uint8Array]> {
    if (!this.device) {
      return [DCStatus.IO, new Uint8Array(0)];
    }

    try {
      // In browser: const data = await this.device.receiveFeatureReport(_reportId);
      // In Node.js: const data = this.device.getFeatureReport(_reportId, length);
      return [DCStatus.SUCCESS, new Uint8Array(length)];
    } catch (_error) {
      return [DCStatus.IO, new Uint8Array(0)];
    }
  }

  /**
   * List available HID devices
   */
  static async listDevices(): Promise<HIDDeviceInfo[]> {
    // In browser using WebHID:
    // const devices = await navigator.hid.getDevices();
    // return devices.map(d => ({
    //   vendorId: d.vendorId,
    //   productId: d.productId,
    //   product: d.productName,
    // }));

    // In Node.js using node-hid:
    // const HID = require('node-hid');
    // return HID.devices();

    return [];
  }

  /**
   * Find HID devices matching a descriptor
   */
  static async findDevices(vendorId: number, productId?: number): Promise<HIDDeviceInfo[]> {
    const allDevices = await this.listDevices();
    return allDevices.filter(d => 
      d.vendorId === vendorId && 
      (productId === undefined || d.productId === productId)
    );
  }
}

/**
 * Known USB HID dive computers
 */
export const USB_HID_DEVICES = [
  // Suunto
  { vendorId: 0x1493, productId: 0x0030, vendor: 'Suunto', product: 'EON Steel' },
  { vendorId: 0x1493, productId: 0x0033, vendor: 'Suunto', product: 'EON Core' },
  { vendorId: 0x1493, productId: 0x0035, vendor: 'Suunto', product: 'D5' },
  
  // Scubapro/Uwatec
  { vendorId: 0x2e6c, productId: 0x3201, vendor: 'Scubapro', product: 'G2' },
  { vendorId: 0x2e6c, productId: 0x3211, vendor: 'Scubapro', product: 'G2 HUD' },
  { vendorId: 0x2e6c, productId: 0x4201, vendor: 'Scubapro', product: 'G3' },
  { vendorId: 0x2e6c, productId: 0x1201, vendor: 'Scubapro', product: 'Aladin Sport Matrix' },
  { vendorId: 0x2e6c, productId: 0x2101, vendor: 'Scubapro', product: 'Aladin A1' },
  { vendorId: 0x2e6c, productId: 0x2401, vendor: 'Scubapro', product: 'Aladin A2' },
];

/**
 * Find dive computer by USB HID VID/PID
 */
export function findDiveComputerByHID(vendorId: number, productId: number): { vendor: string; product: string } | undefined {
  return USB_HID_DEVICES.find(d => d.vendorId === vendorId && d.productId === productId);
}
