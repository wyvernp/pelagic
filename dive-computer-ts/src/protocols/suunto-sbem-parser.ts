/**
 * Suunto SBEM (Suunto Binary Encoded Message) Parser
 *
 * Parses .LOG files downloaded from Suunto EON Steel/Core/D5 dive computers
 * via USB HID. Based on libdivecomputer's suunto_eonsteel_parser.c
 *
 * SBEM format:
 * - "SBEM" + 4 NUL bytes header
 * - Entries: 0x00, textLen, typeID(2), "<PTH>path\n<FRM>format\n<MOD>mod"
 * - Data follows: typeID(1-2 bytes), dataLen, data bytes
 *
 * Duration comes from accumulated sample time deltas (uint16 ms)
 * Max depth comes from maximum sample depth value (uint16 cm)
 *
 * Key insight: Sample data uses GRP (group) entries where a single type ID
 * contains packed data from multiple sub-types (e.g., time + depth + temp + ...)
 */

import type { Dive, DiveSample } from '../types/interfaces.js';
import type { DiveFile } from './suunto-eonsteel-webhid.js';

export interface SbemParseOptions {
  /** Model name to use in the diveComputer entry (default: 'Suunto EON') */
  model?: string;
}

interface DataEntry {
  typeId: number;
  dataStart: number;
  dataLen: number;
  nextPos: number;
}

/**
 * Parse a Suunto SBEM .LOG file into a Dive object.
 *
 * This is a pure function with no side-effects — all state captured from
 * the caller must be passed via `options`.
 */
export function parseSuuntoSbemFile(diveFile: DiveFile, options?: SbemParseOptions): Dive {
  const model = options?.model ?? 'Suunto EON';
  const timestamp = diveFile.timestamp;
  const data = diveFile.data;

  // Default values
  let maxDepthCm = 0;
  let durationMs = 0;
  let minTempDeciC: number | null = null;
  const o2Percent = 21;

  // Check for SBEM header
  const hasSBEM =
    data.length > 8 &&
    String.fromCharCode(data[0], data[1], data[2], data[3]) === 'SBEM';

  if (!hasSBEM) {
    return createDefaultDive(timestamp, diveFile.name, model);
  }

  // Build type descriptor map and group map
  const typeDescs = new Map<number, { path: string; format: string; size: number }>();
  const groups = new Map<number, number[]>(); // groupId -> [memberId, ...]

  let pos = 8; // Skip "SBEM" + 4 NULs

  // Helper to parse a data entry (non-descriptor)
  const parseDataEntry = (startPos: number): DataEntry | null => {
    const firstByte = data[startPos];
    if (firstByte === 0) return null; // descriptor, not data

    let typeId: number;
    let dataLenOffset: number;

    if (firstByte === 0xff) {
      if (startPos + 3 > data.length) return null;
      typeId = data[startPos + 1] | (data[startPos + 2] << 8);
      dataLenOffset = startPos + 3;
    } else {
      typeId = firstByte;
      dataLenOffset = startPos + 1;
    }

    if (dataLenOffset >= data.length) return null;

    let dataLen = data[dataLenOffset];
    let dataStart = dataLenOffset + 1;

    if (dataLen === 0xff) {
      if (dataLenOffset + 5 > data.length) return null;
      dataLen =
        data[dataLenOffset + 1] |
        (data[dataLenOffset + 2] << 8) |
        (data[dataLenOffset + 3] << 16) |
        (data[dataLenOffset + 4] << 24);
      dataStart = dataLenOffset + 5;
    }

    if (dataStart + dataLen > data.length || dataLen > 100000) return null;

    return { typeId, dataStart, dataLen, nextPos: dataStart + dataLen };
  };

  // ---- First pass: collect all descriptors (interleaved with data) -----
  while (pos < data.length - 4) {
    if (data[pos] === 0) {
      // Descriptor entry
      let textLen = data[pos + 1];
      let headerLen = 2;

      if (textLen === 0xff) {
        textLen =
          data[pos + 2] |
          (data[pos + 3] << 8) |
          (data[pos + 4] << 16) |
          (data[pos + 5] << 24);
        headerLen = 6;
      }

      if (textLen < 3 || pos + headerLen + textLen > data.length) {
        pos++;
        continue;
      }

      const typeId = data[pos + headerLen] | (data[pos + headerLen + 1] << 8);
      const descStart = pos + headerLen + 2;
      const descEnd = pos + headerLen + textLen;

      if (data[descStart] === 0x3c) {
        // '<'
        const descText = String.fromCharCode(...data.slice(descStart, descEnd));

        // Check for GRP (group) entries
        const grpMatch = descText.match(/<GRP>([0-9,]+)/);
        if (grpMatch) {
          const memberIds = grpMatch[1].split(',').map(Number);
          groups.set(typeId, memberIds);
        }

        // Parse PTH/FRM
        const pthMatch = descText.match(/<PTH>([^<\n]+)/);
        const frmMatch = descText.match(/<FRM>([^<\n]+)/);

        if (pthMatch) {
          const format = frmMatch ? frmMatch[1] : '';
          let size = 0;
          if (format.startsWith('bool') || format.startsWith('enum')) size = 1;
          else if (format.includes('8')) size = 1;
          else if (format.includes('16')) size = 2;
          else if (format.includes('32')) size = 4;

          typeDescs.set(typeId, { path: pthMatch[1], format, size });
        }
      }

      pos = descEnd;
    } else {
      // Data entry – skip in first pass
      const entry = parseDataEntry(pos);
      if (entry) {
        pos = entry.nextPos;
      } else {
        pos++;
      }
    }
  }

  // ---- Resolve sample & cylinder group offsets ----

  let timeTypeId = -1;
  let depthTypeId = -1;
  let tempTypeId = -1;

  for (const [id, desc] of typeDescs) {
    if (desc.path.includes('Samples') && desc.path.includes('+Sample.Time')) timeTypeId = id;
    if (desc.path.includes('Samples') && desc.path.endsWith('.Sample.Depth')) depthTypeId = id;
    if (desc.path.includes('Samples') && desc.path.endsWith('.Sample.Temperature')) tempTypeId = id;
  }

  let sampleGroupId = -1;
  let timeOffsetInGroup = -1;
  let depthOffsetInGroup = -1;
  let tempOffsetInGroup = -1;

  let pressureTypeId = -1;
  for (const [id, desc] of typeDescs) {
    if (desc.path.includes('Cylinders') && desc.path.endsWith('.Pressure')) {
      pressureTypeId = id;
    }
  }

  let cylinderGroupId = -1;
  let pressureOffsetInGroup = -1;

  for (const [groupId, members] of groups) {
    const timeIdx = members.indexOf(timeTypeId);
    const depthIdx = members.indexOf(depthTypeId);

    if (timeIdx >= 0 && depthIdx >= 0) {
      sampleGroupId = groupId;
      timeOffsetInGroup = timeIdx * 2;
      depthOffsetInGroup = depthIdx * 2;

      const tempIdx = members.indexOf(tempTypeId);
      if (tempIdx >= 0) tempOffsetInGroup = tempIdx * 2;
    }

    const pressIdx = members.indexOf(pressureTypeId);
    if (pressIdx >= 0) {
      cylinderGroupId = groupId;
      pressureOffsetInGroup = 1; // after 1-byte gas number
    }
  }

  // ---- Second pass: extract sample + cylinder data ----

  pos = 8;
  const samples: DiveSample[] = [];
  const pressures: number[] = [];
  let currentTimeMs = 0;

  while (pos < data.length - 2) {
    if (data[pos] === 0) {
      // Skip descriptor
      let textLen = data[pos + 1];
      if (textLen === 0xff) {
        textLen =
          data[pos + 2] |
          (data[pos + 3] << 8) |
          (data[pos + 4] << 16) |
          (data[pos + 5] << 24);
        pos += 6 + textLen;
      } else {
        pos += 2 + textLen;
      }
      continue;
    }

    const entry = parseDataEntry(pos);
    if (!entry) {
      pos++;
      continue;
    }

    // Cylinder group (pressure data)
    if (entry.typeId === cylinderGroupId && entry.dataLen >= 3) {
      const s = entry.dataStart;
      const pressureCentibar =
        data[s + pressureOffsetInGroup] | (data[s + pressureOffsetInGroup + 1] << 8);
      pressures.push(pressureCentibar !== 0xffff ? pressureCentibar : -1);
    }

    // Sample group
    if (entry.typeId === sampleGroupId && entry.dataLen >= 6) {
      const s = entry.dataStart;

      let timeDelta = 0;
      let depthCm = 0;
      let tempDeciC: number | null = null;

      if (timeOffsetInGroup >= 0 && s + timeOffsetInGroup + 2 <= s + entry.dataLen) {
        timeDelta = data[s + timeOffsetInGroup] | (data[s + timeOffsetInGroup + 1] << 8);
        currentTimeMs += timeDelta;
        durationMs += timeDelta;
      }

      if (depthOffsetInGroup >= 0 && s + depthOffsetInGroup + 2 <= s + entry.dataLen) {
        depthCm = data[s + depthOffsetInGroup] | (data[s + depthOffsetInGroup + 1] << 8);
        if (depthCm !== 0xffff && depthCm > maxDepthCm) {
          maxDepthCm = depthCm;
        }
      }

      if (tempOffsetInGroup >= 0 && s + tempOffsetInGroup + 2 <= s + entry.dataLen) {
        const tempRaw = data[s + tempOffsetInGroup] | (data[s + tempOffsetInGroup + 1] << 8);
        tempDeciC = tempRaw > 32767 ? tempRaw - 65536 : tempRaw;
        if (tempDeciC !== -3000) {
          if (minTempDeciC === null || tempDeciC < minTempDeciC) {
            minTempDeciC = tempDeciC;
          }
        }
      }

      const sample: DiveSample = {
        time: { seconds: Math.round(currentTimeMs / 1000) },
        depth: { mm: depthCm !== 0xffff ? depthCm * 10 : 0 },
      };

      if (tempDeciC !== null && tempDeciC !== -3000) {
        const tempC = tempDeciC / 10;
        sample.temperature = { mkelvin: Math.round((tempC + 273.15) * 1000) };
      }

      samples.push(sample);
    }

    pos = entry.nextPos;
  }

  // Merge pressure data into samples (1:1 correspondence)
  if (pressures.length > 0) {
    for (let i = 0; i < Math.min(samples.length, pressures.length); i++) {
      if (pressures[i] >= 0) {
        samples[i].pressure = [{ tank: 0, pressure: { mbar: pressures[i] * 10 } }];
      }
    }
  }

  // Convert to final units
  const maxDepthM = maxDepthCm / 100;
  const durationSeconds = Math.round(durationMs / 1000);
  const waterTempC = minTempDeciC !== null ? minTempDeciC / 10 : undefined;
  const avgDepthM = maxDepthM * 0.6;

  const when = new Date(timestamp * 1000);

  return {
    id: timestamp,
    when,
    duration: { seconds: durationSeconds },
    maxDepth: { mm: Math.round(maxDepthM * 1000) },
    meanDepth: { mm: Math.round(avgDepthM * 1000) },
    waterTemperature:
      waterTempC !== undefined
        ? { mkelvin: Math.round((waterTempC + 273.15) * 1000) }
        : undefined,
    surfaceTemperature: undefined,
    diveSite: undefined,
    diveComputers: [
      {
        model,
        serial: diveFile.name.replace(/\.LOG$/i, ''),
        when,
        samples,
        events: [],
      },
    ],
    cylinders:
      o2Percent !== 21
        ? [
            {
              gasmix: {
                oxygen: { permille: o2Percent * 10 },
                helium: { permille: 0 },
                nitrogen: { permille: (100 - o2Percent) * 10 },
              },
              start: undefined,
              end: undefined,
              workingPressure: undefined,
            },
          ]
        : [],
  };
}

/**
 * Create a placeholder dive when the file cannot be parsed (e.g. missing SBEM header).
 */
export function createDefaultDive(timestamp: number, filename: string, model: string): Dive {
  const when = new Date(timestamp * 1000);
  return {
    id: timestamp,
    when,
    duration: { seconds: 0 },
    maxDepth: { mm: 0 },
    meanDepth: { mm: 0 },
    waterTemperature: undefined,
    surfaceTemperature: undefined,
    diveSite: undefined,
    diveComputers: [
      {
        model,
        serial: filename.replace(/\.LOG$/i, ''),
        when,
        samples: [],
        events: [],
      },
    ],
    cylinders: [],
  };
}
