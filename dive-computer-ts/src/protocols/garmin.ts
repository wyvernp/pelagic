/**
 * Garmin FIT Protocol Implementation
 * 
 * Supports: Garmin Descent Mk1, Mk2, Mk2i, Mk2S, Mk3, Mk3i, G1
 * 
 * Transport:
 * - USB Mass Storage: Device mounts as removable drive
 * - ANT+: For some models (Mk2i, Mk3i)
 * - BLE: Mk3, Mk3i
 * 
 * Garmin dive computers store data in FIT (Flexible and Interoperable Data Transfer)
 * files on the device's internal storage.
 * 
 * File locations:
 * - /Garmin/Activity/*.fit - Activity files (includes dives)
 * - /Garmin/Dives/*.fit - Dive-specific files (newer models)
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseProtocol, ProtocolDeviceInfo, ProtocolDive, Checksum } from './base-protocol';

// FIT Protocol Constants
const FIT_SIGNATURE = '.FIT';
const FIT_HEADER_SIZE = 14;

// FIT epoch: December 31, 1989 00:00:00 UTC
const FIT_EPOCH = 631065600;

/**
 * FIT Message Types for diving
 */
const FIT_MESSAGE = {
    FILE_ID: 0,
    DEVICE_INFO: 23,
    EVENT: 21,
    RECORD: 20,         // Sample data
    LAP: 19,
    SESSION: 18,
    ACTIVITY: 34,
    DIVE_SETTINGS: 258,
    DIVE_GAS: 259,
    DIVE_ALARM: 262,
    DIVE_SUMMARY: 268,
};

/**
 * FIT Record Message Fields (Message ID 20 - sample data)
 */
const RECORD_FIELD = {
    TIMESTAMP: 253,          // uint32, seconds since FIT epoch
    POSITION_LAT: 0,         // sint32, semicircles
    POSITION_LONG: 1,        // sint32, semicircles
    ALTITUDE: 2,             // uint16, meters × 5 - 500
    HEART_RATE: 3,           // uint8, bpm
    DEPTH: 39,               // uint32, mm
    TEMPERATURE: 13,         // sint8, °C
    NEXT_STOP_DEPTH: 40,     // uint32, mm
    NEXT_STOP_TIME: 41,      // uint32, seconds
    TIME_TO_SURFACE: 42,     // uint32, seconds
    NDL_TIME: 43,            // uint32, seconds
    CNS_LOAD: 44,            // uint8, %
    N2_LOAD: 45,             // uint16, %
    AIR_TIME_REMAINING: 47,  // uint32, seconds
    PRESSURE_SAC: 48,        // uint16, mL/min
    VOLUME_SAC: 49,          // uint16, mL/min
    RMV: 50,                 // uint16, mL/min
    ASCENT_RATE: 51,         // sint32, mm/s
    PO2: 52,                 // uint8, % (0.01 bar)
    CORE_TEMPERATURE: 53,    // uint16, °C × 100
};

/**
 * FIT Dive Gas Message Fields (Message ID 259)
 */
const DIVE_GAS_FIELD = {
    MESSAGE_INDEX: 254,      // uint16, gas index
    HELIUM_CONTENT: 0,       // uint8, %
    OXYGEN_CONTENT: 1,       // uint8, %
    STATUS: 2,               // enum: 0=disabled, 1=enabled, 2=backup
    MODE: 3,                 // enum: 0=OC, 1=CCR
};

/**
 * FIT Dive Summary Message Fields (Message ID 268)
 */
const DIVE_SUMMARY_FIELD = {
    TIMESTAMP: 253,          // uint32, seconds
    REFERENCE_MESG: 0,       // uint16
    REFERENCE_INDEX: 1,      // uint16
    AVG_DEPTH: 2,            // uint32, mm
    MAX_DEPTH: 3,            // uint32, mm
    SURFACE_INTERVAL: 4,     // uint32, seconds
    START_CNS: 5,            // uint8, %
    END_CNS: 6,              // uint8, %
    START_N2: 7,             // uint16, %
    END_N2: 8,               // uint16, %
    O2_TOXICITY: 9,          // uint16, OTU
    DIVE_NUMBER: 10,         // uint32
    BOTTOM_TIME: 11,         // uint32, ms
    AVG_PRESSURE_SAC: 12,    // uint16, mL/min
    AVG_VOLUME_SAC: 13,      // uint16, mL/min
    AVG_RMV: 14,             // uint16, mL/min
    DESCENT_TIME: 15,        // uint32, ms
    ASCENT_TIME: 16,         // uint32, ms
    AVG_ASCENT_RATE: 17,     // sint32, mm/s
    AVG_DESCENT_RATE: 22,    // sint32, mm/s
    MAX_ASCENT_RATE: 23,     // sint32, mm/s
    MAX_DESCENT_RATE: 24,    // sint32, mm/s
    HANG_TIME: 25,           // uint32, ms
};

/**
 * Garmin Dive Sample
 */
export interface GarminSample {
    time: number;               // seconds from dive start
    depth: number;              // meters
    temperature?: number;       // Celsius
    heartRate?: number;         // bpm
    latitude?: number;          // degrees
    longitude?: number;         // degrees
    ndl?: number;               // seconds
    tts?: number;               // seconds
    cns?: number;               // %
    n2Load?: number;            // %
    ascentRate?: number;        // m/s
    stopDepth?: number;         // meters
    stopTime?: number;          // seconds
    airTimeRemaining?: number;  // seconds
    ppo2?: number;              // bar
    sac?: number;               // mL/min
    rmv?: number;               // mL/min
}

/**
 * Garmin Dive Summary
 */
export interface GarminDiveSummary {
    diveNumber: number;
    timestamp: Date;
    maxDepth: number;           // meters
    avgDepth: number;           // meters
    bottomTime: number;         // seconds
    surfaceInterval: number;    // seconds
    startCns: number;           // %
    endCns: number;             // %
    startN2: number;            // %
    endN2: number;              // %
    o2Toxicity: number;         // OTU
    ascentTime: number;         // seconds
    descentTime: number;        // seconds
    avgAscentRate: number;      // m/s
    avgDescentRate: number;     // m/s
    maxAscentRate: number;      // m/s
    maxDescentRate: number;     // m/s
    avgSac?: number;            // mL/min
    avgRmv?: number;            // mL/min
}

/**
 * Garmin Gas Mix
 */
export interface GarminGasMix {
    index: number;
    oxygen: number;             // %
    helium: number;             // %
    nitrogen: number;           // % (calculated)
    enabled: boolean;
    mode: 'OC' | 'CCR';
}

/**
 * FIT File Header
 */
interface FitHeader {
    headerSize: number;
    protocolVersion: number;
    profileVersion: number;
    dataSize: number;
    signature: string;
    crc?: number;
}

/**
 * FIT Record Definition
 */
interface FitDefinition {
    reserved: number;
    architecture: number;       // 0=little-endian, 1=big-endian
    globalMessageNumber: number;
    fieldCount: number;
    fields: Array<{
        fieldDefNum: number;
        size: number;
        baseType: number;
    }>;
}

export class GarminProtocol extends BaseProtocol {
    private mountPath: string = '';
    private fitFiles: string[] = [];

    get familyName(): string {
        return 'Garmin';
    }

    /**
     * Find mounted Garmin devices
     * Looks for removable drives with /Garmin folder
     */
    static async findDevices(): Promise<string[]> {
        const possiblePaths: string[] = [];

        if (process.platform === 'win32') {
            // Windows: Check drive letters D-Z
            for (let i = 68; i <= 90; i++) {
                const drive = `${String.fromCharCode(i)}:`;
                const garminPath = path.join(drive, 'Garmin');
                if (fs.existsSync(garminPath)) {
                    possiblePaths.push(drive);
                }
            }
        } else if (process.platform === 'darwin') {
            // macOS: Check /Volumes
            const volumesPath = '/Volumes';
            if (fs.existsSync(volumesPath)) {
                const volumes = fs.readdirSync(volumesPath);
                for (const volume of volumes) {
                    const garminPath = path.join(volumesPath, volume, 'Garmin');
                    if (fs.existsSync(garminPath)) {
                        possiblePaths.push(path.join(volumesPath, volume));
                    }
                }
            }
        } else {
            // Linux: Check /media and /mnt
            for (const basePath of ['/media', '/mnt']) {
                if (fs.existsSync(basePath)) {
                    const entries = fs.readdirSync(basePath);
                    for (const entry of entries) {
                        const garminPath = path.join(basePath, entry, 'Garmin');
                        if (fs.existsSync(garminPath)) {
                            possiblePaths.push(path.join(basePath, entry));
                        }
                    }
                }
            }
        }

        return possiblePaths;
    }

    async connect(path?: string): Promise<boolean> {
        try {
            const devices = path ? [path] : await GarminProtocol.findDevices();
            if (devices.length === 0) {
                console.error('No Garmin device found');
                return false;
            }

            this.mountPath = devices[0];
            console.log(`📁 Found Garmin device at: ${this.mountPath}`);

            // Scan for FIT files
            this.fitFiles = await this.scanForDiveFiles();
            console.log(`   Found ${this.fitFiles.length} FIT files`);

            // Read device info from first FIT file if available
            if (this.fitFiles.length > 0) {
                await this.readDeviceInfoFromFit(this.fitFiles[0]);
            }

            this.connected = true;
            return true;
        } catch (err) {
            console.error('Connection error:', err);
            return false;
        }
    }

    disconnect(): void {
        this.mountPath = '';
        this.fitFiles = [];
        this.connected = false;
    }

    /**
     * Scan for dive FIT files
     */
    private async scanForDiveFiles(): Promise<string[]> {
        const files: string[] = [];
        
        // Check both Activity and Dives folders
        const folders = [
            path.join(this.mountPath, 'Garmin', 'Activity'),
            path.join(this.mountPath, 'Garmin', 'Dives'),
        ];

        for (const folder of folders) {
            if (fs.existsSync(folder)) {
                const entries = fs.readdirSync(folder);
                for (const entry of entries) {
                    if (entry.toLowerCase().endsWith('.fit')) {
                        files.push(path.join(folder, entry));
                    }
                }
            }
        }

        // Sort by modification time (newest first)
        files.sort((a, b) => {
            const statA = fs.statSync(a);
            const statB = fs.statSync(b);
            return statB.mtimeMs - statA.mtimeMs;
        });

        return files;
    }

    /**
     * Read device info from a FIT file
     */
    private async readDeviceInfoFromFit(filePath: string): Promise<void> {
        try {
            const data = fs.readFileSync(filePath);
            const header = this.parseFitHeader(data);
            
            if (!header) {
                return;
            }

            // Parse file to find device_info message
            // This is a simplified implementation
            this.deviceInfo = {
                model: 0,  // Would come from device_info message
                firmware: header.profileVersion,
                serial: 0, // Would come from device_info message
                features: ['Garmin Descent']
            };

            console.log(`✅ Connected to Garmin device`);
            console.log(`   Profile version: ${header.profileVersion}`);
        } catch (err) {
            console.error('Error reading device info:', err);
        }
    }

    /**
     * Parse FIT file header
     */
    private parseFitHeader(data: Buffer): FitHeader | null {
        if (data.length < FIT_HEADER_SIZE) {
            return null;
        }

        const headerSize = data[0];
        const protocolVersion = data[1];
        const profileVersion = data.readUInt16LE(2);
        const dataSize = data.readUInt32LE(4);
        const signature = data.slice(8, 12).toString('ascii');

        if (signature !== FIT_SIGNATURE) {
            console.error('Invalid FIT signature');
            return null;
        }

        const header: FitHeader = {
            headerSize,
            protocolVersion,
            profileVersion,
            dataSize,
            signature,
        };

        // Optional CRC for FIT 2.0
        if (headerSize === 14) {
            header.crc = data.readUInt16LE(12);
        }

        return header;
    }

    async listDives(): Promise<string[]> {
        // Return list of FIT file paths
        return this.fitFiles;
    }

    async downloadDive(identifier: string): Promise<ProtocolDive | null> {
        try {
            const filePath = identifier;
            if (!fs.existsSync(filePath)) {
                console.error('FIT file not found:', filePath);
                return null;
            }

            const data = fs.readFileSync(filePath);
            
            // Create fingerprint from file modification time + size
            const stat = fs.statSync(filePath);
            const fingerprint = Buffer.alloc(8);
            fingerprint.writeUInt32LE(Math.floor(stat.mtimeMs / 1000), 0);
            fingerprint.writeUInt32LE(stat.size, 4);

            return {
                fingerprint,
                timestamp: Math.floor(stat.mtimeMs / 1000),
                data,
            };
        } catch (err) {
            console.error('Error downloading dive:', err);
            return null;
        }
    }

    /**
     * Parse FIT file and extract dive samples
     * This is a simplified parser for dive-specific data
     */
    parseFitFile(data: Buffer): {
        samples: GarminSample[];
        summary?: GarminDiveSummary;
        gases: GarminGasMix[];
    } {
        const samples: GarminSample[] = [];
        const gases: GarminGasMix[] = [];
        let summary: GarminDiveSummary | undefined;

        const header = this.parseFitHeader(data);
        if (!header) {
            return { samples, gases };
        }

        // Parse FIT records
        let offset = header.headerSize;
        const definitions = new Map<number, FitDefinition>();
        let diveStartTime: number | null = null;

        while (offset < header.headerSize + header.dataSize) {
            const recordHeader = data[offset++];
            
            if (recordHeader & 0x40) {
                // Definition message
                const localMsgType = recordHeader & 0x0F;
                const def = this.parseDefinition(data, offset);
                definitions.set(localMsgType, def);
                offset += 5 + def.fieldCount * 3;
            } else {
                // Data message
                const localMsgType = recordHeader & 0x0F;
                const def = definitions.get(localMsgType);
                
                if (!def) {
                    console.warn('Unknown message type:', localMsgType);
                    break;
                }

                const fields = this.parseFields(data, offset, def);
                offset += def.fields.reduce((sum, f) => sum + f.size, 0);

                // Process based on global message number
                switch (def.globalMessageNumber) {
                    case FIT_MESSAGE.RECORD:
                        const sample = this.parseRecordMessage(fields, diveStartTime || 0);
                        if (sample) {
                            samples.push(sample);
                            if (diveStartTime === null && fields.has(RECORD_FIELD.TIMESTAMP)) {
                                diveStartTime = fields.get(RECORD_FIELD.TIMESTAMP) as number;
                            }
                        }
                        break;

                    case FIT_MESSAGE.DIVE_GAS:
                        const gas = this.parseDiveGasMessage(fields);
                        if (gas) {
                            gases.push(gas);
                        }
                        break;

                    case FIT_MESSAGE.DIVE_SUMMARY:
                        summary = this.parseDiveSummaryMessage(fields) ?? undefined;
                        break;
                }
            }
        }

        return { samples, summary, gases };
    }

    /**
     * Parse definition message
     */
    private parseDefinition(data: Buffer, offset: number): FitDefinition {
        const reserved = data[offset];
        const architecture = data[offset + 1];
        const globalMessageNumber = architecture === 0 
            ? data.readUInt16LE(offset + 2)
            : data.readUInt16BE(offset + 2);
        const fieldCount = data[offset + 4];

        const fields: FitDefinition['fields'] = [];
        let fieldOffset = offset + 5;
        for (let i = 0; i < fieldCount; i++) {
            fields.push({
                fieldDefNum: data[fieldOffset],
                size: data[fieldOffset + 1],
                baseType: data[fieldOffset + 2],
            });
            fieldOffset += 3;
        }

        return { reserved, architecture, globalMessageNumber, fieldCount, fields };
    }

    /**
     * Parse fields from data message
     */
    private parseFields(data: Buffer, offset: number, def: FitDefinition): Map<number, number | bigint> {
        const fields = new Map<number, number | bigint>();
        let fieldOffset = offset;

        for (const field of def.fields) {
            const value = this.readFieldValue(data, fieldOffset, field.size, field.baseType, def.architecture);
            fields.set(field.fieldDefNum, value);
            fieldOffset += field.size;
        }

        return fields;
    }

    /**
     * Read field value based on base type
     */
    private readFieldValue(data: Buffer, offset: number, size: number, baseType: number, arch: number): number | bigint {
        const isLE = arch === 0;

        switch (baseType & 0x1F) {
            case 0x00: // enum
            case 0x02: // uint8
            case 0x0A: // uint8z
                return data[offset];
            case 0x01: // sint8
                return data.readInt8(offset);
            case 0x83: // sint16
                return isLE ? data.readInt16LE(offset) : data.readInt16BE(offset);
            case 0x84: // uint16
            case 0x8B: // uint16z
                return isLE ? data.readUInt16LE(offset) : data.readUInt16BE(offset);
            case 0x85: // sint32
                return isLE ? data.readInt32LE(offset) : data.readInt32BE(offset);
            case 0x86: // uint32
            case 0x8C: // uint32z
                return isLE ? data.readUInt32LE(offset) : data.readUInt32BE(offset);
            case 0x8D: // uint64
                return isLE ? data.readBigUInt64LE(offset) : data.readBigUInt64BE(offset);
            default:
                return data[offset];
        }
    }

    /**
     * Parse record message (sample data)
     */
    private parseRecordMessage(fields: Map<number, number | bigint>, startTime: number): GarminSample | null {
        const depth = fields.get(RECORD_FIELD.DEPTH);
        if (depth === undefined) {
            return null; // Not a dive sample
        }

        const timestamp = fields.get(RECORD_FIELD.TIMESTAMP) as number || 0;
        
        const sample: GarminSample = {
            time: timestamp - startTime,
            depth: (depth as number) / 1000, // mm to meters
        };

        // Temperature
        const temp = fields.get(RECORD_FIELD.TEMPERATURE);
        if (temp !== undefined) {
            sample.temperature = temp as number;
        }

        // Heart rate
        const hr = fields.get(RECORD_FIELD.HEART_RATE);
        if (hr !== undefined) {
            sample.heartRate = hr as number;
        }

        // GPS position
        const lat = fields.get(RECORD_FIELD.POSITION_LAT);
        const lon = fields.get(RECORD_FIELD.POSITION_LONG);
        if (lat !== undefined && lon !== undefined) {
            sample.latitude = this.semicirclesToDegrees(lat as number);
            sample.longitude = this.semicirclesToDegrees(lon as number);
        }

        // NDL
        const ndl = fields.get(RECORD_FIELD.NDL_TIME);
        if (ndl !== undefined) {
            sample.ndl = ndl as number;
        }

        // TTS
        const tts = fields.get(RECORD_FIELD.TIME_TO_SURFACE);
        if (tts !== undefined) {
            sample.tts = tts as number;
        }

        // CNS
        const cns = fields.get(RECORD_FIELD.CNS_LOAD);
        if (cns !== undefined) {
            sample.cns = cns as number;
        }

        // N2 load
        const n2 = fields.get(RECORD_FIELD.N2_LOAD);
        if (n2 !== undefined) {
            sample.n2Load = n2 as number;
        }

        // Ascent rate
        const ascentRate = fields.get(RECORD_FIELD.ASCENT_RATE);
        if (ascentRate !== undefined) {
            sample.ascentRate = (ascentRate as number) / 1000; // mm/s to m/s
        }

        // Stop depth/time
        const stopDepth = fields.get(RECORD_FIELD.NEXT_STOP_DEPTH);
        if (stopDepth !== undefined) {
            sample.stopDepth = (stopDepth as number) / 1000;
        }
        const stopTime = fields.get(RECORD_FIELD.NEXT_STOP_TIME);
        if (stopTime !== undefined) {
            sample.stopTime = stopTime as number;
        }

        // Air time remaining
        const atr = fields.get(RECORD_FIELD.AIR_TIME_REMAINING);
        if (atr !== undefined) {
            sample.airTimeRemaining = atr as number;
        }

        // PPO2
        const ppo2 = fields.get(RECORD_FIELD.PO2);
        if (ppo2 !== undefined) {
            sample.ppo2 = (ppo2 as number) / 100; // % to bar
        }

        // SAC
        const sac = fields.get(RECORD_FIELD.PRESSURE_SAC);
        if (sac !== undefined) {
            sample.sac = sac as number;
        }

        // RMV
        const rmv = fields.get(RECORD_FIELD.RMV);
        if (rmv !== undefined) {
            sample.rmv = rmv as number;
        }

        return sample;
    }

    /**
     * Parse dive gas message
     */
    private parseDiveGasMessage(fields: Map<number, number | bigint>): GarminGasMix | null {
        const index = fields.get(DIVE_GAS_FIELD.MESSAGE_INDEX);
        const o2 = fields.get(DIVE_GAS_FIELD.OXYGEN_CONTENT);
        const he = fields.get(DIVE_GAS_FIELD.HELIUM_CONTENT);

        if (index === undefined || o2 === undefined) {
            return null;
        }

        const status = fields.get(DIVE_GAS_FIELD.STATUS) as number || 0;
        const mode = fields.get(DIVE_GAS_FIELD.MODE) as number || 0;

        return {
            index: index as number,
            oxygen: o2 as number,
            helium: (he as number) || 0,
            nitrogen: 100 - (o2 as number) - ((he as number) || 0),
            enabled: status !== 0,
            mode: mode === 1 ? 'CCR' : 'OC',
        };
    }

    /**
     * Parse dive summary message
     */
    private parseDiveSummaryMessage(fields: Map<number, number | bigint>): GarminDiveSummary | null {
        const maxDepth = fields.get(DIVE_SUMMARY_FIELD.MAX_DEPTH);
        if (maxDepth === undefined) {
            return null;
        }

        const timestamp = fields.get(DIVE_SUMMARY_FIELD.TIMESTAMP) as number || 0;

        return {
            diveNumber: (fields.get(DIVE_SUMMARY_FIELD.DIVE_NUMBER) as number) || 0,
            timestamp: this.fitTimestampToDate(timestamp),
            maxDepth: (maxDepth as number) / 1000,
            avgDepth: ((fields.get(DIVE_SUMMARY_FIELD.AVG_DEPTH) as number) || 0) / 1000,
            bottomTime: ((fields.get(DIVE_SUMMARY_FIELD.BOTTOM_TIME) as number) || 0) / 1000,
            surfaceInterval: (fields.get(DIVE_SUMMARY_FIELD.SURFACE_INTERVAL) as number) || 0,
            startCns: (fields.get(DIVE_SUMMARY_FIELD.START_CNS) as number) || 0,
            endCns: (fields.get(DIVE_SUMMARY_FIELD.END_CNS) as number) || 0,
            startN2: (fields.get(DIVE_SUMMARY_FIELD.START_N2) as number) || 0,
            endN2: (fields.get(DIVE_SUMMARY_FIELD.END_N2) as number) || 0,
            o2Toxicity: (fields.get(DIVE_SUMMARY_FIELD.O2_TOXICITY) as number) || 0,
            ascentTime: ((fields.get(DIVE_SUMMARY_FIELD.ASCENT_TIME) as number) || 0) / 1000,
            descentTime: ((fields.get(DIVE_SUMMARY_FIELD.DESCENT_TIME) as number) || 0) / 1000,
            avgAscentRate: ((fields.get(DIVE_SUMMARY_FIELD.AVG_ASCENT_RATE) as number) || 0) / 1000,
            avgDescentRate: ((fields.get(DIVE_SUMMARY_FIELD.AVG_DESCENT_RATE) as number) || 0) / 1000,
            maxAscentRate: ((fields.get(DIVE_SUMMARY_FIELD.MAX_ASCENT_RATE) as number) || 0) / 1000,
            maxDescentRate: ((fields.get(DIVE_SUMMARY_FIELD.MAX_DESCENT_RATE) as number) || 0) / 1000,
            avgSac: (fields.get(DIVE_SUMMARY_FIELD.AVG_PRESSURE_SAC) as number) || undefined,
            avgRmv: (fields.get(DIVE_SUMMARY_FIELD.AVG_RMV) as number) || undefined,
        };
    }

    /**
     * Convert semicircles to degrees (for GPS coordinates)
     */
    private semicirclesToDegrees(semicircles: number): number {
        return semicircles * (180 / Math.pow(2, 31));
    }

    /**
     * Convert FIT timestamp to JavaScript Date
     */
    private fitTimestampToDate(fitTimestamp: number): Date {
        return new Date((fitTimestamp + FIT_EPOCH) * 1000);
    }

    /**
     * Convert JavaScript Date to FIT timestamp
     */
    static dateToFitTimestamp(date: Date): number {
        return Math.floor(date.getTime() / 1000) - FIT_EPOCH;
    }
}
