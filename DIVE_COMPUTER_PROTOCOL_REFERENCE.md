# Dive Computer Protocol Reference
## Complete Bitstream-to-Field Mapping for AI Implementation

This document provides complete technical specifications for implementing dive computer
download functions. All byte offsets, field sizes, encoding formats, and parsing logic
are documented to enable comprehensive implementation.

---

# Table of Contents
1. [Suunto EONSTEEL Family](#1-suunto-eonsteel-family)
2. [Shearwater Family](#2-shearwater-family)
3. [Oceanic/Aqualung Family](#3-oceanicaqualung-family)
4. [Scubapro/Uwatec Family](#4-scubapro-uwatec-family)
5. [Mares Family](#5-mares-family)
6. [Garmin Family](#6-garmin-family)
7. [Common Structures](#7-common-structures)

---

# 1. Suunto EONSTEEL Family

## Supported Devices
| Device | Model ID | USB VID | USB PID | BLE Name Prefix |
|--------|----------|---------|---------|-----------------|
| EON Steel | 0 | 0x1493 | 0x0030 | "EON Steel" |
| EON Core | 1 | 0x1493 | 0x0033 | "EON Core" |
| D5 | 2 | 0x1493 | 0x0035 | "Suunto D5" |
| EON Steel Black | 3 | 0x1493 | 0x0036 | "EON Steel Black" |

## Transport: USB HID
- **Report Size**: 64 bytes
- **Packet Format**:
```
Byte 0:     [SeqHi:4][Cmd:4]  - Upper nibble: sequence, Lower nibble: command
Byte 1:     Length            - Payload length (0-58)
Byte 2-59:  Payload           - Command-specific data
Byte 60-63: CRC32             - CRC of bytes 0-59 (polynomial 0xEDB88320, reflected)
```

## Commands
| Command | Code | Description | Request Payload | Response |
|---------|------|-------------|-----------------|----------|
| INIT | 0x00 | Initialize connection | None | Device info |
| FILE_OPEN | 0x10 | Open file for reading | Path (null-terminated) | Handle |
| FILE_CLOSE | 0x12 | Close file | Handle (4 bytes) | Status |
| FILE_READ | 0x14 | Read file data | Handle + Offset + Length | Data |
| DIR_OPEN | 0x70 | Open directory | Path (null-terminated) | Handle |
| DIR_CLOSE | 0x72 | Close directory | Handle (4 bytes) | Status |
| DIR_READDIR | 0x74 | Read directory entry | Handle (4 bytes) | Entry name |

## CRC32 Calculation
```typescript
function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
```

## File System Structure
```
/
├── sml/                          # Dive logs directory
│   ├── YYMM/                     # Year-Month folder
│   │   └── DDHHMMSS/             # Day-Hour-Minute-Second folder
│   │       └── 0/
│   │           └── D.sml         # Dive data file
├── etc/
│   └── settings.json             # Device settings
└── ...
```

## SML File Format (Type-Length-Value)
Each dive file contains TLV-encoded records:

### Type Descriptor Format
```
Byte 0-1:   Type ID (uint16_le)
Byte 2:     Size (bytes per value)
Byte 3+:    Type description string (null-terminated)
```

### Sample Types (ES_* enum)
| Type ID | Name | Size | Encoding | Units | Nillable Value |
|---------|------|------|----------|-------|----------------|
| ES_dtime | +Time | 2 | uint16 | milliseconds | - |
| ES_depth | Depth | 2 | uint16 | centimeters | 65535 |
| ES_temp | Temperature | 2 | int16 | deci-Celsius (0.1°C) | -3000 |
| ES_ndl | NoDecTime | 2 | int16 | minutes | -1 |
| ES_ceiling | Ceiling | 2 | uint16 | centimeters | 65535 |
| ES_tts | TimeToSurface | 2 | uint16 | minutes | 65535 |
| ES_heading | Heading | 2 | uint16 | degrees * 10000 | 65535 |
| ES_abspressure | AbsPressure | 2 | uint16 | centibar | 65535 |
| ES_gastime | GasTime | 2 | int16 | minutes | -1 |
| ES_gasnr | GasNumber | 1 | uint8 | index | - |
| ES_pressure | Pressure | 2 | uint16 | centibar (0.01 bar) | 65535 |
| ES_setpoint_po2 | SetPointPO2 | 4 | uint32 | centibar | - |

### Event Types
| Event | Code | Description |
|-------|------|-------------|
| NoFly Time | 0 | No-fly time warning |
| Depth | 1 | Depth alarm |
| Surface Time | 2 | Surface time notification |
| Tissue Level | 3 | Tissue saturation |
| Deco | 4 | Decompression required |
| Safety Stop | 6-8 | Safety stop states |
| Deep Stop | 9-10 | Deep stop states |
| Dive Time | 11 | Dive time warning |
| Gas Available | 12 | Gas availability |
| SetPoint Switch | 13 | CCR setpoint change |
| Air Time | 15 | Air time warning |
| Tank Pressure | 16 | Tank pressure warning |

### Parsing Algorithm
```typescript
interface SuuntoSample {
    time: number;        // milliseconds from dive start
    depth: number;       // meters
    temperature: number; // Celsius
    pressure: number[];  // bar per tank
    ndl: number;         // minutes (-1 = in deco)
    ceiling: number;     // meters
    tts: number;         // minutes
    heading: number;     // degrees
    ppo2: number;        // bar (CCR setpoint)
    events: Event[];
}

function parseSmlSample(data: Uint8Array, offset: number, typeDesc: TypeDesc): SuuntoSample {
    // Each sample starts with ES_dtime (time delta)
    // Followed by changed values only (delta encoding)
    // Nillable values use sentinel to indicate "no data"
}
```

---

# 2. Shearwater Family

## Supported Devices
| Device | Model | Transport | BLE Name |
|--------|-------|-----------|----------|
| Predator | 2 | Serial/BT | "Predator" |
| Petrel | 3 | Serial/BT/BLE | "Petrel" |
| Petrel 2 | 3 | Serial/BT/BLE | "Petrel" |
| Petrel 3 | 10 | BLE | "Petrel 3" |
| Nerd | 4 | Serial/BT | "NERD" |
| Nerd 2 | 7 | BLE | "NERD 2" |
| Perdix | 5 | Serial/BT/BLE | "Perdix" |
| Perdix 2 | 11 | BLE | "Perdix 2" |
| Perdix AI | 6 | BLE | "Perdix" |
| Teric | 8 | BLE | "Teric" |
| Peregrine | 9 | BLE | "Peregrine" |
| Peregrine TX | 13 | BLE | "Peregrine TX" |
| Tern | 12 | BLE | "Tern" |
| Tern TX | 12 | BLE | "Tern" |

## Transport: Serial
- **Baud Rate**: 115200
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **Flow Control**: None
- **Timeout**: 3000ms

## SLIP Encoding
All packets are SLIP-framed:
```typescript
const SLIP = {
    END: 0xC0,      // Frame delimiter
    ESC: 0xDB,      // Escape character
    ESC_END: 0xDC,  // Escaped END (0xC0 -> 0xDB 0xDC)
    ESC_ESC: 0xDD   // Escaped ESC (0xDB -> 0xDB 0xDD)
};

function slipEncode(data: Uint8Array): Uint8Array {
    const result: number[] = [SLIP.END];
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
    return new Uint8Array(result);
}
```

## Commands
| Service | Request | Response | Description |
|---------|---------|----------|-------------|
| RDBI | 0x22 | 0x62 | Read Data By Identifier |
| WDBI | 0x2E | 0x6E | Write Data By Identifier |
| NAK | - | 0x7F | Negative acknowledgment |

### RDBI Request Format
```
Byte 0:    0x22 (RDBI request)
Byte 1-2:  Identifier (uint16_be)
```

### RDBI Response Format
```
Byte 0:    0x62 (RDBI response)
Byte 1-2:  Identifier (uint16_be)
Byte 3+:   Data
```

## Data Identifiers
| ID | Name | Size | Description |
|----|------|------|-------------|
| 0x0010 | SERIAL | 8 | Serial number (hex ASCII) |
| 0x0020 | FIRMWARE | 12 | Firmware version (ASCII) |
| 0x0040 | HARDWARE | 2 | Hardware type |
| 0xDD00 | MANIFEST | variable | Dive list |
| 0xDDnn | DIVE_DATA | variable | Dive nn data |

## Manifest Structure
- **Address**: 0xE0000000
- **Size**: 0x600 (1536 bytes)
- **Record Size**: 32 bytes
- **Max Records**: 48

### Manifest Record (32 bytes)
```
Offset  Size  Type      Field
------  ----  --------  -----
0       4     uint32_be Dive number
4       4     uint32_be Timestamp (Unix epoch)
8       4     uint32_be Duration (seconds)
12      2     uint16_be Max depth (cm)
14      1     uint8     Average depth
15      1     uint8     Min temp (°C + 128)
16      4     uint32_be Dive data address
20      4     uint32_be Dive data size
24      4     uint32_be Opening address
28      4     uint32_be Closing address
```

## Dive Sample Format (varies by firmware)
### Standard Sample (Predator/Petrel/Perdix)
```
Offset  Size  Type      Field                    Units/Encoding
------  ----  --------  -----                    --------------
0       2     uint16_le Depth                    1/10 foot
2       2     uint16_le Temperature              1/10 °F
4       1     uint8     Status                   0=OC, 1=CCR, 2=SCR
5       1     uint8     PPO2                     1/100 bar
6       1     uint8     PPO2 Sensor 1            1/100 bar
7       1     uint8     PPO2 Sensor 2            1/100 bar
8       1     uint8     PPO2 Sensor 3            1/100 bar
9       1     uint8     Battery type             0=1.5V, 1=3.0V, 2=3.6V
10      1     uint8     Setpoint                 1/100 bar
11      2     uint16_le CNS                      1/100 %
13      1     uint8     GF99                     % gradient factor
14      1     uint8     Deco status              0=NDL, 1-100=stop depth ft
15      2     uint16_le NDL/Deco time            minutes
17      2     uint16_le TTS                      minutes
```

### Extended Sample (with AI - Petrel 3, Perdix 2, Teric)
```
Offset  Size  Type      Field                    Units/Encoding
------  ----  --------  -----                    --------------
19      2     uint16_le Reserved
21      1     uint8     Current gas O2%
22      1     uint8     Current gas He%
23      1     uint8     Voting logic
24      1     uint8     Active sensors bitmask
25      2     uint16_le Tank 1 pressure          psi
27      2     uint16_le Tank 1 RBT               minutes
29      1     uint8     Tank 1 ID
30      1     uint8     Tank 1 battery %
31      2     uint16_le Tank 2 pressure          psi (if present)
...     (repeat for up to 6 tanks)
```

## Decompression Algorithm
### LRE (Length-Run Encoding) + XOR
```typescript
function decompress(data: Uint8Array): Uint8Array {
    // Step 1: LRE decompression (9-bit stream)
    const lre = decompressLRE(data);
    
    // Step 2: XOR with previous 32-byte block
    for (let i = 32; i < lre.length; i++) {
        lre[i] ^= lre[i - 32];
    }
    
    return lre;
}

function decompressLRE(data: Uint8Array): Uint8Array {
    const result: number[] = [];
    let bitOffset = 0;
    
    while (bitOffset + 9 <= data.length * 8) {
        // Extract 9-bit value
        const byteIdx = Math.floor(bitOffset / 8);
        const bitIdx = bitOffset % 8;
        const value = ((data[byteIdx] << 8) | (data[byteIdx + 1] || 0)) >> (16 - 9 - bitIdx) & 0x1FF;
        
        if (value & 0x100) {
            // Bit 9 set: literal byte (lower 8 bits)
            result.push(value & 0xFF);
        } else if (value === 0) {
            // Zero: end of stream
            break;
        } else {
            // Run of zeros (value = count)
            for (let i = 0; i < value; i++) {
                result.push(0);
            }
        }
        bitOffset += 9;
    }
    
    return new Uint8Array(result);
}
```

## Shutdown Command
```typescript
const SHUTDOWN = new Uint8Array([0x2E, 0x90, 0x20, 0x00]);
```

---

# 3. Oceanic/Aqualung Family

## Supported Devices
| Brand | Device | Model Code | Transport |
|-------|--------|------------|-----------|
| Oceanic | Atom 2.0 | 0x4342 | Serial |
| Oceanic | Atom 3.0/3.1 | 0x444C/0x4456 | Serial |
| Oceanic | VT3/VT4 | 0x4258/0x4447 | Serial |
| Oceanic | Geo 2.0/4.0 | 0x4446/0x4653 | Serial/BLE |
| Oceanic | Veo 4.0 | 0x4654 | Serial/BLE |
| Oceanic | Pro Plus X/4 | 0x4552/0x4656 | Serial/BLE |
| Aqualung | i200/i200C | 0x4646/0x4649 | Serial/BLE |
| Aqualung | i300/i300C | 0x4559/0x4648 | Serial/BLE |
| Aqualung | i330R | 0x4744 | BLE only |
| Aqualung | i450T/i470TC | 0x4641/0x4743 | Serial/BLE |
| Aqualung | i550/i550C | 0x4642/0x4652 | Serial/BLE |
| Aqualung | i750TC/i770R | 0x455A/0x4651 | Serial/BLE |
| Apeks | DSX | 0x4741 | BLE only |
| Sherwood | Sage/Wisdom 4 | 0x4647/0x4655 | Serial/BLE |
| Hollis | TX1 | 0x4542 | Serial |

## Transport: Serial
- **Baud Rate**: 38400 (most models), 115200 (i330R, DSX)
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **Timeout**: 3000ms

## BLE Name Format
BLE name starts with 2-character model code:
- `"ER52..."` = Pro Plus X (0x4552)
- `"FH48..."` = i300C (0x4648)
- `"GD44..."` = i330R (0x4744)

## Commands
| Command | Code | Description | Format |
|---------|------|-------------|--------|
| INIT | 0xA0 | Initialize | [0xA0] |
| QUIT | 0xA2 | Disconnect | [0xA2] |
| VERSION | 0x84 | Get version | [0x84] |
| KEEPALIVE | 0x91 | Keep alive | [0x91] |
| READ1 | 0xB1 | Read 1 page (16 bytes) | [0xB1, addr_hi, addr_lo, checksum] |
| READ8 | 0xB4 | Read 8 pages (128 bytes) | [0xB4, addr_hi, addr_lo, checksum] |
| READ16 | 0xB6 | Read 16 pages (256 bytes) | [0xB6, addr_hi, addr_lo, checksum] |

### Checksum Calculation
```typescript
function oceanicChecksum(cmd: number, addrHi: number, addrLo: number): number {
    return (0x100 - ((cmd + addrHi + addrLo) & 0xFF)) & 0xFF;
}

// Example: Read 16 pages from address 0x1234
const cmd = new Uint8Array([0xB6, 0x12, 0x34, oceanicChecksum(0xB6, 0x12, 0x34)]);
```

### Response Format
```
Byte 0:     0xA5 (ACK)
Byte 1-2:   Address (echoed)
Byte 3-N:   Data
Byte N+1:   Checksum (additive, includes 0xA5)
```

## Memory Layout (Model-Dependent)
### Atom 2.0 (0x4342) - 0x10000 bytes
```
Address     Size    Content
-------     ----    -------
0x0000      0x100   Device info
0x0100      0x100   Logbook ring (8 entries × 32 bytes)
0x0200      var     Dive profiles (ring buffer)
```

### i330R/DSX (0x4744/0x4741) - 0x40000 bytes
```
Address     Size    Content
-------     ----    -------
0x0000      0x400   Device info & settings
0x0400      0x2000  Logbook (128 entries × 64 bytes)
0x2400      var     Dive profiles
```

## Dive Log Entry (32 bytes - Classic)
```
Offset  Size  Type      Field                    Units
------  ----  --------  -----                    -----
0       2     uint16_le Dive number
2       1     uint8     Day
3       1     uint8     Month
4       1     uint8     Year (+ 2000)
5       1     uint8     Hour
6       1     uint8     Minute
7       1     uint8     Second
8       2     uint16_le Surface interval         minutes
10      2     uint16_le Max depth                1/16 foot or 1/4 meter
12      2     uint16_le Dive time                minutes
14      2     uint16_le Start temperature        varies by model
16      2     uint16_le End temperature          varies by model
18      2     uint16_le Start pressure           psi (AI models)
20      2     uint16_le End pressure             psi (AI models)
22      1     uint8     O2 percentage            %
23      1     uint8     Mode                     0=Air, 1=Nitrox, 2=Gauge, 3=Free
24      2     uint16_le Profile start address
26      2     uint16_le Profile end address
28      4     uint32_le Fingerprint
```

## Dive Log Entry (64 bytes - i330R/DSX)
```
Offset  Size  Type      Field                    Units
------  ----  --------  -----                    -----
0       4     uint32_le Dive number
4       4     uint32_le Timestamp                Unix epoch
8       2     uint16_le Max depth                1/10 foot
10      2     uint16_le Dive time                seconds
12      2     int16_le  Min temperature          1/10 °F
14      2     int16_le  Max temperature          1/10 °F
16      1     uint8     Mode                     0=OC, 1=Gauge, 2=Free, 3=CC
17      1     uint8     Gas count
18      6×4   -         Gas mixes                O2%, He%, switch depth
42      2     uint16_le Profile address
44      4     uint32_le Profile size
48      4     uint32_le Fingerprint
52      12    -         Reserved
```

## Sample Format (Classic - 2 bytes per sample)
```
Bits 0-11:  Depth (12 bits)         1/16 foot
Bits 12-15: Flags (4 bits)          see below

Flags:
0x0: Normal sample
0x1: Temperature follows (1 byte, °F)
0x2: NDL follows (1 byte, minutes)
0x3: Deco stop follows (1 byte each: depth, time)
0x4: Pressure follows (2 bytes, psi)
0x5: Ascent rate alarm
0x6: Bookmark
0xA: Tank switch (1 byte: tank index)
0xB: Surface marker
```

## Sample Format (i330R/DSX - 8 bytes per sample)
```
Offset  Size  Type      Field                    Units
------  ----  --------  -----                    -----
0       2     uint16_le Depth                    1/10 foot
2       2     int16_le  Temperature              1/10 °F
4       1     uint8     PPO2 (CCR mode)          1/100 bar
5       1     uint8     NDL/Deco                 minutes (0xFF = in deco)
6       1     uint8     Ceiling                  feet
7       1     uint8     Flags                    events
```

### Sample Interval
- Fixed at 1 second (most models)
- Configurable 1-60 seconds (some newer)

---

# 4. Scubapro/Uwatec Family

## Supported Devices
| Device | Model | Transport | Identifier |
|--------|-------|-----------|------------|
| Aladin Sport Matrix | 0x17 | BLE | "Aladin" |
| Aladin Square | 0x22 | USB HID | VID 0xC251 PID 0x2006 |
| Aladin A1/A2 | 0x25/0x28 | BLE | "Aladin", "A1", "A2" |
| G2/G2 TEK | 0x32/0x31 | USB HID + BLE | VID 0x2E6C PID 0x3201, "G2" |
| G2 Console | 0x32 | USB HID + BLE | VID 0x2E6C PID 0x3211 |
| G2 HUD | 0x42 | USB HID + BLE | VID 0x2E6C PID 0x4201, "HUD" |
| G3 | 0x34 | USB HID + BLE | "Galileo 3" |
| Luna 2.0 | 0x50/0x51 | BLE | "Luna 2.0" |
| Meridian/Mantis | 0x20 | Serial | - |
| Chromis/Mantis 2 | 0x24/0x26 | Serial | - |

## Transport: IrDA (Legacy)
- Aladin Smart Com, Galileo Sol/Luna/Terra
- IrDA names: "Aladin Smart Com", "UWATEC Galileo"

## Transport: Serial
- **Baud Rate**: 19200
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1

## Transport: USB HID
- **Report Size**: 64 bytes
- **VID/PID**: See table above

## Protocol: Smart Protocol
### Handshake Sequence
```typescript
// Step 1: Wake up (send 0x1B repeatedly)
const WAKEUP = 0x1B;
// Wait for response (0x1B back)

// Step 2: Handshake
const HANDSHAKE = new Uint8Array([
    0x1B,           // Escape
    0x01, 0x00,     // Command: identify
    0x00, 0x00      // Padding
]);

// Step 3: Download command
const DOWNLOAD = new Uint8Array([
    0x1B,           // Escape
    0x10, 0x34,     // Command: download
    0x00, 0x00      // Parameters
]);
```

### Response Structure
```
Byte 0:     Type
Byte 1-2:   Length (uint16_le)
Byte 3-N:   Data
Byte N+1-2: Checksum (CRC-16)
```

## Dive Header Structure (G2/G3)
```
Offset  Size  Type      Field
------  ----  --------  -----
0       4     uint32_le Timestamp (Unix + timezone)
4       4     uint32_le Dive time (seconds)
8       2     uint16_le Max depth (cm)
10      2     int16_le  Min temperature (1/10 °C)
12      1     uint8     Dive mode (0=OC, 1=Gauge, 2=Free)
13      1     uint8     Gas count
14      n×8   -         Gas mixes (O2, He, depth, usage)
...
```

## Sample Format (G2/G3)
Variable-length records with type byte:

### Sample Types
| Type | Size | Description | Encoding |
|------|------|-------------|----------|
| 0x01 | 3 | Depth | uint24_le, 1/10 cm |
| 0x02 | 2 | Temperature | int16_le, 1/100 °C |
| 0x03 | 3 | Tank pressure | uint24_le, mbar + tank ID |
| 0x04 | 1 | RBT | minutes |
| 0x05 | 2 | Heartbeat | BPM + status |
| 0x06 | 2 | Bearing | degrees |
| 0x07 | 4 | Time | absolute seconds |
| 0x08 | var | Alarm | type + value |
| 0x0A | 2 | NDL | minutes |
| 0x0B | 3 | Deco stop | depth (cm) + time (min) |
| 0x0C | 1 | Gas switch | gas index |

### Parsing Sample Stream
```typescript
interface UwatecSample {
    time: number;
    depth: number;
    temperature?: number;
    pressure?: { tank: number; value: number }[];
    heartrate?: number;
    bearing?: number;
    ndl?: number;
    deco?: { depth: number; time: number };
    events: string[];
}

function parseSamples(data: Uint8Array): UwatecSample[] {
    const samples: UwatecSample[] = [];
    let offset = 0;
    let time = 0;
    let currentSample: Partial<UwatecSample> = { events: [] };
    
    while (offset < data.length) {
        const type = data[offset++];
        
        switch (type) {
            case 0x01: // Depth (new sample)
                if (currentSample.depth !== undefined) {
                    samples.push(currentSample as UwatecSample);
                    time += sampleInterval;
                }
                currentSample = { time, events: [] };
                currentSample.depth = (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16)) / 1000;
                offset += 3;
                break;
            case 0x02: // Temperature
                currentSample.temperature = readInt16LE(data, offset) / 100;
                offset += 2;
                break;
            // ... handle other types
        }
    }
    return samples;
}
```

---

# 5. Mares Family

## Supported Devices
| Device | Model | Transport | BLE Name |
|--------|-------|-----------|----------|
| Icon HD | 0x14 | Serial | - |
| Icon HD Net Ready | 0x15 | Serial | - |
| Smart | 0x10 | Serial/BLE | "Mares bluelink pro" |
| Smart Air/Apnea | 0x24/0x010010 | Serial/BLE | "Mares bluelink pro" |
| Matrix | 0x0F | Serial | - |
| Puck Pro/Pro+ | 0x18 | Serial/BLE | "Puck" |
| Puck 2/4 | 0x1F/0x35 | Serial/BLE | "Puck" |
| Quad/Quad Air | 0x29/0x23 | Serial/BLE | "Quad" |
| Genius | 0x1C | Serial/BLE | "Mares Genius" |
| Sirius | 0x2F | BLE | "Sirius" |
| Horizon | 0x2C | Serial | - |

## Transport: Serial
- **Baud Rate**: 38400
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1

## Protocol: DIVEIC
### Frame Format
```
[0xE5] [0xE5]  - Wake up (repeat until ACK)
[0x55] [CMD] [PARAMS...] [CHECKSUM] [0xAA]
       |                  |
       STX               ETX
```

### Checksum
```typescript
function maresChecksum(data: Uint8Array): number {
    let xor = 0;
    for (const byte of data) {
        xor ^= byte;
    }
    return xor;
}
```

## Commands
| Command | Code | Description |
|---------|------|-------------|
| WAKEUP | 0xE5 | Wake device |
| READ_MEMORY | 0x78 | Read memory block |
| WRITE_MEMORY | 0x79 | Write memory block |
| IDENTIFY | 0x64 | Get model info |

### Read Memory Command
```
[0x55] [0x78] [addr_hi] [addr_lo] [size] [checksum] [0xAA]
```

### Response
```
[0x55] [status] [data...] [checksum] [0xAA]
```

## Memory Layout: Icon HD/Smart
```
Address     Size    Content
-------     ----    -------
0x0000      0x20    Device info (model, serial, FW)
0x0100      var     Dive logbook entries
0x4000      var     Dive profile data
```

## Memory Layout: Genius
Uses record-based format with 4-byte type signatures:

| Signature | ASCII | Description |
|-----------|-------|-------------|
| 0x44535452 | "DSTR" | Dive start |
| 0x54495353 | "TISS" | Tissue saturation |
| 0x44505253 | "DPRS" | Sample record (34 bytes) |
| 0x53445054 | "SDPT" | SCR sample (78 bytes) |
| 0x41495253 | "AIRS" | Air integration (16 bytes) |
| 0x44454E44 | "DEND" | Dive end (162 bytes) |

## Dive Header (Icon HD/Smart - 32 bytes)
```
Offset  Size  Type      Field                    Units
------  ----  --------  -----                    -----
0       1     uint8     Year (+ 2000)
1       1     uint8     Month
2       1     uint8     Day
3       1     uint8     Hour
4       1     uint8     Minute
5       2     uint16_le Dive time                seconds
7       2     uint16_le Max depth                1/10 m
9       1     int8      Min temperature          °C
10      1     uint8     Mode (Air/Nitrox/Gauge/Free)
11      1     uint8     O2 %
12      2     uint16_le Surface interval         minutes
14      2     uint16_le Profile address
16      2     uint16_le Profile size
18      14    -         Reserved
```

## Sample Format (Icon HD - 2 bytes)
```
Bits 0-11:  Depth (12 bits)         1/10 m
Bits 12-15: Gas index (4 bits)
```
Temperature encoded separately, every N samples.

## Sample Format (Genius - DPRS record, 34 bytes)
```
Offset  Size  Type      Field                    Units
------  ----  --------  -----                    -----
0       4     uint32    Signature "DPRS"
4       2     uint16_le Time delta               seconds
6       2     uint16_le Depth                    1/10 m
8       2     int16_le  Temperature              1/10 °C
10      1     uint8     NDL                      minutes
11      1     uint8     Deco ceiling             meters
12      1     uint8     Deco time                minutes
13      1     uint8     TTS                      minutes
14      2     uint16_le CNS                      1/10 %
16      1     uint8     GF                       %
17      1     uint8     O2 %
18      1     uint8     He %
19      1     uint8     Gas index
20      2     uint16_le Tank 1 pressure          mbar (0xFFFF = no AI)
22      2     uint16_le Tank 2 pressure          mbar
24      2     uint16_le RBT                      minutes
26      1     uint8     Ascent rate              m/min
27      1     uint8     Alarm flags
28      2     uint16_le PPO2                     1/100 bar (SCR mode)
30      4     -         Reserved
```

## Alarm Flags (Genius)
| Bit | Alarm |
|-----|-------|
| 0 | Ascent speed |
| 1 | Fast ascent |
| 2 | MOD reached |
| 3 | CNS warning |
| 4 | CNS danger |
| 5 | Missed deco |
| 6 | Battery low |
| 7 | Tank pressure low |

---

# 6. Garmin Family

## Supported Devices
| Device | Transport | Notes |
|--------|-----------|-------|
| Descent Mk1 | USB Mass Storage | FIT files |
| Descent Mk2/Mk2i/Mk2S | USB Mass Storage + ANT+ | FIT files |
| Descent Mk3/Mk3i | USB Mass Storage + BLE | FIT files |
| Descent G1 | USB Mass Storage | FIT files |

## Transport: USB Mass Storage
Garmin dive computers mount as a USB mass storage device.

### File Location
```
/Garmin/Activity/*.fit       # Activity files (includes dives)
/Garmin/Dives/*.fit          # Dive-specific files (newer models)
```

## FIT File Format
FIT (Flexible and Interoperable Data Transfer) is Garmin's binary format.

### File Structure
```
[Header (14 bytes)]
[Data Records (variable)]
[CRC (2 bytes)]
```

### Header Format
```
Offset  Size  Type      Field
------  ----  --------  -----
0       1     uint8     Header size (14 for FIT 2.0)
1       1     uint8     Protocol version
2       2     uint16_le Profile version
4       4     uint32_le Data size (excluding header & CRC)
8       4     char[4]   ".FIT" signature
12      2     uint16_le Header CRC (optional)
```

### Record Types
| Type | Description |
|------|-------------|
| Definition | Defines structure of following data messages |
| Data | Actual field values |
| Compressed Timestamp | Timestamp with 5-bit seconds |

### Message Types for Diving
| Message | Global ID | Description |
|---------|-----------|-------------|
| file_id | 0 | File identification |
| device_info | 23 | Device information |
| event | 21 | Events (start, stop, etc.) |
| record | 20 | Sample data (depth, temp, etc.) |
| lap | 19 | Lap/segment summary |
| session | 18 | Session summary |
| activity | 34 | Activity summary |
| dive_settings | 258 | Dive computer settings |
| dive_gas | 259 | Gas mix definitions |
| dive_alarm | 262 | Alarm definitions |
| dive_summary | 268 | Dive summary data |

### Record Message Fields (ID 20)
| Field | ID | Type | Units |
|-------|-----|------|-------|
| timestamp | 253 | uint32 | seconds since UTC 00:00 Dec 31 1989 |
| position_lat | 0 | sint32 | semicircles (× 180/2^31 = degrees) |
| position_long | 1 | sint32 | semicircles |
| altitude | 2 | uint16 | meters × 5 - 500 |
| heart_rate | 3 | uint8 | bpm |
| depth | 39 | uint32 | mm |
| temperature | 13 | sint8 | °C |
| next_stop_depth | 40 | uint32 | mm |
| next_stop_time | 41 | uint32 | seconds |
| time_to_surface | 42 | uint32 | seconds |
| ndl_time | 43 | uint32 | seconds |
| cns_load | 44 | uint8 | % |
| n2_load | 45 | uint16 | % |
| air_time_remaining | 47 | uint32 | seconds |
| pressure_sac | 48 | uint16 | mL/min |
| volume_sac | 49 | uint16 | mL/min |
| rmv | 50 | uint16 | mL/min |
| ascent_rate | 51 | sint32 | mm/s |
| po2 | 52 | uint8 | % (0.01 bar) |
| core_temperature | 53 | uint16 | °C × 100 |

### Dive Gas Message Fields (ID 259)
| Field | ID | Type | Description |
|-------|-----|------|-------------|
| message_index | 254 | uint16 | Gas index |
| helium_content | 0 | uint8 | % |
| oxygen_content | 1 | uint8 | % |
| status | 2 | enum | 0=disabled, 1=enabled, 2=backup |
| mode | 3 | enum | 0=OC, 1=CCR |

### Dive Summary Message Fields (ID 268)
| Field | ID | Type | Units |
|-------|-----|------|-------|
| timestamp | 253 | uint32 | seconds |
| reference_mesg | 0 | uint16 | reference message index |
| reference_index | 1 | uint16 | reference record index |
| avg_depth | 2 | uint32 | mm |
| max_depth | 3 | uint32 | mm |
| surface_interval | 4 | uint32 | seconds |
| start_cns | 5 | uint8 | % |
| end_cns | 6 | uint8 | % |
| start_n2 | 7 | uint16 | % |
| end_n2 | 8 | uint16 | % |
| o2_toxicity | 9 | uint16 | OTU |
| dive_number | 10 | uint32 | |
| bottom_time | 11 | uint32 | ms |
| avg_pressure_sac | 12 | uint16 | mL/min |
| avg_volume_sac | 13 | uint16 | mL/min |
| avg_rmv | 14 | uint16 | mL/min |
| descent_time | 15 | uint32 | ms |
| ascent_time | 16 | uint32 | ms |
| avg_ascent_rate | 17 | sint32 | mm/s |
| avg_descent_rate | 22 | sint32 | mm/s |
| max_ascent_rate | 23 | sint32 | mm/s |
| max_descent_rate | 24 | sint32 | mm/s |
| hang_time | 25 | uint32 | ms |

### GPS Coordinates
```typescript
// Convert semicircles to degrees
function semicirclesToDegrees(semicircles: number): number {
    return semicircles * (180 / Math.pow(2, 31));
}
```

### Timestamp Conversion
```typescript
// FIT epoch: December 31, 1989 00:00:00 UTC
const FIT_EPOCH = 631065600; // Unix timestamp of FIT epoch

function fitTimestampToUnix(fitTimestamp: number): number {
    return fitTimestamp + FIT_EPOCH;
}
```

## FIT Parsing Library
Recommend using existing FIT SDK or implementing basic parser:

```typescript
interface FITRecord {
    timestamp: number;
    depth: number;          // meters
    temperature: number;    // Celsius
    latitude?: number;      // degrees
    longitude?: number;     // degrees
    heartRate?: number;     // bpm
    ndl?: number;           // seconds
    tts?: number;           // seconds
    cns?: number;           // %
    po2?: number;           // bar
    ascentRate?: number;    // m/s
}
```

---

# 7. Common Structures

## Universal Dive Data Model
```typescript
interface Dive {
    // Identification
    number: number;
    fingerprint: Uint8Array;
    
    // Timing
    datetime: Date;
    duration: number;           // seconds
    surfaceInterval?: number;   // seconds
    
    // Depth
    maxDepth: number;           // meters
    avgDepth?: number;          // meters
    
    // Temperature
    minTemp?: number;           // Celsius
    maxTemp?: number;           // Celsius
    surfaceTemp?: number;       // Celsius
    
    // Conditions
    salinity: 'fresh' | 'salt';
    altitude?: number;          // meters
    surfacePressure?: number;   // bar
    
    // Gases
    gases: GasMix[];
    
    // Tanks (AI models)
    tanks?: Tank[];
    
    // Mode
    mode: 'OC' | 'CCR' | 'SCR' | 'Gauge' | 'Freedive';
    
    // Deco model
    decoModel?: {
        type: 'Buhlmann' | 'VPM' | 'RGBM';
        gfLow?: number;
        gfHigh?: number;
        conservatism?: number;
    };
    
    // Location (GPS-equipped only)
    location?: {
        latitude: number;       // degrees
        longitude: number;      // degrees
        altitude?: number;      // meters
    };
    
    // Samples
    samples: Sample[];
    
    // Events
    events: DiveEvent[];
}

interface GasMix {
    index: number;
    oxygen: number;             // fraction (0.21 = 21%)
    helium: number;             // fraction
    nitrogen: number;           // fraction (calculated)
    usage: 'none' | 'oxygen' | 'diluent' | 'sidemount';
}

interface Tank {
    index: number;
    gasMix: number;             // gas mix index
    volume?: number;            // liters (water capacity)
    workPressure?: number;      // bar
    startPressure: number;      // bar
    endPressure: number;        // bar
}

interface Sample {
    time: number;               // seconds from dive start
    depth: number;              // meters
    temperature?: number;       // Celsius
    pressure?: TankPressure[];  // bar per tank
    ndl?: number;               // seconds (-1 = in deco)
    tts?: number;               // seconds
    ceiling?: number;           // meters
    stopDepth?: number;         // meters
    stopTime?: number;          // seconds
    cns?: number;               // fraction
    heartRate?: number;         // bpm
    bearing?: number;           // degrees
    ppo2?: number;              // bar (CCR)
    setpoint?: number;          // bar (CCR)
    o2Sensors?: number[];       // bar per sensor (CCR)
    ascentRate?: number;        // m/min
    gf?: number;                // % gradient factor
}

interface TankPressure {
    tank: number;
    pressure: number;           // bar
    rbt?: number;               // seconds
}

interface DiveEvent {
    time: number;               // seconds
    type: EventType;
    flags?: number;
    value?: number;
    data?: any;
}

type EventType = 
    | 'deco'
    | 'rbt'
    | 'ascent'
    | 'ceiling'
    | 'violation'
    | 'bookmark'
    | 'surface'
    | 'safety_stop'
    | 'deep_stop'
    | 'gas_switch'
    | 'setpoint_change'
    | 'bailout'
    | 'sensor_disabled'
    | 'alarm'
    | 'warning';
```

## Unit Conversion Helpers
```typescript
const Units = {
    // Depth
    feetToMeters: (ft: number) => ft * 0.3048,
    metersToFeet: (m: number) => m / 0.3048,
    
    // Temperature
    fahrenheitToCelsius: (f: number) => (f - 32) * 5/9,
    celsiusToFahrenheit: (c: number) => c * 9/5 + 32,
    celsiusToKelvin: (c: number) => c + 273.15,
    
    // Pressure
    psiToBar: (psi: number) => psi * 0.0689476,
    barToPsi: (bar: number) => bar / 0.0689476,
    mbarToBar: (mbar: number) => mbar / 1000,
    cbarToBar: (cbar: number) => cbar / 100,
    
    // GPS
    semicirclesToDegrees: (sc: number) => sc * (180 / Math.pow(2, 31)),
    degreesToSemicircles: (deg: number) => deg / (180 / Math.pow(2, 31)),
};
```

## Checksum Implementations
```typescript
const Checksum = {
    // Additive 8-bit (Oceanic)
    add8: (data: Uint8Array): number => {
        let sum = 0;
        for (const byte of data) sum += byte;
        return sum & 0xFF;
    },
    
    // XOR (Mares, HW)
    xor: (data: Uint8Array): number => {
        let xor = 0;
        for (const byte of data) xor ^= byte;
        return xor;
    },
    
    // CRC-16 CCITT (Shearwater, Scubapro)
    crc16ccitt: (data: Uint8Array, init = 0xFFFF): number => {
        let crc = init;
        for (const byte of data) {
            crc ^= byte << 8;
            for (let i = 0; i < 8; i++) {
                crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
            }
        }
        return crc & 0xFFFF;
    },
    
    // CRC-32 (Suunto)
    crc32: (data: Uint8Array): number => {
        let crc = 0xFFFFFFFF;
        for (const byte of data) {
            crc ^= byte;
            for (let i = 0; i < 8; i++) {
                crc = crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
};
```

---

# Appendix A: Quick Reference Tables

## Transport Summary
| Family | Serial Baud | USB HID | BLE | IrDA |
|--------|-------------|---------|-----|------|
| Suunto EONSTEEL | - | 0x1493:0x0030-0x0036 | ✅ | - |
| Shearwater | 115200 | - | ✅ | - |
| Oceanic | 38400 | - | ✅ | - |
| Scubapro | 19200 | 0x2E6C:0x3201+ | ✅ | ✅ |
| Mares | 38400 | - | ✅ | - |
| Garmin | - | USB MSC | - | - |

## Sample Interval Defaults
| Family | Interval | Configurable |
|--------|----------|--------------|
| Suunto | 1-60s | Yes |
| Shearwater | 10s | Yes (some models) |
| Oceanic | 1s | Limited |
| Scubapro | 4s | Yes |
| Mares | 20s | Yes |
| Garmin | 1s | Yes |

## GPS Support
| Family | GPS | Format |
|--------|-----|--------|
| Suunto EONSTEEL | ❌ | - |
| Shearwater | ❌ | - |
| Oceanic | ❌ | - |
| Scubapro | ❌ | - |
| Mares | ❌ | - |
| Garmin | ✅ | FIT semicircles |

## Heart Rate Support
| Family | HR | Sensor Type |
|--------|-----|-------------|
| Suunto EONSTEEL | ❌ | - |
| Shearwater | ❌ | - |
| Oceanic | ❌ | - |
| Scubapro | ✅ (Galileo) | ANT+ |
| Mares | ❌ | - |
| Garmin | ✅ | ANT+/Bluetooth |

## CCR Support
| Family | CCR | O2 Sensors | Setpoint |
|--------|-----|------------|----------|
| Suunto EONSTEEL | ✅ | 3 | ✅ |
| Shearwater | ✅ | 3 | ✅ |
| Oceanic | ✅ (DSX) | 1 | ✅ |
| Scubapro | ❌ | - | - |
| Mares | ✅ (SCR) | 1 | - |
| Garmin | ✅ | - | ✅ |

---

# Appendix B: Implementation Checklist

## For Each Dive Computer Family:
- [ ] Implement transport layer (Serial/USB HID/BLE)
- [ ] Implement device detection and connection
- [ ] Implement handshake/initialization sequence
- [ ] Implement device info retrieval (serial, firmware, model)
- [ ] Implement dive list/manifest retrieval
- [ ] Implement dive data download
- [ ] Implement sample parsing with all fields
- [ ] Implement event parsing
- [ ] Implement header field extraction
- [ ] Implement gas mix parsing
- [ ] Implement tank/AI data parsing
- [ ] Implement decompression data parsing
- [ ] Implement CCR fields (if applicable)
- [ ] Implement progress callbacks
- [ ] Implement fingerprint comparison for incremental download
- [ ] Handle timeout and error recovery
- [ ] Unit test with sample data files
