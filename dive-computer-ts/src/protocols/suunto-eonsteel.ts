/**
 * Suunto EON Steel/Core/D5 Protocol Implementation
 * Based on libdivecomputer's suunto_eonsteel.c by Linus Torvalds
 * 
 * This implements the USB HID protocol for Suunto EON Steel family dive computers.
 */

import HID from 'node-hid';

// Constants from the protocol
const PACKET_SIZE = 64;
const HEADER_SIZE = 12;

// Command numbers
const CMD_INIT = 0x0000;
const CMD_READ_STRING = 0x0411;
const CMD_FILE_OPEN = 0x0010;
const CMD_FILE_READ = 0x0110;
const CMD_FILE_STAT = 0x0710;
const CMD_FILE_CLOSE = 0x0510;
const CMD_DIR_OPEN = 0x0810;
const CMD_DIR_READDIR = 0x0910;
const CMD_DIR_CLOSE = 0x0a10;
const CMD_SET_TIME = 0x0003;
const CMD_GET_TIME = 0x0103;
const CMD_SET_DATE = 0x0203;
const CMD_GET_DATE = 0x0303;

// Initial magic values
const INIT_MAGIC = 0x0001;
const INIT_SEQ = 0;

// Directory entry types
const DIRTYPE_FILE = 0x0001;
const DIRTYPE_DIR = 0x0002;

// Dive directory path
const DIVE_DIRECTORY = "0:/dives";

// CRC32 lookup table (reflected polynomial)
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
        table[i] = crc >>> 0; // Force unsigned
    }
    return table;
})();

function crc32r(data: Buffer, offset: number = 0, length?: number): number {
    const len = length ?? data.length - offset;
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < len; i++) {
        crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[offset + i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

interface DirectoryEntry {
    type: number;
    name: string;
}

export interface DeviceInfo {
    model: number;
    firmware: number;
    serial: number;
    version: Buffer;
}

export interface DiveFile {
    name: string;
    timestamp: number;
    data: Buffer;
}

export class SuuntoEonSteel {
    private device: HID.HID | null = null;
    private magic: number = INIT_MAGIC;
    private seq: number = INIT_SEQ;
    private version: Buffer = Buffer.alloc(0x30);
    private model: number = 0; // 0 = EON Steel, 1 = EON Core
    private connected: boolean = false;

    constructor(model: number = 1) { // Default to EON Core
        this.model = model;
    }

    /**
     * Find and return all Suunto EON Steel/Core devices
     */
    static findDevices(): HID.Device[] {
        const devices = HID.devices();
        return devices.filter(d => d.vendorId === 0x1493 && d.productId === 0x0033);
    }

    /**
     * Connect to the dive computer
     */
    async connect(path?: string): Promise<boolean> {
        try {
            if (path) {
                this.device = new HID.HID(path);
            } else {
                // Find first available device
                const devices = SuuntoEonSteel.findDevices();
                if (devices.length === 0) {
                    throw new Error('No Suunto EON Steel/Core device found');
                }
                if (!devices[0].path) {
                    throw new Error('Device path not available');
                }
                this.device = new HID.HID(devices[0].path);
            }

            console.log('📡 Device opened, initializing protocol...');

            // Send init command
            const initResult = await this.initialize();
            if (!initResult) {
                throw new Error('Failed to initialize device');
            }

            this.connected = true;
            return true;
        } catch (err) {
            console.error('❌ Connection error:', err);
            return false;
        }
    }

    /**
     * Disconnect from the device
     */
    disconnect(): void {
        if (this.device) {
            this.device.close();
            this.device = null;
            this.connected = false;
        }
    }

    /**
     * Initialize the device connection
     */
    private async initialize(): Promise<boolean> {
        // Reset state
        this.magic = INIT_MAGIC;
        this.seq = INIT_SEQ;

        // Init command: [0x02, 0x00, 0x2a, 0x00]
        const initData = Buffer.from([0x02, 0x00, 0x2a, 0x00]);
        
        try {
            const response = await this.transfer(CMD_INIT, initData, 0x30);
            if (response) {
                this.version = response;
                console.log('✅ Device initialized!');
                return true;
            }
            return false;
        } catch (err) {
            console.error('Init failed:', err);
            return false;
        }
    }

    /**
     * Get device information
     */
    getDeviceInfo(): DeviceInfo | null {
        if (!this.connected || this.version.length === 0) {
            return null;
        }

        // Serial number is at offset 0x10, 16 hex chars
        const serialStr = this.version.slice(0x10, 0x20).toString('ascii').replace(/\0/g, '');
        const serial = parseInt(serialStr, 16) || 0;

        // Firmware version at offset 0x20, 4 bytes BE
        const firmware = this.version.readUInt32BE(0x20);

        return {
            model: this.model,
            firmware,
            serial,
            version: this.version
        };
    }

    /**
     * Send a command and receive a reply
     */
    private async transfer(cmd: number, data: Buffer | null, expectedSize: number): Promise<Buffer | null> {
        if (!this.device) {
            throw new Error('Device not connected');
        }

        // Build and send the command packet
        const sendResult = this.sendCommand(cmd, data);
        if (!sendResult) {
            return null;
        }

        // Receive the response
        return this.receiveResponse(cmd, expectedSize);
    }

    /**
     * Build and send a command packet
     */
    private sendCommand(cmd: number, data: Buffer | null): boolean {
        if (!this.device) return false;

        const dataSize = data ? data.length : 0;
        const buf = Buffer.alloc(PACKET_SIZE);

        // Packet header
        buf[0] = 0x3f;  // Report type
        buf[1] = dataSize + HEADER_SIZE;  // Payload size

        // 12-byte extended header:
        // 2-byte LE command word
        buf.writeUInt16LE(cmd, 2);

        // 4-byte LE magic value (ensure unsigned)
        buf.writeUInt32LE(this.magic >>> 0, 4);

        // 2-byte LE sequence number
        buf.writeUInt16LE(this.seq, 8);

        // 4-byte LE data length
        buf.writeUInt32LE(dataSize, 10);

        // Copy actual data
        if (data && dataSize > 0) {
            data.copy(buf, 14, 0, Math.min(dataSize, PACKET_SIZE - 14));
        }

        try {
            // For USB HID, we write the buffer starting from offset 1 (skip report ID in buffer)
            // The report ID 0x3f goes as the first byte
            const written = this.device.write(Array.from(buf));
            console.log(`📤 Sent command 0x${cmd.toString(16).padStart(4, '0')}, ${written} bytes`);
            return written > 0;
        } catch (err) {
            console.error('Send error:', err);
            return false;
        }
    }

    /**
     * Receive a response packet
     */
    private receiveResponse(expectedCmd: number, maxSize: number): Buffer | null {
        if (!this.device) return null;

        try {
            // Read the first packet
            const packet = Buffer.from(this.device.readSync());
            console.log(`📥 Received ${packet.length} bytes`);

            if (packet.length < 2) {
                console.error('Packet too short');
                return null;
            }

            // Check report type
            if (packet[0] !== 0x3f) {
                console.error(`Invalid report type: 0x${packet[0].toString(16)}`);
                return null;
            }

            const payloadLen = packet[1];
            if (payloadLen < HEADER_SIZE) {
                console.error('Payload too short for header');
                return null;
            }

            // Parse the 12-byte header (starts at offset 2)
            const reply = packet.readUInt16LE(2);
            const magic = packet.readUInt32LE(4);
            const seq = packet.readUInt16LE(8);
            const length = packet.readUInt32LE(10);

            console.log(`   Reply: 0x${reply.toString(16)}, Magic: 0x${magic.toString(16)}, Seq: ${seq}, Len: ${length}`);

            // For init command, the magic is special
            if (expectedCmd === CMD_INIT) {
                // Remember the magic number: keep upper 16 bits, set lower to 0x0005
                this.magic = ((magic & 0xffff0000) | 0x0005) >>> 0;
            } else {
                // Verify command reply
                if (reply !== expectedCmd) {
                    console.error(`Unexpected reply: 0x${reply.toString(16)}, expected 0x${expectedCmd.toString(16)}`);
                    return null;
                }

                // Verify magic
                if (magic !== this.magic + 5) {
                    console.error(`Unexpected magic: 0x${magic.toString(16)}, expected 0x${(this.magic + 5).toString(16)}`);
                    return null;
                }
            }

            // Verify sequence number
            if (seq !== this.seq) {
                console.error(`Unexpected seq: ${seq}, expected ${this.seq}`);
                return null;
            }

            // Increment sequence number
            this.seq++;

            // Extract initial payload data (after 12-byte header)
            let result = Buffer.alloc(length);
            let nbytes = payloadLen - HEADER_SIZE;
            if (nbytes > 0) {
                packet.copy(result, 0, 14, 14 + Math.min(nbytes, length));
            }

            // Read remaining packets if needed
            while (nbytes < length) {
                const nextPacket = Buffer.from(this.device.readSync());
                if (nextPacket.length < 2 || nextPacket[0] !== 0x3f) {
                    break;
                }
                const nextLen = nextPacket[1];
                nextPacket.copy(result, nbytes, 2, 2 + nextLen);
                nbytes += nextLen;

                // Short packet indicates end
                if (nextLen < PACKET_SIZE - 2) {
                    break;
                }
            }

            return result.slice(0, Math.min(nbytes, length));
        } catch (err) {
            console.error('Receive error:', err);
            return null;
        }
    }

    /**
     * Read a string value from the device
     */
    async readString(id: number): Promise<string | null> {
        const cmd = Buffer.alloc(4);
        cmd.writeUInt32LE(id, 0);

        const response = await this.transfer(CMD_READ_STRING, cmd, 256);
        if (response) {
            return response.toString('utf-8').replace(/\0/g, '');
        }
        return null;
    }

    /**
     * Open a directory on the device
     */
    private async openDirectory(path: string): Promise<boolean> {
        const cmd = Buffer.alloc(4 + path.length + 1);
        cmd.writeUInt32LE(0, 0);
        cmd.write(path, 4, 'utf-8');
        cmd[4 + path.length] = 0;

        const response = await this.transfer(CMD_DIR_OPEN, cmd, 256);
        return response !== null;
    }

    /**
     * Read directory entries
     */
    private async readDirectory(): Promise<{ entries: DirectoryEntry[], isLast: boolean } | null> {
        const response = await this.transfer(CMD_DIR_READDIR, null, 2048);
        if (!response || response.length < 8) {
            return null;
        }

        const nr = response.readUInt32LE(0);
        const last = response.readUInt32LE(4);

        const entries: DirectoryEntry[] = [];
        let offset = 8;

        while (offset + 8 < response.length) {
            const type = response.readUInt32LE(offset);
            const nameLen = response.readUInt32LE(offset + 4);
            
            if (offset + 8 + nameLen >= response.length) break;

            const name = response.slice(offset + 8, offset + 8 + nameLen).toString('utf-8');
            entries.push({ type, name });

            offset += 8 + nameLen + 1;
        }

        return { entries, isLast: last !== 0 };
    }

    /**
     * Close the current directory
     */
    private async closeDirectory(): Promise<boolean> {
        const response = await this.transfer(CMD_DIR_CLOSE, null, 256);
        return response !== null;
    }

    /**
     * Open a file on the device
     */
    private async openFile(path: string): Promise<boolean> {
        const cmd = Buffer.alloc(4 + path.length + 1);
        cmd.writeUInt32LE(0, 0);
        cmd.write(path, 4, 'utf-8');
        cmd[4 + path.length] = 0;

        const response = await this.transfer(CMD_FILE_OPEN, cmd, 256);
        return response !== null;
    }

    /**
     * Get file size
     */
    private async getFileSize(): Promise<number> {
        const response = await this.transfer(CMD_FILE_STAT, null, 256);
        if (!response || response.length < 8) {
            return -1;
        }
        return response.readUInt32LE(4);
    }

    /**
     * Read file data
     */
    private async readFileData(size: number): Promise<Buffer | null> {
        const result = Buffer.alloc(size);
        let offset = 0;

        while (offset < size) {
            const ask = Math.min(size - offset, 1024);
            const cmd = Buffer.alloc(8);
            cmd.writeUInt32LE(1234, 0); // Magic marker (not file offset)
            cmd.writeUInt32LE(ask, 4);  // Size to read

            const response = await this.transfer(CMD_FILE_READ, cmd, 2560);
            if (!response || response.length < 8) {
                return null;
            }

            const marker = response.readUInt32LE(0);
            const got = response.readUInt32LE(4);

            if (marker !== 1234) {
                console.error('Unexpected read marker');
                return null;
            }

            if (got === 0) break;

            response.copy(result, offset, 8, 8 + got);
            offset += got;
        }

        return result.slice(0, offset);
    }

    /**
     * Close the current file
     */
    private async closeFile(): Promise<boolean> {
        const response = await this.transfer(CMD_FILE_CLOSE, null, 256);
        return response !== null;
    }

    /**
     * Read a complete file from the device
     */
    async readFile(path: string): Promise<Buffer | null> {
        if (!await this.openFile(path)) {
            console.error('Failed to open file:', path);
            return null;
        }

        const size = await this.getFileSize();
        if (size < 0) {
            console.error('Failed to get file size');
            await this.closeFile();
            return null;
        }

        console.log(`   File size: ${size} bytes`);

        const data = await this.readFileData(size);
        await this.closeFile();

        return data;
    }

    /**
     * List all dive files on the device
     */
    async listDives(): Promise<string[]> {
        const dives: string[] = [];

        if (!await this.openDirectory(DIVE_DIRECTORY)) {
            console.error('Failed to open dive directory');
            return dives;
        }

        let done = false;
        while (!done) {
            const result = await this.readDirectory();
            if (!result) {
                break;
            }

            for (const entry of result.entries) {
                if (entry.type === DIRTYPE_FILE && entry.name.endsWith('.LOG')) {
                    dives.push(entry.name);
                }
            }

            done = result.isLast;
        }

        await this.closeDirectory();

        // Sort by timestamp (most recent first - names are hex timestamps)
        dives.sort((a, b) => b.localeCompare(a));

        return dives;
    }

    /**
     * Download a specific dive
     */
    async downloadDive(filename: string): Promise<DiveFile | null> {
        const path = `${DIVE_DIRECTORY}/${filename}`;
        console.log(`📥 Downloading: ${path}`);

        const data = await this.readFile(path);
        if (!data) {
            return null;
        }

        // Parse timestamp from filename (hex)
        const timestampHex = filename.replace('.LOG', '');
        const timestamp = parseInt(timestampHex, 16);

        return {
            name: filename,
            timestamp,
            data
        };
    }

    /**
     * Download all dives
     */
    async downloadAllDives(callback?: (dive: DiveFile, index: number, total: number) => void): Promise<DiveFile[]> {
        const diveFiles = await this.listDives();
        console.log(`📋 Found ${diveFiles.length} dive(s)`);

        const dives: DiveFile[] = [];

        for (let i = 0; i < diveFiles.length; i++) {
            const dive = await this.downloadDive(diveFiles[i]);
            if (dive) {
                dives.push(dive);
                if (callback) {
                    callback(dive, i, diveFiles.length);
                }
            }
        }

        return dives;
    }
}

// Self-test when run directly
async function main() {
    console.log('🤿 Suunto EON Steel/Core Protocol Test');
    console.log('======================================\n');

    // Find devices
    const devices = SuuntoEonSteel.findDevices();
    console.log(`Found ${devices.length} Suunto device(s)\n`);

    if (devices.length === 0) {
        console.log('❌ No Suunto EON Steel/Core device found');
        console.log('   Make sure your dive computer is:');
        console.log('   - Connected via USB');
        console.log('   - Turned on');
        console.log('   - Not in USB storage mode');
        return;
    }

    for (const d of devices) {
        console.log(`  📱 ${d.product || 'Unknown'}`);
        console.log(`     Manufacturer: ${d.manufacturer || 'Unknown'}`);
        console.log(`     Path: ${d.path}`);
    }
    console.log();

    // Connect to the first device
    const dc = new SuuntoEonSteel(1); // 1 = EON Core

    console.log('🔌 Connecting...\n');
    const connected = await dc.connect();

    if (!connected) {
        console.log('❌ Failed to connect');
        return;
    }

    console.log('\n✅ Connected!\n');

    // Get device info
    const info = dc.getDeviceInfo();
    if (info) {
        console.log('📊 Device Information:');
        console.log(`   Model: ${info.model === 0 ? 'EON Steel' : 'EON Core'}`);
        console.log(`   Firmware: ${info.firmware}`);
        console.log(`   Serial: ${info.serial}`);
        console.log(`   Version data: ${info.version.toString('hex')}`);
    }

    // List dives
    console.log('\n📂 Listing dives...');
    const diveList = await dc.listDives();
    console.log(`   Found ${diveList.length} dive(s)`);
    
    for (const dive of diveList.slice(0, 5)) { // Show first 5
        console.log(`   - ${dive}`);
    }
    if (diveList.length > 5) {
        console.log(`   ... and ${diveList.length - 5} more`);
    }

    // Download most recent dive
    if (diveList.length > 0) {
        console.log('\n📥 Downloading most recent dive...');
        const dive = await dc.downloadDive(diveList[0]);
        if (dive) {
            console.log(`   ✅ Downloaded: ${dive.name}`);
            console.log(`   📦 Size: ${dive.data.length} bytes`);
            console.log(`   ⏰ Timestamp: ${new Date(dive.timestamp * 1000).toISOString()}`);
        }
    }

    // Disconnect
    dc.disconnect();
    console.log('\n🔌 Disconnected');
}

// Run if executed directly
main().catch(console.error);
