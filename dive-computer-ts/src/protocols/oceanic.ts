/**
 * Oceanic Protocol Implementation
 * 
 * Supports: Oceanic, Aeris, Sherwood, Hollis, Tusa, Aqualung dive computers
 * Based on libdivecomputer's oceanic_atom2.c
 * 
 * Transport:
 * - Serial: 38400 baud (most models), 115200 baud (i330R, DSX)
 * - BLE: Newer models (BLE name starts with 2-char model code)
 * 
 * Uses simple serial protocol with page-based memory access.
 */

import { SerialPort } from 'serialport';
import { BaseProtocol, ProtocolDeviceInfo, ProtocolDive, Checksum, ArrayUtils } from './base-protocol';

// Constants
const PAGESIZE = 16;
const MAXPACKET = 256;
const MAXRETRIES = 2;
const MAXDELAY = 16;

// Commands
const CMD_INIT = 0xA8;
const CMD_VERSION = 0x84;
const CMD_HANDSHAKE = 0xE5;
const CMD_READ1 = 0xB1;     // Read 1 page (16 bytes)
const CMD_READ8 = 0xB4;     // Read 8 pages (128 bytes)
const CMD_READ16 = 0xB8;    // Read 16 pages (256 bytes)
const CMD_READ16HI = 0xF6;  // Read from high memory
const CMD_WRITE = 0xB2;
const CMD_KEEPALIVE = 0x91;
const CMD_QUIT = 0x6A;

// Response codes
const ACK = 0x5A;
const NAK = 0xA5;

/**
 * Supported Devices with Model Codes
 * BLE name format: 2-char model code + serial
 */
const MODEL_CODES: Record<number, { name: string; brand: string; layout: string; bleBaud?: number }> = {
    // Oceanic
    0x4342: { name: 'Atom 2.0', brand: 'Oceanic', layout: 'default' },
    0x444C: { name: 'Atom 3.0', brand: 'Oceanic', layout: 'atom3' },
    0x4456: { name: 'Atom 3.1', brand: 'Oceanic', layout: 'atom3' },
    0x4258: { name: 'VT3', brand: 'Oceanic', layout: 'default' },
    0x4447: { name: 'VT4', brand: 'Oceanic', layout: 'default' },
    0x4446: { name: 'Geo 2.0', brand: 'Oceanic', layout: 'default' },
    0x4653: { name: 'Geo 4.0', brand: 'Oceanic', layout: 'oc1' },
    0x4654: { name: 'Veo 4.0', brand: 'Oceanic', layout: 'oc1' },
    0x4552: { name: 'Pro Plus X', brand: 'Oceanic', layout: 'oc1' },
    0x4656: { name: 'Pro Plus 4', brand: 'Oceanic', layout: 'oc1' },
    
    // Aqualung
    0x4646: { name: 'i200', brand: 'Aqualung', layout: 'default' },
    0x4649: { name: 'i200C', brand: 'Aqualung', layout: 'default' },
    0x4559: { name: 'i300', brand: 'Aqualung', layout: 'default' },
    0x4648: { name: 'i300C', brand: 'Aqualung', layout: 'default' },
    0x4744: { name: 'i330R', brand: 'Aqualung', layout: 'i770r', bleBaud: 115200 },
    0x4641: { name: 'i450T', brand: 'Aqualung', layout: 'default' },
    0x4743: { name: 'i470TC', brand: 'Aqualung', layout: 'oc1' },
    0x4642: { name: 'i550', brand: 'Aqualung', layout: 'oc1' },
    0x4652: { name: 'i550C', brand: 'Aqualung', layout: 'oc1' },
    0x455A: { name: 'i750TC', brand: 'Aqualung', layout: 'oc1' },
    0x4651: { name: 'i770R', brand: 'Aqualung', layout: 'i770r' },
    
    // Apeks
    0x4741: { name: 'DSX', brand: 'Apeks', layout: 'i770r', bleBaud: 115200 },
    
    // Sherwood
    0x4647: { name: 'Sage', brand: 'Sherwood', layout: 'oc1' },
    0x4655: { name: 'Wisdom 4', brand: 'Sherwood', layout: 'oc1' },
    
    // Hollis
    0x4542: { name: 'TX1', brand: 'Hollis', layout: 'default' },
};

// Memory layouts for different models
interface MemoryLayout {
    memsize: number;
    highmem: number;
    cf_devinfo: number;
    cf_pointers: number;
    rb_logbook_begin: number;
    rb_logbook_end: number;
    rb_logbook_entry_size: number;
    rb_logbook_direction: number;
    rb_profile_begin: number;
    rb_profile_end: number;
}

const LAYOUTS: Record<string, MemoryLayout> = {
    default: {
        memsize: 0x10000,
        highmem: 0,
        cf_devinfo: 0x0000,
        cf_pointers: 0x0040,
        rb_logbook_begin: 0x0240,
        rb_logbook_end: 0x0A40,
        rb_logbook_entry_size: 8,
        rb_logbook_direction: 1,
        rb_profile_begin: 0x0A40,
        rb_profile_end: 0x10000,
    },
    oc1: {
        memsize: 0x20000,
        highmem: 0,
        cf_devinfo: 0x0000,
        cf_pointers: 0x0040,
        rb_logbook_begin: 0x0240,
        rb_logbook_end: 0x0A40,
        rb_logbook_entry_size: 8,
        rb_logbook_direction: 1,
        rb_profile_begin: 0x0A40,
        rb_profile_end: 0x1FE00,
    },
    atom3: {
        memsize: 0x20000,
        highmem: 0,
        cf_devinfo: 0x0000,
        cf_pointers: 0x0040,
        rb_logbook_begin: 0x0400,
        rb_logbook_end: 0x0A40,
        rb_logbook_entry_size: 8,
        rb_logbook_direction: 1,
        rb_profile_begin: 0x0A40,
        rb_profile_end: 0x1FE00,
    },
    i770r: {
        memsize: 0x640000,
        highmem: 0x40000,
        cf_devinfo: 0x0000,
        cf_pointers: 0x0040,
        rb_logbook_begin: 0x2000,
        rb_logbook_end: 0x10000,
        rb_logbook_entry_size: 16,
        rb_logbook_direction: 1,
        rb_profile_begin: 0x40000,
        rb_profile_end: 0x640000,
    },
};

// Model identification from version string
const VERSION_PATTERNS: Array<{ pattern: string, model: string, layout: string }> = [
    { pattern: 'OCEATOM3', model: 'Atom 3', layout: 'atom3' },
    { pattern: 'OC1WATCH', model: 'OC1', layout: 'oc1' },
    { pattern: 'OCWATCH R', model: 'OC1', layout: 'oc1' },
    { pattern: 'AQUA770R', model: 'i770R', layout: 'i770r' },
    { pattern: 'AQUAI550', model: 'i550', layout: 'oc1' },
    { pattern: 'AQUAI450', model: 'i450T', layout: 'default' },
    { pattern: 'AQUAI300', model: 'i300', layout: 'default' },
    { pattern: 'AQUAI200', model: 'i200', layout: 'default' },
    { pattern: 'OCEVEO30', model: 'Veo 3.0', layout: 'default' },
    { pattern: 'PROPLUS3', model: 'Pro Plus 3', layout: 'default' },
    { pattern: 'OCEANVT4', model: 'VT4', layout: 'default' },
    { pattern: 'OCEANVTX', model: 'VTX', layout: 'default' },
    { pattern: '2M ATOM r', model: 'Atom 2', layout: 'default' },
    { pattern: 'HOLLDG04', model: 'Hollis TX1', layout: 'default' },
    { pattern: 'AQUAI330', model: 'i330R', layout: 'i770r' },
    { pattern: 'APEKSDSX', model: 'DSX', layout: 'i770r' },
];

/**
 * Dive Log Entry - Classic (32 bytes)
 * Used by most older models
 */
interface DiveLogEntryClassic {
    diveNumber: number;
    day: number;
    month: number;
    year: number;        // + 2000
    hour: number;
    minute: number;
    second: number;
    surfaceInterval: number;  // minutes
    maxDepth: number;         // 1/16 foot or 1/4 meter
    diveTime: number;         // minutes
    startTemp: number;
    endTemp: number;
    startPressure: number;    // psi (AI models)
    endPressure: number;      // psi (AI models)
    o2Percentage: number;     // %
    mode: number;             // 0=Air, 1=Nitrox, 2=Gauge, 3=Free
    profileStart: number;
    profileEnd: number;
    fingerprint: number;
}

/**
 * Dive Log Entry - i330R/DSX (64 bytes)
 * Used by newer extended models
 */
interface DiveLogEntryExtended {
    diveNumber: number;
    timestamp: number;        // Unix epoch
    maxDepth: number;         // 1/10 foot
    diveTime: number;         // seconds
    minTemp: number;          // 1/10 °F
    maxTemp: number;          // 1/10 °F
    mode: number;             // 0=OC, 1=Gauge, 2=Free, 3=CC
    gasCount: number;
    gases: Array<{
        o2: number;
        he: number;
        switchDepth: number;
    }>;
    profileAddress: number;
    profileSize: number;
    fingerprint: number;
}

/**
 * Sample Flags (Classic 2-byte format)
 * Bits 0-11: Depth (12 bits, 1/16 foot)
 * Bits 12-15: Flags (4 bits)
 */
const SAMPLE_FLAGS = {
    NORMAL: 0x0,              // Normal sample
    TEMPERATURE: 0x1,         // Temperature follows (1 byte, °F)
    NDL: 0x2,                 // NDL follows (1 byte, minutes)
    DECO_STOP: 0x3,           // Deco stop follows (1 byte depth, 1 byte time)
    PRESSURE: 0x4,            // Tank pressure follows (2 bytes, psi)
    ASCENT_RATE: 0x5,         // Ascent rate alarm
    BOOKMARK: 0x6,            // Bookmark/marker
    TANK_SWITCH: 0xA,         // Tank switch (1 byte tank index)
    SURFACE: 0xB,             // Surface marker
};

/**
 * Oceanic Dive Sample
 */
export interface OceanicSample {
    time: number;             // seconds
    depth: number;            // meters
    temperature?: number;     // Celsius
    pressure?: number;        // bar (AI models)
    ndl?: number;             // minutes
    ceiling?: number;         // meters (deco stop depth)
    stopTime?: number;        // minutes (deco stop time)
    tankIndex?: number;
    event?: string;
    ppo2?: number;            // bar (CCR mode)
}

export class OceanicProtocol extends BaseProtocol {
    private port: SerialPort | null = null;
    private layout: MemoryLayout = LAYOUTS.default;
    private version: Buffer = Buffer.alloc(PAGESIZE);
    private cache: Buffer = Buffer.alloc(256);
    private cachedPage: number = 0xFFFFFFFF;
    private delay: number = 0;
    private sequence: number = 0;
    private bigpage: number = 1;
    private isBLE: boolean = false;

    get familyName(): string {
        return 'Oceanic/Atom2';
    }

    /**
     * Find available Oceanic devices
     */
    static async findDevices(): Promise<string[]> {
        const ports = await SerialPort.list();
        return ports
            .filter(p => p.manufacturer?.toLowerCase().includes('oceanic') ||
                        p.manufacturer?.toLowerCase().includes('ftdi') ||
                        p.vendorId === '0403') // FTDI
            .map(p => p.path);
    }

    async connect(path?: string): Promise<boolean> {
        try {
            const portPath = path || (await OceanicProtocol.findDevices())[0];
            if (!portPath) {
                console.error('No Oceanic device found');
                return false;
            }

            this.port = new SerialPort({
                path: portPath,
                baudRate: 38400,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                rtscts: false,
            });

            await new Promise<void>((resolve, reject) => {
                this.port!.once('open', resolve);
                this.port!.once('error', reject);
            });

            // Set DTR
            await this.setDTR(true);
            
            // Reset PIC by toggling RTS
            await this.setRTS(false);
            await this.sleep(100);
            await this.setRTS(true);
            await this.sleep(100);
            
            // Flush buffers
            this.port.flush();

            // Read version
            await this.readVersion();

            this.connected = true;
            return true;
        } catch (err) {
            console.error('Connection error:', err);
            return false;
        }
    }

    disconnect(): void {
        if (this.port?.isOpen) {
            // Send quit command
            const quitCmd = Buffer.from([CMD_QUIT, 0x05, 0xA5]);
            this.transfer(quitCmd, NAK, 0, 0).catch(() => {});
            
            this.port.close();
            this.port = null;
        }
        this.connected = false;
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async setDTR(value: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            this.port?.set({ dtr: value }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    private async setRTS(value: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            this.port?.set({ rts: value }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Write data to port
     */
    private async write(data: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            this.port!.write(data, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Read data from port
     */
    private async read(size: number, timeout: number = 1000): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const buffer: number[] = [];
            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('Read timeout'));
            }, timeout);

            const onData = (data: Buffer) => {
                buffer.push(...data);
                if (buffer.length >= size) {
                    cleanup();
                    resolve(Buffer.from(buffer.slice(0, size)));
                }
            };

            const cleanup = () => {
                clearTimeout(timeoutId);
                this.port?.removeListener('data', onData);
            };

            this.port!.on('data', onData);
        });
    }

    /**
     * Send command and receive response with retries
     */
    private async transfer(
        command: Buffer, 
        expectedAck: number,
        responseSize: number, 
        crcSize: number
    ): Promise<Buffer> {
        let nretries = 0;

        while (true) {
            try {
                if (this.delay > 0) {
                    await this.sleep(this.delay);
                }

                // Send command
                await this.write(command);

                // Read response
                const totalSize = 1 + responseSize + crcSize;
                const packet = await this.read(totalSize);

                // Verify ACK
                if (packet[0] !== expectedAck) {
                    if (packet[0] === (~expectedAck & 0xFF)) {
                        throw new Error('Unsupported command');
                    }
                    throw new Error(`Unexpected response: 0x${packet[0].toString(16)}`);
                }

                // Verify checksum
                if (responseSize > 0 && crcSize > 0) {
                    const data = packet.slice(1, 1 + responseSize);
                    const crc = crcSize === 2 
                        ? packet.readUInt16LE(1 + responseSize)
                        : packet[1 + responseSize];
                    const calculated = crcSize === 2
                        ? Checksum.add16(data)
                        : Checksum.add8(data);
                    
                    if (crc !== calculated) {
                        throw new Error('Checksum error');
                    }
                }

                this.sequence++;
                return packet.slice(1, 1 + responseSize);

            } catch (err) {
                if (nretries++ >= MAXRETRIES) {
                    throw err;
                }

                // Increase delay for next retry
                if (this.delay < MAXDELAY) {
                    this.delay++;
                }

                await this.sleep(100);
                this.port?.flush();
            }
        }
    }

    /**
     * Read version string from device
     */
    private async readVersion(): Promise<void> {
        const command = Buffer.from([CMD_VERSION]);
        this.version = await this.transfer(command, ACK, PAGESIZE, 1);

        // Identify model and layout
        const versionStr = this.version.toString('ascii').replace(/\0/g, '');
        console.log(`Version: ${versionStr}`);

        // Find matching model
        for (const { pattern, model, layout } of VERSION_PATTERNS) {
            if (versionStr.includes(pattern)) {
                this.layout = LAYOUTS[layout] || LAYOUTS.default;
                
                // Get serial from device info
                const devinfo = await this.readMemory(this.layout.cf_devinfo, PAGESIZE);
                const serial = devinfo.readUInt32LE(0);
                
                this.deviceInfo = {
                    model: 0,
                    firmware: 0,
                    serial,
                    features: [model]
                };
                
                console.log(`✅ Connected to ${model}`);
                console.log(`   Serial: ${serial}`);
                return;
            }
        }

        // Default device info
        this.deviceInfo = {
            model: 0,
            firmware: 0,
            serial: 0,
            features: ['Unknown Oceanic']
        };
    }

    /**
     * Read memory from device
     */
    private async readMemory(address: number, size: number): Promise<Buffer> {
        const result = Buffer.alloc(size);
        let nbytes = 0;

        while (nbytes < size) {
            const page = Math.floor(address / PAGESIZE);
            
            if (page !== this.cachedPage) {
                // Read the page
                const command = Buffer.from([
                    CMD_READ1,
                    (page >> 8) & 0xFF,
                    page & 0xFF
                ]);

                this.cache.fill(0);
                const data = await this.transfer(command, ACK, PAGESIZE, 1);
                data.copy(this.cache);
                this.cachedPage = page;
            }

            const offset = address % PAGESIZE;
            const length = Math.min(PAGESIZE - offset, size - nbytes);
            this.cache.copy(result, nbytes, offset, offset + length);

            nbytes += length;
            address += length;
        }

        return result;
    }

    /**
     * Send keepalive to prevent device timeout
     */
    async keepAlive(): Promise<void> {
        const command = Buffer.from([CMD_KEEPALIVE, 0x05, 0xA5]);
        await this.transfer(command, ACK, 0, 0);
    }

    async listDives(): Promise<string[]> {
        const dives: string[] = [];
        const layout = this.layout;

        // Read pointers
        const pointers = await this.readMemory(layout.cf_pointers, 32);
        const logbookFirst = pointers.readUInt16LE(4);
        const logbookLast = pointers.readUInt16LE(6);

        // Calculate number of entries
        let count: number;
        if (logbookLast >= logbookFirst) {
            count = Math.floor((logbookLast - logbookFirst) / layout.rb_logbook_entry_size);
        } else {
            count = Math.floor(
                ((layout.rb_logbook_end - logbookFirst) + 
                 (logbookLast - layout.rb_logbook_begin)) / 
                layout.rb_logbook_entry_size
            );
        }

        // Read logbook entries
        let address = logbookLast;
        for (let i = 0; i < count; i++) {
            // Move to previous entry
            if (layout.rb_logbook_direction > 0) {
                address -= layout.rb_logbook_entry_size;
                if (address < layout.rb_logbook_begin) {
                    address = layout.rb_logbook_end - layout.rb_logbook_entry_size;
                }
            } else {
                address += layout.rb_logbook_entry_size;
                if (address >= layout.rb_logbook_end) {
                    address = layout.rb_logbook_begin;
                }
            }

            // Read entry
            const entry = await this.readMemory(address, layout.rb_logbook_entry_size);
            
            // Get profile pointer
            const profilePtr = entry.readUInt16LE(0);
            if (profilePtr !== 0 && profilePtr !== 0xFFFF) {
                dives.push(`${address.toString(16).padStart(8, '0')}:${profilePtr.toString(16).padStart(4, '0')}`);
            }
        }

        return dives;
    }

    async downloadDive(identifier: string): Promise<ProtocolDive | null> {
        const [entryAddr, profilePtr] = identifier.split(':').map(s => parseInt(s, 16));
        const layout = this.layout;

        // Read logbook entry
        const entry = await this.readMemory(entryAddr, layout.rb_logbook_entry_size);

        // Read profile data
        const profileStart = layout.rb_profile_begin + profilePtr * PAGESIZE;
        
        // Find end of profile (look for markers or size info)
        // For simplicity, read until we hit empty data or ring buffer wraps
        const chunks: Buffer[] = [];
        let addr = profileStart;
        let totalSize = 0;
        const maxSize = layout.rb_profile_end - layout.rb_profile_begin;

        while (totalSize < maxSize) {
            const chunk = await this.readMemory(addr, PAGESIZE);
            
            // Check for empty page (all 0xFF)
            if (chunk.every(b => b === 0xFF)) {
                break;
            }
            
            chunks.push(chunk);
            totalSize += PAGESIZE;
            addr += PAGESIZE;
            
            if (addr >= layout.rb_profile_end) {
                addr = layout.rb_profile_begin;
            }
            
            if (addr === profileStart) {
                break; // Wrapped around
            }
        }

        const profileData = Buffer.concat(chunks);

        // Create fingerprint from entry
        const fingerprint = entry.slice(0, 4);

        // Extract timestamp (format varies by model)
        const timestamp = Date.now(); // Placeholder - actual parsing needed

        return {
            fingerprint,
            timestamp,
            data: Buffer.concat([entry, profileData])
        };
    }

    /**
     * Parse dive log entry (Classic 32-byte format)
     */
    parseDiveLogClassic(data: Buffer, offset: number = 0): DiveLogEntryClassic {
        return {
            diveNumber: data.readUInt16LE(offset),
            day: data[offset + 2],
            month: data[offset + 3],
            year: data[offset + 4] + 2000,
            hour: data[offset + 5],
            minute: data[offset + 6],
            second: data[offset + 7],
            surfaceInterval: data.readUInt16LE(offset + 8),
            maxDepth: data.readUInt16LE(offset + 10),
            diveTime: data.readUInt16LE(offset + 12),
            startTemp: data.readUInt16LE(offset + 14),
            endTemp: data.readUInt16LE(offset + 16),
            startPressure: data.readUInt16LE(offset + 18),
            endPressure: data.readUInt16LE(offset + 20),
            o2Percentage: data[offset + 22],
            mode: data[offset + 23],
            profileStart: data.readUInt16LE(offset + 24),
            profileEnd: data.readUInt16LE(offset + 26),
            fingerprint: data.readUInt32LE(offset + 28),
        };
    }

    /**
     * Parse dive log entry (Extended 64-byte format - i330R/DSX)
     */
    parseDiveLogExtended(data: Buffer, offset: number = 0): DiveLogEntryExtended {
        const gasCount = data[offset + 17];
        const gases: Array<{ o2: number; he: number; switchDepth: number }> = [];
        
        for (let i = 0; i < gasCount && i < 6; i++) {
            const gasOffset = offset + 18 + (i * 4);
            gases.push({
                o2: data[gasOffset],
                he: data[gasOffset + 1],
                switchDepth: data.readUInt16LE(gasOffset + 2),
            });
        }

        return {
            diveNumber: data.readUInt32LE(offset),
            timestamp: data.readUInt32LE(offset + 4),
            maxDepth: data.readUInt16LE(offset + 8),
            diveTime: data.readUInt16LE(offset + 10),
            minTemp: data.readInt16LE(offset + 12),
            maxTemp: data.readInt16LE(offset + 14),
            mode: data[offset + 16],
            gasCount,
            gases,
            profileAddress: data.readUInt16LE(offset + 42),
            profileSize: data.readUInt32LE(offset + 44),
            fingerprint: data.readUInt32LE(offset + 48),
        };
    }

    /**
     * Parse samples (Classic 2-byte format)
     * Each sample: Bits 0-11 = depth (1/16 ft), Bits 12-15 = flags
     */
    parseSamplesClassic(data: Buffer, sampleInterval: number = 1): OceanicSample[] {
        const samples: OceanicSample[] = [];
        let offset = 0;
        let time = 0;
        let temperature: number | undefined;

        while (offset + 2 <= data.length) {
            const word = data.readUInt16LE(offset);
            const rawDepth = word & 0x0FFF;           // 12 bits
            const flags = (word >> 12) & 0x0F;        // 4 bits
            
            // Convert depth: 1/16 foot to meters
            const depth = (rawDepth / 16) * 0.3048;
            
            const sample: OceanicSample = {
                time,
                depth,
                temperature,
            };

            offset += 2;

            // Process flags to read additional data
            switch (flags) {
                case SAMPLE_FLAGS.TEMPERATURE:
                    if (offset < data.length) {
                        // Temperature in °F, convert to °C
                        temperature = (data[offset++] - 32) * 5 / 9;
                        sample.temperature = temperature;
                    }
                    break;
                    
                case SAMPLE_FLAGS.NDL:
                    if (offset < data.length) {
                        sample.ndl = data[offset++];
                    }
                    break;
                    
                case SAMPLE_FLAGS.DECO_STOP:
                    if (offset + 1 < data.length) {
                        sample.ceiling = data[offset++] * 0.3048; // feet to meters
                        sample.stopTime = data[offset++];
                    }
                    break;
                    
                case SAMPLE_FLAGS.PRESSURE:
                    if (offset + 1 < data.length) {
                        const psi = data.readUInt16LE(offset);
                        sample.pressure = psi * 0.0689476; // PSI to bar
                        offset += 2;
                    }
                    break;
                    
                case SAMPLE_FLAGS.ASCENT_RATE:
                    sample.event = 'ascent_rate_alarm';
                    break;
                    
                case SAMPLE_FLAGS.BOOKMARK:
                    sample.event = 'bookmark';
                    break;
                    
                case SAMPLE_FLAGS.TANK_SWITCH:
                    if (offset < data.length) {
                        sample.tankIndex = data[offset++];
                        sample.event = 'tank_switch';
                    }
                    break;
                    
                case SAMPLE_FLAGS.SURFACE:
                    sample.event = 'surface';
                    break;
            }

            samples.push(sample);
            time += sampleInterval;
        }

        return samples;
    }

    /**
     * Parse samples (Extended 8-byte format - i330R/DSX)
     * Each sample: 8 bytes with full data
     */
    parseSamplesExtended(data: Buffer, sampleInterval: number = 1): OceanicSample[] {
        const samples: OceanicSample[] = [];
        let time = 0;

        for (let offset = 0; offset + 8 <= data.length; offset += 8) {
            // Extended format:
            // Offset 0-1: Depth (1/10 foot)
            // Offset 2-3: Temperature (1/10 °F)
            // Offset 4:   PPO2 (1/100 bar) - CCR mode
            // Offset 5:   NDL/Deco (minutes, 0xFF = in deco)
            // Offset 6:   Ceiling (feet)
            // Offset 7:   Flags/events
            
            const rawDepth = data.readUInt16LE(offset);
            const rawTemp = data.readInt16LE(offset + 2);
            const ppo2Raw = data[offset + 4];
            const ndlDeco = data[offset + 5];
            const ceiling = data[offset + 6];
            const flags = data[offset + 7];

            const sample: OceanicSample = {
                time,
                depth: (rawDepth / 10) * 0.3048,  // 1/10 foot to meters
                temperature: ((rawTemp / 10) - 32) * 5 / 9,  // 1/10 °F to °C
            };

            if (ppo2Raw > 0 && ppo2Raw !== 0xFF) {
                sample.ppo2 = ppo2Raw / 100;  // CCR setpoint in bar
            }

            if (ndlDeco === 0xFF) {
                // In deco
                sample.ceiling = ceiling * 0.3048;  // feet to meters
            } else {
                sample.ndl = ndlDeco;
            }

            // Parse event flags
            if (flags & 0x01) sample.event = 'ascent_alarm';
            if (flags & 0x02) sample.event = 'deco_violation';
            if (flags & 0x04) sample.event = 'bookmark';

            samples.push(sample);
            time += sampleInterval;
        }

        return samples;
    }

    /**
     * Determine if model uses extended format
     */
    isExtendedFormat(): boolean {
        return this.layout === LAYOUTS.i770r;
    }

    /**
     * Get model code from BLE name
     * BLE names start with 2-char hex model code
     */
    static getModelFromBLEName(name: string): number | null {
        if (name.length < 2) return null;
        const code = name.charCodeAt(0) << 8 | name.charCodeAt(1);
        return MODEL_CODES[code] ? code : null;
    }

    /**
     * Get model info by code
     */
    static getModelInfo(code: number): { name: string; brand: string; layout: string } | null {
        return MODEL_CODES[code] || null;
    }

    /**
     * Calculate Oceanic checksum for commands
     */
    static calculateChecksum(cmd: number, addrHi: number, addrLo: number): number {
        return (0x100 - ((cmd + addrHi + addrLo) & 0xFF)) & 0xFF;
    }
}
