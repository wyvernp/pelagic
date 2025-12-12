// SPDX-License-Identifier: GPL-2.0
/**
 * Transport types for dive computer communication
 * Converted from libdivecomputer transport definitions
 */

export enum TransportType {
  NONE = 0,
  SERIAL = 1 << 0,      // RS232/USB-Serial
  USB = 1 << 1,         // Native USB
  USBHID = 1 << 2,      // USB Human Interface Device
  IRDA = 1 << 3,        // Infrared
  BLUETOOTH = 1 << 4,   // Classic Bluetooth RFCOMM
  BLE = 1 << 5,         // Bluetooth Low Energy
  USBSTORAGE = 1 << 6,  // USB Mass Storage (Uemis)
}

export enum DCStatus {
  SUCCESS = 0,
  UNSUPPORTED = -1,
  INVALIDARGS = -2,
  NOMEMORY = -3,
  NODEVICE = -4,
  NOACCESS = -5,
  IO = -6,
  TIMEOUT = -7,
  PROTOCOL = -8,
  DATAFORMAT = -9,
  CANCELLED = -10,
}

export enum DCDirection {
  INPUT = 0x01,
  OUTPUT = 0x02,
  ALL = 0x03,
}

export enum DCEventType {
  WAITING = 1,
  PROGRESS = 2,
  DEVINFO = 3,
  CLOCK = 4,
  VENDOR = 5,
}

export enum DCLogLevel {
  NONE = 0,
  ERROR = 1,
  WARNING = 2,
  INFO = 3,
  DEBUG = 4,
  ALL = 5,
}

export enum DiveMode {
  OC = 0,       // Open Circuit
  CCR = 1,      // Closed Circuit Rebreather
  PSCR = 2,     // Passive Semi-Closed Rebreather
  FREEDIVE = 3, // Freediving
  GAUGE = 4,    // Gauge mode
}

export enum CylinderUse {
  OC_GAS = 0,
  DILUENT = 1,
  OXYGEN = 2,
  NOT_USED = 3,
}

export function getStatusMessage(status: DCStatus): string {
  switch (status) {
    case DCStatus.SUCCESS:
      return 'Success';
    case DCStatus.UNSUPPORTED:
      return 'Unsupported operation';
    case DCStatus.INVALIDARGS:
      return 'Invalid arguments';
    case DCStatus.NOMEMORY:
      return 'Out of memory';
    case DCStatus.NODEVICE:
      return 'No device found';
    case DCStatus.NOACCESS:
      return 'Access denied';
    case DCStatus.IO:
      return 'Input/output error';
    case DCStatus.TIMEOUT:
      return 'Timeout';
    case DCStatus.PROTOCOL:
      return 'Protocol error';
    case DCStatus.DATAFORMAT:
      return 'Data format error';
    case DCStatus.CANCELLED:
      return 'Cancelled';
    default:
      return 'Unknown error';
  }
}

export function getTransportString(transport: number): string {
  const parts: string[] = [];
  
  if (transport & TransportType.SERIAL) parts.push('SERIAL');
  if (transport & TransportType.USB) parts.push('USB');
  if (transport & TransportType.USBHID) parts.push('USBHID');
  if (transport & TransportType.IRDA) parts.push('IRDA');
  if (transport & TransportType.BLUETOOTH) parts.push('BT');
  if (transport & TransportType.BLE) parts.push('BLE');
  if (transport & TransportType.USBSTORAGE) parts.push('USBSTORAGE');
  
  return parts.join(', ');
}
