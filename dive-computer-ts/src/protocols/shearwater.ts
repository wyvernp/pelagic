/**
 * Shearwater Protocol Implementation
 * 
 * Supports: Predator, Petrel, Petrel 2, Petrel 3, Perdix, Perdix AI, Perdix 2,
 *           Teric, Nerd, Nerd 2, Peregrine, Peregrine TX, Tern, Tern TX
 * Based on libdivecomputer's shearwater_petrel.c and shearwater_common.c
 * 
 * Transport:
 * - Serial: 115200 baud, 8N1, no flow control
 * - BLE: Petrel 3, Perdix 2, Teric, Nerd 2, Peregrine, Tern
 * 
 * Uses SLIP (Serial Line Internet Protocol) encoding over serial or BLE.
 * Data is compressed using LRE (Length-Run Encoding) + XOR.
 */

import { SerialPort } from 'serialport';
import { BaseProtocol, ProtocolDeviceInfo, ProtocolDive, SLIP, Checksum, ArrayUtils } from './base-protocol';

// Constants
const SZ_PACKET = 254;
const MANIFEST_ADDR = 0xE0000000;
const MANIFEST_SIZE = 0x600;  // 1536 bytes
const DIVE_SIZE = 0xFFFFFF;
const RECORD_SIZE = 0x20;     // 32 bytes per manifest record
const RECORD_COUNT = MANIFEST_SIZE / RECORD_SIZE;  // 48 max records

// Command IDs (UDS - Unified Diagnostic Services)
const RDBI_REQUEST = 0x22;   // Read Data By Identifier
const RDBI_RESPONSE = 0x62;
const WDBI_REQUEST = 0x2E;   // Write Data By Identifier
const WDBI_RESPONSE = 0x6E;
const NAK = 0x7F;            // Negative acknowledgment

// Data Block IDs
const ID_SERIAL = 0x8010;
const ID_FIRMWARE = 0x8011;
const ID_HARDWARE = 0x8012;
const ID_LOGUPLOAD = 0x8020;
const ID_TIME_LOCAL = 0x9001;
const ID_TIME_UTC = 0x9003;
const ID_TIME_OFFSET = 0x9005;
const ID_TIME_DST = 0x9007;

// Model numbers - updated with all known devices
const PREDATOR = 1;
const PETREL = 2;
const PETREL2 = 3;
const PETREL3 = 4;
const NERD = 5;
const NERD2 = 6;
const PERDIX = 7;
const PERDIXAI = 8;
const PERDIX2 = 9;
const TERIC = 10;
const PEREGRINE = 11;
const PEREGRINE_TX = 12;
const TERN = 13;
const TERN_TX = 14;

// Hardware type to model mapping - comprehensive list
const HARDWARE_MODELS: Record<number, number> = {
    // Predator
    0x0101: PREDATOR, 0x0202: PREDATOR,
    // Petrel
    0x0404: PETREL, 0x0909: PETREL,
    // Petrel 2
    0x0505: PETREL2, 0x0808: PETREL2, 0x0838: PETREL2, 0x08A5: PETREL2,
    0x0B0B: PETREL2, 0x7828: PETREL2, 0x7B2C: PETREL2, 0x8838: PETREL2,
    // Petrel 3
    0xB407: PETREL3,
    // NERD
    0x0606: NERD, 0x0A0A: NERD,
    // NERD 2
    0x0E0D: NERD2, 0x7E2D: NERD2,
    // Perdix
    0x0707: PERDIX,
    // Perdix AI
    0x0C0D: PERDIXAI, 0x7C2D: PERDIXAI, 0x8D6C: PERDIXAI, 0x425B: PERDIXAI,
    // Perdix 2
    0x704C: PERDIX2, 0xC407: PERDIX2, 0xC964: PERDIX2, 0x9C64: PERDIX2,
    // Teric
    0x0F0F: TERIC, 0x1F0A: TERIC, 0x1F0F: TERIC,
    // Peregrine
    0x1512: PEREGRINE,
    // Peregrine TX
    0x1712: PEREGRINE_TX, 0x813A: PEREGRINE_TX,
    // Tern / Tern TX
    0xC0E0: TERN,
};

const MODEL_NAMES: Record<number, string> = {
    [PREDATOR]: 'Predator',
    [PETREL]: 'Petrel',
    [PETREL2]: 'Petrel 2',
    [PETREL3]: 'Petrel 3',
    [NERD]: 'NERD',
    [NERD2]: 'NERD 2',
    [PERDIX]: 'Perdix',
    [PERDIXAI]: 'Perdix AI',
    [PERDIX2]: 'Perdix 2',
    [TERIC]: 'Teric',
    [PEREGRINE]: 'Peregrine',
    [PEREGRINE_TX]: 'Peregrine TX',
    [TERN]: 'Tern',
    [TERN_TX]: 'Tern TX',
};

// BLE Name prefixes for device discovery
const BLE_NAME_PREFIXES: Record<string, number[]> = {
    'Predator': [PREDATOR],
    'Petrel': [PETREL, PETREL2],
    'Petrel 3': [PETREL3],
    'NERD': [NERD],
    'NERD 2': [NERD2],
    'Perdix': [PERDIX, PERDIXAI],
    'Perdix 2': [PERDIX2],
    'Teric': [TERIC],
    'Peregrine': [PEREGRINE],
    'Peregrine TX': [PEREGRINE_TX],
    'Tern': [TERN, TERN_TX],
};

// Models with AI (Air Integration) support
const MODELS_WITH_AI = [PERDIXAI, PERDIX2, TERIC, PETREL3, PEREGRINE_TX, TERN_TX];

/**
 * Manifest Record Structure (32 bytes)
 * Offset  Size  Type      Field
 * 0       4     uint32_be Dive number
 * 4       4     uint32_be Timestamp (Unix epoch)
 * 8       4     uint32_be Duration (seconds)
 * 12      2     uint16_be Max depth (cm)
 * 14      1     uint8     Average depth
 * 15      1     uint8     Min temp (°C + 128)
 * 16      4     uint32_be Dive data address
 * 20      4     uint32_be Dive data size
 * 24      4     uint32_be Opening address
 * 28      4     uint32_be Closing address
 */
interface ManifestRecord {
    diveNumber: number;
    timestamp: number;
    duration: number;
    maxDepth: number;      // cm
    avgDepth: number;
    minTemp: number;       // Celsius
    dataAddress: number;
    dataSize: number;
    openingAddress: number;
    closingAddress: number;
}

/**
 * Shearwater Dive Sample Structure
 * Standard sample (Predator/Petrel/Perdix) - varies by firmware
 * Extended sample (with AI) - Petrel 3, Perdix 2, Teric
 */
export interface ShearwaterSample {
    time: number;           // seconds
    depth: number;          // meters (from 1/10 foot)
    temperature: number;    // Celsius (from 1/10 °F)
    status: number;         // 0=OC, 1=CCR, 2=SCR
    ppo2: number;           // bar (from 1/100 bar)
    ppo2Sensor1?: number;   // bar
    ppo2Sensor2?: number;   // bar
    ppo2Sensor3?: number;   // bar
    batteryType: number;    // 0=1.5V, 1=3.0V, 2=3.6V
    setpoint: number;       // bar (from 1/100 bar)
    cns: number;            // % (from 1/100 %)
    gf99: number;           // % gradient factor
    decoStatus: number;     // 0=NDL, 1-100=stop depth ft
    ndlDecoTime: number;    // minutes
    tts: number;            // minutes
    // Extended fields for AI models
    currentGasO2?: number;  // %
    currentGasHe?: number;  // %
    votingLogic?: number;
    activeSensors?: number; // bitmask
    tanks?: Array<{
        pressure: number;   // psi -> bar
        rbt: number;        // minutes
        id: number;
        battery: number;    // %
    }>;
}

export class ShearwaterProtocol extends BaseProtocol {
    private port: SerialPort | null = null;
    private rxBuffer: Buffer = Buffer.alloc(0);
    private isBLE: boolean = false;

    get familyName(): string {
        return 'Shearwater';
    }

    /**
     * Find available Shearwater devices
     */
    static async findDevices(): Promise<string[]> {
        const ports = await SerialPort.list();
        // Shearwater typically uses FTDI or similar USB-serial adapters
        // For BLE, discovery is handled separately
        return ports
            .filter(p => p.manufacturer?.toLowerCase().includes('ftdi') ||
                        p.manufacturer?.toLowerCase().includes('shearwater'))
            .map(p => p.path);
    }

    async connect(path?: string): Promise<boolean> {
        try {
            const portPath = path || (await ShearwaterProtocol.findDevices())[0];
            if (!portPath) {
                console.error('No Shearwater device found');
                return false;
            }

            this.port = new SerialPort({
                path: portPath,
                baudRate: 115200,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
            });

            await new Promise<void>((resolve, reject) => {
                this.port!.once('open', resolve);
                this.port!.once('error', reject);
            });

            // Setup data handler
            this.port.on('data', (data: Buffer) => {
                this.rxBuffer = Buffer.concat([this.rxBuffer, data]);
            });

            // Wait for device to settle
            await this.sleep(300);
            this.port.flush();

            // Read device info
            await this.readDeviceInfo();

            this.connected = true;
            return true;
        } catch (err) {
            console.error('Connection error:', err);
            return false;
        }
    }

    disconnect(): void {
        if (this.port?.isOpen) {
            // Send shutdown command
            const shutdownCmd = Buffer.from([0x2E, 0x90, 0x20, 0x00]);
            this.transfer(shutdownCmd, 0).catch(() => {});
            
            this.port.close();
            this.port = null;
        }
        this.connected = false;
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Send a SLIP-encoded packet
     */
    private async slipWrite(data: Buffer): Promise<void> {
        if (!this.port) throw new Error('Not connected');
        
        const encoded = SLIP.encode(data);
        
        return new Promise((resolve, reject) => {
            this.port!.write(encoded, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Read a SLIP-encoded packet
     */
    private async slipRead(timeout: number = 3000): Promise<Buffer> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const endIdx = this.rxBuffer.indexOf(SLIP.END);
            if (endIdx >= 0) {
                const packet = this.rxBuffer.slice(0, endIdx);
                this.rxBuffer = this.rxBuffer.slice(endIdx + 1);
                return SLIP.decode(packet);
            }
            await this.sleep(10);
        }
        
        throw new Error('Read timeout');
    }

    /**
     * Transfer command and receive response
     */
    private async transfer(input: Buffer, outputSize: number): Promise<Buffer> {
        if (!this.port) throw new Error('Not connected');

        // Build request packet
        const packet = Buffer.alloc(input.length + 4);
        packet[0] = 0xFF;
        packet[1] = 0x01;
        packet[2] = input.length + 1;
        packet[3] = 0x00;
        input.copy(packet, 4);

        // Send
        await this.slipWrite(packet);

        if (outputSize === 0) {
            return Buffer.alloc(0);
        }

        // Receive
        const response = await this.slipRead();

        // Validate header
        if (response.length < 4 || 
            response[0] !== 0x01 || 
            response[1] !== 0xFF || 
            response[3] !== 0x00) {
            throw new Error('Invalid packet header');
        }

        const length = response[2];
        if (length < 1 || length - 1 > outputSize) {
            throw new Error('Invalid packet length');
        }

        return response.slice(4, 4 + length - 1);
    }

    /**
     * Read data block by ID (RDBI command)
     */
    private async rdbi(id: number, maxSize: number): Promise<Buffer> {
        const request = Buffer.from([
            RDBI_REQUEST,
            (id >> 8) & 0xFF,
            id & 0xFF
        ]);

        const response = await this.transfer(request, SZ_PACKET);

        if (response.length < 3) {
            throw new Error('Response too short');
        }

        // Check for NAK
        if (response[0] === NAK) {
            throw new Error(`NAK received: ${response[2]}`);
        }

        // Verify response
        if (response[0] !== RDBI_RESPONSE ||
            response[1] !== ((id >> 8) & 0xFF) ||
            response[2] !== (id & 0xFF)) {
            throw new Error('Unexpected response');
        }

        return response.slice(3);
    }

    /**
     * Write data block by ID (WDBI command)
     */
    private async wdbi(id: number, data: Buffer): Promise<void> {
        const request = Buffer.alloc(3 + data.length);
        request[0] = WDBI_REQUEST;
        request[1] = (id >> 8) & 0xFF;
        request[2] = id & 0xFF;
        data.copy(request, 3);

        const response = await this.transfer(request, SZ_PACKET);

        if (response.length < 3) {
            throw new Error('Response too short');
        }

        if (response[0] !== WDBI_RESPONSE ||
            response[1] !== ((id >> 8) & 0xFF) ||
            response[2] !== (id & 0xFF)) {
            throw new Error('Write failed');
        }
    }

    /**
     * Download data from device
     */
    private async download(address: number, size: number, compressed: boolean = true): Promise<Buffer> {
        // Init request
        const reqInit = Buffer.from([
            0x35,
            compressed ? 0x10 : 0x00,
            0x34,
            (address >> 24) & 0xFF,
            (address >> 16) & 0xFF,
            (address >> 8) & 0xFF,
            address & 0xFF,
            (size >> 16) & 0xFF,
            (size >> 8) & 0xFF,
            size & 0xFF
        ]);

        const initResponse = await this.transfer(reqInit, 3);
        if (initResponse.length !== 3 || 
            initResponse[0] !== 0x75 || 
            initResponse[1] !== 0x10) {
            throw new Error('Init failed');
        }

        // Download blocks
        const buffer: number[] = [];
        let block = 1;
        let nbytes = 0;
        let done = false;

        while (nbytes < size && !done) {
            const reqBlock = Buffer.from([0x36, block]);
            const response = await this.transfer(reqBlock, SZ_PACKET);

            if (response.length < 2 || 
                response[0] !== 0x76 || 
                response[1] !== block) {
                throw new Error('Block read failed');
            }

            const data = response.slice(2);
            
            if (compressed) {
                // LRE decompression
                const decompressed = this.decompressLRE(data);
                if (decompressed.done) {
                    done = true;
                }
                buffer.push(...decompressed.data);
            } else {
                buffer.push(...data);
            }

            nbytes += data.length;
            block++;
        }

        // Quit request
        const reqQuit = Buffer.from([0x37]);
        const quitResponse = await this.transfer(reqQuit, 2);
        if (quitResponse.length !== 2 || 
            quitResponse[0] !== 0x77 || 
            quitResponse[1] !== 0x00) {
            console.warn('Quit response unexpected');
        }

        // XOR decompression phase
        const result = Buffer.from(buffer);
        if (compressed) {
            this.decompressXOR(result);
        }

        return result;
    }

    /**
     * LRE (Run Length Encoding) decompression
     */
    private decompressLRE(data: Buffer): { data: number[], done: boolean } {
        const result: number[] = [];
        let done = false;

        // Process as 9-bit values
        const nbits = data.length * 8;
        let offset = 0;

        while (offset + 9 <= nbits) {
            const byteIdx = Math.floor(offset / 8);
            const bitIdx = offset % 8;
            const shift = 16 - (bitIdx + 9);
            const value = ((data[byteIdx] << 8) | (data[byteIdx + 1] || 0)) >> shift & 0x1FF;

            if (value & 0x100) {
                // Data byte
                result.push(value & 0xFF);
            } else if (value === 0) {
                // End of stream
                done = true;
                break;
            } else {
                // Run of zeros
                for (let i = 0; i < value; i++) {
                    result.push(0);
                }
            }

            offset += 9;
        }

        return { data: result, done };
    }

    /**
     * XOR decompression (in-place)
     */
    private decompressXOR(data: Buffer): void {
        for (let i = 32; i < data.length; i++) {
            data[i] ^= data[i - 32];
        }
    }

    /**
     * Read device information
     */
    private async readDeviceInfo(): Promise<void> {
        // Read serial number
        const serialData = await this.rdbi(ID_SERIAL, 8);
        const serialHex = serialData.toString('hex');
        const serial = parseInt(serialHex, 16);

        // Read firmware version
        const firmwareData = await this.rdbi(ID_FIRMWARE, 12);
        const firmwareStr = firmwareData.toString('ascii').replace(/\0/g, '');
        const firmware = parseInt(firmwareStr.slice(1)) || 0;

        // Read hardware type
        const hardwareData = await this.rdbi(ID_HARDWARE, 2);
        const hardware = (hardwareData[0] << 8) | hardwareData[1];
        const model = HARDWARE_MODELS[hardware] || 0;

        this.deviceInfo = {
            model,
            firmware,
            serial,
            hardwareVersion: hardware,
            features: [MODEL_NAMES[model] || 'Unknown']
        };

        console.log(`✅ Connected to ${MODEL_NAMES[model] || 'Shearwater'}`);
        console.log(`   Serial: ${serial}`);
        console.log(`   Firmware: ${firmware}`);
    }

    async listDives(): Promise<string[]> {
        const dives: string[] = [];

        // Read manifest
        const manifest = await this.download(MANIFEST_ADDR, MANIFEST_SIZE, false);

        // Parse records
        for (let offset = 0; offset < manifest.length; offset += RECORD_SIZE) {
            const header = (manifest[offset] << 8) | manifest[offset + 1];
            
            if (header === 0x5A23) {
                // Deleted dive
                continue;
            }
            
            if (header !== 0xA5C4) {
                // End of manifest
                break;
            }

            // Check fingerprint
            if (this.fingerprint.length >= 4) {
                const fp = manifest.slice(offset + 4, offset + 8);
                if (fp.equals(this.fingerprint)) {
                    break;
                }
            }

            // Get dive address
            const address = manifest.readUInt32BE(offset + 20);
            dives.push(address.toString(16).padStart(8, '0'));
        }

        return dives;
    }

    async downloadDive(identifier: string): Promise<ProtocolDive | null> {
        const address = parseInt(identifier, 16);
        
        // Determine base address from logbook type
        const logupload = await this.rdbi(ID_LOGUPLOAD, 9);
        let baseAddr = logupload.readUInt32BE(1);
        
        // Map to supported format
        if (baseAddr === 0xDD000000 || baseAddr === 0xC0000000 || baseAddr === 0x90000000) {
            baseAddr = 0xC0000000;
        }

        console.log(`📥 Downloading dive at 0x${identifier}...`);
        
        const data = await this.download(baseAddr + address, DIVE_SIZE, true);

        // Extract fingerprint (offset 12, 4 bytes)
        const fingerprint = data.slice(12, 16);
        
        // Parse timestamp from dive data
        const timestamp = data.readUInt32BE(4);

        return {
            fingerprint,
            timestamp,
            data
        };
    }

    async syncTime(datetime: Date): Promise<boolean> {
        try {
            const hardware = this.deviceInfo?.hardwareVersion || 0;
            const model = HARDWARE_MODELS[hardware] || 0;

            const timestamp = Math.floor(datetime.getTime() / 1000);
            const data = Buffer.alloc(4);
            data.writeUInt32BE(timestamp, 0);

            if (model === TERIC) {
                // Teric uses UTC time
                await this.wdbi(ID_TIME_UTC, data);
                
                const offset = -datetime.getTimezoneOffset() * 60;
                const offsetData = Buffer.alloc(4);
                offsetData.writeInt32BE(offset, 0);
                await this.wdbi(ID_TIME_OFFSET, offsetData);

                const dstData = Buffer.alloc(4);
                await this.wdbi(ID_TIME_DST, dstData);
            } else {
                // Other models use local time
                await this.wdbi(ID_TIME_LOCAL, data);
            }

            return true;
        } catch (err) {
            console.error('Time sync failed:', err);
            return false;
        }
    }

    /**
     * Parse manifest record from raw data
     */
    parseManifestRecord(data: Buffer, offset: number = 0): ManifestRecord | null {
        if (offset + RECORD_SIZE > data.length) {
            return null;
        }

        const header = data.readUInt16BE(offset);
        if (header !== 0xA5C4) {
            return null; // Invalid or deleted record
        }

        return {
            diveNumber: data.readUInt32BE(offset + 0),
            timestamp: data.readUInt32BE(offset + 4),
            duration: data.readUInt32BE(offset + 8),
            maxDepth: data.readUInt16BE(offset + 12),
            avgDepth: data[offset + 14],
            minTemp: data[offset + 15] - 128, // Decode temperature
            dataAddress: data.readUInt32BE(offset + 16),
            dataSize: data.readUInt32BE(offset + 20),
            openingAddress: data.readUInt32BE(offset + 24),
            closingAddress: data.readUInt32BE(offset + 28),
        };
    }

    /**
     * Parse dive samples from raw dive data
     * Sample format varies by firmware and model
     * 
     * Standard Sample (17-19 bytes):
     * Offset  Size  Type      Field
     * 0       2     uint16_le Depth (1/10 foot)
     * 2       2     uint16_le Temperature (1/10 °F)
     * 4       1     uint8     Status (0=OC, 1=CCR, 2=SCR)
     * 5       1     uint8     PPO2 (1/100 bar)
     * 6       1     uint8     PPO2 Sensor 1
     * 7       1     uint8     PPO2 Sensor 2
     * 8       1     uint8     PPO2 Sensor 3
     * 9       1     uint8     Battery type
     * 10      1     uint8     Setpoint (1/100 bar)
     * 11      2     uint16_le CNS (1/100 %)
     * 13      1     uint8     GF99 (%)
     * 14      1     uint8     Deco status (0=NDL, 1-100=stop ft)
     * 15      2     uint16_le NDL/Deco time (minutes)
     * 17      2     uint16_le TTS (minutes)
     */
    parseSamples(data: Buffer, sampleInterval: number = 10): ShearwaterSample[] {
        const samples: ShearwaterSample[] = [];
        const model = this.deviceInfo?.model || 0;
        const hasAI = MODELS_WITH_AI.includes(model);
        
        // Standard sample size is 19 bytes, extended (AI) is larger
        const standardSampleSize = 19;
        const extendedSampleSize = hasAI ? 64 : standardSampleSize; // AI models have tank data
        
        let offset = 0;
        let time = 0;
        
        // Skip dive header (varies by firmware, typically 32-64 bytes)
        const headerSize = this.findSampleStart(data);
        offset = headerSize;

        while (offset + standardSampleSize <= data.length) {
            const sample: ShearwaterSample = {
                time,
                depth: this.feetToMeters(data.readUInt16LE(offset) / 10),
                temperature: this.fahrenheitToCelsius(data.readUInt16LE(offset + 2) / 10),
                status: data[offset + 4],
                ppo2: data[offset + 5] / 100,
                ppo2Sensor1: data[offset + 6] / 100,
                ppo2Sensor2: data[offset + 7] / 100,
                ppo2Sensor3: data[offset + 8] / 100,
                batteryType: data[offset + 9],
                setpoint: data[offset + 10] / 100,
                cns: data.readUInt16LE(offset + 11) / 100,
                gf99: data[offset + 13],
                decoStatus: data[offset + 14],
                ndlDecoTime: data.readUInt16LE(offset + 15),
                tts: data.readUInt16LE(offset + 17),
            };

            // Parse extended AI data if available
            if (hasAI && offset + extendedSampleSize <= data.length) {
                sample.currentGasO2 = data[offset + 21];
                sample.currentGasHe = data[offset + 22];
                sample.votingLogic = data[offset + 23];
                sample.activeSensors = data[offset + 24];
                
                // Parse tank data (up to 6 tanks)
                sample.tanks = [];
                let tankOffset = offset + 25;
                for (let i = 0; i < 6 && tankOffset + 6 <= data.length; i++) {
                    const pressure = data.readUInt16LE(tankOffset);
                    const rbt = data.readUInt16LE(tankOffset + 2);
                    const id = data[tankOffset + 4];
                    const battery = data[tankOffset + 5];
                    
                    if (pressure !== 0xFFFF && pressure > 0) {
                        sample.tanks.push({
                            pressure: this.psiToBar(pressure),
                            rbt,
                            id,
                            battery,
                        });
                    }
                    tankOffset += 6;
                }
            }

            samples.push(sample);
            time += sampleInterval;
            offset += hasAI ? extendedSampleSize : standardSampleSize;
        }

        return samples;
    }

    /**
     * Find where samples start in dive data (skip header)
     */
    private findSampleStart(data: Buffer): number {
        // Shearwater dive data typically starts with a header
        // Look for the first valid depth reading pattern
        for (let i = 32; i < Math.min(data.length, 128); i += 2) {
            const depth = data.readUInt16LE(i);
            const temp = data.readUInt16LE(i + 2);
            // Reasonable depth (0-150m = 0-500ft) and temp (30-100°F)
            if (depth >= 0 && depth < 5000 && temp > 300 && temp < 1000) {
                return i;
            }
        }
        return 64; // Default header size
    }

    /**
     * Convert feet to meters
     */
    private feetToMeters(feet: number): number {
        return feet * 0.3048;
    }

    /**
     * Convert Fahrenheit to Celsius
     */
    private fahrenheitToCelsius(f: number): number {
        return (f - 32) * 5 / 9;
    }

    /**
     * Convert PSI to bar
     */
    private psiToBar(psi: number): number {
        return psi * 0.0689476;
    }

    /**
     * Check if a model supports BLE
     */
    static supportsBLE(model: number): boolean {
        return [PETREL3, PERDIX2, TERIC, NERD2, PEREGRINE, PEREGRINE_TX, TERN, TERN_TX].includes(model);
    }

    /**
     * Check if a model has AI (Air Integration) support
     */
    static hasAirIntegration(model: number): boolean {
        return MODELS_WITH_AI.includes(model);
    }

    /**
     * Get model name from model number
     */
    static getModelName(model: number): string {
        return MODEL_NAMES[model] || 'Unknown Shearwater';
    }

    /**
     * Send shutdown command to device
     */
    async shutdown(): Promise<void> {
        const shutdownCmd = Buffer.from([0x2E, 0x90, 0x20, 0x00]);
        try {
            await this.transfer(shutdownCmd, 0);
        } catch {
            // Ignore errors on shutdown
        }
    }
}
