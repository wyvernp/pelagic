/**
 * Suunto EON Steel/Core/D5 Protocol Implementation using WebHID
 * 
 * This is a browser-compatible implementation of the Suunto protocol
 * using the WebHID API instead of node-hid.
 * 
 * Protocol documentation reverse-engineered from libdivecomputer
 */

// Protocol constants
const PACKET_SIZE = 64;
const HEADER_SIZE = 12;

// Commands
const CMD_INIT = 0x0000;
const CMD_READ_STRING = 0x0411;
const CMD_DIR_OPEN = 0x0810;
const CMD_DIR_READDIR = 0x0910;
const CMD_DIR_CLOSE = 0x0a10;
const CMD_FILE_OPEN = 0x0010;
const CMD_FILE_STAT = 0x0710;
const CMD_FILE_READ = 0x0110;
const CMD_FILE_CLOSE = 0x0210;

// Directory types - from libdivecomputer
const DIRTYPE_FILE = 0x0001;  // File entry
const DIRTYPE_DIR = 0x0002;   // Directory entry

// Dive directory path
const DIVE_DIRECTORY = '0:/dives';

// Suunto USB HID VID/PID
const SUUNTO_VENDOR_ID = 0x1493;
const EON_STEEL_PRODUCT_ID = 0x0030;
const EON_CORE_PRODUCT_ID = 0x0033;

// Models
const MODEL_EON_STEEL = 0;
const MODEL_EON_CORE = 1;

export interface DiveFile {
  name: string;
  timestamp: number;
  data: Uint8Array;
}

export interface DeviceInfo {
  model: number;
  firmware: number;
  serial: number;
  version: Uint8Array;
}

interface DirectoryEntry {
  type: number;
  name: string;
}

// WebHID types (for TypeScript)
interface HIDDevice {
  vendorId: number;
  productId: number;
  productName?: string;
  opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  addEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
  removeEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
  oninputreport: ((event: HIDInputReportEvent) => void) | null;
}

interface HIDInputReportEvent {
  device: HIDDevice;
  reportId: number;
  data: DataView;
}

interface WebHID {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options?: { filters?: Array<{ vendorId: number; productId?: number }> }): Promise<HIDDevice[]>;
}

export class SuuntoEonSteelWebHID {
  private device: HIDDevice | null = null;
  private magic: number = 0;
  private seq: number = 0;
  private version: Uint8Array = new Uint8Array(0);
  private model: number;
  
  // For receiving data
  private receiveBuffer: Uint8Array[] = [];
  private receiveResolve: ((data: Uint8Array | null) => void) | null = null;
  private receiveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(model: number = MODEL_EON_CORE) {
    this.model = model;
  }

  /**
   * Check if WebHID is available
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'hid' in navigator;
  }

  /**
   * Request a Suunto device via WebHID picker
   */
  static async requestDevice(): Promise<HIDDevice | null> {
    if (!this.isSupported()) {
      throw new Error('WebHID is not supported in this browser');
    }

    const hid = (navigator as Navigator & { hid: WebHID }).hid;
    
    try {
      const devices = await hid.requestDevice({
        filters: [
          { vendorId: SUUNTO_VENDOR_ID, productId: EON_STEEL_PRODUCT_ID },
          { vendorId: SUUNTO_VENDOR_ID, productId: EON_CORE_PRODUCT_ID },
        ]
      });

      return devices.length > 0 ? devices[0] : null;
    } catch (err) {
      if ((err as Error).name === 'NotFoundError') {
        return null; // User cancelled
      }
      throw err;
    }
  }

  /**
   * Get already-paired Suunto devices
   */
  static async getPairedDevices(): Promise<HIDDevice[]> {
    if (!this.isSupported()) {
      return [];
    }

    const hid = (navigator as Navigator & { hid: WebHID }).hid;
    const devices = await hid.getDevices();
    
    return devices.filter(d => 
      d.vendorId === SUUNTO_VENDOR_ID && 
      (d.productId === EON_STEEL_PRODUCT_ID || d.productId === EON_CORE_PRODUCT_ID)
    );
  }

  /**
   * Connect to a Suunto device
   */
  async connect(device?: HIDDevice): Promise<boolean> {
    try {
      // Get device if not provided
      if (!device) {
        device = await SuuntoEonSteelWebHID.requestDevice() ?? undefined;
      }

      if (!device) {
        console.error('No device selected');
        return false;
      }

      this.device = device;
      console.log(`🔌 Connecting to device: VID=0x${device.vendorId.toString(16)}, PID=0x${device.productId.toString(16)}`);
      console.log(`   Product: ${device.productName || 'Unknown'}`);

      // Determine model from product ID
      if (device.productId === EON_STEEL_PRODUCT_ID) {
        this.model = MODEL_EON_STEEL;
        console.log('   Model: EON Steel');
      } else if (device.productId === EON_CORE_PRODUCT_ID) {
        this.model = MODEL_EON_CORE;
        console.log('   Model: EON Core');
      }

      // Open the device
      if (!device.opened) {
        console.log('📱 Opening HID device...');
        await device.open();
        console.log('✅ HID device opened');
      }

      // Setup input report handler
      device.addEventListener('inputreport', this.handleInputReport.bind(this));
      console.log('📡 Input report handler registered');

      // Initialize protocol - per libdivecomputer: INIT_MAGIC=1, INIT_SEQ=0
      this.magic = 1;  // INIT_MAGIC
      this.seq = 0;    // INIT_SEQ

      // Send init command
      console.log('🚀 Sending init command...');
      const initData = new Uint8Array([0x02, 0x00, 0x2a, 0x00]);
      const response = await this.transfer(CMD_INIT, initData, 0x30);
      
      if (!response || response.length < 0x30) {
        console.error('Init failed - invalid response', response ? `(got ${response.length} bytes)` : '(null)');
        await this.disconnect();
        return false;
      }

      this.version = response;
      console.log('✅ Connected to Suunto device');
      console.log(`   Version data (first 32 bytes): ${Array.from(response.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

      // Try to read some device info
      const deviceInfo = this.getDeviceInfo();
      if (deviceInfo) {
        console.log(`   Serial: ${deviceInfo.serial}`);
        console.log(`   Firmware: ${deviceInfo.firmware}`);
      }

      return true;
    } catch (error) {
      console.error('Connection error:', error);
      await this.disconnect();
      return false;
    }
  }

  /**
   * Disconnect from the device
   */
  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        if (this.device.opened) {
          await this.device.close();
        }
      } catch (err) {
        console.error('Error closing device:', err);
      }
      this.device = null;
    }
  }

  /**
   * Handle incoming HID input reports
   */
  private handleInputReport(event: HIDInputReportEvent): void {
    // WebHID gives us the data WITHOUT the report ID
    // We need to prepend it for protocol compatibility
    const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
    
    // Create packet with report ID prepended
    const packet = new Uint8Array(data.length + 1);
    packet[0] = event.reportId;  // Should be 0x3f
    packet.set(data, 1);
    
    console.log(`📥 HID Input Report: reportId=0x${event.reportId.toString(16)}, dataLen=${data.length}`);
    
    this.receiveBuffer.push(packet);
    
    // If we're waiting for data, resolve immediately
    if (this.receiveResolve) {
      if (this.receiveTimeout) {
        clearTimeout(this.receiveTimeout);
        this.receiveTimeout = null;
      }
      const resolve = this.receiveResolve;
      this.receiveResolve = null;
      resolve(this.receiveBuffer.shift() || null);
    }
  }

  /**
   * Wait for an input report with timeout
   */
  private async waitForReport(timeoutMs: number = 5000): Promise<Uint8Array | null> {
    // Check if we already have data buffered
    if (this.receiveBuffer.length > 0) {
      return this.receiveBuffer.shift() || null;
    }

    // Wait for data
    return new Promise<Uint8Array | null>((resolve) => {
      this.receiveResolve = resolve;
      this.receiveTimeout = setTimeout(() => {
        this.receiveResolve = null;
        resolve(null);
      }, timeoutMs);
    });
  }

  /**
   * Get device information
   */
  getDeviceInfo(): DeviceInfo | null {
    if (this.version.length < 0x30) {
      return null;
    }

    // Serial number is at offset 0x10, 16 hex chars
    const serialBytes = this.version.slice(0x10, 0x20);
    const serialStr = String.fromCharCode(...serialBytes).replace(/\0/g, '');
    const serial = parseInt(serialStr, 16) || 0;

    // Firmware version at offset 0x20, 4 bytes BE
    const firmware = (this.version[0x20] << 24) | 
                     (this.version[0x21] << 16) | 
                     (this.version[0x22] << 8) | 
                     this.version[0x23];

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
  private async transfer(cmd: number, data: Uint8Array | null, _expectedSize: number): Promise<Uint8Array | null> {
    if (!this.device || !this.device.opened) {
      throw new Error('Device not connected');
    }

    // Build and send the command packet
    const sendResult = await this.sendCommand(cmd, data);
    if (!sendResult) {
      return null;
    }

    // Receive the response
    return this.receiveResponse(cmd, _expectedSize);
  }

  /**
   * Build and send a command packet
   */
  private async sendCommand(cmd: number, data: Uint8Array | null): Promise<boolean> {
    if (!this.device || !this.device.opened) return false;

    const dataSize = data ? data.length : 0;
    
    // Build the packet (without report ID - WebHID handles that separately)
    // Total packet size is PACKET_SIZE - 1 since we don't include report ID in the data
    const buf = new Uint8Array(PACKET_SIZE - 1);

    // Packet header (offset 0 in buf = offset 1 in full packet)
    buf[0] = dataSize + HEADER_SIZE;  // Payload size

    // 12-byte extended header starts at offset 1 (offset 2 in full packet):
    // 2-byte LE command word
    buf[1] = cmd & 0xff;
    buf[2] = (cmd >> 8) & 0xff;

    // 4-byte LE magic value
    const magic = this.magic >>> 0;
    buf[3] = magic & 0xff;
    buf[4] = (magic >> 8) & 0xff;
    buf[5] = (magic >> 16) & 0xff;
    buf[6] = (magic >> 24) & 0xff;

    // 2-byte LE sequence number
    buf[7] = this.seq & 0xff;
    buf[8] = (this.seq >> 8) & 0xff;

    // 4-byte LE data length
    buf[9] = dataSize & 0xff;
    buf[10] = (dataSize >> 8) & 0xff;
    buf[11] = (dataSize >> 16) & 0xff;
    buf[12] = (dataSize >> 24) & 0xff;

    // Copy actual data (starts at offset 13 in buf = offset 14 in full packet)
    if (data && dataSize > 0) {
      buf.set(data.slice(0, Math.min(dataSize, buf.length - 13)), 13);
    }

    try {
      // Send using WebHID - report ID is passed separately
      console.log(`📤 Sending cmd 0x${cmd.toString(16).padStart(4, '0')}, magic=0x${magic.toString(16)}, seq=${this.seq}, dataLen=${dataSize}`);
      console.log(`   Packet: ${Array.from(buf.slice(0, Math.min(32, buf.length))).map(b => b.toString(16).padStart(2, '0')).join(' ')}...`);
      
      await this.device.sendReport(0x3f, buf);
      return true;
    } catch (err) {
      console.error('Send error:', err);
      return false;
    }
  }

  /**
   * Receive a response packet
   */
  private async receiveResponse(expectedCmd: number, _maxSize: number): Promise<Uint8Array | null> {
    if (!this.device) return null;

    try {
      // Read the first packet
      const rawPacket = await this.waitForReport(5000);
      if (!rawPacket) {
        console.error('❌ Timeout waiting for response');
        return null;
      }

      // WebHID gives us data without report ID, but handleInputReport prepends it
      // So rawPacket[0] = reportId (0x3f), rawPacket[1] = payload length
      const packet = rawPacket;
      console.log(`📥 Received ${packet.length} bytes, first 20: ${Array.from(packet.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

      if (packet.length < 2) {
        console.error('Packet too short');
        return null;
      }

      // Check report type (should be 0x3f)
      if (packet[0] !== 0x3f) {
        console.error(`Invalid report type: 0x${packet[0].toString(16)}, expected 0x3f`);
        return null;
      }

      const payloadLen = packet[1];
      console.log(`   Payload length: ${payloadLen}`);
      
      if (payloadLen < HEADER_SIZE) {
        console.error(`Payload too short for header: ${payloadLen} < ${HEADER_SIZE}`);
        return null;
      }

      // Per libdivecomputer: receive function removes first 2 bytes (report type + length)
      // So header starts at what would be offset 2 in the raw packet
      // But in the "result" buffer, it starts at offset 0
      // We have the full packet, so header is at offset 2
      
      // Parse the 12-byte header (starts at offset 2 after report type and length)
      const reply = packet[2] | (packet[3] << 8);
      const magic = (packet[4] | (packet[5] << 8) | (packet[6] << 16) | (packet[7] << 24)) >>> 0;
      const seq = packet[8] | (packet[9] << 8);
      const length = (packet[10] | (packet[11] << 8) | (packet[12] << 16) | (packet[13] << 24)) >>> 0;

      console.log(`   Reply: 0x${reply.toString(16).padStart(4, '0')}, Magic: 0x${magic.toString(16)}, Seq: ${seq}, DataLen: ${length}`);

      // For init command, the magic is special
      if (expectedCmd === CMD_INIT) {
        // Remember the magic number: keep upper 16 bits, set lower to 0x0005
        this.magic = ((magic & 0xffff0000) | 0x0005) >>> 0;
        console.log(`   Init: New magic = 0x${this.magic.toString(16)}`);
      } else {
        // Verify command reply
        if (reply !== expectedCmd) {
          console.error(`Unexpected reply: 0x${reply.toString(16)}, expected 0x${expectedCmd.toString(16)}`);
          return null;
        }

        // Verify magic - device returns magic+5
        // Per libdivecomputer: magic is NOT updated after commands (stays constant after init)
        const expectedMagic = (this.magic + 5) >>> 0;
        if (magic !== expectedMagic) {
          console.warn(`Magic mismatch: 0x${magic.toString(16)}, expected 0x${expectedMagic.toString(16)}`);
          // Don't fail, but log the mismatch
        }
        // NOTE: magic is NOT incremented after each command - only set during init
      }

      // Verify sequence number
      if (seq !== this.seq) {
        console.error(`Unexpected seq: ${seq}, expected ${this.seq}`);
        return null;
      }

      // Increment sequence number for next command
      this.seq++;

      // Extract payload data (after 12-byte header, starts at offset 14 in full packet)
      const result = new Uint8Array(length);
      let nbytes = payloadLen - HEADER_SIZE;
      if (nbytes > 0) {
        const copyLen = Math.min(nbytes, length, packet.length - 14);
        result.set(packet.slice(14, 14 + copyLen), 0);
        console.log(`   Copied ${copyLen} bytes from first packet`);
      }

      // Read remaining packets if needed
      while (nbytes < length) {
        console.log(`   Need more data: ${nbytes}/${length}`);
        const nextRawPacket = await this.waitForReport(5000);
        if (!nextRawPacket || nextRawPacket.length < 2) {
          console.error('Failed to get continuation packet');
          break;
        }
        if (nextRawPacket[0] !== 0x3f) {
          console.error(`Invalid continuation report type: 0x${nextRawPacket[0].toString(16)}`);
          break;
        }
        const nextPacket = nextRawPacket;
        const nextLen = nextPacket[1];
        // Continuation packets have data starting at offset 2 (no header, just raw data)
        const copyLen = Math.min(nextLen, length - nbytes, nextPacket.length - 2);
        result.set(nextPacket.slice(2, 2 + copyLen), nbytes);
        nbytes += nextLen;
        console.log(`   Continuation: got ${nextLen} bytes, total ${nbytes}/${length}`);

        // Short packet indicates end (less than max payload of 62 bytes)
        if (nextLen < PACKET_SIZE - 2) {
          break;
        }
      }

      console.log(`   ✅ Response complete: ${Math.min(nbytes, length)} bytes`);
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
    const cmd = new Uint8Array(4);
    cmd[0] = id & 0xff;
    cmd[1] = (id >> 8) & 0xff;
    cmd[2] = (id >> 16) & 0xff;
    cmd[3] = (id >> 24) & 0xff;

    const response = await this.transfer(CMD_READ_STRING, cmd, 256);
    if (response) {
      return String.fromCharCode(...response).replace(/\0/g, '');
    }
    return null;
  }

  /**
   * Open a directory on the device
   */
  private async openDirectory(path: string): Promise<boolean> {
    console.log(`📂 openDirectory("${path}")`);
    
    // Command format per libdivecomputer:
    // - 4 bytes: flags (all zeros)
    // - path string bytes
    // - 1 byte: null terminator
    // Total: 4 + path.length + 1
    const pathBytes = new TextEncoder().encode(path);
    const cmdLen = 4 + pathBytes.length + 1;
    const cmd = new Uint8Array(cmdLen);
    
    // First 4 bytes are flags (0) - already zero-filled
    // Copy path starting at offset 4
    cmd.set(pathBytes, 4);
    // Null terminator is already 0 due to Uint8Array initialization
    
    console.log(`   Command length: ${cmdLen} bytes`);
    console.log(`   Command data: ${Array.from(cmd).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    console.log(`   As string: [flags:0000] + "${path}" + [null]`);
    
    const response = await this.transfer(CMD_DIR_OPEN, cmd, 256);
    console.log(`   Response: ${response ? `${response.length} bytes` : 'null'}`);
    if (response) {
      console.log(`   Response data: ${Array.from(response.slice(0, Math.min(32, response.length))).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }
    return response !== null;
  }

  /**
   * Read directory entries
   */
  private async readDirectory(): Promise<{ entries: DirectoryEntry[], isLast: boolean } | null> {
    console.log('📖 readDirectory()');
    const response = await this.transfer(CMD_DIR_READDIR, null, 2048);
    if (!response) {
      console.error('   No response from readdir');
      return null;
    }
    
    console.log(`   Response: ${response.length} bytes`);
    console.log(`   Raw data: ${Array.from(response.slice(0, Math.min(64, response.length))).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    if (response.length < 8) {
      console.error(`   Response too short: ${response.length} < 8`);
      return null;
    }

    // Per libdivecomputer: result[0..3] = nr (number of entries), result[4..7] = last flag
    const nr = response[0] | (response[1] << 8) | (response[2] << 16) | (response[3] << 24);
    const last = response[4] | (response[5] << 8) | (response[6] << 16) | (response[7] << 24);
    
    console.log(`   nr=${nr}, last=${last}`);

    const entries: DirectoryEntry[] = [];
    
    // Parse directory entries starting at offset 8
    // Per libdivecomputer parse_dirent: each entry is type(4) + namelen(4) + name(namelen) + null(1)
    let p = 8;
    let len = response.length - 8;

    while (len > 8) {
      const type = response[p] | (response[p + 1] << 8) | 
                   (response[p + 2] << 16) | (response[p + 3] << 24);
      const nameLen = response[p + 4] | (response[p + 5] << 8) | 
                      (response[p + 6] << 16) | (response[p + 7] << 24);
      
      console.log(`   Entry at offset ${p}: type=${type}, nameLen=${nameLen}`);
      
      // Validate: need nameLen + 8 + 1 bytes total, and null terminator must be present
      if (nameLen + 8 + 1 > len) {
        console.log(`   Breaking: not enough data for entry (need ${nameLen + 8 + 1}, have ${len})`);
        break;
      }
      
      // Check null terminator
      if (response[p + 8 + nameLen] !== 0) {
        console.log(`   Breaking: missing null terminator at offset ${p + 8 + nameLen}`);
        break;
      }

      const nameBytes = response.slice(p + 8, p + 8 + nameLen);
      const name = String.fromCharCode(...nameBytes);
      console.log(`   Entry name: "${name}" (type=${type})`);
      entries.push({ type, name });

      // Advance to next entry
      p += 8 + nameLen + 1;
      len -= 8 + nameLen + 1;
    }

    console.log(`   Parsed ${entries.length} entries, isLast=${last !== 0}`);
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
    console.log(`📄 openFile("${path}")`);
    
    // Command format per libdivecomputer:
    // - 4 bytes: flags (all zeros)
    // - path string bytes
    // - 1 byte: null terminator
    const pathBytes = new TextEncoder().encode(path);
    const cmdLen = 4 + pathBytes.length + 1;
    const cmd = new Uint8Array(cmdLen);
    
    // First 4 bytes are flags (0) - already zero-filled
    // Copy path starting at offset 4
    cmd.set(pathBytes, 4);
    // Null terminator is already 0
    
    console.log(`   Command length: ${cmdLen} bytes`);
    console.log(`   Command data: ${Array.from(cmd).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

    const response = await this.transfer(CMD_FILE_OPEN, cmd, 256);
    console.log(`   Response: ${response ? `${response.length} bytes` : 'null'}`);
    return response !== null;
  }

  /**
   * Get file size
   */
  private async getFileSize(): Promise<number> {
    console.log('📏 getFileSize()');
    const response = await this.transfer(CMD_FILE_STAT, null, 256);
    if (!response) {
      console.error('   No response from file stat');
      return -1;
    }
    console.log(`   Response: ${response.length} bytes`);
    console.log(`   Raw data: ${Array.from(response.slice(0, Math.min(16, response.length))).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    if (response.length < 8) {
      console.error(`   Response too short: ${response.length} < 8`);
      return -1;
    }
    // Size is at offset 4, 4 bytes LE (per libdivecomputer)
    const size = response[4] | (response[5] << 8) | (response[6] << 16) | (response[7] << 24);
    console.log(`   File size: ${size} bytes`);
    return size;
  }

  /**
   * Read file data
   */
  private async readFileData(size: number): Promise<Uint8Array | null> {
    console.log(`📖 readFileData(${size})`);
    const result = new Uint8Array(size);
    let offset = 0;

    while (offset < size) {
      const ask = Math.min(size - offset, 1024);
      const cmd = new Uint8Array(8);
      
      // Magic marker (1234 = 0x4D2)
      cmd[0] = 0xd2;
      cmd[1] = 0x04;
      cmd[2] = 0x00;
      cmd[3] = 0x00;
      
      // Size to read
      cmd[4] = ask & 0xff;
      cmd[5] = (ask >> 8) & 0xff;
      cmd[6] = (ask >> 16) & 0xff;
      cmd[7] = (ask >> 24) & 0xff;

      console.log(`   Reading chunk: offset=${offset}, ask=${ask}`);
      const response = await this.transfer(CMD_FILE_READ, cmd, 2560);
      if (!response) {
        console.error('   No response from file read');
        return null;
      }
      console.log(`   Response: ${response.length} bytes`);
      
      if (response.length < 8) {
        console.error(`   Response too short: ${response.length} < 8`);
        return null;
      }

      const marker = response[0] | (response[1] << 8) | (response[2] << 16) | (response[3] << 24);
      const got = response[4] | (response[5] << 8) | (response[6] << 16) | (response[7] << 24);

      console.log(`   Marker: ${marker}, got: ${got} bytes`);

      if (marker !== 1234) {
        console.error(`   Unexpected read marker: ${marker}, expected 1234`);
        return null;
      }

      if (got === 0) {
        console.log('   Got 0 bytes, end of file');
        break;
      }

      result.set(response.slice(8, 8 + got), offset);
      offset += got;
      console.log(`   Total read: ${offset}/${size}`);
    }

    console.log(`   ✅ File read complete: ${offset} bytes`);
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
  async readFile(path: string): Promise<Uint8Array | null> {
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

    console.log(`📂 Opening dive directory: ${DIVE_DIRECTORY}`);
    
    if (!await this.openDirectory(DIVE_DIRECTORY)) {
      console.error('Failed to open dive directory');
      
      // Try to list root directory to see what's there
      console.log('📂 Trying to list root directory...');
      if (await this.openDirectory('0:/')) {
        console.log('✅ Root directory opened, listing contents:');
        let rootDone = false;
        while (!rootDone) {
          const rootResult = await this.readDirectory();
          if (!rootResult) break;
          for (const entry of rootResult.entries) {
            console.log(`   ${entry.type === DIRTYPE_DIR ? '📁' : '📄'} ${entry.name} (type=${entry.type})`);
          }
          rootDone = rootResult.isLast;
        }
        await this.closeDirectory();
      }
      
      return dives;
    }

    console.log('✅ Dive directory opened successfully');
    
    let done = false;
    while (!done) {
      const result = await this.readDirectory();
      if (!result) {
        console.log('❌ Failed to read directory');
        break;
      }

      console.log(`📋 Read ${result.entries.length} entries (isLast: ${result.isLast})`);
      
      for (const entry of result.entries) {
        console.log(`   ${entry.type === DIRTYPE_FILE ? '📄' : '📁'} ${entry.name} (type: ${entry.type})`);
        // Accept any file in the dives directory - Suunto uses .LOG extension
        if (entry.type === DIRTYPE_FILE) {
          // Check for .LOG extension (case insensitive)
          if (entry.name.toUpperCase().endsWith('.LOG')) {
            dives.push(entry.name);
          } else {
            console.log(`      Skipping non-.LOG file: ${entry.name}`);
          }
        }
      }

      done = result.isLast;
    }

    await this.closeDirectory();

    console.log(`📊 Found ${dives.length} dive files: ${dives.slice(0, 5).join(', ')}${dives.length > 5 ? '...' : ''}`);
    
    // Sort by timestamp (most recent first - names are hex timestamps)
    dives.sort((a, b) => b.localeCompare(a));

    return dives;
  }

  /**
   * Download a specific dive
   */
  async downloadDive(filename: string): Promise<DiveFile | null> {
    const path = `${DIVE_DIRECTORY}/${filename}`;
    console.log(`📥 Downloading dive: ${filename}`);
    console.log(`   Full path: ${path}`);

    const data = await this.readFile(path);
    if (!data) {
      console.error(`   ❌ Failed to read file: ${path}`);
      return null;
    }

    console.log(`   ✅ Read ${data.length} bytes`);

    // Parse timestamp from filename (hex)
    const timestampHex = filename.replace(/\.LOG$/i, '');
    const timestamp = parseInt(timestampHex, 16);
    console.log(`   Timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);

    return {
      name: filename,
      timestamp,
      data
    };
  }

  /**
   * Download all dives with progress callback
   */
  async downloadAllDives(
    callback?: (dive: DiveFile, index: number, total: number) => void,
    stopAfterFilename?: string
  ): Promise<DiveFile[]> {
    const diveFiles = await this.listDives();
    console.log(`📋 Found ${diveFiles.length} dive(s)`);

    const dives: DiveFile[] = [];

    for (let i = 0; i < diveFiles.length; i++) {
      // Check if we should stop (fingerprint reached)
      if (stopAfterFilename && diveFiles[i] === stopAfterFilename) {
        console.log(`⏹️ Stopping at fingerprint: ${stopAfterFilename}`);
        break;
      }

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

export default SuuntoEonSteelWebHID;
