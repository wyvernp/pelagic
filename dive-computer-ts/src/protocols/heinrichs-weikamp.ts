/**
 * Heinrichs Weikamp Protocol Implementation
 * 
 * Supports: OSTC, OSTC 2, OSTC 2N, OSTC 2C, OSTC Plus, OSTC 4, Frog
 * Based on libdivecomputer's hw_ostc.c
 * 
 * Uses simple serial protocol with command bytes.
 */

import { SerialPort } from 'serialport';
import { BaseProtocol, ProtocolDeviceInfo, ProtocolDive, Checksum, ArrayUtils } from './base-protocol';

// Constants
const SZ_HEADER = 266;
const SZ_FW_190 = 0x8000;
const SZ_FW_NEW = 0x10000;
const SZ_EEPROM = 256;
const FW_190 = 0x015A;

// Commands
const CMD_DUMP = 'a'.charCodeAt(0);
const CMD_MD2HASH = 'e'.charCodeAt(0);
const CMD_TIMESYNC = 'b'.charCodeAt(0);
const CMD_EEPROM_READ = ['g', 'j', 'm'].map(c => c.charCodeAt(0));
const CMD_EEPROM_WRITE = ['d', 'i', 'n'].map(c => c.charCodeAt(0));
const CMD_RESET = 'h'.charCodeAt(0);
const CMD_SCREENSHOT = 'l'.charCodeAt(0);

// Models based on serial number ranges
const getModel = (serial: number): { model: number; name: string } => {
    if (serial > 7000) return { model: 3, name: 'OSTC 2C' };
    if (serial > 2048) return { model: 2, name: 'OSTC 2N' };
    if (serial > 300) return { model: 1, name: 'OSTC Mk2' };
    return { model: 0, name: 'OSTC' };
};

export class HeinrichsWeikampProtocol extends BaseProtocol {
    private port: SerialPort | null = null;

    get familyName(): string {
        return 'Heinrichs Weikamp';
    }

    /**
     * Find available HW devices
     */
    static async findDevices(): Promise<string[]> {
        const ports = await SerialPort.list();
        return ports
            .filter(p => 
                p.manufacturer?.toLowerCase().includes('heinrichs') ||
                p.manufacturer?.toLowerCase().includes('ftdi') ||
                p.vendorId === '0403' // FTDI
            )
            .map(p => p.path);
    }

    async connect(path?: string): Promise<boolean> {
        try {
            const portPath = path || (await HeinrichsWeikampProtocol.findDevices())[0];
            if (!portPath) {
                console.error('No HW device found');
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

            // Wait and flush
            await this.sleep(100);
            this.port.flush();

            // Read device info by dumping header
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
            this.port.close();
            this.port = null;
        }
        this.connected = false;
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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
    private async read(size: number, timeout: number = 4000): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const buffer: number[] = [];
            const timeoutId = setTimeout(() => {
                cleanup();
                // Return what we have
                resolve(Buffer.from(buffer));
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
     * Send command and optionally wait for echo
     */
    private async sendCommand(cmd: number, waitEcho: boolean = false): Promise<void> {
        const command = Buffer.from([cmd]);
        await this.write(command);

        if (waitEcho) {
            const echo = await this.read(1);
            if (echo[0] !== cmd) {
                throw new Error(`Unexpected echo: 0x${echo[0].toString(16)}`);
            }
        }
    }

    /**
     * Read device information
     */
    private async readDeviceInfo(): Promise<void> {
        // Send dump command and read header
        await this.sendCommand(CMD_DUMP);

        // Read header
        const header = await this.read(SZ_HEADER);

        // Verify preamble
        const preamble = Buffer.from([0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0x55]);
        if (!header.slice(0, 6).equals(preamble)) {
            throw new Error('Invalid header preamble');
        }

        // Get firmware and serial
        const firmware = header.readUInt16BE(264);
        const serial = header.readUInt16LE(6);

        const { model, name } = getModel(serial);

        this.deviceInfo = {
            model,
            firmware,
            serial,
            features: [name]
        };

        console.log(`✅ Connected to ${name}`);
        console.log(`   Serial: ${serial}`);
        console.log(`   Firmware: ${firmware}`);
    }

    /**
     * Dump all dive data from device
     */
    async dumpData(): Promise<Buffer> {
        // Send dump command
        await this.sendCommand(CMD_DUMP);

        // Read header
        const header = await this.read(SZ_HEADER);

        // Get firmware to determine data size
        const firmware = header.readUInt16BE(264);
        const dataSize = firmware > FW_190 ? SZ_FW_NEW : SZ_FW_190;

        console.log(`📥 Downloading ${(SZ_HEADER + dataSize) / 1024} KB...`);

        // Read profile data
        const profileData = await this.read(dataSize, 60000);

        return Buffer.concat([header, profileData]);
    }

    async listDives(): Promise<string[]> {
        // HW protocol dumps all data at once, so we return a placeholder
        return ['all'];
    }

    async downloadDive(identifier: string): Promise<ProtocolDive | null> {
        const data = await this.dumpData();

        // The data contains all dives - return the whole blob
        // extractDives() can be used to parse individual dives
        return {
            fingerprint: data.slice(3, 8), // 5-byte fingerprint
            timestamp: Date.now(),
            data
        };
    }

    /**
     * Extract individual dives from dump data
     */
    extractDives(data: Buffer): ProtocolDive[] {
        const dives: ProtocolDive[] = [];
        const header = Buffer.from([0xFA, 0xFA]);
        const footer = Buffer.from([0xFD, 0xFD]);

        // Search backward from end
        let current = data.length;
        let previous = data.length;

        // Skip header section (266 bytes)
        const searchData = data.slice(SZ_HEADER);

        while (true) {
            // Find header marker
            const headerIdx = ArrayUtils.searchBackward(
                searchData, 
                header, 
                current - SZ_HEADER - 2
            );

            if (headerIdx < 0) break;

            // Move past header marker
            const diveStart = headerIdx;

            // Find footer
            const footerIdx = ArrayUtils.searchForward(
                searchData,
                footer,
                diveStart
            );

            if (footerIdx >= 0 && footerIdx < previous - SZ_HEADER) {
                const diveEnd = footerIdx + 2;
                const diveData = searchData.slice(diveStart, diveEnd);
                
                // Extract 5-byte fingerprint starting at offset 3
                const fingerprint = diveData.slice(3, 8);

                dives.push({
                    fingerprint,
                    timestamp: 0, // Parsed from dive data
                    data: diveData
                });

                previous = diveStart + SZ_HEADER;
            }

            current = headerIdx + SZ_HEADER;
        }

        return dives;
    }

    /**
     * Read MD2 hash from device
     */
    async readMD2Hash(): Promise<Buffer> {
        await this.sendCommand(CMD_MD2HASH);
        return this.read(18);
    }

    /**
     * Sync time with device
     */
    async syncTime(datetime: Date): Promise<boolean> {
        try {
            await this.sendCommand(CMD_TIMESYNC, true);

            const packet = Buffer.from([
                datetime.getHours(),
                datetime.getMinutes(),
                datetime.getSeconds(),
                datetime.getMonth() + 1,
                datetime.getDate(),
                datetime.getFullYear() - 2000
            ]);

            await this.write(packet);
            return true;
        } catch (err) {
            console.error('Time sync failed:', err);
            return false;
        }
    }

    /**
     * Read EEPROM bank
     */
    async readEEPROM(bank: number): Promise<Buffer> {
        if (bank > 2) {
            throw new Error('Invalid EEPROM bank');
        }

        await this.sendCommand(CMD_EEPROM_READ[bank]);
        return this.read(SZ_EEPROM);
    }

    /**
     * Write EEPROM bank
     */
    async writeEEPROM(bank: number, data: Buffer): Promise<void> {
        if (bank > 2 || data.length !== SZ_EEPROM) {
            throw new Error('Invalid EEPROM parameters');
        }

        await this.sendCommand(CMD_EEPROM_WRITE[bank], true);

        // Write bytes 4-255 with echo
        for (let i = 4; i < SZ_EEPROM; i++) {
            await this.sendCommand(data[i], true);
        }
    }

    /**
     * Reset device
     */
    async reset(): Promise<void> {
        await this.sendCommand(CMD_RESET, true);
    }
}
