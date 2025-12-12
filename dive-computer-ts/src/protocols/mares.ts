/**
 * Mares Protocol Implementation
 * 
 * Supports: Mares Icon HD, Icon HD Net Ready, Puck Pro, Puck Pro+, Puck 2, Puck 4,
 *           Quad, Quad Air, Smart, Smart Air, Smart Apnea, Matrix, Genius, Sirius, Horizon
 * Based on libdivecomputer's mares_iconhd.c and mares_nemo.c
 * 
 * Transport:
 * - Serial: 38400 baud, 8N1
 * - BLE: Puck, Quad, Smart, Genius, Sirius (via "Mares bluelink pro")
 * 
 * Uses DIVEIC chip communication protocol with record-based format for Genius.
 */

import { SerialPort } from 'serialport';
import { BaseProtocol, ProtocolDeviceInfo, ProtocolDive, Checksum } from './base-protocol';

// Constants
const PACKETSIZE = 256;
const NRETRIES = 3;

// Commands
const CMD_INIT = 0xAA;
const CMD_EXIT = 0x46;
const CMD_READ_MEMORY = 0xE4;
const CMD_MODEL = 0x31;

// Response codes
const ACK = 0x55;
const NAK = 0xAA;
const BUSY = 0x66;

/**
 * Model identifiers with memory sizes and BLE names
 */
const MODELS: Record<number, { name: string; memsize: number; bleName?: string }> = {
    0x02: { name: 'Nemo', memsize: 0x10000 },
    0x03: { name: 'Nemo Excel', memsize: 0x10000 },
    0x04: { name: 'Nemo Apneist', memsize: 0x10000 },
    0x05: { name: 'Puck', memsize: 0x10000, bleName: 'Puck' },
    0x06: { name: 'Nemo Wide', memsize: 0x10000 },
    0x07: { name: 'Puck Air', memsize: 0x10000, bleName: 'Puck' },
    0x08: { name: 'Nemo Air', memsize: 0x10000 },
    0x0A: { name: 'Smart', memsize: 0x40000, bleName: 'Mares bluelink pro' },
    0x0B: { name: 'Puck Pro', memsize: 0x40000, bleName: 'Puck' },
    0x0D: { name: 'Icon HD', memsize: 0x100000 },
    0x0E: { name: 'Icon HD Net Ready', memsize: 0x100000 },
    0x0F: { name: 'Matrix', memsize: 0x40000 },
    0x10: { name: 'Smart Apnea', memsize: 0x40000, bleName: 'Mares bluelink pro' },
    0x11: { name: 'Matrix', memsize: 0x40000 },
    0x12: { name: 'Quad Air', memsize: 0x40000, bleName: 'Quad' },
    0x14: { name: 'Quad', memsize: 0x40000, bleName: 'Quad' },
    0x18: { name: 'Puck Pro', memsize: 0x40000, bleName: 'Puck' },
    0x19: { name: 'Puck 2', memsize: 0x40000, bleName: 'Puck' },
    0x1C: { name: 'Genius', memsize: 0x100000, bleName: 'Mares Genius' },
    0x1F: { name: 'Genius', memsize: 0x100000, bleName: 'Mares Genius' },
    0x20: { name: 'Sirius', memsize: 0x100000, bleName: 'Sirius' },
    0x23: { name: 'Quad Air', memsize: 0x40000, bleName: 'Quad' },
    0x24: { name: 'Smart Air', memsize: 0x40000, bleName: 'Mares bluelink pro' },
    0x29: { name: 'Quad Air', memsize: 0x40000, bleName: 'Quad' },
    0x2C: { name: 'Horizon', memsize: 0x100000 },
    0x2F: { name: 'Sirius', memsize: 0x100000, bleName: 'Sirius' },
    0x35: { name: 'Puck 4', memsize: 0x40000, bleName: 'Puck' },
};

/**
 * Genius Record Signatures (4-byte ASCII)
 * Genius uses a record-based format with type signatures
 */
const GENIUS_SIGNATURES = {
    DIVE_START: 0x44535452,  // "DSTR" - Dive start
    TISSUE: 0x54495353,      // "TISS" - Tissue saturation
    SAMPLE: 0x44505253,      // "DPRS" - Sample record (34 bytes)
    SCR_SAMPLE: 0x53445054,  // "SDPT" - SCR sample (78 bytes)
    AIR_INT: 0x41495253,     // "AIRS" - Air integration (16 bytes)
    DIVE_END: 0x44454E44,    // "DEND" - Dive end (162 bytes)
};

/**
 * Genius Alarm Flags (bit field)
 */
const GENIUS_ALARMS = {
    ASCENT_SPEED: 0x01,     // Bit 0: Ascent speed warning
    FAST_ASCENT: 0x02,      // Bit 1: Fast ascent alarm
    MOD_REACHED: 0x04,      // Bit 2: Maximum operating depth
    CNS_WARNING: 0x08,      // Bit 3: CNS warning (80%)
    CNS_DANGER: 0x10,       // Bit 4: CNS danger (100%)
    MISSED_DECO: 0x20,      // Bit 5: Missed decompression
    BATTERY_LOW: 0x40,      // Bit 6: Low battery
    PRESSURE_LOW: 0x80,     // Bit 7: Tank pressure low
};

/**
 * Genius Sample Record (DPRS - 34 bytes)
 */
export interface GeniusSample {
    time: number;           // seconds from dive start
    depth: number;          // meters (from 1/10 m)
    temperature: number;    // Celsius (from 1/10 °C)
    ndl: number;            // minutes
    ceiling: number;        // meters
    decoTime: number;       // minutes
    tts: number;            // minutes
    cns: number;            // % (from 1/10 %)
    gf: number;             // % gradient factor
    o2: number;             // %
    he: number;             // %
    gasIndex: number;
    tank1Pressure?: number; // bar (from mbar)
    tank2Pressure?: number; // bar
    rbt?: number;           // minutes
    ascentRate: number;     // m/min
    alarms: string[];
    ppo2?: number;          // bar (SCR mode, from 1/100 bar)
}

/**
 * Classic Mares Sample (Icon HD/Smart - 2 bytes)
 */
export interface MaresSample {
    time: number;           // seconds
    depth: number;          // meters
    temperature?: number;   // Celsius
    gasIndex?: number;
}

export class MaresProtocol extends BaseProtocol {
    private port: SerialPort | null = null;
    private model: number = 0;
    private memsize: number = 0;

    get familyName(): string {
        return 'Mares';
    }

    /**
     * Find available Mares devices
     */
    static async findDevices(): Promise<string[]> {
        const ports = await SerialPort.list();
        return ports
            .filter(p => 
                p.manufacturer?.toLowerCase().includes('mares') ||
                p.manufacturer?.toLowerCase().includes('ftdi') ||
                p.vendorId === '0403' // FTDI
            )
            .map(p => p.path);
    }

    async connect(path?: string): Promise<boolean> {
        try {
            const portPath = path || (await MaresProtocol.findDevices())[0];
            if (!portPath) {
                console.error('No Mares device found');
                return false;
            }

            this.port = new SerialPort({
                path: portPath,
                baudRate: 9600,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
            });

            await new Promise<void>((resolve, reject) => {
                this.port!.once('open', resolve);
                this.port!.once('error', reject);
            });

            // Set DTR and RTS
            await this.setDTR(true);
            await this.setRTS(true);
            await this.sleep(100);
            
            this.port.flush();

            // Initialize device
            await this.initialize();

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
            // Send exit command
            this.sendCommand(CMD_EXIT).catch(() => {});
            
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
    private async read(size: number, timeout: number = 2000): Promise<Buffer> {
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
    private async sendCommand(cmd: number, data?: Buffer): Promise<Buffer> {
        for (let retry = 0; retry < NRETRIES; retry++) {
            try {
                // Build packet
                const packet = this.buildPacket(cmd, data);
                
                // Send packet
                await this.write(packet);

                // Read echo
                const echo = await this.read(packet.length);
                if (!echo.equals(packet)) {
                    throw new Error('Echo mismatch');
                }

                // Read response byte
                const response = await this.read(1);

                if (response[0] === NAK) {
                    throw new Error('NAK received');
                }

                if (response[0] === BUSY) {
                    await this.sleep(100);
                    continue;
                }

                if (response[0] !== ACK) {
                    throw new Error(`Unexpected response: 0x${response[0].toString(16)}`);
                }

                return response;

            } catch (err) {
                if (retry === NRETRIES - 1) {
                    throw err;
                }
                await this.sleep(100);
                this.port?.flush();
            }
        }

        throw new Error('Max retries exceeded');
    }

    /**
     * Build command packet
     */
    private buildPacket(cmd: number, data?: Buffer): Buffer {
        const size = data ? data.length + 2 : 1;
        const packet = Buffer.alloc(size);
        
        packet[0] = cmd;
        
        if (data) {
            data.copy(packet, 1);
            // Add checksum
            packet[size - 1] = Checksum.xor8(packet, 0, size - 1);
        }

        return packet;
    }

    /**
     * Initialize device communication
     */
    private async initialize(): Promise<void> {
        // Send init command
        await this.sendCommand(CMD_INIT);
        console.log('✅ Device initialized');
    }

    /**
     * Read device information
     */
    private async readDeviceInfo(): Promise<void> {
        // Read model from memory address 0
        const modelData = await this.readMemory(0x0000, 4);
        
        this.model = modelData[0];
        const modelInfo = MODELS[this.model];
        
        if (modelInfo) {
            this.memsize = modelInfo.memsize;
        } else {
            console.warn(`Unknown model: 0x${this.model.toString(16)}`);
            this.memsize = 0x10000; // Default
        }

        // Read serial number (location varies by model)
        const serialData = await this.readMemory(0x0004, 4);
        const serial = serialData.readUInt32LE(0);

        this.deviceInfo = {
            model: this.model,
            firmware: 0,
            serial,
            features: [modelInfo?.name || `Mares (0x${this.model.toString(16)})`]
        };

        console.log(`✅ Connected to ${modelInfo?.name || 'Mares device'}`);
        console.log(`   Model: 0x${this.model.toString(16)}`);
        console.log(`   Serial: ${serial}`);
        console.log(`   Memory: ${this.memsize / 1024} KB`);
    }

    /**
     * Read memory from device
     */
    async readMemory(address: number, size: number): Promise<Buffer> {
        const result = Buffer.alloc(size);
        let offset = 0;

        while (offset < size) {
            const chunkSize = Math.min(PACKETSIZE, size - offset);
            
            // Build read command
            const cmd = Buffer.alloc(5);
            cmd[0] = CMD_READ_MEMORY;
            cmd[1] = (address >> 16) & 0xFF;
            cmd[2] = (address >> 8) & 0xFF;
            cmd[3] = address & 0xFF;
            cmd[4] = chunkSize - 1;

            await this.sendCommand(cmd[0], cmd.slice(1));

            // Read data
            const data = await this.read(chunkSize);
            data.copy(result, offset);

            // Read checksum
            const checksum = await this.read(1);
            const calculated = Checksum.xor8(data);
            
            if (checksum[0] !== calculated) {
                throw new Error('Checksum error');
            }

            offset += chunkSize;
            address += chunkSize;
        }

        return result;
    }

    async listDives(): Promise<string[]> {
        // Read logbook pointer area
        const pointers = await this.readMemory(0x0100, 64);
        
        // Parse dive count and pointers
        const dives: string[] = [];
        const diveCount = pointers.readUInt16LE(0);

        for (let i = 0; i < Math.min(diveCount, 30); i++) {
            const ptr = pointers.readUInt16LE(2 + i * 2);
            if (ptr !== 0 && ptr !== 0xFFFF) {
                dives.push(ptr.toString(16).padStart(6, '0'));
            }
        }

        return dives;
    }

    async downloadDive(identifier: string): Promise<ProtocolDive | null> {
        const address = parseInt(identifier, 16);

        // Read dive header to get size
        const header = await this.readMemory(address, 32);
        
        // Parse size from header (location varies by model)
        const profileSize = header.readUInt16LE(4);
        
        // Read full dive data
        const diveData = await this.readMemory(address, 32 + profileSize);

        // Create fingerprint from first 4 bytes
        const fingerprint = diveData.slice(0, 4);

        return {
            fingerprint,
            timestamp: 0, // Parsed from dive data
            data: diveData
        };
    }

    /**
     * Parse dive header (Icon HD/Smart - 32 bytes)
     */
    parseDiveHeader(data: Buffer, offset: number = 0): {
        year: number;
        month: number;
        day: number;
        hour: number;
        minute: number;
        diveTime: number;       // seconds
        maxDepth: number;       // meters
        minTemp: number;        // Celsius
        mode: number;           // Air/Nitrox/Gauge/Free
        o2Percent: number;
        surfaceInterval: number; // minutes
        profileAddress: number;
        profileSize: number;
    } {
        return {
            year: data[offset] + 2000,
            month: data[offset + 1],
            day: data[offset + 2],
            hour: data[offset + 3],
            minute: data[offset + 4],
            diveTime: data.readUInt16LE(offset + 5),
            maxDepth: data.readUInt16LE(offset + 7) / 10, // 1/10 m to m
            minTemp: data[offset + 9] as number,          // signed int8
            mode: data[offset + 10],
            o2Percent: data[offset + 11],
            surfaceInterval: data.readUInt16LE(offset + 12),
            profileAddress: data.readUInt16LE(offset + 14),
            profileSize: data.readUInt16LE(offset + 16),
        };
    }

    /**
     * Parse samples (Classic Icon HD - 2 bytes per sample)
     * Bits 0-11: Depth (12 bits, 1/10 m)
     * Bits 12-15: Gas index (4 bits)
     */
    parseSamplesClassic(data: Buffer, sampleInterval: number = 20): MaresSample[] {
        const samples: MaresSample[] = [];
        let time = 0;
        let temperature: number | undefined;

        for (let offset = 0; offset + 2 <= data.length; offset += 2) {
            const word = data.readUInt16LE(offset);
            const rawDepth = word & 0x0FFF;        // 12 bits
            const gasIndex = (word >> 12) & 0x0F; // 4 bits

            const sample: MaresSample = {
                time,
                depth: rawDepth / 10, // 1/10 m to meters
                gasIndex,
                temperature,
            };

            samples.push(sample);
            time += sampleInterval;
        }

        return samples;
    }

    /**
     * Parse samples (Genius DPRS format - 34 bytes per sample)
     */
    parseSamplesGenius(data: Buffer): GeniusSample[] {
        const samples: GeniusSample[] = [];
        let offset = 0;
        let time = 0;

        while (offset + 34 <= data.length) {
            // Check for DPRS signature
            const signature = data.readUInt32LE(offset);
            if (signature !== GENIUS_SIGNATURES.SAMPLE) {
                // Not a sample record, try to find next one
                offset += 4;
                continue;
            }

            const sample: GeniusSample = {
                time,
                depth: data.readUInt16LE(offset + 6) / 10,    // 1/10 m
                temperature: data.readInt16LE(offset + 8) / 10, // 1/10 °C
                ndl: data[offset + 10],
                ceiling: data[offset + 11],                    // meters
                decoTime: data[offset + 12],                   // minutes
                tts: data[offset + 13],                        // minutes
                cns: data.readUInt16LE(offset + 14) / 10,     // 1/10 %
                gf: data[offset + 16],                         // %
                o2: data[offset + 17],                         // %
                he: data[offset + 18],                         // %
                gasIndex: data[offset + 19],
                ascentRate: data[offset + 26],                 // m/min
                alarms: [],
            };

            // Tank pressures (0xFFFF = no AI)
            const tank1 = data.readUInt16LE(offset + 20);
            const tank2 = data.readUInt16LE(offset + 22);
            if (tank1 !== 0xFFFF) {
                sample.tank1Pressure = tank1 / 1000; // mbar to bar
            }
            if (tank2 !== 0xFFFF) {
                sample.tank2Pressure = tank2 / 1000;
            }

            // RBT
            const rbt = data.readUInt16LE(offset + 24);
            if (rbt !== 0xFFFF) {
                sample.rbt = rbt;
            }

            // Parse alarm flags
            const alarmFlags = data[offset + 27];
            sample.alarms = this.parseGeniusAlarms(alarmFlags);

            // PPO2 (SCR mode, 1/100 bar)
            const ppo2 = data.readUInt16LE(offset + 28);
            if (ppo2 > 0 && ppo2 !== 0xFFFF) {
                sample.ppo2 = ppo2 / 100;
            }

            // Time delta is at offset + 4 (2 bytes, seconds)
            time += data.readUInt16LE(offset + 4);

            samples.push(sample);
            offset += 34;
        }

        return samples;
    }

    /**
     * Parse Genius SCR sample (SDPT format - 78 bytes)
     * Extended format with additional sensor data
     */
    parseScrSample(data: Buffer, offset: number): GeniusSample | null {
        const signature = data.readUInt32LE(offset);
        if (signature !== GENIUS_SIGNATURES.SCR_SAMPLE) {
            return null;
        }

        // SCR samples have extended data
        const sample = this.parseSamplesGenius(data.slice(offset, offset + 34))[0];
        if (sample) {
            // Additional SCR-specific parsing could go here
            // Offset 34-77 contains extended sensor data
        }
        return sample;
    }

    /**
     * Parse alarm flags byte into human-readable alarms
     */
    private parseGeniusAlarms(flags: number): string[] {
        const alarms: string[] = [];
        
        if (flags & GENIUS_ALARMS.ASCENT_SPEED) alarms.push('ascent_speed');
        if (flags & GENIUS_ALARMS.FAST_ASCENT) alarms.push('fast_ascent');
        if (flags & GENIUS_ALARMS.MOD_REACHED) alarms.push('mod_reached');
        if (flags & GENIUS_ALARMS.CNS_WARNING) alarms.push('cns_warning');
        if (flags & GENIUS_ALARMS.CNS_DANGER) alarms.push('cns_danger');
        if (flags & GENIUS_ALARMS.MISSED_DECO) alarms.push('missed_deco');
        if (flags & GENIUS_ALARMS.BATTERY_LOW) alarms.push('battery_low');
        if (flags & GENIUS_ALARMS.PRESSURE_LOW) alarms.push('pressure_low');

        return alarms;
    }

    /**
     * Find Genius record by signature
     */
    findGeniusRecord(data: Buffer, signature: number): number {
        for (let offset = 0; offset + 4 <= data.length; offset++) {
            if (data.readUInt32LE(offset) === signature) {
                return offset;
            }
        }
        return -1;
    }

    /**
     * Parse Genius dive end record (DEND - 162 bytes)
     * Contains dive summary information
     */
    parseGeniusDiveEnd(data: Buffer, offset: number): {
        maxDepth: number;
        avgDepth: number;
        diveTime: number;
        minTemp: number;
        maxTemp: number;
        surfaceInterval: number;
        cnsStart: number;
        cnsEnd: number;
        o2Toxicity: number;  // OTU
    } | null {
        const signature = data.readUInt32LE(offset);
        if (signature !== GENIUS_SIGNATURES.DIVE_END) {
            return null;
        }

        return {
            maxDepth: data.readUInt16LE(offset + 4) / 10,
            avgDepth: data.readUInt16LE(offset + 6) / 10,
            diveTime: data.readUInt32LE(offset + 8),
            minTemp: data.readInt16LE(offset + 12) / 10,
            maxTemp: data.readInt16LE(offset + 14) / 10,
            surfaceInterval: data.readUInt32LE(offset + 16),
            cnsStart: data[offset + 20],
            cnsEnd: data[offset + 21],
            o2Toxicity: data.readUInt16LE(offset + 22),
        };
    }

    /**
     * Check if model is Genius (uses record-based format)
     */
    isGeniusModel(): boolean {
        return this.model === 0x1C || this.model === 0x1F || 
               this.model === 0x20 || this.model === 0x2F;
    }

    /**
     * Get model name
     */
    static getModelName(model: number): string {
        return MODELS[model]?.name || `Unknown (0x${model.toString(16)})`;
    }

    /**
     * Get BLE name for model
     */
    static getBleName(model: number): string | null {
        return MODELS[model]?.bleName || null;
    }

    /**
     * Find model from BLE name
     */
    static getModelFromBleName(bleName: string): number | null {
        for (const [modelStr, info] of Object.entries(MODELS)) {
            if (info.bleName && bleName.toLowerCase().includes(info.bleName.toLowerCase())) {
                return parseInt(modelStr);
            }
        }
        return null;
    }
}
