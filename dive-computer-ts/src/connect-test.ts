/**
 * Interactive Dive Computer Connection Test
 * 
 * This script will:
 * 1. Scan for available serial ports (USB dive computers)
 * 2. Scan for Bluetooth devices (if available)
 * 3. Let you select and connect to your dive computer
 */

import { SerialPort } from 'serialport';
import { 
  findDescriptor, 
  getVendors, 
  getProducts,
  diveComputerDescriptors,
  TransportType,
  supportsBluetooth,
  supportsUSB
} from './index.js';
import { USB_SERIAL_CHIPS } from './transport/serial.js';
import { USB_HID_DEVICES } from './transport/usb-hid.js';
import { matchBLEDeviceName } from './transport/ble.js';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function listSerialPorts() {
  console.log('\n📡 Scanning for USB/Serial devices...\n');
  
  try {
    const ports = await SerialPort.list();
    
    if (ports.length === 0) {
      console.log('   No serial ports found.');
      return [];
    }
    
    console.log('   Found serial ports:');
    const diveComputerPorts: typeof ports = [];
    
    for (const port of ports) {
      const vendorId = port.vendorId ? parseInt(port.vendorId, 16) : undefined;
      const productId = port.productId ? parseInt(port.productId, 16) : undefined;
      
      // Check if it's a known USB-Serial chip
      let chipName = '';
      let isDiveComputer = false;
      
      if (vendorId && productId) {
        for (const [name, chip] of Object.entries(USB_SERIAL_CHIPS)) {
          if (chip.vendorId === vendorId) {
            const product = chip.products.find(p => p.productId === productId);
            if (product) {
              chipName = `${name} ${product.name}`;
              isDiveComputer = true;
              diveComputerPorts.push(port);
            }
          }
        }
        
        // Check if it's a known HID dive computer
        const hidMatch = USB_HID_DEVICES.find(d => 
          d.vendorId === vendorId && d.productId === productId
        );
        if (hidMatch) {
          chipName = `${hidMatch.vendor} ${hidMatch.product}`;
          isDiveComputer = true;
          diveComputerPorts.push(port);
        }
      }
      
      const marker = isDiveComputer ? '🤿' : '  ';
      console.log(`   ${marker} ${port.path}`);
      console.log(`      Manufacturer: ${port.manufacturer || 'Unknown'}`);
      if (port.vendorId) {
        console.log(`      VID:PID: ${port.vendorId}:${port.productId}`);
      }
      if (chipName) {
        console.log(`      Chip: ${chipName}`);
      }
      if (port.serialNumber) {
        console.log(`      Serial: ${port.serialNumber}`);
      }
      console.log('');
    }
    
    return diveComputerPorts.length > 0 ? diveComputerPorts : ports;
  } catch (error) {
    console.log('   Error scanning serial ports:', (error as Error).message);
    return [];
  }
}

function listSupportedDiveComputers() {
  console.log('\n📋 Supported Dive Computers:\n');
  
  const vendors = getVendors();
  for (const vendor of vendors) {
    const products = getProducts(vendor);
    const usbProducts = products.filter(p => {
      const desc = findDescriptor(vendor, p);
      return desc && (desc.transports & (TransportType.SERIAL | TransportType.USB | TransportType.USBHID));
    });
    
    if (usbProducts.length > 0) {
      console.log(`   ${vendor}:`);
      for (const product of usbProducts) {
        const desc = findDescriptor(vendor, product)!;
        const transports: string[] = [];
        if (desc.transports & TransportType.SERIAL) transports.push('Serial');
        if (desc.transports & TransportType.USB) transports.push('USB');
        if (desc.transports & TransportType.USBHID) transports.push('USB-HID');
        if (desc.transports & TransportType.BLUETOOTH) transports.push('BT');
        if (desc.transports & TransportType.BLE) transports.push('BLE');
        console.log(`      - ${product} (${transports.join(', ')})`);
      }
    }
  }
}

async function selectDiveComputer(): Promise<{ vendor: string; product: string } | null> {
  const vendors = getVendors().sort();
  
  console.log('\n🤿 Select your dive computer vendor:\n');
  vendors.forEach((v, i) => console.log(`   ${i + 1}. ${v}`));
  console.log(`   0. Cancel`);
  
  const vendorChoice = await question('\nEnter number: ');
  const vendorIndex = parseInt(vendorChoice) - 1;
  
  if (vendorIndex < 0 || vendorIndex >= vendors.length) {
    return null;
  }
  
  const vendor = vendors[vendorIndex];
  const products = getProducts(vendor).sort();
  
  console.log(`\n🤿 Select your ${vendor} model:\n`);
  products.forEach((p, i) => {
    const desc = findDescriptor(vendor, p)!;
    const transports: string[] = [];
    if (desc.transports & TransportType.SERIAL) transports.push('Serial');
    if (desc.transports & TransportType.USB) transports.push('USB');
    if (desc.transports & TransportType.USBHID) transports.push('HID');
    if (desc.transports & TransportType.BLUETOOTH) transports.push('BT');
    if (desc.transports & TransportType.BLE) transports.push('BLE');
    console.log(`   ${i + 1}. ${p} (${transports.join(', ')})`);
  });
  console.log(`   0. Back`);
  
  const productChoice = await question('\nEnter number: ');
  const productIndex = parseInt(productChoice) - 1;
  
  if (productIndex < 0 || productIndex >= products.length) {
    return null;
  }
  
  return { vendor, product: products[productIndex] };
}

async function testSerialConnection(port: string, baudRate: number = 9600) {
  console.log(`\n🔌 Testing connection to ${port} at ${baudRate} baud...`);
  
  return new Promise<void>((resolve) => {
    const serialPort = new SerialPort({
      path: port,
      baudRate: baudRate,
      autoOpen: false,
    });
    
    serialPort.on('error', (err) => {
      console.log(`   ❌ Error: ${err.message}`);
      resolve();
    });
    
    serialPort.on('open', () => {
      console.log(`   ✅ Port opened successfully!`);
      
      // Try to read some data
      console.log('   📥 Waiting for data (5 seconds)...');
      
      let dataReceived = false;
      
      serialPort.on('data', (data: Buffer) => {
        dataReceived = true;
        console.log(`   📦 Received ${data.length} bytes:`, data.toString('hex'));
      });
      
      setTimeout(() => {
        if (!dataReceived) {
          console.log('   ⚠️  No data received (device may need to be in transfer mode)');
        }
        serialPort.close(() => {
          console.log('   🔒 Port closed.');
          resolve();
        });
      }, 5000);
    });
    
    serialPort.open();
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Dive Computer Connection Test                       ║');
  console.log('║        TypeScript Dive Computer Library                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  while (true) {
    console.log('\n📌 Main Menu:\n');
    console.log('   1. Scan for USB/Serial devices');
    console.log('   2. List supported dive computers');
    console.log('   3. Select dive computer and test connection');
    console.log('   4. Quick serial port test');
    console.log('   0. Exit');
    
    const choice = await question('\nEnter choice: ');
    
    switch (choice) {
      case '1':
        await listSerialPorts();
        break;
        
      case '2':
        listSupportedDiveComputers();
        break;
        
      case '3': {
        const dc = await selectDiveComputer();
        if (dc) {
          const desc = findDescriptor(dc.vendor, dc.product);
          console.log(`\n✅ Selected: ${dc.vendor} ${dc.product}`);
          console.log(`   Model ID: ${desc?.model}`);
          console.log(`   Transports: ${desc?.transports}`);
          
          if (desc && (desc.transports & (TransportType.SERIAL | TransportType.USB))) {
            const ports = await listSerialPorts();
            if (ports.length > 0) {
              console.log('\nSelect a port to test:');
              ports.forEach((p, i) => console.log(`   ${i + 1}. ${p.path}`));
              const portChoice = await question('\nEnter number (0 to skip): ');
              const portIndex = parseInt(portChoice) - 1;
              if (portIndex >= 0 && portIndex < ports.length) {
                await testSerialConnection(ports[portIndex].path);
              }
            }
          } else if (desc && (desc.transports & TransportType.BLE)) {
            console.log('\n⚠️  This dive computer uses Bluetooth LE.');
            console.log('   BLE scanning requires a browser environment with Web Bluetooth API');
            console.log('   or a native Bluetooth library like @abandonware/noble.');
          }
        }
        break;
      }
        
      case '4': {
        const ports = await listSerialPorts();
        if (ports.length > 0) {
          console.log('\nSelect a port to test:');
          ports.forEach((p, i) => console.log(`   ${i + 1}. ${p.path}`));
          const portChoice = await question('\nEnter number: ');
          const portIndex = parseInt(portChoice) - 1;
          if (portIndex >= 0 && portIndex < ports.length) {
            const baudChoice = await question('Enter baud rate (default 9600): ');
            const baud = parseInt(baudChoice) || 9600;
            await testSerialConnection(ports[portIndex].path, baud);
          }
        }
        break;
      }
        
      case '0':
        console.log('\nGoodbye! 🤿');
        rl.close();
        process.exit(0);
        
      default:
        console.log('\n❌ Invalid choice');
    }
  }
}

main().catch(console.error);
