// SPDX-License-Identifier: GPL-2.0
/**
 * Dive Computer Descriptors
 * Database of known dive computers with their properties
 * Converted from libdivecomputer descriptor data
 */

import { TransportType, DCDescriptor } from '../types/index.js';

/**
 * Known dive computer families
 */
export enum DCFamily {
  NULL = 0,
  // Suunto
  SUUNTO_SOLUTION,
  SUUNTO_EON,
  SUUNTO_VYPER,
  SUUNTO_VYPER2,
  SUUNTO_D9,
  SUUNTO_EONSTEEL,
  // Reefnet
  REEFNET_SENSUS,
  REEFNET_SENSUSPRO,
  REEFNET_SENSUSULTRA,
  // Uwatec
  UWATEC_ALADIN,
  UWATEC_MEMOMOUSE,
  UWATEC_SMART,
  UWATEC_MERIDIAN,
  // Oceanic
  OCEANIC_VTPRO,
  OCEANIC_VEO250,
  OCEANIC_ATOM2,
  PELAGIC_I330R,
  // Mares
  MARES_NEMO,
  MARES_PUCK,
  MARES_DARWIN,
  MARES_ICONHD,
  MARES_GENIUS,
  // Heinrichs Weikamp
  HW_OSTC,
  HW_FROG,
  HW_OSTC3,
  // Cressi
  CRESSI_EDY,
  CRESSI_LEONARDO,
  CRESSI_GOA,
  // Zeagle
  ZEAGLE_N2ITION3,
  // Atomics
  ATOMICS_COBALT,
  // Shearwater
  SHEARWATER_PREDATOR,
  SHEARWATER_PETREL,
  SHEARWATER_PERDIX,
  // Diverite
  DIVERITE_NITEKQ,
  // Citizen
  CITIZEN_AQUALAND,
  // DiveSoft
  DIVESOFT_FREEDOM,
  // Deepblu
  DEEPBLU_COSMIQ,
  // Oceans
  OCEANS_S1,
  // McLean
  MCLEAN_EXTREME,
  // Liquivision
  LIQUIVISION_LYNX,
  // Sporasub
  SPORASUB_SP2,
  // Deepsix
  DEEPSIX_EXCURSION,
  // Seac
  SEAC_SCREEN,
  // Ratio
  RATIO_IFLY,
  RATIO_IX3M2,
  // Garmin
  GARMIN,
  // Tecdiving
  TECDIVING_DIVECOMPUTEREU,
  // Scubapro
  SCUBAPRO_G2,
}

/**
 * Database of known dive computers
 */
export const diveComputerDescriptors: DCDescriptor[] = [
  // Heinrichs Weikamp
  { vendor: 'Heinrichs Weikamp', product: 'OSTC 2', model: 0, type: DCFamily.HW_OSTC, transports: TransportType.SERIAL },
  { vendor: 'Heinrichs Weikamp', product: 'OSTC 2N', model: 1, type: DCFamily.HW_OSTC, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Heinrichs Weikamp', product: 'OSTC 3', model: 2, type: DCFamily.HW_OSTC3, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Heinrichs Weikamp', product: 'OSTC Plus', model: 3, type: DCFamily.HW_OSTC3, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Heinrichs Weikamp', product: 'OSTC 4/5', model: 4, type: DCFamily.HW_OSTC3, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Heinrichs Weikamp', product: 'OSTC Sport', model: 5, type: DCFamily.HW_OSTC3, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Heinrichs Weikamp', product: 'OSTC cR', model: 6, type: DCFamily.HW_OSTC3, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Heinrichs Weikamp', product: 'Frog', model: 0, type: DCFamily.HW_FROG, transports: TransportType.SERIAL },
  
  // Shearwater
  { vendor: 'Shearwater', product: 'Predator', model: 2, type: DCFamily.SHEARWATER_PREDATOR, transports: TransportType.BLUETOOTH | TransportType.BLE },
  { vendor: 'Shearwater', product: 'Petrel', model: 3, type: DCFamily.SHEARWATER_PETREL, transports: TransportType.BLUETOOTH | TransportType.BLE },
  { vendor: 'Shearwater', product: 'Petrel 2', model: 3, type: DCFamily.SHEARWATER_PETREL, transports: TransportType.BLUETOOTH | TransportType.BLE },
  { vendor: 'Shearwater', product: 'Petrel 3', model: 9, type: DCFamily.SHEARWATER_PETREL, transports: TransportType.BLUETOOTH | TransportType.BLE },
  { vendor: 'Shearwater', product: 'NERD', model: 4, type: DCFamily.SHEARWATER_PETREL, transports: TransportType.BLUETOOTH | TransportType.BLE },
  { vendor: 'Shearwater', product: 'NERD 2', model: 4, type: DCFamily.SHEARWATER_PETREL, transports: TransportType.BLUETOOTH | TransportType.BLE },
  { vendor: 'Shearwater', product: 'Perdix', model: 5, type: DCFamily.SHEARWATER_PERDIX, transports: TransportType.BLUETOOTH | TransportType.BLE },
  { vendor: 'Shearwater', product: 'Perdix 2', model: 10, type: DCFamily.SHEARWATER_PERDIX, transports: TransportType.BLE },
  { vendor: 'Shearwater', product: 'Perdix AI', model: 6, type: DCFamily.SHEARWATER_PERDIX, transports: TransportType.BLUETOOTH | TransportType.BLE },
  { vendor: 'Shearwater', product: 'Teric', model: 7, type: DCFamily.SHEARWATER_PERDIX, transports: TransportType.BLE },
  { vendor: 'Shearwater', product: 'Peregrine', model: 8, type: DCFamily.SHEARWATER_PERDIX, transports: TransportType.BLE },
  { vendor: 'Shearwater', product: 'Tern', model: 11, type: DCFamily.SHEARWATER_PERDIX, transports: TransportType.BLE },
  
  // Suunto
  { vendor: 'Suunto', product: 'Solution', model: 0, type: DCFamily.SUUNTO_SOLUTION, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'Eon', model: 0, type: DCFamily.SUUNTO_EON, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'Vyper', model: 0x0A, type: DCFamily.SUUNTO_VYPER, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'Vyper 2', model: 0x10, type: DCFamily.SUUNTO_VYPER2, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'Cobra', model: 0x04, type: DCFamily.SUUNTO_VYPER, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'Cobra 2', model: 0x11, type: DCFamily.SUUNTO_VYPER2, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'Cobra 3', model: 0x14, type: DCFamily.SUUNTO_VYPER2, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'Zoop', model: 0x0B, type: DCFamily.SUUNTO_VYPER, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'Zoop Novo', model: 0x16, type: DCFamily.SUUNTO_VYPER2, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'D4', model: 0x0C, type: DCFamily.SUUNTO_VYPER, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'D4i', model: 0x19, type: DCFamily.SUUNTO_VYPER2, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'D6', model: 0x0D, type: DCFamily.SUUNTO_VYPER, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'D6i', model: 0x1A, type: DCFamily.SUUNTO_VYPER2, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'D9', model: 0x0E, type: DCFamily.SUUNTO_D9, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'D9tx', model: 0x1B, type: DCFamily.SUUNTO_D9, transports: TransportType.SERIAL },
  { vendor: 'Suunto', product: 'EON Steel', model: 0, type: DCFamily.SUUNTO_EONSTEEL, transports: TransportType.USBHID | TransportType.BLE },
  { vendor: 'Suunto', product: 'EON Core', model: 1, type: DCFamily.SUUNTO_EONSTEEL, transports: TransportType.USBHID | TransportType.BLE },
  { vendor: 'Suunto', product: 'D5', model: 2, type: DCFamily.SUUNTO_EONSTEEL, transports: TransportType.USBHID | TransportType.BLE },
  
  // Oceanic / Aqualung / Sherwood
  { vendor: 'Oceanic', product: 'VT Pro', model: 0x4151, type: DCFamily.OCEANIC_VTPRO, transports: TransportType.SERIAL },
  { vendor: 'Oceanic', product: 'Veo 250', model: 0x424C, type: DCFamily.OCEANIC_VEO250, transports: TransportType.SERIAL },
  { vendor: 'Oceanic', product: 'Atom 2.0', model: 0x4344, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL },
  { vendor: 'Oceanic', product: 'Geo 4.0', model: 0x4653, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Oceanic', product: 'Veo 4.0', model: 0x4654, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Oceanic', product: 'Pro Plus X', model: 0x4552, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Oceanic', product: 'Pro Plus 4', model: 0x4656, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Aqualung', product: 'i300C', model: 0x4648, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Aqualung', product: 'i200C', model: 0x4649, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Aqualung', product: 'i200Cv2', model: 0x4749, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Aqualung', product: 'i330R', model: 0x4744, type: DCFamily.PELAGIC_I330R, transports: TransportType.BLE },
  { vendor: 'Aqualung', product: 'i470TC', model: 0x4743, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Aqualung', product: 'i550C', model: 0x4652, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Aqualung', product: 'i750TC', model: 0x455A, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Aqualung', product: 'i770R', model: 0x4651, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Sherwood', product: 'Sage', model: 0x4647, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Sherwood', product: 'Wisdom 4', model: 0x4655, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Apeks', product: 'DSX', model: 0x4741, type: DCFamily.OCEANIC_ATOM2, transports: TransportType.SERIAL | TransportType.BLE },
  
  // Scubapro / Uwatec
  { vendor: 'Scubapro', product: 'G2', model: 0x22, type: DCFamily.SCUBAPRO_G2, transports: TransportType.USBHID | TransportType.BLE },
  { vendor: 'Scubapro', product: 'G2 HUD', model: 0x42, type: DCFamily.SCUBAPRO_G2, transports: TransportType.USBHID | TransportType.BLE },
  { vendor: 'Scubapro', product: 'G3', model: 0x32, type: DCFamily.SCUBAPRO_G2, transports: TransportType.USBHID | TransportType.BLE },
  { vendor: 'Scubapro', product: 'Aladin Sport Matrix', model: 0x17, type: DCFamily.UWATEC_SMART, transports: TransportType.USBHID | TransportType.BLE },
  { vendor: 'Scubapro', product: 'Aladin A1', model: 0x21, type: DCFamily.UWATEC_SMART, transports: TransportType.USBHID | TransportType.BLE },
  { vendor: 'Scubapro', product: 'Aladin A2', model: 0x24, type: DCFamily.UWATEC_SMART, transports: TransportType.USBHID | TransportType.BLE },
  { vendor: 'Scubapro', product: 'Luna 2.0', model: 0x23, type: DCFamily.SCUBAPRO_G2, transports: TransportType.USBHID | TransportType.BLE },
  { vendor: 'Scubapro', product: 'Luna 2.0 AI', model: 0x25, type: DCFamily.SCUBAPRO_G2, transports: TransportType.USBHID | TransportType.BLE },
  
  // Mares
  { vendor: 'Mares', product: 'Nemo', model: 0, type: DCFamily.MARES_NEMO, transports: TransportType.SERIAL },
  { vendor: 'Mares', product: 'Puck', model: 4, type: DCFamily.MARES_PUCK, transports: TransportType.SERIAL },
  { vendor: 'Mares', product: 'Puck Pro', model: 5, type: DCFamily.MARES_PUCK, transports: TransportType.SERIAL },
  { vendor: 'Mares', product: 'Puck Pro+', model: 11, type: DCFamily.MARES_PUCK, transports: TransportType.SERIAL },
  { vendor: 'Mares', product: 'Smart', model: 7, type: DCFamily.MARES_PUCK, transports: TransportType.SERIAL },
  { vendor: 'Mares', product: 'Smart Air', model: 10, type: DCFamily.MARES_PUCK, transports: TransportType.SERIAL },
  { vendor: 'Mares', product: 'Quad', model: 6, type: DCFamily.MARES_DARWIN, transports: TransportType.SERIAL },
  { vendor: 'Mares', product: 'Quad Air', model: 8, type: DCFamily.MARES_DARWIN, transports: TransportType.SERIAL },
  { vendor: 'Mares', product: 'Icon HD', model: 0x14, type: DCFamily.MARES_ICONHD, transports: TransportType.SERIAL },
  { vendor: 'Mares', product: 'Icon HD Net Ready', model: 0x15, type: DCFamily.MARES_ICONHD, transports: TransportType.SERIAL },
  { vendor: 'Mares', product: 'Genius', model: 0, type: DCFamily.MARES_GENIUS, transports: TransportType.BLE },
  { vendor: 'Mares', product: 'Sirius', model: 1, type: DCFamily.MARES_GENIUS, transports: TransportType.BLE },
  
  // Cressi
  { vendor: 'Cressi', product: 'Edy', model: 0x08, type: DCFamily.CRESSI_EDY, transports: TransportType.SERIAL },
  { vendor: 'Cressi', product: 'Leonardo', model: 1, type: DCFamily.CRESSI_LEONARDO, transports: TransportType.SERIAL },
  { vendor: 'Cressi', product: 'Leonardo 2.0', model: 3, type: DCFamily.CRESSI_GOA, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Cressi', product: 'Goa', model: 2, type: DCFamily.CRESSI_GOA, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Cressi', product: 'Cartesio', model: 1, type: DCFamily.CRESSI_GOA, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Cressi', product: 'Donatello', model: 4, type: DCFamily.CRESSI_GOA, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Cressi', product: 'Michelangelo', model: 5, type: DCFamily.CRESSI_GOA, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Cressi', product: 'Neon', model: 9, type: DCFamily.CRESSI_GOA, transports: TransportType.SERIAL | TransportType.BLE },
  { vendor: 'Cressi', product: 'Nepto', model: 10, type: DCFamily.CRESSI_GOA, transports: TransportType.SERIAL | TransportType.BLE },
  
  // Ratio
  { vendor: 'Ratio', product: 'iX3M GPS Easy', model: 0x02, type: DCFamily.RATIO_IX3M2, transports: TransportType.BLUETOOTH },
  { vendor: 'Ratio', product: 'iX3M 2021 GPS Easy', model: 0x12, type: DCFamily.RATIO_IX3M2, transports: TransportType.BLE },
  { vendor: 'Ratio', product: 'iDive Color Easy', model: 0x22, type: DCFamily.RATIO_IX3M2, transports: TransportType.BLE },
  
  // Garmin
  { vendor: 'Garmin', product: 'Descent Mk1', model: 0, type: DCFamily.GARMIN, transports: TransportType.USBSTORAGE },
  { vendor: 'Garmin', product: 'Descent Mk2', model: 1, type: DCFamily.GARMIN, transports: TransportType.USBSTORAGE | TransportType.BLE },
  { vendor: 'Garmin', product: 'Descent Mk2i', model: 2, type: DCFamily.GARMIN, transports: TransportType.USBSTORAGE | TransportType.BLE },
  { vendor: 'Garmin', product: 'Descent Mk2S', model: 3, type: DCFamily.GARMIN, transports: TransportType.USBSTORAGE | TransportType.BLE },
  { vendor: 'Garmin', product: 'Descent G1', model: 4, type: DCFamily.GARMIN, transports: TransportType.USBSTORAGE | TransportType.BLE },
  { vendor: 'Garmin', product: 'Descent Mk3', model: 5, type: DCFamily.GARMIN, transports: TransportType.USBSTORAGE | TransportType.BLE },
  { vendor: 'Garmin', product: 'Descent Mk3i', model: 6, type: DCFamily.GARMIN, transports: TransportType.USBSTORAGE | TransportType.BLE },
  
  // Deepblu
  { vendor: 'Deepblu', product: 'Cosmiq+', model: 0, type: DCFamily.DEEPBLU_COSMIQ, transports: TransportType.BLE },
  
  // Oceans
  { vendor: 'Oceans', product: 'S1', model: 0, type: DCFamily.OCEANS_S1, transports: TransportType.BLE },
  
  // McLean
  { vendor: 'McLean', product: 'Extreme', model: 0, type: DCFamily.MCLEAN_EXTREME, transports: TransportType.BLE },
  
  // Tecdiving
  { vendor: 'Tecdiving', product: 'DiveComputer.eu', model: 0, type: DCFamily.TECDIVING_DIVECOMPUTEREU, transports: TransportType.BLE },
  
  // DiveSoft
  { vendor: 'Divesoft', product: 'Freedom', model: 0, type: DCFamily.DIVESOFT_FREEDOM, transports: TransportType.BLE },
  
  // Atomics
  { vendor: 'Atomics', product: 'Cobalt', model: 0, type: DCFamily.ATOMICS_COBALT, transports: TransportType.USB },
  { vendor: 'Atomics', product: 'Cobalt 2', model: 2, type: DCFamily.ATOMICS_COBALT, transports: TransportType.USB },
  
  // Uemis
  { vendor: 'Uemis', product: 'Zurich', model: 0, type: DCFamily.NULL, transports: TransportType.USBSTORAGE },
];

/**
 * Get all vendors
 */
export function getVendors(): string[] {
  const vendors = new Set<string>();
  for (const desc of diveComputerDescriptors) {
    vendors.add(desc.vendor);
  }
  return Array.from(vendors).sort();
}

/**
 * Get products for a vendor
 */
export function getProducts(vendor: string): string[] {
  const products: string[] = [];
  for (const desc of diveComputerDescriptors) {
    if (desc.vendor === vendor && !products.includes(desc.product)) {
      products.push(desc.product);
    }
  }
  return products.sort();
}

/**
 * Find descriptor by vendor and product
 */
export function findDescriptor(vendor: string, product: string): DCDescriptor | undefined {
  const key = (vendor + product).toLowerCase();
  return diveComputerDescriptors.find(
    d => (d.vendor + d.product).toLowerCase() === key
  );
}

/**
 * Get descriptor by model and type
 */
export function getDescriptorByModel(type: number, model: number): DCDescriptor | undefined {
  return diveComputerDescriptors.find(
    d => d.type === type && d.model === model
  );
}

/**
 * Check if transports include Bluetooth
 */
export function supportsBluetooth(transports: TransportType): boolean {
  return !!(transports & (TransportType.BLUETOOTH | TransportType.BLE));
}

/**
 * Check if transports include BLE only
 */
export function isBLEOnly(transports: TransportType): boolean {
  return !!(transports & TransportType.BLE) && !(transports & TransportType.BLUETOOTH);
}

/**
 * Check if transports include USB
 */
export function supportsUSB(transports: TransportType): boolean {
  return !!(transports & (TransportType.USB | TransportType.USBHID | TransportType.SERIAL | TransportType.USBSTORAGE));
}
