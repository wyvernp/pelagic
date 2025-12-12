// Simple test script for the dive computer library
import {
  TransportType,
  DCStatus,
  DiveMode,
  getVendors,
  getProducts,
  findDescriptor,
  supportsBluetooth,
  isBLEOnly,
  supportsUSB,
  diveComputerDescriptors,
  DCFamily,
} from './index.js';

import { DownloadManager, DownloadState } from './download/download-manager.js';
import { FingerprintManager, MemoryFingerprintStorage } from './download/fingerprint-manager.js';
import { BluetoothDiscovery } from './discovery/bluetooth-discovery.js';
import { matchBLEDeviceName, BLE_SERIAL_SERVICES } from './transport/ble.js';

console.log('=== Dive Computer TypeScript Library Test ===\n');

// Test 1: Enum values
console.log('1. Testing Enums:');
console.log(`   TransportType.BLE = ${TransportType.BLE}`);
console.log(`   TransportType.BLUETOOTH = ${TransportType.BLUETOOTH}`);
console.log(`   DCStatus.SUCCESS = ${DCStatus.SUCCESS}`);
console.log(`   DiveMode.OC = ${DiveMode.OC}`);
console.log(`   DiveMode.CCR = ${DiveMode.CCR}`);

// Test 2: Descriptor database
console.log('\n2. Testing Descriptor Database:');
console.log(`   Total dive computers: ${diveComputerDescriptors.length}`);

const vendors = getVendors();
console.log(`   Total vendors: ${vendors.length}`);
console.log(`   Vendors: ${vendors.slice(0, 10).join(', ')}...`);

// Test 3: Find specific dive computers
console.log('\n3. Finding Specific Dive Computers:');

const perdix = findDescriptor('Shearwater', 'Perdix');
if (perdix) {
  console.log(`   Shearwater Perdix:`);
  console.log(`     - Model: ${perdix.model}`);
  console.log(`     - Transport: ${perdix.transports} (BLE: ${!!(perdix.transports & TransportType.BLE)})`);
}

const suuntoD5 = findDescriptor('Suunto', 'D5');
if (suuntoD5) {
  console.log(`   Suunto D5:`);
  console.log(`     - Model: ${suuntoD5.model}`);
  console.log(`     - Transport: ${suuntoD5.transports}`);
}

const g2 = findDescriptor('Scubapro', 'G2');
if (g2) {
  console.log(`   Scubapro G2:`);
  console.log(`     - Model: ${g2.model}`);
  console.log(`     - Transport: ${g2.transports}`);
}

// Test 4: Get products for a vendor
console.log('\n4. Products by Vendor:');
const shearwaterProducts = getProducts('Shearwater');
console.log(`   Shearwater products (${shearwaterProducts.length}): ${shearwaterProducts.join(', ')}`);

const suuntoProducts = getProducts('Suunto');
console.log(`   Suunto products (${suuntoProducts.length}): ${suuntoProducts.slice(0, 5).join(', ')}...`);

// Test 5: Transport support helpers
console.log('\n5. Transport Support Checks:');
if (perdix) {
  console.log(`   Shearwater Perdix supports Bluetooth: ${supportsBluetooth(perdix.transports)}`);
  console.log(`   Shearwater Perdix is BLE only: ${isBLEOnly(perdix.transports)}`);
  console.log(`   Shearwater Perdix supports USB: ${supportsUSB(perdix.transports)}`);
}

// Test 6: BLE name matching
console.log('\n6. BLE Device Name Matching:');
const testNames = [
  'Perdix 12345',
  'Petrel 3 67890',
  'Teric ABCD',
  'EON Steel',
  'G2 123456',
  'OSTC4-12345',
  'Unknown Device',
];

for (const name of testNames) {
  const match = matchBLEDeviceName(name);
  if (match) {
    console.log(`   "${name}" -> ${match.vendor} ${match.product}`);
  } else {
    console.log(`   "${name}" -> No match`);
  }
}

// Test 7: BLE Service UUIDs
console.log('\n7. Known BLE Serial Services:');
console.log(`   Shearwater: ${BLE_SERIAL_SERVICES.SHEARWATER}`);
console.log(`   Suunto: ${BLE_SERIAL_SERVICES.SUUNTO}`);
console.log(`   Scubapro: ${BLE_SERIAL_SERVICES.SCUBAPRO}`);
console.log(`   Mares: ${BLE_SERIAL_SERVICES.MARES}`);

// Test 8: Download Manager
console.log('\n8. Testing Download Manager:');
const downloadManager = new DownloadManager();
console.log(`   Initial state: ${downloadManager.getState()}`);
console.log(`   Initial dives: ${downloadManager.getDives().length}`);

// Test 9: Fingerprint Manager
console.log('\n9. Testing Fingerprint Manager:');
const fpManager = new FingerprintManager(new MemoryFingerprintStorage());

async function testFingerprints() {
  const testDescriptor = findDescriptor('Shearwater', 'Perdix')!;
  const testFingerprint = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
  
  // Save fingerprint
  await fpManager.saveFingerprint(testDescriptor, 12345, testFingerprint, {
    firmware: '1.0.0',
    diveCount: 100,
  });
  
  // Load fingerprint
  const loaded = await fpManager.getFingerprint(testDescriptor, 12345);
  console.log(`   Saved and loaded fingerprint: ${loaded ? 'Success' : 'Failed'}`);
  console.log(`   Fingerprint data: [${loaded?.join(', ')}]`);
  
  // Check existence
  const exists = await fpManager.hasFingerprint(testDescriptor, 12345);
  console.log(`   Has fingerprint: ${exists}`);
}

// Test 10: Bluetooth Discovery
console.log('\n10. Testing Bluetooth Discovery:');
const btDiscovery = new BluetoothDiscovery();
console.log(`    Is scanning: ${btDiscovery.isScanning()}`);
console.log(`    Devices found: ${btDiscovery.getDevices().length}`);

// Test device matching
const matchResult = btDiscovery.matchDeviceName('Perdix 2 12345');
if (matchResult) {
  console.log(`    Name match test: ${matchResult.vendor} ${matchResult.product}`);
}

// Test 11: DCFamily enum
console.log('\n11. DC Family Types:');
console.log(`    SHEARWATER_PREDATOR = ${DCFamily.SHEARWATER_PREDATOR}`);
console.log(`    SUUNTO_EONSTEEL = ${DCFamily.SUUNTO_EONSTEEL}`);
console.log(`    HW_OSTC3 = ${DCFamily.HW_OSTC3}`);

// Run async tests
testFingerprints().then(() => {
  console.log('\n=== All Tests Completed ===');
}).catch(err => {
  console.error('Test error:', err);
});
