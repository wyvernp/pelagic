// SPDX-License-Identifier: GPL-2.0
/**
 * Core data types for dive computer communication
 */

import { TransportType, DiveMode, CylinderUse } from './enums.js';
import type { Transport } from '../transport/transport.js';

/**
 * Device information from dive computer
 */
export interface DeviceInfo {
  model: number;
  firmware: number;
  serial: number;
}

/**
 * Gas mix definition (values in permille 0-1000)
 */
export interface GasMix {
  oxygen: { permille: number };   // O2 fraction (0-1000)
  helium: { permille: number };   // He fraction (0-1000)
  nitrogen?: { permille: number }; // Calculated: 1000 - oxygen - helium
}

/**
 * Tank/Cylinder information
 */
export interface Cylinder {
  gasmix: GasMix;
  type?: {
    description?: string;
    size?: number;        // ml
    workingPressure?: number; // mbar
  };
  start?: Pressure;     // Start pressure
  end?: Pressure;       // End pressure
  workingPressure?: Pressure;
  cylinderUse?: CylinderUse;
}

/**
 * Depth measurement
 */
export interface Depth {
  mm: number;
}

/**
 * Duration measurement
 */
export interface Duration {
  seconds: number;
}

/**
 * Temperature measurement
 */
export interface Temperature {
  mkelvin: number;  // Millikelvin
}

/**
 * Pressure measurement
 */
export interface Pressure {
  mbar: number;
}

/**
 * Location coordinates
 */
export interface Location {
  lat: number;  // Degrees
  lon: number;  // Degrees
}

/**
 * Tank pressure reading in a sample
 */
export interface TankPressure {
  tank: number;   // Tank index
  pressure: Pressure;
}

/**
 * Dive sample (single data point during dive)
 */
export interface DiveSample {
  time: Duration;
  depth: Depth;
  temperature?: Temperature;
  pressure?: TankPressure[];
  heartbeat?: number;
  bearing?: number;
  setpoint?: Pressure;      // For CCR
  ppo2?: Pressure[];        // O2 sensor readings
  cns?: number;             // CNS percentage
  ndl?: Duration;           // No-deco limit
  stopDepth?: Depth;        // Deco stop depth
  stopTime?: Duration;      // Deco stop time
  tts?: Duration;           // Time to surface
  inDeco?: boolean;
  rbt?: Duration;           // Remaining bottom time
}

/**
 * Dive event
 */
export interface DiveEvent {
  time: Duration;       // Event time
  type: number;
  flags?: number;
  value?: number;
  name?: string;
  gasIndex?: number;    // For gas changes
}

/**
 * Dive computer data for a single dive
 */
export interface DiveComputer {
  model: string;
  serial?: string;
  firmware?: string;
  deviceId?: number;
  diveId?: number;
  when?: Date;
  duration?: Duration;
  maxDepth?: Depth;
  meanDepth?: Depth;
  airTemp?: Temperature;
  waterTemp?: Temperature;
  surfacePressure?: Pressure;
  salinity?: number;
  diveMode?: DiveMode;
  samples: DiveSample[];
  events: DiveEvent[];
  extraData?: Map<string, string>;
  noO2Sensors?: number;
}

/**
 * Dive site information
 */
export interface DiveSite {
  uuid?: string;
  name: string;
  location?: Location;
  description?: string;
  notes?: string;
}

/**
 * Weight system entry
 */
export interface WeightSystem {
  weight: number;  // grams
  description: string;
}

/**
 * Complete dive record
 */
export interface Dive {
  id: number;
  number?: number;
  when: Date;
  duration: Duration;
  maxDepth: Depth;
  meanDepth?: Depth;
  surfaceTemperature?: Temperature;
  waterTemperature?: Temperature;
  diveSite?: DiveSite;
  diveComputers: DiveComputer[];
  cylinders: Cylinder[];
  weights?: WeightSystem[];
  suit?: string;
  buddy?: string;
  divemaster?: string;
  notes?: string;
  rating?: number;
  visibility?: number;
  tags?: string[];
  diveMode?: DiveMode;
}

/**
 * Dive computer descriptor
 */
export interface DCDescriptor {
  vendor: string;
  product: string;
  model: number;
  type: number;
  transports: TransportType;
}

/**
 * Device data for download operations
 */
export interface DeviceData {
  descriptor?: DCDescriptor;
  vendor: string;
  product: string;
  devName: string;
  model: string;
  btName?: string;
  fingerprint?: Uint8Array;
  fingerprintDeviceId?: number;
  fingerprintDiveId?: number;
  devInfo?: DeviceInfo;
  diveId?: number;
  forceDownload: boolean;
  libdcLog: boolean;
  libdcDump: boolean;
  bluetoothMode: boolean;
  syncTime: boolean;
}

/**
 * Progress event data
 */
export interface ProgressEvent {
  current: number;
  maximum: number;
  step?: number;
}

/**
 * Clock event data
 */
export interface ClockEvent {
  systime: number;
  devtime: number;
}

/**
 * Download options
 */
export interface DownloadOptions {
  descriptor: DCDescriptor;
  transport?: Transport;
  fingerprint?: Uint8Array;
  forceDownload?: boolean;
  syncTime?: boolean;
  saveDump?: boolean;
  saveLog?: boolean;
  bluetoothMode?: boolean;
}

/**
 * Connection info for a dive computer
 */
export interface ConnectionInfo {
  vendor: string;
  product: string;
  device: string;
  btAddress?: string;
  btName?: string;
}

/**
 * USB device descriptor
 */
export interface USBDeviceDescriptor {
  vendorId: number;
  productId: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  busNumber?: number;
  portNumber?: number;
}

/**
 * Bluetooth device info
 */
export interface BluetoothDeviceInfo {
  address: string;
  name?: string;
  isBLE: boolean;
  rssi?: number;
  serviceUUIDs?: string[];
}
