/**
 * Suunto EON Core USB HID Test
 * 
 * The EON Core uses USB HID with:
 * - Vendor ID: 0x1493 (Suunto)
 * - Product ID: 0x0033 (EON Core)
 */

import HID from 'node-hid';

// Suunto USB IDs
const SUUNTO_VID = 0x1493;
const EON_STEEL_PID = 0x0030;
const EON_CORE_PID = 0x0033;
const D5_PID = 0x0035;

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        Suunto EON Core USB HID Test                        ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// List all HID devices
console.log('📡 Scanning for USB HID devices...\n');

try {
  const devices = HID.devices();
  
  console.log(`Found ${devices.length} HID devices total.\n`);
  
  // Look for Suunto devices
  const suuntoDevices = devices.filter(d => d.vendorId === SUUNTO_VID);
  
  if (suuntoDevices.length > 0) {
    console.log('🤿 Found Suunto device(s):\n');
    for (const device of suuntoDevices) {
      console.log(`   Path: ${device.path}`);
      console.log(`   VID:PID: ${device.vendorId?.toString(16)}:${device.productId?.toString(16)}`);
      console.log(`   Product: ${device.product}`);
      console.log(`   Manufacturer: ${device.manufacturer}`);
      console.log(`   Serial: ${device.serialNumber}`);
      console.log(`   Interface: ${device.interface}`);
      console.log(`   Usage Page: ${device.usagePage}`);
      console.log(`   Usage: ${device.usage}`);
      console.log('');
      
      // Identify the model
      if (device.productId === EON_CORE_PID) {
        console.log('   ✅ This is a Suunto EON Core!\n');
      } else if (device.productId === EON_STEEL_PID) {
        console.log('   ✅ This is a Suunto EON Steel!\n');
      } else if (device.productId === D5_PID) {
        console.log('   ✅ This is a Suunto D5!\n');
      }
    }
    
    // Try to open the first Suunto device
    const targetDevice = suuntoDevices[0];
    if (targetDevice.path) {
      console.log('🔌 Attempting to open device...\n');
      
      try {
        const hid = new HID.HID(targetDevice.path);
        console.log('   ✅ Device opened successfully!\n');
        
        // Set up data handler
        hid.on('data', (data: Buffer) => {
          console.log('   📥 Received data:', data.toString('hex'));
        });
        
        hid.on('error', (err: Error) => {
          console.log('   ❌ HID Error:', err.message);
        });
        
        // The Suunto EON uses a specific protocol
        // First, we need to send an init packet
        // Based on libdivecomputer's suunto_eonsteel.c
        
        console.log('   📤 Sending init packet...\n');
        
        // Suunto EON Steel/Core protocol uses 64-byte packets
        // The first byte is the report ID (0x00 for output)
        // Packet format: [length, seq, cmd, ...]
        
        // Try a simple "ping" - request device info
        // This is a simplified version - real protocol is more complex
        const initPacket = Buffer.alloc(64);
        initPacket[0] = 0x01;  // Length
        initPacket[1] = 0x00;  // Sequence
        initPacket[2] = 0x10;  // Command: device info request (example)
        
        try {
          // Write with report ID 0
          hid.write([0x00, ...initPacket]);
          console.log('   ✅ Packet sent!\n');
          
          // Wait for response
          console.log('   ⏳ Waiting for response (5 seconds)...\n');
          
          setTimeout(() => {
            console.log('   🔒 Closing device...');
            hid.close();
            console.log('\n✅ Test completed!');
            process.exit(0);
          }, 5000);
          
        } catch (writeErr) {
          console.log('   ⚠️  Write error:', (writeErr as Error).message);
          console.log('   This is expected - we need to implement the proper Suunto protocol.\n');
          hid.close();
        }
        
      } catch (openErr) {
        console.log('   ❌ Failed to open device:', (openErr as Error).message);
        console.log('   Try running as Administrator or check if another app is using the device.\n');
      }
    }
    
  } else {
    console.log('❌ No Suunto devices found.\n');
    console.log('Make sure your EON Core is:');
    console.log('   1. Connected via USB cable');
    console.log('   2. Turned on');
    console.log('   3. Not in use by another application (like Suunto DM5)\n');
    
    // Show other potentially interesting devices
    console.log('Other HID devices found:\n');
    const otherDevices = devices.filter(d => 
      d.product && !d.product.toLowerCase().includes('keyboard') && 
      !d.product.toLowerCase().includes('mouse')
    ).slice(0, 10);
    
    for (const device of otherDevices) {
      console.log(`   ${device.manufacturer || 'Unknown'} - ${device.product || 'Unknown'}`);
      console.log(`   VID:PID: ${device.vendorId?.toString(16)}:${device.productId?.toString(16)}`);
      console.log('');
    }
  }
  
} catch (err) {
  console.log('❌ Error scanning HID devices:', (err as Error).message);
}
