// SPDX-License-Identifier: GPL-2.0
/**
 * Serial Port Transport
 * Handles USB-Serial and RS232 communication with dive computers
 */

import { Transport } from './transport.js';
import { DCStatus, DCDirection } from '../types/index.js';

// Note: In a real implementation, you would import the serialport library
// import { SerialPort } from 'serialport';

/**
 * Serial port configuration
 */
export interface SerialConfig {
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  stopBits: 1 | 1.5 | 2;
  flowControl: 'none' | 'hardware' | 'software';
}

/**
 * Default serial configuration
 */
const DEFAULT_CONFIG: SerialConfig = {
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  flowControl: 'none',
};

/**
 * Serial transport implementation
 */
export class SerialTransport extends Transport {
  private port: unknown = null;  // SerialPort instance
  private path: string;
  private config: SerialConfig;
  private receiveBuffer: Uint8Array[] = [];

  constructor(path: string, config: Partial<SerialConfig> = {}) {
    super();
    this.path = path;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async open(): Promise<DCStatus> {
    try {
      // In a real implementation:
      // this.port = new SerialPort({
      //   path: this.path,
      //   baudRate: this.config.baudRate,
      //   dataBits: this.config.dataBits,
      //   parity: this.config.parity,
      //   stopBits: this.config.stopBits,
      //   autoOpen: false,
      // });
      
      // For now, simulate the connection
      console.log(`Opening serial port: ${this.path}`);
      
      // await new Promise((resolve, reject) => {
      //   this.port.open((err) => {
      //     if (err) reject(err);
      //     else resolve(undefined);
      //   });
      // });
      
      // this.port.on('data', (data: Buffer) => {
      //   this.receiveBuffer.push(new Uint8Array(data));
      //   this.emit('data', data);
      // });
      
      // this.port.on('error', (err: Error) => {
      //   this.emit('error', err);
      // });
      
      // this.port.on('close', () => {
      //   this.connected = false;
      //   this.emit('disconnect');
      // });

      this.connected = true;
      this.emit('connect');
      return DCStatus.SUCCESS;
    } catch (error) {
      console.error('Failed to open serial port:', error);
      return DCStatus.IO;
    }
  }

  async close(): Promise<DCStatus> {
    if (!this.port) {
      return DCStatus.SUCCESS;
    }

    try {
      // In a real implementation:
      // await new Promise((resolve) => {
      //   this.port.close((err) => {
      //     resolve(undefined);
      //   });
      // });
      
      this.connected = false;
      this.port = null;
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
      // Check timeout
      if (Date.now() - startTime > this.timeout) {
        return [DCStatus.TIMEOUT, result.slice(0, bytesRead), bytesRead];
      }

      // Check for available data
      if (this.receiveBuffer.length > 0) {
        const chunk = this.receiveBuffer.shift()!;
        const copyLength = Math.min(chunk.length, size - bytesRead);
        result.set(chunk.slice(0, copyLength), bytesRead);
        bytesRead += copyLength;
        
        // Put back remaining data
        if (copyLength < chunk.length) {
          this.receiveBuffer.unshift(chunk.slice(copyLength));
        }
      } else {
        // Wait a bit before checking again
        await this.sleep(10);
      }
    }

    return [DCStatus.SUCCESS, result, bytesRead];
  }

  async write(data: Uint8Array): Promise<[DCStatus, number]> {
    if (!this.connected || !this.port) {
      return [DCStatus.IO, 0];
    }

    try {
      // In a real implementation:
      // await new Promise((resolve, reject) => {
      //   this.port.write(Buffer.from(data), (err) => {
      //     if (err) reject(err);
      //     else resolve(undefined);
      //   });
      // });
      // await new Promise((resolve) => {
      //   this.port.drain(resolve);
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
    
    // In a real implementation:
    // if (direction & DCDirection.OUTPUT) {
    //   await new Promise((resolve) => this.port.flush(resolve));
    // }
    
    return DCStatus.SUCCESS;
  }

  async configure(
    baudrate: number,
    databits: number,
    parity: number,
    stopbits: number,
    _flowcontrol: number
  ): Promise<DCStatus> {
    const parityMap: Record<number, 'none' | 'even' | 'odd'> = {
      0: 'none',
      1: 'even',
      2: 'odd',
    };

    this.config.baudRate = baudrate;
    this.config.dataBits = databits as 5 | 6 | 7 | 8;
    this.config.parity = parityMap[parity] || 'none';
    this.config.stopBits = stopbits as 1 | 1.5 | 2;

    // In a real implementation:
    // if (this.port && this.connected) {
    //   await new Promise((resolve, reject) => {
    //     this.port.update({ baudRate: baudrate }, (err) => {
    //       if (err) reject(err);
    //       else resolve(undefined);
    //     });
    //   });
    // }

    return DCStatus.SUCCESS;
  }

  async setDTR(_value: boolean): Promise<DCStatus> {
    if (!this.port) {
      return DCStatus.IO;
    }

    // In a real implementation:
    // await new Promise((resolve, reject) => {
    //   this.port.set({ dtr: _value }, (err) => {
    //     if (err) reject(err);
    //     else resolve(undefined);
    //   });
    // });

    return DCStatus.SUCCESS;
  }

  async setRTS(_value: boolean): Promise<DCStatus> {
    if (!this.port) {
      return DCStatus.IO;
    }

    // In a real implementation:
    // await new Promise((resolve, reject) => {
    //   this.port.set({ rts: _value }, (err) => {
    //     if (err) reject(err);
    //     else resolve(undefined);
    //   });
    // });

    return DCStatus.SUCCESS;
  }

  async getAvailable(): Promise<number> {
    let total = 0;
    for (const chunk of this.receiveBuffer) {
      total += chunk.length;
    }
    return total;
  }

  /**
   * List available serial ports
   */
  static async listPorts(): Promise<string[]> {
    // In a real implementation:
    // const ports = await SerialPort.list();
    // return ports.map(p => p.path);
    
    return [];
  }
}

/**
 * Known USB-Serial chip vendor/product IDs
 */
export const USB_SERIAL_CHIPS = {
  FTDI: {
    vendorId: 0x0403,
    products: [
      { productId: 0x6001, name: 'FT232' },
      { productId: 0x6010, name: 'FT2232' },
      { productId: 0x6011, name: 'FT4232' },
      { productId: 0x6014, name: 'FT232H' },
      { productId: 0x6015, name: 'FT230X' },
      { productId: 0xf460, name: 'Oceanic' },
      { productId: 0xf680, name: 'Suunto' },
    ],
  },
  SILABS: {
    vendorId: 0x10c4,
    products: [
      { productId: 0xea60, name: 'CP210x' },
      { productId: 0xea70, name: 'CP2105' },
      { productId: 0xea71, name: 'CP2108' },
      { productId: 0xea80, name: 'CP2110' },
    ],
  },
  PROLIFIC: {
    vendorId: 0x067b,
    products: [
      { productId: 0x2303, name: 'PL2303' },
    ],
  },
  CH340: {
    vendorId: 0x1a86,
    products: [
      { productId: 0x7523, name: 'CH340' },
    ],
  },
  MARES: {
    vendorId: 0xffff,
    products: [
      { productId: 0x0005, name: 'Icon HD' },
    ],
  },
};

/**
 * Check if a USB device is a known serial adapter
 */
export function isKnownSerialAdapter(vendorId: number, productId: number): boolean {
  for (const chip of Object.values(USB_SERIAL_CHIPS)) {
    if (chip.vendorId === vendorId) {
      for (const product of chip.products) {
        if (product.productId === productId) {
          return true;
        }
      }
    }
  }
  return false;
}
