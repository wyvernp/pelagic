// SPDX-License-Identifier: GPL-2.0
/**
 * Bluetooth Low Energy (BLE) Transport
 * Handles BLE GATT communication with dive computers
 */

import { Transport } from './transport.js';
import { DCStatus, DCDirection } from '../types/index.js';

/**
 * Known BLE serial service UUIDs for dive computers
 */
export const BLE_SERIAL_SERVICES = {
  // Heinrichs-Weikamp (Telit/Stollmann)
  HW_TELIT: '0000fefb-0000-1000-8000-00805f9b34fb',
  // Heinrichs-Weikamp (U-Blox)
  HW_UBLOX: '2456e1b9-26e2-8f83-e744-f34f01e9d701',
  // Mares BlueLink Pro
  MARES: '544e326b-5b72-c6b0-1c46-41c1bc448118',
  // Suunto (EON Steel/Core, G5)
  SUUNTO: '98ae7120-e62e-11e3-badd-0002a5d5c51b',
  // Pelagic (i770R, i200C, Pro Plus X, Geo 4.0)
  PELAGIC: 'cb3c4555-d670-4670-bc20-b61dbc851e9a',
  // Pelagic (i330R, DSX)
  PELAGIC_NEW: 'ca7b0001-f785-4c38-b599-c7c5fbadb034',
  // ScubaPro (G2, G3)
  SCUBAPRO: 'fdcdeaaa-295d-470e-bf15-04217b7aa0a0',
  // Shearwater (Perdix/Teric/Peregrine/Tern)
  SHEARWATER: 'fe25c237-0ece-443c-b0aa-e02033e7029d',
  // Divesoft
  DIVESOFT: '0000fcef-0000-1000-8000-00805f9b34fb',
  // Cressi
  CRESSI: '6e400001-b5a3-f393-e0a9-e50e24dc10b8',
  // Nordic Semi UART (generic)
  NORDIC_UART: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  // Halcyon Symbios
  HALCYON: '00000001-8c3b-4f2c-a59e-8c08224f3253',
};

/**
 * Firmware upgrade services to ignore
 */
export const BLE_UPGRADE_SERVICES = [
  '00001530-1212-efde-1523-785feabcd123', // Nordic Upgrade
  '9e5d1e47-5c13-43a0-8635-82ad38a1386f', // Broadcom Upgrade #1
  'a86abc2d-d44c-442e-99f7-80059a873e36', // Broadcom Upgrade #2
];

/**
 * BLE characteristic types
 */
export interface BLECharacteristic {
  uuid: string;
  properties: {
    read: boolean;
    write: boolean;
    writeWithoutResponse: boolean;
    notify: boolean;
    indicate: boolean;
  };
  descriptors: string[];
}

/**
 * BLE service information
 */
export interface BLEService {
  uuid: string;
  name?: string;
  characteristics: BLECharacteristic[];
}

/**
 * BLE Transport implementation
 */
export class BLETransport extends Transport {
  // Note: These private fields are used in the commented-out implementation code
  // which would be uncommented when using the Web Bluetooth API
  // @ts-expect-error - Used in commented-out Web Bluetooth implementation
  private _device: unknown = null;  // BluetoothDevice instance
  // @ts-expect-error - Used in commented-out Web Bluetooth implementation
  private _server: unknown = null;  // BluetoothRemoteGATTServer
  // @ts-expect-error - Used in commented-out Web Bluetooth implementation
  private _service: unknown = null; // BluetoothRemoteGATTService
  // @ts-expect-error - Used in commented-out Web Bluetooth implementation
  private _rxCharacteristic: unknown = null;
  private txCharacteristic: unknown = null;
  private address: string;
  private receiveBuffer: Uint8Array[] = [];
  // @ts-expect-error - Used in commented-out Web Bluetooth implementation
  private _useRandomAddress: boolean = false;

  constructor(address: string, options?: { useRandomAddress?: boolean }) {
    super();
    // Remove "LE:" prefix if present
    this.address = address.startsWith('LE:') ? address.substring(3) : address;
    this._useRandomAddress = options?.useRandomAddress ?? false;
  }

  async open(): Promise<DCStatus> {
    try {
      console.log(`Opening BLE connection to: ${this.address}`);
      
      // In a browser environment using Web Bluetooth:
      // const device = await navigator.bluetooth.requestDevice({
      //   filters: [{ services: Object.values(BLE_SERIAL_SERVICES) }],
      //   optionalServices: Object.values(BLE_SERIAL_SERVICES),
      // });
      // 
      // this.device = device;
      // this.server = await device.gatt?.connect();
      // 
      // // Find the appropriate service
      // for (const [name, uuid] of Object.entries(BLE_SERIAL_SERVICES)) {
      //   try {
      //     this.service = await this.server.getPrimaryService(uuid);
      //     console.log(`Found service: ${name}`);
      //     break;
      //   } catch {}
      // }
      // 
      // if (!this.service) {
      //   return DCStatus.NODEVICE;
      // }
      // 
      // // Find TX (read) and RX (write) characteristics
      // const characteristics = await this.service.getCharacteristics();
      // for (const char of characteristics) {
      //   if (char.properties.notify || char.properties.indicate) {
      //     this.rxCharacteristic = char;
      //     await char.startNotifications();
      //     char.addEventListener('characteristicvaluechanged', (event) => {
      //       const value = event.target.value;
      //       this.receiveBuffer.push(new Uint8Array(value.buffer));
      //       this.emit('data', value);
      //     });
      //   }
      //   if (char.properties.write || char.properties.writeWithoutResponse) {
      //     this.txCharacteristic = char;
      //   }
      // }

      this.connected = true;
      this.emit('connect');
      return DCStatus.SUCCESS;
    } catch (error) {
      console.error('Failed to open BLE connection:', error);
      return DCStatus.IO;
    }
  }

  async close(): Promise<DCStatus> {
    try {
      // In browser:
      // if (this._rxCharacteristic) {
      //   await this._rxCharacteristic.stopNotifications();
      // }
      // if (this._server) {
      //   this._server.disconnect();
      // }
      
      this.connected = false;
      this._device = null;
      this._server = null;
      this._service = null;
      this._rxCharacteristic = null;
      this.txCharacteristic = null;
      this.emit('disconnect');
      return DCStatus.SUCCESS;
    } catch (_error) {
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
    if (!this.connected || !this.txCharacteristic) {
      return [DCStatus.IO, 0];
    }

    try {
      // In browser:
      // const char = this.txCharacteristic as BluetoothRemoteGATTCharacteristic;
      // if (char.properties.writeWithoutResponse) {
      //   await char.writeValueWithoutResponse(data);
      // } else {
      //   await char.writeValueWithResponse(data);
      // }
      
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
   * Get device name from BLE GATT
   */
  async getDeviceName(): Promise<string | undefined> {
    // In browser:
    // const device = this.device as BluetoothDevice;
    // return device?.name;
    return undefined;
  }
}

/**
 * BLE device name patterns for dive computer recognition
 */
export interface BLENamePattern {
  pattern: string | RegExp;
  vendor: string;
  product: string;
}

/**
 * Known BLE name patterns for dive computers
 */
export const BLE_NAME_PATTERNS: BLENamePattern[] = [
  // Shearwater
  { pattern: /^Perdix 2/, vendor: 'Shearwater', product: 'Perdix 2' },
  { pattern: /^Petrel 3/, vendor: 'Shearwater', product: 'Petrel 3' },
  { pattern: /^Petrel/, vendor: 'Shearwater', product: 'Petrel 2' },
  { pattern: /^Perdix/, vendor: 'Shearwater', product: 'Perdix' },
  { pattern: /^Teric/, vendor: 'Shearwater', product: 'Teric' },
  { pattern: /^Peregrine/, vendor: 'Shearwater', product: 'Peregrine' },
  { pattern: /^NERD 2/, vendor: 'Shearwater', product: 'NERD 2' },
  { pattern: /^NERD/, vendor: 'Shearwater', product: 'NERD' },
  { pattern: /^Predator/, vendor: 'Shearwater', product: 'Predator' },
  { pattern: /^Tern/, vendor: 'Shearwater', product: 'Tern' },
  
  // Suunto
  { pattern: /^EON Steel/, vendor: 'Suunto', product: 'EON Steel' },
  { pattern: /^EON Core/, vendor: 'Suunto', product: 'EON Core' },
  { pattern: /^Suunto D5/, vendor: 'Suunto', product: 'D5' },
  
  // Scubapro
  { pattern: /^G2/, vendor: 'Scubapro', product: 'G2' },
  { pattern: /^HUD/, vendor: 'Scubapro', product: 'G2 HUD' },
  { pattern: /^G3/, vendor: 'Scubapro', product: 'G3' },
  { pattern: /^Aladin/, vendor: 'Scubapro', product: 'Aladin Sport Matrix' },
  { pattern: /^A1/, vendor: 'Scubapro', product: 'Aladin A1' },
  { pattern: /^A2/, vendor: 'Scubapro', product: 'Aladin A2' },
  { pattern: /^Luna 2\.0 AI/, vendor: 'Scubapro', product: 'Luna 2.0 AI' },
  { pattern: /^Luna 2\.0/, vendor: 'Scubapro', product: 'Luna 2.0' },
  
  // Mares
  { pattern: /^Mares Genius/, vendor: 'Mares', product: 'Genius' },
  { pattern: /^Sirius/, vendor: 'Mares', product: 'Sirius' },
  { pattern: /^Mares/, vendor: 'Mares', product: 'Quad' },
  
  // Heinrichs Weikamp
  { pattern: /^OSTC3/, vendor: 'Heinrichs Weikamp', product: 'OSTC Plus' },
  { pattern: /^OSTCs#/, vendor: 'Heinrichs Weikamp', product: 'OSTC Sport' },
  { pattern: /^OSTCs /, vendor: 'Heinrichs Weikamp', product: 'OSTC Sport' },
  { pattern: /^OSTC4-/, vendor: 'Heinrichs Weikamp', product: 'OSTC 4/5' },
  { pattern: /^OSTC5-/, vendor: 'Heinrichs Weikamp', product: 'OSTC 4/5' },
  { pattern: /^OSTC2-/, vendor: 'Heinrichs Weikamp', product: 'OSTC 2N' },
  { pattern: /^OSTC\+ /, vendor: 'Heinrichs Weikamp', product: 'OSTC 2' },
  { pattern: /^OSTC/, vendor: 'Heinrichs Weikamp', product: 'OSTC 2' },
  
  // Cressi
  { pattern: /^CARESIO_/, vendor: 'Cressi', product: 'Cartesio' },
  { pattern: /^GOA_/, vendor: 'Cressi', product: 'Goa' },
  { pattern: /^\d{1,2}_[0-9a-f]{4}$/, vendor: 'Cressi', product: '' }, // Model number pattern
  
  // Deepblu
  { pattern: /^COSMIQ/, vendor: 'Deepblu', product: 'Cosmiq+' },
  
  // Oceans
  { pattern: /^S1/, vendor: 'Oceans', product: 'S1' },
  
  // McLean
  { pattern: /^McLean Extreme/, vendor: 'McLean', product: 'Extreme' },
  
  // Tecdiving
  { pattern: /^DiveComputer/, vendor: 'Tecdiving', product: 'DiveComputer.eu' },
  
  // Ratio
  { pattern: /^DS\d{6}/, vendor: 'Ratio', product: 'iX3M 2021 GPS Easy' },
  { pattern: /^IX5M\d{6}/, vendor: 'Ratio', product: 'iX3M 2021 GPS Easy' },
  { pattern: /^RATIO-\d{6}/, vendor: 'Ratio', product: 'iX3M 2021 GPS Easy' },
];

/**
 * Match a BLE device name to a known dive computer
 */
export function matchBLEDeviceName(name: string): { vendor: string; product: string } | undefined {
  for (const pattern of BLE_NAME_PATTERNS) {
    if (typeof pattern.pattern === 'string') {
      if (name.startsWith(pattern.pattern)) {
        return { vendor: pattern.vendor, product: pattern.product };
      }
    } else if (pattern.pattern.test(name)) {
      return { vendor: pattern.vendor, product: pattern.product };
    }
  }
  return undefined;
}

/**
 * Check if a service UUID is a known serial service
 */
export function isKnownSerialService(uuid: string): string | undefined {
  const normalizedUuid = uuid.toLowerCase();
  for (const [name, serviceUuid] of Object.entries(BLE_SERIAL_SERVICES)) {
    if (normalizedUuid === serviceUuid.toLowerCase()) {
      return name;
    }
  }
  return undefined;
}

/**
 * Check if a service UUID should be ignored (firmware upgrade)
 */
export function shouldIgnoreService(uuid: string): boolean {
  const normalizedUuid = uuid.toLowerCase();
  return BLE_UPGRADE_SERVICES.some(s => normalizedUuid === s.toLowerCase());
}
