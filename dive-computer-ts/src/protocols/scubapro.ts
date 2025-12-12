/**
 * Scubapro/Uwatec Smart Protocol Implementation
 * 
 * Supports: Scubapro G2, G2 TEK, G2 Console, G2 HUD, G3, 
 *           Aladin Sport Matrix, Aladin A1/A2, Luna 2.0
 *           Mantis, Mantis 2, Meridian, Chromis
 * Based on libdivecomputer's uwatec_smart.c
 * 
 * Transport:
 * - IrDA: Aladin Smart Com, Galileo Sol/Luna/Terra
 * - Serial: 19200 baud, 8N1
 * - USB HID: G2, G3, Aladin Square (various VID/PID)
 * - BLE: G2, G3, Aladin A1/A2, Luna 2.0
 * 
 * Uses command/response protocol with variable-length sample records.
 */

import HID from 'node-hid';
import { SerialPort } from 'serialport';
import { BaseProtocol, ProtocolDeviceInfo, ProtocolDive, Checksum, ArrayUtils } from './base-protocol';

// Constants
const DATASIZE_RX = 255;
const DATASIZE_TX = 254;
const PACKETSIZE_USBHID_RX = 64;
const PACKETSIZE_USBHID_TX = 32;

// Commands
const CMD_MODEL = 0x10;
const CMD_HARDWARE = 0x11;
const CMD_SOFTWARE = 0x13;
const CMD_SERIAL = 0x14;
const CMD_DEVTIME = 0x1A;
const CMD_HANDSHAKE1 = 0x1B;
const CMD_HANDSHAKE2 = 0x1C;
const CMD_DATA = 0xC4;
const CMD_SIZE = 0xC6;

// Response codes
const OK = 0x01;
const ACK = 0x11;
const NAK = 0x66;

// USB HID identifiers for Scubapro devices
const SCUBAPRO_VID = 0x2e6c;
const UWATEC_VID = 0x2e6c;

/**
 * Supported Devices with USB HID and BLE identifiers
 */
const DEVICE_INFO: Record<number, { name: string; usbPid?: number; bleName?: string }> = {
    0x10: { name: 'Smart Pro' },
    0x11: { name: 'Galileo Sol' },
    0x12: { name: 'Galileo Luna' },
    0x13: { name: 'Galileo Terra' },
    0x14: { name: 'Aladin TEC' },
    0x15: { name: 'Aladin TEC 2G' },
    0x16: { name: 'Aladin 2G' },
    0x17: { name: 'Aladin Sport Matrix', bleName: 'Aladin' },
    0x18: { name: 'Smart TEC' },
    0x19: { name: 'Smart Z' },
    0x1A: { name: 'Meridian' },
    0x1B: { name: 'Chromis' },
    0x1C: { name: 'Mantis' },
    0x1D: { name: 'Mantis 2' },
    0x1E: { name: 'G2', usbPid: 0x3201, bleName: 'G2' },
    0x1F: { name: 'Aladin Sport Matrix', bleName: 'Aladin' },
    0x20: { name: 'Aladin H Matrix', bleName: 'Aladin' },
    0x21: { name: 'G2 TEK', usbPid: 0x3201, bleName: 'G2' },
    0x22: { name: 'Aladin Square', usbPid: 0x2006 },
    0x23: { name: 'Luna 2.0', bleName: 'Luna 2.0' },
    0x24: { name: 'G2 Console', usbPid: 0x3211, bleName: 'G2' },
    0x25: { name: 'Aladin A1', bleName: 'A1' },
    0x28: { name: 'Aladin A2', bleName: 'A2' },
    0x32: { name: 'G2', usbPid: 0x3201, bleName: 'G2' },
    0x31: { name: 'G2 TEK', usbPid: 0x3201 },
    0x34: { name: 'G3', bleName: 'Galileo 3' },
    0x42: { name: 'G2 HUD', usbPid: 0x4201, bleName: 'HUD' },
    0x50: { name: 'Luna 2.0', bleName: 'Luna 2.0' },
    0x51: { name: 'Luna 2.0', bleName: 'Luna 2.0' },
};

// Keep backward compatibility
const MODELS: Record<number, string> = Object.fromEntries(
    Object.entries(DEVICE_INFO).map(([k, v]) => [k, v.name])
);

/**
 * Sample Type Codes (G2/G3 variable-length format)
 * Each sample record: [type_byte] [data_bytes...]
 */
const SAMPLE_TYPE = {
    DEPTH: 0x01,           // 3 bytes, uint24_le, 1/10 cm
    TEMPERATURE: 0x02,     // 2 bytes, int16_le, 1/100 °C
    TANK_PRESSURE: 0x03,   // 3 bytes, uint24_le (mbar + tank ID in high bits)
    RBT: 0x04,             // 1 byte, minutes
    HEARTBEAT: 0x05,       // 2 bytes, BPM + status
    BEARING: 0x06,         // 2 bytes, degrees
    TIME: 0x07,            // 4 bytes, absolute seconds
    ALARM: 0x08,           // variable, type + value
    NDL: 0x0A,             // 2 bytes, minutes
    DECO_STOP: 0x0B,       // 3 bytes, depth (cm) + time (min)
    GAS_SWITCH: 0x0C,      // 1 byte, gas index
};

/**
 * Scubapro/Uwatec Dive Sample
 */
export interface UwatecSample {
    time: number;               // seconds
    depth: number;              // meters
    temperature?: number;       // Celsius
    pressure?: { tank: number; value: number }[];  // bar per tank
    heartRate?: number;         // bpm
    bearing?: number;           // degrees
    ndl?: number;               // minutes
    deco?: { depth: number; time: number };  // meters, minutes
    rbt?: number;               // minutes
    events: string[];
}

type TransportType = 'serial' | 'usbhid' | 'ble';

export class ScubaproProtocol extends BaseProtocol {
    private transport: TransportType = 'usbhid';
    private hidDevice: HID.HID | null = null;
    private serialPort: SerialPort | null = null;
    private timestamp: number = 0;
    private systime: number = 0;
    private devtime: number = 0;

    get familyName(): string {
        return 'Scubapro/Uwatec Smart';
    }

    /**
     * Find available Scubapro USB HID devices
     */
    static findUsbDevices(): HID.Device[] {
        const devices = HID.devices();
        return devices.filter(d => 
            d.vendorId === SCUBAPRO_VID ||
            d.vendorId === UWATEC_VID ||
            d.product?.toLowerCase().includes('scubapro') ||
            d.product?.toLowerCase().includes('uwatec') ||
            d.product?.toLowerCase().includes('galileo') ||
            d.product?.toLowerCase().includes('aladin')
        );
    }

    /**
     * Find available serial ports for Scubapro devices
     */
    static async findSerialDevices(): Promise<string[]> {
        const ports = await SerialPort.list();
        return ports
            .filter(p => 
                p.manufacturer?.toLowerCase().includes('scubapro') ||
                p.manufacturer?.toLowerCase().includes('uwatec')
            )
            .map(p => p.path);
    }

    async connect(path?: string): Promise<boolean> {
        try {
            // Try USB HID first
            const hidDevices = ScubaproProtocol.findUsbDevices();
            if (hidDevices.length > 0 && hidDevices[0].path) {
                return this.connectUsb(path || hidDevices[0].path);
            }

            // Try serial
            const serialDevices = await ScubaproProtocol.findSerialDevices();
            if (serialDevices.length > 0) {
                return this.connectSerial(path || serialDevices[0]);
            }

            console.error('No Scubapro device found');
            return false;
        } catch (err) {
            console.error('Connection error:', err);
            return false;
        }
    }

    private async connectUsb(path: string): Promise<boolean> {
        try {
            this.hidDevice = new HID.HID(path);
            this.transport = 'usbhid';
            
            console.log('📡 USB HID device opened');

            // Perform handshake
            await this.handshake();

            // Read device info
            await this.readDeviceInfo();

            this.connected = true;
            return true;
        } catch (err) {
            console.error('USB connection error:', err);
            return false;
        }
    }

    private async connectSerial(path: string): Promise<boolean> {
        try {
            this.serialPort = new SerialPort({
                path,
                baudRate: 57600,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
            });

            await new Promise<void>((resolve, reject) => {
                this.serialPort!.once('open', resolve);
                this.serialPort!.once('error', reject);
            });

            this.transport = 'serial';
            this.serialPort.flush();

            // Perform handshake
            await this.handshake();

            // Read device info
            await this.readDeviceInfo();

            this.connected = true;
            return true;
        } catch (err) {
            console.error('Serial connection error:', err);
            return false;
        }
    }

    disconnect(): void {
        if (this.hidDevice) {
            this.hidDevice.close();
            this.hidDevice = null;
        }
        if (this.serialPort?.isOpen) {
            this.serialPort.close();
            this.serialPort = null;
        }
        this.connected = false;
    }

    /**
     * Send command via USB HID
     */
    private async sendUsb(cmd: number, data?: Buffer): Promise<void> {
        if (!this.hidDevice) throw new Error('Not connected');

        const size = data ? data.length : 0;
        const buf = Buffer.alloc(PACKETSIZE_USBHID_TX + 1);
        buf[0] = 0; // Report ID
        buf[1] = size + 1;
        buf[2] = cmd;
        if (data) {
            data.copy(buf, 3);
        }

        this.hidDevice.write(Array.from(buf));
    }

    /**
     * Receive data via USB HID
     */
    private async receiveUsb(size: number): Promise<Buffer> {
        if (!this.hidDevice) throw new Error('Not connected');

        const result: number[] = [];
        
        while (result.length < size) {
            const packet = Buffer.from(this.hidDevice.readSync());
            
            if (packet.length < 1) {
                throw new Error('Empty packet received');
            }

            let len = packet.length - 1;
            if (this.transport === 'usbhid' && len > packet[0]) {
                len = packet[0];
            }

            result.push(...packet.slice(1, 1 + len));
        }

        return Buffer.from(result.slice(0, size));
    }

    /**
     * Send command via serial
     */
    private async sendSerial(cmd: number, data?: Buffer): Promise<void> {
        if (!this.serialPort) throw new Error('Not connected');

        const size = data ? data.length : 0;
        const packet = Buffer.alloc(12 + size + 1);
        
        // Header
        packet[0] = 0xFF;
        packet[1] = 0xFF;
        packet[2] = 0xFF;
        packet[3] = 0xA6;
        packet[4] = 0x59;
        packet[5] = 0xBD;
        packet[6] = 0xC2;
        packet[7] = size + 1;
        packet[8] = 0x00;
        packet[9] = 0x00;
        packet[10] = 0x00;
        packet[11] = cmd;
        
        if (data) {
            data.copy(packet, 12);
        }
        
        // Checksum
        packet[12 + size] = Checksum.xor8(packet, 7, size + 5);

        return new Promise((resolve, reject) => {
            this.serialPort!.write(packet, (err) => {
                if (err) reject(err);
                else {
                    // Read echo and ACK
                    this.readSerial(packet.length + 1).then(response => {
                        if (response[response.length - 1] !== ACK) {
                            reject(new Error('No ACK received'));
                        } else {
                            resolve();
                        }
                    }).catch(reject);
                }
            });
        });
    }

    /**
     * Read data from serial port
     */
    private readSerial(size: number, timeout: number = 5000): Promise<Buffer> {
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
                this.serialPort?.removeListener('data', onData);
            };

            this.serialPort!.on('data', onData);
        });
    }

    /**
     * Receive data via serial with packet handling
     */
    private async receiveSerial(size: number): Promise<Buffer> {
        const result: number[] = [];

        while (result.length < size) {
            // Read header
            const header = await this.readSerial(5);
            
            const len = header.readUInt32LE(0);
            const cmd = header[4];

            // Read data
            const data = await this.readSerial(len - 1);

            // Read checksum
            const csum = (await this.readSerial(1))[0];

            // Verify checksum
            const allData = Buffer.concat([header, data]);
            if (Checksum.xor8(allData) !== csum) {
                throw new Error('Checksum error');
            }

            result.push(...data);
        }

        return Buffer.from(result.slice(0, size));
    }

    /**
     * Transfer command and receive response
     */
    private async transfer(cmd: number, data?: Buffer, responseSize?: number): Promise<Buffer> {
        if (this.transport === 'usbhid') {
            await this.sendUsb(cmd, data);
            return responseSize ? await this.receiveUsb(responseSize) : Buffer.alloc(0);
        } else {
            await this.sendSerial(cmd, data);
            return responseSize ? await this.receiveSerial(responseSize) : Buffer.alloc(0);
        }
    }

    /**
     * Perform handshake (serial only, skip for BLE/USB HID)
     */
    private async handshake(): Promise<void> {
        if (this.transport === 'usbhid' || this.transport === 'ble') {
            return; // No handshake needed
        }

        // Handshake stage 1
        const response1 = await this.transfer(CMD_HANDSHAKE1, undefined, 1);
        if (response1[0] !== OK) {
            throw new Error('Handshake 1 failed');
        }

        // Handshake stage 2
        const params = Buffer.from([0x10, 0x27, 0x00, 0x00]);
        const response2 = await this.transfer(CMD_HANDSHAKE2, params, 1);
        if (response2[0] !== OK) {
            throw new Error('Handshake 2 failed');
        }
    }

    /**
     * Read device information
     */
    private async readDeviceInfo(): Promise<void> {
        // Read model
        const model = await this.transfer(CMD_MODEL, undefined, 1);
        
        // Read hardware version
        const hardware = await this.transfer(CMD_HARDWARE, undefined, 1);

        // Read software version
        const software = await this.transfer(CMD_SOFTWARE, undefined, 1);

        // Read serial number
        const serial = await this.transfer(CMD_SERIAL, undefined, 4);

        // Read device time
        const devtime = await this.transfer(CMD_DEVTIME, undefined, 4);

        this.devtime = devtime.readUInt32LE(0);
        this.systime = Date.now();

        const modelNum = model[0];
        const serialNum = serial.readUInt32LE(0);
        const firmwareNum = ArrayUtils.bcd2dec(software[0]);

        this.deviceInfo = {
            model: modelNum,
            firmware: firmwareNum,
            serial: serialNum,
            hardwareVersion: hardware[0],
            features: [MODELS[modelNum] || `Unknown (0x${modelNum.toString(16)})`]
        };

        console.log(`✅ Connected to ${MODELS[modelNum] || 'Scubapro device'}`);
        console.log(`   Model: 0x${modelNum.toString(16)}`);
        console.log(`   Serial: ${serialNum}`);
        console.log(`   Firmware: ${firmwareNum}`);
    }

    async listDives(): Promise<string[]> {
        // Get data size
        const params = Buffer.alloc(8);
        params.writeUInt32LE(this.timestamp, 0);
        params[4] = 0x10;
        params[5] = 0x27;

        const sizeResponse = await this.transfer(CMD_SIZE, params, 4);
        const dataSize = sizeResponse.readUInt32LE(0);

        if (dataSize === 0) {
            return [];
        }

        // Return a placeholder - actual dive parsing happens in downloadAllDives
        // The Uwatec protocol downloads all dive data at once, not individual dives
        return [`bulk:${dataSize}`];
    }

    async downloadDive(identifier: string): Promise<ProtocolDive | null> {
        // Parse identifier
        const [, sizeStr] = identifier.split(':');
        const dataSize = parseInt(sizeStr);

        if (dataSize === 0) {
            return null;
        }

        // Request data
        const params = Buffer.alloc(8);
        params.writeUInt32LE(this.timestamp, 0);
        params[4] = 0x10;
        params[5] = 0x27;

        // Get total size
        const sizeResponse = await this.transfer(CMD_DATA, params, 4);
        const totalSize = sizeResponse.readUInt32LE(0);

        if (totalSize !== dataSize + 4) {
            console.warn(`Size mismatch: expected ${dataSize + 4}, got ${totalSize}`);
        }

        // Download data
        console.log(`📥 Downloading ${dataSize} bytes...`);
        const data = await (this.transport === 'usbhid' 
            ? this.receiveUsb(dataSize)
            : this.receiveSerial(dataSize));

        // The data contains multiple dives - return the whole blob
        // Actual parsing is done by the caller using extractDives()
        return {
            fingerprint: data.slice(8, 12),
            timestamp: Date.now(),
            data
        };
    }

    /**
     * Extract individual dives from bulk data
     */
    extractDives(data: Buffer): ProtocolDive[] {
        const dives: ProtocolDive[] = [];
        const header = Buffer.from([0xa5, 0xa5, 0x5a, 0x5a]);

        // Search backward for dive headers
        let previous = data.length;
        let current = data.length >= 4 ? data.length - 4 : 0;

        while (current > 0) {
            current--;
            
            if (data.slice(current, current + 4).equals(header)) {
                // Get dive length
                const len = data.readUInt32LE(current + 4);

                // Validate
                if (current + len <= previous) {
                    const diveData = data.slice(current, current + len);
                    const fingerprint = diveData.slice(8, 12);

                    dives.push({
                        fingerprint,
                        timestamp: 0, // Parsed from dive data
                        data: diveData
                    });
                }

                previous = current;
                current = current >= 4 ? current - 4 : 0;
            }
        }

        return dives;
    }

    /**
     * Parse variable-length sample stream (G2/G3 format)
     * Each record: [type] [data...]
     * New sample starts with DEPTH type (0x01)
     */
    parseSamples(data: Buffer, sampleInterval: number = 4): UwatecSample[] {
        const samples: UwatecSample[] = [];
        let offset = 0;
        let time = 0;
        let currentSample: UwatecSample | null = null;

        // Skip dive header (find first sample by searching for depth type)
        while (offset < data.length && data[offset] !== SAMPLE_TYPE.DEPTH) {
            offset++;
        }

        while (offset < data.length) {
            const type = data[offset++];

            switch (type) {
                case SAMPLE_TYPE.DEPTH: {
                    // New sample starts with depth
                    if (currentSample) {
                        samples.push(currentSample);
                        time += sampleInterval;
                    }
                    if (offset + 3 > data.length) break;
                    const rawDepth = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
                    offset += 3;
                    currentSample = {
                        time,
                        depth: rawDepth / 10000, // 1/10 cm to meters
                        events: [],
                    };
                    break;
                }

                case SAMPLE_TYPE.TEMPERATURE: {
                    if (!currentSample || offset + 2 > data.length) break;
                    currentSample.temperature = data.readInt16LE(offset) / 100; // 1/100 °C
                    offset += 2;
                    break;
                }

                case SAMPLE_TYPE.TANK_PRESSURE: {
                    if (!currentSample || offset + 3 > data.length) break;
                    const raw = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
                    const tank = (raw >> 20) & 0x0F;  // Tank ID in high bits
                    const pressure = (raw & 0x0FFFFF) / 1000; // mbar to bar
                    offset += 3;
                    if (!currentSample.pressure) currentSample.pressure = [];
                    currentSample.pressure.push({ tank, value: pressure });
                    break;
                }

                case SAMPLE_TYPE.RBT: {
                    if (!currentSample || offset >= data.length) break;
                    currentSample.rbt = data[offset++];
                    break;
                }

                case SAMPLE_TYPE.HEARTBEAT: {
                    if (!currentSample || offset + 2 > data.length) break;
                    currentSample.heartRate = data[offset]; // BPM
                    // data[offset + 1] is status
                    offset += 2;
                    break;
                }

                case SAMPLE_TYPE.BEARING: {
                    if (!currentSample || offset + 2 > data.length) break;
                    currentSample.bearing = data.readUInt16LE(offset);
                    offset += 2;
                    break;
                }

                case SAMPLE_TYPE.TIME: {
                    if (offset + 4 > data.length) break;
                    // Absolute time in seconds - useful for time sync
                    offset += 4;
                    break;
                }

                case SAMPLE_TYPE.ALARM: {
                    if (!currentSample || offset >= data.length) break;
                    const alarmType = data[offset++];
                    const alarmNames: Record<number, string> = {
                        0x01: 'ascent_rate',
                        0x02: 'max_depth',
                        0x03: 'safety_stop',
                        0x04: 'deco_violation',
                        0x05: 'po2_high',
                        0x06: 'po2_low',
                        0x07: 'battery_low',
                        0x08: 'missed_deco',
                    };
                    currentSample.events.push(alarmNames[alarmType] || `alarm_${alarmType}`);
                    break;
                }

                case SAMPLE_TYPE.NDL: {
                    if (!currentSample || offset + 2 > data.length) break;
                    currentSample.ndl = data.readUInt16LE(offset);
                    offset += 2;
                    break;
                }

                case SAMPLE_TYPE.DECO_STOP: {
                    if (!currentSample || offset + 3 > data.length) break;
                    const decoDepthCm = data.readUInt16LE(offset);
                    const decoTime = data[offset + 2];
                    offset += 3;
                    currentSample.deco = {
                        depth: decoDepthCm / 100, // cm to meters
                        time: decoTime,
                    };
                    break;
                }

                case SAMPLE_TYPE.GAS_SWITCH: {
                    if (!currentSample || offset >= data.length) break;
                    const gasIndex = data[offset++];
                    currentSample.events.push(`gas_switch:${gasIndex}`);
                    break;
                }

                default:
                    // Unknown type, try to continue
                    // Most unknown records are 1-2 bytes
                    if (type < 0x80) {
                        offset++; // Skip one byte
                    }
                    break;
            }
        }

        // Don't forget the last sample
        if (currentSample) {
            samples.push(currentSample);
        }

        return samples;
    }

    /**
     * Parse dive header (G2/G3 format)
     * Returns dive metadata extracted from header
     */
    parseDiveHeader(data: Buffer): {
        timestamp: number;
        duration: number;
        maxDepth: number;
        minTemp: number;
        diveMode: number;
        gasCount: number;
        gases: Array<{ o2: number; he: number; depth: number }>;
    } | null {
        // Check header signature
        const header = Buffer.from([0xa5, 0xa5, 0x5a, 0x5a]);
        if (!data.slice(0, 4).equals(header)) {
            return null;
        }

        // Parse header fields
        const timestamp = data.readUInt32LE(4); // Unix + timezone
        const duration = data.readUInt32LE(8);  // seconds
        const maxDepth = data.readUInt16LE(12); // cm
        const minTemp = data.readInt16LE(14);   // 1/10 °C
        const diveMode = data[16];              // 0=OC, 1=Gauge, 2=Free
        const gasCount = data[17];

        // Parse gas mixes
        const gases: Array<{ o2: number; he: number; depth: number }> = [];
        let offset = 18;
        for (let i = 0; i < gasCount && offset + 8 <= data.length; i++) {
            gases.push({
                o2: data[offset],
                he: data[offset + 1],
                depth: data.readUInt16LE(offset + 2),
            });
            offset += 8;
        }

        return {
            timestamp,
            duration,
            maxDepth: maxDepth / 100, // cm to meters
            minTemp: minTemp / 10,    // 1/10 °C to °C
            diveMode,
            gasCount,
            gases,
        };
    }

    /**
     * Check if a model supports heart rate monitoring
     */
    static supportsHeartRate(model: number): boolean {
        // Galileo series and some newer models support HR via ANT+
        return [0x11, 0x12, 0x13, 0x1E, 0x21, 0x24, 0x32, 0x34].includes(model);
    }

    /**
     * Get USB PID for a model number
     */
    static getUsbPid(model: number): number | null {
        return DEVICE_INFO[model]?.usbPid || null;
    }

    /**
     * Get BLE name prefix for a model number
     */
    static getBleName(model: number): string | null {
        return DEVICE_INFO[model]?.bleName || null;
    }

    /**
     * Find model from BLE name
     */
    static getModelFromBleName(bleName: string): number | null {
        for (const [modelStr, info] of Object.entries(DEVICE_INFO)) {
            if (info.bleName && bleName.toLowerCase().startsWith(info.bleName.toLowerCase())) {
                return parseInt(modelStr);
            }
        }
        return null;
    }

    setFingerprint(fingerprint: Buffer): void {
        super.setFingerprint(fingerprint);
        if (fingerprint.length >= 4) {
            this.timestamp = fingerprint.readUInt32LE(0);
        }
    }
}
