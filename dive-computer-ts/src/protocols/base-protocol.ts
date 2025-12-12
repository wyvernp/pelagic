/**
 * Base Protocol Class
 * 
 * Abstract base class for all dive computer protocol implementations.
 * Each manufacturer/family has its own protocol that extends this class.
 */

import { DCStatus } from '../types/enums';

export interface ProtocolDeviceInfo {
    model: number;
    firmware: number;
    serial: number;
    hardwareVersion?: number;
    features?: string[];
}

export interface ProtocolDive {
    fingerprint: Buffer;
    timestamp: number;
    data: Buffer;
}

export interface ProgressCallback {
    (current: number, maximum: number): void;
}

export interface DiveCallback {
    (dive: ProtocolDive, index: number, total: number): boolean;
}

export abstract class BaseProtocol {
    protected connected: boolean = false;
    protected deviceInfo: ProtocolDeviceInfo | null = null;
    protected fingerprint: Buffer = Buffer.alloc(0);

    /**
     * Get the protocol family name
     */
    abstract get familyName(): string;

    /**
     * Connect to the dive computer
     */
    abstract connect(path?: string): Promise<boolean>;

    /**
     * Disconnect from the dive computer
     */
    abstract disconnect(): void;

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Get device information after connecting
     */
    getDeviceInfo(): ProtocolDeviceInfo | null {
        return this.deviceInfo;
    }

    /**
     * Set fingerprint for incremental downloads
     * Only dives newer than the fingerprint will be downloaded
     */
    setFingerprint(fingerprint: Buffer): void {
        this.fingerprint = fingerprint;
    }

    /**
     * Get the list of dives on the device
     */
    abstract listDives(): Promise<string[]>;

    /**
     * Download a specific dive by filename/identifier
     */
    abstract downloadDive(identifier: string): Promise<ProtocolDive | null>;

    /**
     * Download all dives with progress callback
     */
    async downloadAllDives(
        diveCallback?: DiveCallback,
        progressCallback?: ProgressCallback
    ): Promise<ProtocolDive[]> {
        const diveList = await this.listDives();
        const dives: ProtocolDive[] = [];
        
        const total = diveList.length;
        
        for (let i = 0; i < diveList.length; i++) {
            if (progressCallback) {
                progressCallback(i, total);
            }
            
            const dive = await this.downloadDive(diveList[i]);
            if (dive) {
                dives.push(dive);
                
                // Check fingerprint - stop if we've reached a previously downloaded dive
                if (this.fingerprint.length > 0 && 
                    dive.fingerprint.equals(this.fingerprint)) {
                    break;
                }
                
                if (diveCallback) {
                    const shouldContinue = diveCallback(dive, i, total);
                    if (!shouldContinue) {
                        break;
                    }
                }
            }
        }
        
        if (progressCallback) {
            progressCallback(total, total);
        }
        
        return dives;
    }

    /**
     * Sync time with the dive computer (if supported)
     */
    async syncTime(datetime: Date): Promise<boolean> {
        console.log(`Time sync not implemented for ${this.familyName}`);
        return false;
    }

    /**
     * Read raw data from device (if supported)
     */
    async readRaw(address: number, size: number): Promise<Buffer | null> {
        console.log(`Raw read not implemented for ${this.familyName}`);
        return null;
    }
}

/**
 * Checksum utilities used by many protocols
 */
export const Checksum = {
    /**
     * Simple 8-bit additive checksum
     */
    add8(data: Buffer, offset: number = 0, length?: number): number {
        const len = length ?? data.length - offset;
        let sum = 0;
        for (let i = 0; i < len; i++) {
            sum = (sum + data[offset + i]) & 0xFF;
        }
        return sum;
    },

    /**
     * 16-bit additive checksum
     */
    add16(data: Buffer, offset: number = 0, length?: number): number {
        const len = length ?? data.length - offset;
        let sum = 0;
        for (let i = 0; i < len; i += 2) {
            if (i + 1 < len) {
                sum = (sum + data.readUInt16LE(offset + i)) & 0xFFFF;
            } else {
                sum = (sum + data[offset + i]) & 0xFFFF;
            }
        }
        return sum;
    },

    /**
     * XOR checksum
     */
    xor8(data: Buffer, offset: number = 0, length?: number, init: number = 0): number {
        const len = length ?? data.length - offset;
        let result = init;
        for (let i = 0; i < len; i++) {
            result ^= data[offset + i];
        }
        return result;
    },

    /**
     * CRC-16 CCITT (used by many dive computers)
     */
    crc16ccitt(data: Buffer, offset: number = 0, length?: number): number {
        const len = length ?? data.length - offset;
        let crc = 0xFFFF;
        for (let i = 0; i < len; i++) {
            crc ^= data[offset + i] << 8;
            for (let j = 0; j < 8; j++) {
                if (crc & 0x8000) {
                    crc = (crc << 1) ^ 0x1021;
                } else {
                    crc = crc << 1;
                }
            }
            crc &= 0xFFFF;
        }
        return crc;
    },

    /**
     * CRC-32 (reflected polynomial, used by Suunto EONSTEEL)
     */
    crc32r(data: Buffer, offset: number = 0, length?: number): number {
        const table = CRC32_TABLE;
        const len = length ?? data.length - offset;
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < len; i++) {
            crc = (crc >>> 8) ^ table[(crc ^ data[offset + i]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
};

// Pre-computed CRC32 lookup table
const CRC32_TABLE = (() => {
    const table: number[] = [];
    for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = (crc >>> 1) ^ 0xEDB88320;
            } else {
                crc = crc >>> 1;
            }
        }
        table[i] = crc >>> 0;
    }
    return table;
})();

/**
 * SLIP encoding/decoding (used by Shearwater)
 */
export const SLIP = {
    END: 0xC0,
    ESC: 0xDB,
    ESC_END: 0xDC,
    ESC_ESC: 0xDD,

    encode(data: Buffer): Buffer {
        const result: number[] = [];
        for (const byte of data) {
            if (byte === SLIP.END) {
                result.push(SLIP.ESC, SLIP.ESC_END);
            } else if (byte === SLIP.ESC) {
                result.push(SLIP.ESC, SLIP.ESC_ESC);
            } else {
                result.push(byte);
            }
        }
        result.push(SLIP.END);
        return Buffer.from(result);
    },

    decode(data: Buffer): Buffer {
        const result: number[] = [];
        let escaped = false;
        
        for (const byte of data) {
            if (escaped) {
                if (byte === SLIP.ESC_END) {
                    result.push(SLIP.END);
                } else if (byte === SLIP.ESC_ESC) {
                    result.push(SLIP.ESC);
                } else {
                    result.push(byte);
                }
                escaped = false;
            } else if (byte === SLIP.ESC) {
                escaped = true;
            } else if (byte === SLIP.END) {
                break;
            } else {
                result.push(byte);
            }
        }
        
        return Buffer.from(result);
    }
};

/**
 * Array utilities for protocol implementations
 */
export const ArrayUtils = {
    /**
     * Search forward for a pattern in data
     */
    searchForward(data: Buffer, pattern: Buffer, start: number = 0): number {
        for (let i = start; i <= data.length - pattern.length; i++) {
            let found = true;
            for (let j = 0; j < pattern.length; j++) {
                if (data[i + j] !== pattern[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return i;
        }
        return -1;
    },

    /**
     * Search backward for a pattern in data
     */
    searchBackward(data: Buffer, pattern: Buffer, start?: number): number {
        const startPos = start ?? data.length - pattern.length;
        for (let i = startPos; i >= 0; i--) {
            let found = true;
            for (let j = 0; j < pattern.length; j++) {
                if (data[i + j] !== pattern[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return i;
        }
        return -1;
    },

    /**
     * Convert hex string to number
     */
    hexToNum(str: string): number {
        return parseInt(str.replace(/[^0-9a-fA-F]/g, ''), 16);
    },

    /**
     * Convert BCD to decimal
     */
    bcd2dec(bcd: number): number {
        return ((bcd >> 4) & 0x0F) * 10 + (bcd & 0x0F);
    }
};
