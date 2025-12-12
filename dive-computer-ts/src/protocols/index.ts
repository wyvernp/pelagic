/**
 * Protocol Index
 * 
 * Maps dive computer families to their protocol implementations
 * and provides a unified factory for creating protocol instances.
 */

import { DCFamily } from '../descriptors/descriptors';
import { BaseProtocol } from './base-protocol';
import { SuuntoEonSteel } from './suunto-eonsteel';
import { SuuntoEonSteelWebHID } from './suunto-eonsteel-webhid';
import { ShearwaterProtocol } from './shearwater';
import { OceanicProtocol } from './oceanic';
import { ScubaproProtocol } from './scubapro';
import { HeinrichsWeikampProtocol } from './heinrichs-weikamp';
import { MaresProtocol } from './mares';
import { GarminProtocol } from './garmin';

// Re-export all protocols
export { BaseProtocol, ProtocolDeviceInfo, ProtocolDive, ProgressCallback, DiveCallback } from './base-protocol';
export { SuuntoEonSteel } from './suunto-eonsteel';
export { SuuntoEonSteelWebHID } from './suunto-eonsteel-webhid';
export { ShearwaterProtocol } from './shearwater';
export { OceanicProtocol } from './oceanic';
export { ScubaproProtocol } from './scubapro';
export { HeinrichsWeikampProtocol } from './heinrichs-weikamp';
export { MaresProtocol } from './mares';
export { GarminProtocol } from './garmin';

/**
 * Protocol support status
 */
export interface ProtocolSupport {
    family: DCFamily;
    supported: boolean;
    protocol: string;
    transports: string[];
    notes?: string;
}

/**
 * Complete protocol support matrix
 */
export const PROTOCOL_SUPPORT: ProtocolSupport[] = [
    // Fully Implemented
    {
        family: DCFamily.SUUNTO_EONSTEEL,
        supported: true,
        protocol: 'SuuntoEonSteel',
        transports: ['USB HID', 'BLE'],
        notes: 'Full support for EON Steel, EON Core, D5'
    },
    {
        family: DCFamily.SHEARWATER_PETREL,
        supported: true,
        protocol: 'ShearwaterProtocol',
        transports: ['Serial', 'BLE'],
        notes: 'Supports Petrel, Perdix, Teric, Nerd, Peregrine'
    },
    {
        family: DCFamily.OCEANIC_ATOM2,
        supported: true,
        protocol: 'OceanicProtocol',
        transports: ['Serial', 'BLE'],
        notes: 'Supports Oceanic, Aeris, Sherwood, Hollis, Aqualung'
    },
    {
        family: DCFamily.UWATEC_SMART,
        supported: true,
        protocol: 'ScubaproProtocol',
        transports: ['Serial', 'USB HID', 'BLE', 'IrDA'],
        notes: 'Supports Scubapro G2, G3, Aladin, Galileo, Mantis'
    },
    {
        family: DCFamily.HW_OSTC,
        supported: true,
        protocol: 'HeinrichsWeikampProtocol',
        transports: ['Serial'],
        notes: 'Supports OSTC, OSTC 2, OSTC 2N, OSTC 2C'
    },
    {
        family: DCFamily.MARES_ICONHD,
        supported: true,
        protocol: 'MaresProtocol',
        transports: ['Serial'],
        notes: 'Supports Icon HD, Puck Pro, Quad, Smart, Matrix, Genius'
    },
    
    // Partial Support / Planned
    {
        family: DCFamily.SUUNTO_D9,
        supported: false,
        protocol: 'SuuntoD9Protocol',
        transports: ['Serial', 'USB'],
        notes: 'Older Suunto protocol - needs implementation'
    },
    {
        family: DCFamily.SUUNTO_VYPER,
        supported: false,
        protocol: 'SuuntoVyperProtocol',
        transports: ['Serial'],
        notes: 'Legacy Suunto protocol'
    },
    {
        family: DCFamily.SUUNTO_EON,
        supported: false,
        protocol: 'SuuntoEonProtocol',
        transports: ['Serial'],
        notes: 'Classic Suunto EON protocol'
    },
    {
        family: DCFamily.OCEANIC_VTPRO,
        supported: false,
        protocol: 'OceanicVtproProtocol',
        transports: ['Serial'],
        notes: 'Older Oceanic protocol'
    },
    {
        family: DCFamily.OCEANIC_VEO250,
        supported: false,
        protocol: 'OceanicVeo250Protocol',
        transports: ['Serial'],
        notes: 'Oceanic Veo series'
    },
    {
        family: DCFamily.MARES_NEMO,
        supported: false,
        protocol: 'MaresNemoProtocol',
        transports: ['Serial'],
        notes: 'Older Mares protocol'
    },
    {
        family: DCFamily.HW_OSTC3,
        supported: false,
        protocol: 'HwOstc3Protocol',
        transports: ['Serial', 'BLE'],
        notes: 'OSTC 3, OSTC Plus, OSTC 4'
    },
    {
        family: DCFamily.CRESSI_GOA,
        supported: false,
        protocol: 'CressiProtocol',
        transports: ['Serial'],
        notes: 'Cressi dive computers'
    },
    {
        family: DCFamily.DIVERITE_NITEKQ,
        supported: false,
        protocol: 'DiveriteProtocol',
        transports: ['Serial'],
        notes: 'Dive Rite computers'
    },
    {
        family: DCFamily.DIVESOFT_FREEDOM,
        supported: false,
        protocol: 'DivesoftProtocol',
        transports: ['Serial'],
        notes: 'DiveSoft Freedom'
    },
    {
        family: DCFamily.CITIZEN_AQUALAND,
        supported: false,
        protocol: 'CitizenProtocol',
        transports: ['Serial'],
        notes: 'Citizen Aqualand'
    },
    {
        family: DCFamily.ATOMICS_COBALT,
        supported: false,
        protocol: 'AtomicProtocol',
        transports: ['USB HID'],
        notes: 'Atomic Aquatics Cobalt'
    },
    {
        family: DCFamily.DEEPBLU_COSMIQ,
        supported: false,
        protocol: 'DeepbluProtocol',
        transports: ['BLE'],
        notes: 'Deepblu Cosmiq+'
    },
    {
        family: DCFamily.GARMIN,
        supported: true,
        protocol: 'GarminProtocol',
        transports: ['USB Mass Storage', 'ANT+', 'BLE'],
        notes: 'Supports Descent Mk1, Mk2, Mk2i, Mk2S, Mk3, Mk3i, G1 via FIT files'
    },
    {
        family: DCFamily.TECDIVING_DIVECOMPUTEREU,
        supported: false,
        protocol: 'TecdivingProtocol',
        transports: ['Serial', 'BLE'],
        notes: 'Ratio computers'
    },
    {
        family: DCFamily.DEEPSIX_EXCURSION,
        supported: false,
        protocol: 'DeepsixProtocol',
        transports: ['BLE'],
        notes: 'DeepSix Excursion'
    },
    {
        family: DCFamily.PELAGIC_I330R,
        supported: false,
        protocol: 'PelagicProtocol',
        transports: ['Serial', 'BLE'],
        notes: 'Similar to Oceanic protocol'
    },
    {
        family: DCFamily.SPORASUB_SP2,
        supported: false,
        protocol: 'SporasubProtocol',
        transports: ['Serial'],
        notes: 'Sporasub SP2'
    },
    {
        family: DCFamily.MCLEAN_EXTREME,
        supported: false,
        protocol: 'McleanProtocol',
        transports: ['Serial'],
        notes: 'McLean Extreme'
    },
    {
        family: DCFamily.LIQUIVISION_LYNX,
        supported: false,
        protocol: 'LiquivisionProtocol',
        transports: ['Serial', 'USB'],
        notes: 'Liquivision Lynx'
    },
    {
        family: DCFamily.NULL,
        supported: false,
        protocol: 'None',
        transports: [],
        notes: 'No protocol'
    }
];

/**
 * Get protocol class for a given family
 */
export function getProtocolClass(family: DCFamily): typeof BaseProtocol | null {
    switch (family) {
        case DCFamily.SUUNTO_EONSTEEL:
            return SuuntoEonSteel as any;
        case DCFamily.SHEARWATER_PETREL:
        case DCFamily.SHEARWATER_PREDATOR:
            return ShearwaterProtocol as any;
        case DCFamily.OCEANIC_ATOM2:
            return OceanicProtocol as any;
        case DCFamily.UWATEC_SMART:
            return ScubaproProtocol as any;
        case DCFamily.HW_OSTC:
            return HeinrichsWeikampProtocol as any;
        case DCFamily.MARES_ICONHD:
            return MaresProtocol as any;
        case DCFamily.GARMIN:
            return GarminProtocol as any;
        default:
            return null;
    }
}

/**
 * Create a protocol instance for a given family
 */
export function createProtocol(family: DCFamily): BaseProtocol | null {
    const ProtocolClass = getProtocolClass(family);
    if (ProtocolClass) {
        return new (ProtocolClass as any)();
    }
    return null;
}

/**
 * Check if a family is supported
 */
export function isSupported(family: DCFamily): boolean {
    return getProtocolClass(family) !== null;
}

/**
 * Get support information for a family
 */
export function getSupportInfo(family: DCFamily): ProtocolSupport | undefined {
    return PROTOCOL_SUPPORT.find(s => s.family === family);
}

/**
 * Get all supported families
 */
export function getSupportedFamilies(): DCFamily[] {
    return PROTOCOL_SUPPORT
        .filter(s => s.supported)
        .map(s => s.family);
}

/**
 * Print protocol support matrix
 */
export function printSupportMatrix(): void {
    console.log('\n📋 Dive Computer Protocol Support Matrix\n');
    console.log('=' .repeat(80));
    
    const supported = PROTOCOL_SUPPORT.filter(s => s.supported);
    const unsupported = PROTOCOL_SUPPORT.filter(s => !s.supported);

    console.log('\n✅ FULLY SUPPORTED:\n');
    for (const s of supported) {
        console.log(`  ${DCFamily[s.family]}`);
        console.log(`    Protocol: ${s.protocol}`);
        console.log(`    Transports: ${s.transports.join(', ')}`);
        if (s.notes) console.log(`    Notes: ${s.notes}`);
        console.log();
    }

    console.log('\n⏳ PLANNED / NOT YET IMPLEMENTED:\n');
    for (const s of unsupported) {
        if (s.family === DCFamily.NULL) continue;
        console.log(`  ${DCFamily[s.family]}`);
        console.log(`    Protocol: ${s.protocol}`);
        console.log(`    Transports: ${s.transports.join(', ')}`);
        if (s.notes) console.log(`    Notes: ${s.notes}`);
        console.log();
    }

    console.log('=' .repeat(80));
    console.log(`\nTotal: ${supported.length} supported, ${unsupported.length - 1} pending`);
}

// Self-test when run directly
if (require.main === module) {
    printSupportMatrix();
}
