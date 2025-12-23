import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import {
  getVendors,
  getProducts,
  findDescriptor,
  hasWebBluetooth,
  hasWebSerial,
  DownloadManager,
  DownloadState,
  BluetoothDiscovery,
  TransportType,
  BLETransport,
  USB_HID_DEVICES,
  type Dive as DCDive,
  type DiveSample as DCDiveSample,
  type ProgressEvent,
  type DiscoveredDevice,
} from '../../dive-computer-ts/src/index';
import { SuuntoEonSteelWebHID, type DiveFile } from '../../dive-computer-ts/src/protocols/suunto-eonsteel-webhid';
import type { Dive, Trip } from '../types';
import { DiveImportReviewModal, type DiveGroup } from './DiveImportReviewModal';
import './DiveComputerModal.css';

// Import status tracking for UI feedback
interface ImportStatus {
  phase: 'idle' | 'downloading' | 'parsing' | 'saving' | 'complete';
  currentDive: number;
  totalDives: number;
  currentSamples: number;
  totalSamples: number;
  message: string;
}

interface DiveComputerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: number | null;
  onDivesImported: (dives: Dive[]) => void;
  onTripsChanged?: () => void; // Called when a new trip is created during import
}

type ConnectionType = 'bluetooth' | 'ble' | 'serial' | 'usb' | 'usbhid' | 'usbstorage';
type ModalStep = 'choose-import-method' | 'select-device' | 'scan-bluetooth' | 'downloading' | 'complete' | 'error';

// Helper to check if connection type requires Bluetooth scan
function requiresBluetoothScan(type: ConnectionType): boolean {
  return type === 'bluetooth' || type === 'ble';
}

// Helper to check if connection type requires serial port selection
function requiresSerialPort(type: ConnectionType): boolean {
  return type === 'serial';
}

// Helper to check if connection type requires USB device selection
function requiresUSBDevice(type: ConnectionType): boolean {
  return type === 'usb' || type === 'usbhid';
}

// Helper to check if connection type is USB mass storage (file-based)
function isUSBStorage(type: ConnectionType): boolean {
  return type === 'usbstorage';
}

interface DownloadedDive extends DCDive {
  selected: boolean;
  isDuplicate?: boolean; // True if a dive with same date/time exists
  // Tank pressure readings (for file imports like FIT that have separate tank pressure records)
  tankPressures?: {
    sensor_id: number;
    sensor_name?: string;
    time_seconds: number;
    pressure_bar: number;
  }[];
}

// Convert dive-computer-ts Dive to Pelagic Dive format
function convertDive(dcDive: DCDive, tripId: number, diveNumber: number): Omit<Dive, 'id' | 'created_at' | 'updated_at'> {
  const dc = dcDive.diveComputers[0];
  
  // Extract CNS% from the last sample that has it (end-of-dive CNS)
  const cnsPercent = dc?.samples?.reduceRight((found, s) => found ?? s.cns, undefined as number | undefined);
  
  // Get surface pressure from dive computer data
  const surfacePressureBar = dc?.surfacePressure?.mbar 
    ? dc.surfacePressure.mbar / 1000 
    : undefined;
  
  // Get GPS coordinates from dive site if available
  const latitude = dcDive.diveSite?.location?.lat;
  const longitude = dcDive.diveSite?.location?.lon;
  
  return {
    trip_id: tripId,
    dive_number: diveNumber,
    date: dcDive.when.toISOString().split('T')[0],
    time: dcDive.when.toTimeString().split(' ')[0],
    duration_seconds: dcDive.duration.seconds,
    max_depth_m: dcDive.maxDepth.mm / 1000,
    mean_depth_m: dcDive.meanDepth ? dcDive.meanDepth.mm / 1000 : dcDive.maxDepth.mm / 2000,
    water_temp_c: dcDive.waterTemperature 
      ? (dcDive.waterTemperature.mkelvin / 1000) - 273.15 
      : undefined,
    air_temp_c: dcDive.surfaceTemperature
      ? (dcDive.surfaceTemperature.mkelvin / 1000) - 273.15
      : undefined,
    surface_pressure_bar: surfacePressureBar,
    cns_percent: cnsPercent,
    dive_computer_model: dc?.model,
    dive_computer_serial: dc?.serial,
    latitude,
    longitude,
    is_fresh_water: false,
    is_boat_dive: false,
    is_drift_dive: false,
    is_night_dive: false,
    is_training_dive: false,
  };
}

export function DiveComputerModal({ isOpen, onClose, tripId, onDivesImported, onTripsChanged }: DiveComputerModalProps) {
  // Device selection state
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [connectionType, setConnectionType] = useState<ConnectionType>('bluetooth');
  
  // Bluetooth scanning state
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  
  // Download state
  const [step, setStep] = useState<ModalStep>('select-device');
  const [downloadState, setDownloadState] = useState<DownloadState>(DownloadState.IDLE);
  const [progress, setProgress] = useState<ProgressEvent>({ current: 0, maximum: 100 });
  const [downloadedDives, setDownloadedDives] = useState<DownloadedDive[]>([]);
  const [rawDiveFiles, setRawDiveFiles] = useState<DiveFile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [existingDives, setExistingDives] = useState<Dive[]>([]);
  
  // Import status for detailed progress feedback
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    phase: 'idle',
    currentDive: 0,
    totalDives: 0,
    currentSamples: 0,
    totalSamples: 0,
    message: '',
  });
  
  // Batch state update buffer for downloaded dives
  const pendingDivesRef = useRef<DownloadedDive[]>([]);
  const batchUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  
  // Managers
  const [downloadManager] = useState(() => new DownloadManager());
  const [discovery] = useState(() => new BluetoothDiscovery());
  
  // Import from file functionality - uses review modal for consistency
  const handleImportFromFile = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Dive Log Files',
          extensions: ['ssrf', 'xml', 'json', 'fit']
        }]
      });

      if (selected && selected.length > 0) {
        setStep('downloading');
        setProgress({ current: 0, maximum: selected.length });
        
        const allParsedDives: DownloadedDive[] = [];
        
        // Parse each selected file
        for (let i = 0; i < selected.length; i++) {
          const filePath = selected[i];
          setProgress({ current: i + 1, maximum: selected.length });
          
          try {
            // Read file and parse it
            const { readFile } = await import('@tauri-apps/plugin-fs');
            const fileData = await readFile(filePath);
            const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
            
            const result = await invoke<ParsedFileResult>('parse_dive_file_data', {
              fileName,
              fileData: Array.from(fileData),
            });
            
            // Convert parsed dives to DownloadedDive format
            for (const parsed of result.dives) {
              allParsedDives.push(convertParsedDiveToDownloadedDive(parsed));
            }
            
            logger.info(`Parsed ${result.dives.length} dives from ${fileName}`);
          } catch (fileError) {
            logger.error(`Failed to parse file ${filePath}:`, fileError);
            // Continue with other files even if one fails
          }
        }
        
        if (allParsedDives.length > 0) {
          // Apply duplicate detection
          const divesWithDuplicateCheck = allParsedDives.map(dive => {
            const isDup = isDuplicateDive(dive);
            return { ...dive, isDuplicate: isDup, selected: !isDup };
          });
          
          setDownloadedDives(divesWithDuplicateCheck);
          setStep('complete');
          openReviewModal();
        } else {
          setErrorMessage('No dives could be parsed from the selected files');
          setStep('error');
        }
      }
    } catch (error) {
      logger.error('Failed to import dives:', error);
      setErrorMessage(`Failed to import dives: ${error}`);
      setStep('error');
    }
  };

  // Get available vendors and products
  const vendors = useMemo(() => getVendors(), []);
  const products = useMemo(() => selectedVendor ? getProducts(selectedVendor) : [], [selectedVendor]);
  const descriptor = useMemo(() => 
    selectedVendor && selectedProduct 
      ? findDescriptor(selectedVendor, selectedProduct) 
      : undefined,
    [selectedVendor, selectedProduct]
  );
  
  // Check available connection types based on descriptor
  const availableConnections = useMemo(() => {
    const available: ConnectionType[] = [];
    if (descriptor) {
      // BLE (Bluetooth Low Energy)
      if ((descriptor.transports & TransportType.BLE) && hasWebBluetooth()) {
        available.push('ble');
      }
      // Classic Bluetooth (RFCOMM) - not supported in browsers, but list for info
      if ((descriptor.transports & TransportType.BLUETOOTH) && hasWebBluetooth()) {
        // Note: Web Bluetooth doesn't support classic Bluetooth RFCOMM
        // But some devices work over BLE fallback
        if (!available.includes('ble')) {
          available.push('bluetooth');
        }
      }
      // Serial (RS232/USB-Serial cable)
      if ((descriptor.transports & TransportType.SERIAL) && hasWebSerial()) {
        available.push('serial');
      }
      // USB HID
      if (descriptor.transports & TransportType.USBHID) {
        available.push('usbhid');
      }
      // Native USB
      if (descriptor.transports & TransportType.USB) {
        available.push('usb');
      }
      // USB Mass Storage (Garmin, etc.)
      if (descriptor.transports & TransportType.USBSTORAGE) {
        available.push('usbstorage');
      }
    }
    return available;
  }, [descriptor]);

  // Helper to check if a dive is already imported
  const isDuplicateDive = useCallback((dcDive: DCDive): boolean => {
    const diveDate = dcDive.when.toISOString().split('T')[0];
    const diveTime = dcDive.when.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
    
    return existingDives.some(existing => {
      const existingTime = existing.time?.substring(0, 5) || '';
      return existing.date === diveDate && existingTime === diveTime;
    });
  }, [existingDives]);

  // Flush pending dives to state (batched update)
  const flushPendingDives = useCallback(() => {
    if (pendingDivesRef.current.length > 0) {
      const divesToAdd = [...pendingDivesRef.current];
      pendingDivesRef.current = [];
      setDownloadedDives(prev => [...prev, ...divesToAdd]);
    }
  }, []);

  // Setup event handlers with batched dive updates
  useEffect(() => {
    const handleProgress = (p: ProgressEvent) => setProgress(p);
    
    // Batch dive additions to reduce re-renders during download
    const handleDive = (dive: DCDive) => {
      pendingDivesRef.current.push({ ...dive, selected: true, isDuplicate: false });
      
      // Clear existing timeout
      if (batchUpdateTimeoutRef.current) {
        clearTimeout(batchUpdateTimeoutRef.current);
      }
      
      // Flush after 100ms of no new dives, or every 5 dives
      if (pendingDivesRef.current.length >= 5) {
        flushPendingDives();
      } else {
        batchUpdateTimeoutRef.current = setTimeout(flushPendingDives, 100);
      }
    };
    
    const handleState = (state: DownloadState) => {
      setDownloadState(state);
      // Flush any pending dives when state changes (e.g., download complete)
      if (state === DownloadState.IDLE) {
        flushPendingDives();
      }
    };
    
    const handleError = (error: Error) => {
      flushPendingDives(); // Flush any pending dives before showing error
      setErrorMessage(error.message);
      setStep('error');
    };
    const handleDeviceFound = (device: DiscoveredDevice) => {
      setDiscoveredDevices(prev => {
        const existing = prev.findIndex(d => d.address === device.address);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = device;
          return updated;
        }
        return [...prev, device];
      });
    };
    
    downloadManager.on('progress', handleProgress);
    downloadManager.on('dive', handleDive);
    downloadManager.on('state', handleState);
    downloadManager.on('error', handleError);
    discovery.on('deviceFound', handleDeviceFound);
    
    return () => {
      // Clear any pending batch timeout
      if (batchUpdateTimeoutRef.current) {
        clearTimeout(batchUpdateTimeoutRef.current);
      }
      // Cast handlers to unknown to satisfy TypeScript - the library types are not fully compatible
      downloadManager.off('progress', handleProgress as unknown as Parameters<typeof downloadManager.off>[1]);
      downloadManager.off('dive', handleDive as unknown as Parameters<typeof downloadManager.off>[1]);
      downloadManager.off('state', handleState as unknown as Parameters<typeof downloadManager.off>[1]);
      downloadManager.off('error', handleError as unknown as Parameters<typeof downloadManager.off>[1]);
      discovery.off('deviceFound', handleDeviceFound as unknown as Parameters<typeof discovery.off>[1]);
    };
  }, [downloadManager, discovery, flushPendingDives]);

  // Update duplicate status when existingDives changes
  useEffect(() => {
    if (existingDives.length > 0 && downloadedDives.length > 0) {
      setDownloadedDives(prev => prev.map(dive => {
        const isDup = isDuplicateDive(dive);
        if (dive.isDuplicate !== isDup) {
          return { ...dive, isDuplicate: isDup, selected: isDup ? false : dive.selected };
        }
        return dive;
      }));
    }
  }, [existingDives, isDuplicateDive]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep('choose-import-method');
      setSelectedVendor('');
      setSelectedProduct('');
      setDiscoveredDevices([]);
      setSelectedDevice(null);
      setDownloadedDives([]);
      setErrorMessage('');
      setProgress({ current: 0, maximum: 100 });
      setExistingDives([]);
      setShowReviewModal(false);
      setAllTrips([]);
      setImportStatus({
        phase: 'idle',
        currentDive: 0,
        totalDives: 0,
        currentSamples: 0,
        totalSamples: 0,
        message: '',
      });
      pendingDivesRef.current = [];
      if (batchUpdateTimeoutRef.current) {
        clearTimeout(batchUpdateTimeoutRef.current);
        batchUpdateTimeoutRef.current = null;
      }
      discovery.stopScan();
    }
  }, [isOpen, discovery]);

  // Fetch existing dives when tripId is available
  useEffect(() => {
    if (isOpen && tripId) {
      invoke<Dive[]>('get_dives_for_trip', { tripId })
        .then(dives => setExistingDives(dives))
        .catch(err => logger.error('Failed to fetch existing dives:', err));
    }
  }, [isOpen, tripId]);

  // Fetch all trips when modal opens (for review modal dropdown)
  useEffect(() => {
    if (isOpen) {
      invoke<Trip[]>('get_trips')
        .then(trips => setAllTrips(trips))
        .catch(err => logger.error('Failed to fetch trips:', err));
    }
  }, [isOpen]);

  const handleVendorChange = (vendor: string) => {
    setSelectedVendor(vendor);
    setSelectedProduct('');
    setConnectionType('bluetooth');
  };

  const handleProductChange = (product: string) => {
    setSelectedProduct(product);
    // Auto-select first available connection type based on device capabilities
    const desc = findDescriptor(selectedVendor, product);
    if (desc) {
      // Prefer BLE over classic Bluetooth, then serial, then USB options
      if ((desc.transports & TransportType.BLE) && hasWebBluetooth()) {
        setConnectionType('ble');
      } else if ((desc.transports & TransportType.BLUETOOTH) && hasWebBluetooth()) {
        setConnectionType('bluetooth');
      } else if ((desc.transports & TransportType.SERIAL) && hasWebSerial()) {
        setConnectionType('serial');
      } else if (desc.transports & TransportType.USBHID) {
        setConnectionType('usbhid');
      } else if (desc.transports & TransportType.USB) {
        setConnectionType('usb');
      } else if (desc.transports & TransportType.USBSTORAGE) {
        setConnectionType('usbstorage');
      } else {
        setConnectionType('serial'); // fallback
      }
    }
  };

  const startBluetoothScan = useCallback(async () => {
    setDiscoveredDevices([]);
    setIsScanning(true);
    setStep('scan-bluetooth');
    
    try {
      // For web bluetooth, we need to use the browser's device picker
      if (hasWebBluetooth() && 'bluetooth' in navigator) {
        try {
          // Request device - this opens the browser's Bluetooth picker
          const device = await (navigator as Navigator & { bluetooth: { requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice> } }).bluetooth.requestDevice({
            acceptAllDevices: true,
            // Note: In production, we'd filter by service UUIDs
            // filters: [{ services: [...] }],
          });
          
          // Create a discovered device from the selection
          const discovered: DiscoveredDevice = {
            address: device.id,
            name: device.name,
            isBLE: true,
            vendor: selectedVendor,
            product: selectedProduct,
            descriptor,
          };
          
          setDiscoveredDevices([discovered]);
          setSelectedDevice(discovered);
        } catch (err) {
          if ((err as Error).name !== 'NotFoundError') {
            throw err;
          }
          // User cancelled the picker
        }
      } else {
        // Fallback for environments without web bluetooth
        discovery.startBLEScan();
        
        // Auto-stop after 30 seconds
        setTimeout(() => {
          discovery.stopScan();
          setIsScanning(false);
        }, 30000);
      }
    } catch (error) {
      setErrorMessage(`Failed to scan for devices: ${(error as Error).message}`);
      setStep('error');
    } finally {
      setIsScanning(false);
    }
  }, [discovery, selectedVendor, selectedProduct, descriptor]);

  const stopScan = useCallback(() => {
    discovery.stopScan();
    setIsScanning(false);
  }, [discovery]);

  const startSerialConnection = useCallback(async () => {
    if (!descriptor) {
      setErrorMessage('Please select a dive computer model first');
      return;
    }

    try {
      // Check if Web Serial is available
      if (hasWebSerial() && 'serial' in navigator) {
        // Request serial port from user
        await (navigator as Navigator & { serial: { requestPort(): Promise<unknown> } }).serial.requestPort();
        
        // Create a device from the selected port
        const discovered: DiscoveredDevice = {
          address: 'serial-port',
          name: `${selectedVendor} ${selectedProduct}`,
          isBLE: false,
          vendor: selectedVendor,
          product: selectedProduct,
          descriptor,
        };
        
        setSelectedDevice(discovered);
        
        // Store the port for later use (we'll need to pass it to the transport)
        // For now, go straight to download step
        setStep('downloading');
        setDownloadedDives([]);
        setProgress({ current: 0, maximum: 100 });
        
        // Note: In a real implementation, we'd create a SerialTransport with the port
        // For now, simulate the download process
        const result = await downloadManager.download({
          descriptor,
          transport: new BLETransport('serial-simulation'), // This would be SerialTransport in real impl
          forceDownload: false,
          syncTime: true,
        });
        
        if (result.success) {
          setDownloadedDives(result.dives.map(d => ({ ...d, selected: true })));
          setStep('complete');
          openReviewModal();
        } else if (result.error) {
          setErrorMessage(result.error.message);
          setStep('error');
        }
      } else {
        setErrorMessage('Web Serial API is not available in this browser. Please use Chrome or Edge.');
        setStep('error');
      }
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        // User cancelled the port picker
        return;
      }
      setErrorMessage(`Failed to connect: ${(error as Error).message}`);
      setStep('error');
    }
  }, [descriptor, selectedVendor, selectedProduct, downloadManager]);

  const startUSBConnection = useCallback(async () => {
    if (!descriptor) {
      setErrorMessage('Please select a dive computer model first');
      return;
    }

    try {
      // Check if WebHID is available
      if (!('hid' in navigator)) {
        setErrorMessage('WebHID API is not available in this browser. Please use Chrome or Edge.');
        setStep('error');
        return;
      }

      // Check if this is a Suunto EON Steel/Core/D5
      const isSuuntoEon = selectedVendor === 'Suunto' && 
        (selectedProduct?.includes('EON Steel') || 
         selectedProduct?.includes('EON Core') || 
         selectedProduct?.includes('D5'));

      if (isSuuntoEon) {
        // Use Suunto-specific WebHID protocol
        await downloadSuuntoViaUSB();
      } else {
        // For other manufacturers, show not implemented message
        const knownDevice = USB_HID_DEVICES.find(
          d => d.vendor === selectedVendor && d.product === selectedProduct
        );

        const hid = (navigator as Navigator & { hid: WebHID }).hid;
        const filters: Array<{ vendorId: number; productId?: number }> = [];
        if (knownDevice) {
          filters.push({ vendorId: knownDevice.vendorId, productId: knownDevice.productId });
        }

        const devices = await hid.requestDevice({ 
          filters: filters.length > 0 ? filters : undefined 
        });
        
        if (devices.length === 0) {
          setErrorMessage('No device selected');
          return;
        }

        const hidDevice = devices[0];
        setErrorMessage(
          `Connected to ${hidDevice.productName || 'USB HID device'} (VID: 0x${hidDevice.vendorId.toString(16)}, PID: 0x${hidDevice.productId.toString(16)}). ` +
          `USB HID protocol for ${selectedVendor} ${selectedProduct} is not yet implemented. ` +
          `Try using Bluetooth LE if your device supports it.`
        );
        setStep('error');
      }
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        // User cancelled the device picker
        return;
      }
      if ((error as Error).name === 'NotAllowedError') {
        setErrorMessage('Permission denied to access USB device. Please grant permission when prompted.');
        setStep('error');
        return;
      }
      setErrorMessage(`Failed to connect: ${(error as Error).message}`);
      setStep('error');
    }
  }, [descriptor, selectedVendor, selectedProduct]);

  /**
   * Download dives from Suunto EON Steel/Core via USB HID
   */
  const downloadSuuntoViaUSB = useCallback(async () => {
    setStep('downloading');
    setDownloadedDives([]);
    setProgress({ current: 0, maximum: 100 });

    const suunto = new SuuntoEonSteelWebHID();

    try {
      // Connect - this will prompt the user to select the device
      logger.debug('🔌 Starting Suunto USB connection...');
      const connected = await suunto.connect();
      if (!connected) {
        setErrorMessage('Failed to connect to Suunto device. Make sure it is connected via USB and not in USB storage mode.');
        setStep('error');
        return;
      }

      // Get device info
      const info = suunto.getDeviceInfo();
      logger.debug('📊 Device info:', info);

      // List dives
      logger.debug('📂 Listing dives...');
      const diveList = await suunto.listDives();
      logger.debug(`📋 Found ${diveList.length} dives:`, diveList.slice(0, 10));

      if (diveList.length === 0) {
        // Try to get more info about why no dives were found
        const deviceInfo = suunto.getDeviceInfo();
        const errorMsg = deviceInfo 
          ? `No dives found on the device (Serial: ${deviceInfo.serial}, FW: ${deviceInfo.firmware}). The dive directory may be empty or in a different location.`
          : 'No dives found on the device. Make sure dives are stored on the device.';
        setErrorMessage(errorMsg);
        setStep('error');
        await suunto.disconnect();
        return;
      }

      setProgress({ current: 0, maximum: diveList.length });

      // Download all dives
      logger.debug('📥 Starting dive downloads...');
      const diveFiles = await suunto.downloadAllDives((dive, index, total) => {
        setProgress({ current: index + 1, maximum: total });
        logger.debug(`Downloaded dive ${index + 1}/${total}: ${dive.name} (${dive.data.length} bytes)`);
      });

      logger.debug(`✅ Downloaded ${diveFiles.length} dive files`);
      await suunto.disconnect();

      // Store raw files for debugging/saving
      setRawDiveFiles(diveFiles);

      if (diveFiles.length === 0) {
        setErrorMessage('Failed to download any dives. The files may be corrupted or unreadable.');
        setStep('error');
        return;
      }

      // Convert DiveFiles to the format expected by the modal
      const convertedDives: DownloadedDive[] = diveFiles.map((diveFile) => {
        return {
          // Parse the Suunto dive file into a Dive structure
          ...parseSuuntoDiveFile(diveFile),
          selected: true
        };
      });

      logger.debug(`✅ Converted ${convertedDives.length} dives for display`);
      setDownloadedDives(convertedDives);
      setStep('complete');
      openReviewModal();

    } catch (error) {
      logger.error('Suunto download error:', error);
      setErrorMessage(`Download failed: ${(error as Error).message}`);
      setStep('error');
      await suunto.disconnect();
    }
  }, []);

  /**
   * Parse a Suunto SBEM (Suunto Binary Encoded Message) .LOG file
   * Based on libdivecomputer's suunto_eonsteel_parser.c
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
  const parseSuuntoDiveFile = (diveFile: DiveFile): DCDive => {
    const timestamp = diveFile.timestamp;
    const data = diveFile.data;
    
    logger.debug(`📄 Parsing Suunto LOG file: ${diveFile.name}, ${data.length} bytes`);
    
    // Default values
    let maxDepthCm = 0;
    let durationMs = 0;
    let minTempDeciC: number | null = null;
    const o2Percent = 21;
    
    // Check for SBEM header
    const hasSBEM = data.length > 8 && 
      String.fromCharCode(data[0], data[1], data[2], data[3]) === 'SBEM';
    
    if (!hasSBEM) {
      logger.warn('   No SBEM header found');
      return createDefaultDive(timestamp, diveFile.name);
    }
    
    // Build type descriptor map and group map
    const typeDescs = new Map<number, {path: string, format: string, size: number}>();
    const groups = new Map<number, number[]>(); // groupId -> [memberId, ...]
    
    // Parse all entries (descriptors interleaved with data)
    let pos = 8; // Skip "SBEM" + 4 NULs
    
    // Helper to skip/parse a data entry
    const parseDataEntry = (startPos: number): { typeId: number; dataStart: number; dataLen: number; nextPos: number } | null => {
      const firstByte = data[startPos];
      if (firstByte === 0) return null; // This is a descriptor, not data
      
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
        dataLen = data[dataLenOffset + 1] | (data[dataLenOffset + 2] << 8) | 
                  (data[dataLenOffset + 3] << 16) | (data[dataLenOffset + 4] << 24);
        dataStart = dataLenOffset + 5;
      }
      
      if (dataStart + dataLen > data.length || dataLen > 100000) return null;
      
      return { typeId, dataStart, dataLen, nextPos: dataStart + dataLen };
    };
    
    // First pass: collect all descriptors (they're interleaved with data)
    while (pos < data.length - 4) {
      if (data[pos] === 0) {
        // Descriptor entry
        let textLen = data[pos + 1];
        let headerLen = 2;
        
        if (textLen === 0xff) {
          textLen = data[pos + 2] | (data[pos + 3] << 8) | (data[pos + 4] << 16) | (data[pos + 5] << 24);
          headerLen = 6;
        }
        
        if (textLen < 3 || pos + headerLen + textLen > data.length) {
          pos++;
          continue;
        }
        
        const typeId = data[pos + headerLen] | (data[pos + headerLen + 1] << 8);
        const descStart = pos + headerLen + 2;
        const descEnd = pos + headerLen + textLen;
        
        if (data[descStart] === 0x3c) { // '<'
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
        // Data entry - skip for now
        const entry = parseDataEntry(pos);
        if (entry) {
          pos = entry.nextPos;
        } else {
          pos++;
        }
      }
    }
    
    logger.debug(`   Found ${typeDescs.size} descriptors, ${groups.size} groups`);
    
    // Find sample-related type IDs
    let timeTypeId = -1;
    let depthTypeId = -1;
    let tempTypeId = -1;
    
    for (const [id, desc] of typeDescs) {
      if (desc.path.includes('Samples') && desc.path.includes('+Sample.Time')) timeTypeId = id;
      if (desc.path.includes('Samples') && desc.path.endsWith('.Sample.Depth')) depthTypeId = id;
      if (desc.path.includes('Samples') && desc.path.endsWith('.Sample.Temperature')) tempTypeId = id;
    }
    
    // Find which group contains the sample data
    let sampleGroupId = -1;
    let timeOffsetInGroup = -1;
    let depthOffsetInGroup = -1;
    let tempOffsetInGroup = -1;
    
    // Find cylinder pressure type
    let pressureTypeId = -1;
    for (const [id, desc] of typeDescs) {
      if (desc.path.includes('Cylinders') && desc.path.endsWith('.Pressure')) {
        pressureTypeId = id;
      }
    }
    
    // Find which group contains cylinder pressure
    let cylinderGroupId = -1;
    let pressureOffsetInGroup = -1;
    
    for (const [groupId, members] of groups) {
      const timeIdx = members.indexOf(timeTypeId);
      const depthIdx = members.indexOf(depthTypeId);
      
      if (timeIdx >= 0 && depthIdx >= 0) {
        sampleGroupId = groupId;
        // Calculate byte offsets (each member is 2 bytes for uint16/int16)
        timeOffsetInGroup = timeIdx * 2;
        depthOffsetInGroup = depthIdx * 2;
        
        const tempIdx = members.indexOf(tempTypeId);
        if (tempIdx >= 0) tempOffsetInGroup = tempIdx * 2;
        
        logger.debug(`   Sample group ID: ${sampleGroupId}, members: [${members.join(',')}]`);
        logger.debug(`   Offsets - time: ${timeOffsetInGroup}, depth: ${depthOffsetInGroup}, temp: ${tempOffsetInGroup}`);
      }
      
      // Check for cylinder group (contains pressure)
      const pressIdx = members.indexOf(pressureTypeId);
      if (pressIdx >= 0) {
        cylinderGroupId = groupId;
        // Gas number is 1 byte (uint8), pressure is 2 bytes (uint16)
        // Members are [gasNumber, pressure], so offset for pressure is 1 byte
        pressureOffsetInGroup = 1; // After the 1-byte gas number
        logger.debug(`   Cylinder group ID: ${cylinderGroupId}, members: [${members.join(',')}], pressure offset: ${pressureOffsetInGroup}`);
      }
    }
    
    // Second pass: extract sample data from group entries
    // We need to interleave sample data with cylinder pressure data
    pos = 8;
    let sampleCount = 0;
    const samples: DCDiveSample[] = [];
    const pressures: number[] = []; // Collect pressures separately (in centibar)
    let currentTimeMs = 0;
    
    while (pos < data.length - 2) {
      if (data[pos] === 0) {
        // Skip descriptor
        let textLen = data[pos + 1];
        if (textLen === 0xff) {
          textLen = data[pos + 2] | (data[pos + 3] << 8) | (data[pos + 4] << 16) | (data[pos + 5] << 24);
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
      
      // Check if this is the cylinder group (pressure data)
      if (entry.typeId === cylinderGroupId && entry.dataLen >= 3) {
        const d = data;
        const s = entry.dataStart;
        // Pressure is uint16 in centibar (divide by 100 for bar)
        const pressureCentibar = d[s + pressureOffsetInGroup] | (d[s + pressureOffsetInGroup + 1] << 8);
        if (pressureCentibar !== 0xffff) {
          pressures.push(pressureCentibar);
        } else {
          pressures.push(-1); // Mark invalid
        }
      }
      
      // Check if this is the sample group
      if (entry.typeId === sampleGroupId && entry.dataLen >= 6) {
        const d = data;
        const s = entry.dataStart;
        
        let timeDelta = 0;
        let depthCm = 0;
        let tempDeciC: number | null = null;
        
        // Extract time delta (uint16 ms)
        if (timeOffsetInGroup >= 0 && s + timeOffsetInGroup + 2 <= s + entry.dataLen) {
          timeDelta = d[s + timeOffsetInGroup] | (d[s + timeOffsetInGroup + 1] << 8);
          currentTimeMs += timeDelta;
          durationMs += timeDelta;
        }
        
        // Extract depth (uint16 cm, 0xFFFF = nil)
        if (depthOffsetInGroup >= 0 && s + depthOffsetInGroup + 2 <= s + entry.dataLen) {
          depthCm = d[s + depthOffsetInGroup] | (d[s + depthOffsetInGroup + 1] << 8);
          if (depthCm !== 0xffff && depthCm > maxDepthCm) {
            maxDepthCm = depthCm;
          }
        }
        
        // Extract temperature (int16 deci-C, -3000 = nil)
        if (tempOffsetInGroup >= 0 && s + tempOffsetInGroup + 2 <= s + entry.dataLen) {
          const tempRaw = d[s + tempOffsetInGroup] | (d[s + tempOffsetInGroup + 1] << 8);
          tempDeciC = tempRaw > 32767 ? tempRaw - 65536 : tempRaw;
          if (tempDeciC !== -3000) {
            if (minTempDeciC === null || tempDeciC < minTempDeciC) {
              minTempDeciC = tempDeciC;
            }
          }
        }
        
        // Add sample to array (for dive profile graph)
        const sample: DCDiveSample = {
          time: { seconds: Math.round(currentTimeMs / 1000) },
          depth: { mm: depthCm !== 0xffff ? depthCm * 10 : 0 } // cm to mm
        };
        
        // Add temperature if valid
        if (tempDeciC !== null && tempDeciC !== -3000) {
          const tempC = tempDeciC / 10;
          sample.temperature = { mkelvin: Math.round((tempC + 273.15) * 1000) };
        }
        
        samples.push(sample);
        sampleCount++;
      }
      
      pos = entry.nextPos;
    }
    
    // Merge pressure data into samples (they should be 1:1)
    if (pressures.length > 0) {
      logger.debug(`   Found ${pressures.length} pressure readings`);
      for (let i = 0; i < Math.min(samples.length, pressures.length); i++) {
        if (pressures[i] >= 0) {
          // Convert centibar to mbar (centibar * 10 = mbar, or centibar / 100 = bar)
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
    
    logger.debug(`   ✅ ${sampleCount} samples: depth=${maxDepthM.toFixed(1)}m, duration=${durationSeconds}s (${Math.round(durationSeconds/60)} min), temp=${waterTempC?.toFixed(1) ?? 'unknown'}°C`);
    
    return {
      id: timestamp,
      when,
      duration: { seconds: durationSeconds },
      maxDepth: { mm: Math.round(maxDepthM * 1000) },
      meanDepth: { mm: Math.round(avgDepthM * 1000) },
      waterTemperature: waterTempC !== undefined 
        ? { mkelvin: Math.round((waterTempC + 273.15) * 1000) }
        : undefined,
      surfaceTemperature: undefined,
      diveSite: undefined,
      diveComputers: [{
        model: selectedProduct || 'Suunto EON',
        serial: diveFile.name.replace(/\.LOG$/i, ''),
        when: when,
        samples: samples,
        events: [],
      }],
      cylinders: o2Percent !== 21 ? [{
        gasmix: {
          oxygen: { permille: o2Percent * 10 },
          helium: { permille: 0 },
          nitrogen: { permille: (100 - o2Percent) * 10 },
        },
        start: undefined,
        end: undefined,
        workingPressure: undefined,
      }] : [],
    };
  };
  
  const createDefaultDive = (timestamp: number, filename: string): DCDive => {
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
      diveComputers: [{
        model: selectedProduct || 'Suunto EON',
        serial: filename.replace(/\.LOG$/i, ''),
        when: when,
        samples: [],
        events: [],
      }],
      cylinders: [],
    };
  };

  // Type for parsed file result from backend
  interface ParsedDiveSample {
    time_seconds: number;
    depth_m: number;
    temp_c?: number;
    pressure_bar?: number;
    ndl_seconds?: number;
    rbt_seconds?: number;
  }

  interface ParsedTankPressure {
    sensor_id: number;
    sensor_name?: string;
    time_seconds: number;
    pressure_bar: number;
  }

  interface ParsedDivePreview {
    date: string;
    time: string;
    duration_seconds: number;
    max_depth_m: number;
    mean_depth_m: number;
    water_temp_c?: number;
    dive_computer_model?: string;
    samples: ParsedDiveSample[];
    tank_pressures: ParsedTankPressure[];
    tanks: ParsedTank[];
  }

  interface ParsedTank {
    sensor_id: number;
    gas_index: number;
    o2_percent?: number;
    he_percent?: number;
    start_pressure_bar?: number;
    end_pressure_bar?: number;
    volume_used_liters?: number;
  }

  interface ParsedFileResult {
    dives: ParsedDivePreview[];
    trip_name: string;
    date_start: string;
    date_end: string;
  }

  // Convert parsed file dive to DownloadedDive format (includes tank pressures) for the review modal
  const convertParsedDiveToDownloadedDive = (parsed: ParsedDivePreview): DownloadedDive => {
    // Parse date and time to create a Date object
    // Ensure time has seconds (some formats might be HH:MM only)
    const timeStr = parsed.time.includes(':') && parsed.time.split(':').length === 2 
      ? `${parsed.time}:00` 
      : parsed.time;
    const dateTime = new Date(`${parsed.date}T${timeStr}`);
    
    logger.debug(`Converting parsed dive: date=${parsed.date}, time=${parsed.time}, dateTime=${dateTime.toISOString()}, tankPressures=${parsed.tank_pressures?.length || 0}`);
    
    return {
      id: 0,
      when: dateTime,
      duration: { seconds: parsed.duration_seconds, minutes: parsed.duration_seconds / 60, hours: parsed.duration_seconds / 3600, milliseconds: parsed.duration_seconds * 1000 },
      maxDepth: { mm: parsed.max_depth_m * 1000, m: parsed.max_depth_m, ft: parsed.max_depth_m * 3.28084 },
      meanDepth: { mm: parsed.mean_depth_m * 1000, m: parsed.mean_depth_m, ft: parsed.mean_depth_m * 3.28084 },
      waterTemperature: parsed.water_temp_c != null ? { mkelvin: (parsed.water_temp_c + 273.15) * 1000, celsius: parsed.water_temp_c, fahrenheit: parsed.water_temp_c * 9/5 + 32 } : undefined,
      cylinders: parsed.tanks?.map(t => ({
        gasmix: {
          oxygen: t.o2_percent != null ? { permille: t.o2_percent * 10 } : undefined,
          helium: t.he_percent != null ? { permille: t.he_percent * 10 } : undefined,
        },
        start: t.start_pressure_bar != null ? { mbar: t.start_pressure_bar * 1000 } : undefined,
        end: t.end_pressure_bar != null ? { mbar: t.end_pressure_bar * 1000 } : undefined,
      })) || [],
      diveComputers: [{
        model: parsed.dive_computer_model,
        serial: undefined,
        samples: parsed.samples.map(s => ({
          time: { seconds: s.time_seconds, minutes: s.time_seconds / 60, hours: s.time_seconds / 3600, milliseconds: s.time_seconds * 1000 },
          depth: { mm: s.depth_m * 1000, m: s.depth_m, ft: s.depth_m * 3.28084 },
          temperature: s.temp_c != null ? { mkelvin: (s.temp_c + 273.15) * 1000, celsius: s.temp_c, fahrenheit: s.temp_c * 9/5 + 32 } : undefined,
          pressure: s.pressure_bar != null ? [{ sensor: 0, pressure: { mbar: s.pressure_bar * 1000, bar: s.pressure_bar, psi: s.pressure_bar * 14.5038 } }] : undefined,
          ndl: s.ndl_seconds != null ? { seconds: s.ndl_seconds, minutes: s.ndl_seconds / 60, hours: s.ndl_seconds / 3600, milliseconds: s.ndl_seconds * 1000 } : undefined,
          rbt: s.rbt_seconds != null ? { seconds: s.rbt_seconds, minutes: s.rbt_seconds / 60, hours: s.rbt_seconds / 3600, milliseconds: s.rbt_seconds * 1000 } : undefined,
        })),
      }],
      // Include additional fields for DownloadedDive
      selected: true,
      isDuplicate: false,
      // Pass through tank pressures from file import
      tankPressures: parsed.tank_pressures,
    } as unknown as DownloadedDive;
  };

  const startUSBStorageConnection = useCallback(async () => {
    if (!descriptor) {
      setErrorMessage('Please select a dive computer model first');
      return;
    }

    // USB Storage devices (like Garmin) mount as a drive
    // Use File System Access API to let user select multiple dive files
    try {
      if ('showOpenFilePicker' in window) {
        const fileHandles = await (window as Window & { showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'Dive Log Files',
            accept: {
              'application/octet-stream': ['.fit', '.FIT', '.ssrf', '.SSRF'],
              'application/xml': ['.xml', '.XML'],
              'application/json': ['.json', '.JSON']
            }
          }]
        });

        if (fileHandles.length === 0) {
          setErrorMessage('No files selected');
          setStep('error');
          return;
        }

        setStep('downloading');
        setProgress({ current: 0, maximum: fileHandles.length });

        const allParsedDives: DownloadedDive[] = [];

        // Parse each selected file without importing
        for (let i = 0; i < fileHandles.length; i++) {
          const fileHandle = fileHandles[i];
          setProgress({ current: i + 1, maximum: fileHandles.length });

          try {
            // Get file from handle
            const file = await fileHandle.getFile();
            
            // Read file as array buffer
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Parse the file data using the new backend command
            const result = await invoke<ParsedFileResult>('parse_dive_file_data', {
              fileName: file.name,
              fileData: Array.from(uint8Array),
            });
            
            // Convert parsed dives to DownloadedDive format (includes tank pressures)
            for (const parsed of result.dives) {
              allParsedDives.push(convertParsedDiveToDownloadedDive(parsed));
            }
            
            logger.info(`✅ Parsed ${result.dives.length} dives from ${file.name}`);

          } catch (fileError) {
            logger.error(`Failed to parse file ${fileHandle.name}:`, fileError);
            setErrorMessage(`Warning: Failed to parse ${fileHandle.name}: ${fileError}. Continuing with other files...`);
          }
        }

        if (allParsedDives.length > 0) {
          // Apply duplicate detection to parsed dives
          const divesWithDuplicateCheck = allParsedDives.map(dive => {
            const isDup = isDuplicateDive(dive);
            return { ...dive, isDuplicate: isDup, selected: !isDup };
          });
          
          setDownloadedDives(divesWithDuplicateCheck);
          setStep('complete');
          openReviewModal();
        } else {
          setErrorMessage('No dives could be parsed from the selected files');
          setStep('error');
        }

      } else {
        setErrorMessage('File System Access API is not available. Please use a browser that supports it (Chrome, Edge) or manually import dive files.');
        setStep('error');
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // User cancelled the file picker
        return;
      }
      setErrorMessage(`Failed to access files: ${(error as Error).message}`);
      setStep('error');
    }
  }, [descriptor]);

  const handleConnect = useCallback(() => {
    if (requiresBluetoothScan(connectionType)) {
      startBluetoothScan();
    } else if (requiresSerialPort(connectionType)) {
      startSerialConnection();
    } else if (requiresUSBDevice(connectionType)) {
      startUSBConnection();
    } else if (isUSBStorage(connectionType)) {
      startUSBStorageConnection();
    } else {
      setErrorMessage(`Connection type "${connectionType}" is not yet supported`);
      setStep('error');
    }
  }, [connectionType, startBluetoothScan, startSerialConnection, startUSBConnection, startUSBStorageConnection]);

  const startDownload = useCallback(async () => {
    if (!descriptor || !selectedDevice) {
      setErrorMessage('Please select a device first');
      return;
    }
    
    setStep('downloading');
    setDownloadedDives([]);
    setProgress({ current: 0, maximum: 100 });
    
    try {
      const transport = new BLETransport(selectedDevice.address);
      
      const result = await downloadManager.download({
        descriptor,
        transport,
        forceDownload: false,
        syncTime: true,
      });
      
      if (result.success) {
        setDownloadedDives(result.dives.map(d => ({ ...d, selected: true })));
        setStep('complete');
        openReviewModal();
      } else if (result.error) {
        setErrorMessage(result.error.message);
        setStep('error');
      }
    } catch (error) {
      setErrorMessage(`Download failed: ${(error as Error).message}`);
      setStep('error');
    }
  }, [descriptor, selectedDevice, downloadManager]);

  // Save raw dive files to disk for debugging
  const saveRawDiveFiles = useCallback(async () => {
    logger.debug('saveRawDiveFiles called, rawDiveFiles.length:', rawDiveFiles.length);
    if (rawDiveFiles.length === 0) {
      logger.debug('No raw dive files to save');
      return;
    }
    
    try {
      // Create a JSON object with all dive files
      const exportData = {
        exportDate: new Date().toISOString(),
        diveComputer: selectedProduct || 'Unknown',
        files: rawDiveFiles.map(f => ({
          name: f.name,
          timestamp: f.timestamp,
          data: Array.from(f.data) // Convert Uint8Array to regular array for JSON
        }))
      };
      
      const json = JSON.stringify(exportData, null, 2);
      
      // Use Tauri's save dialog
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      
      const filePath = await save({
        defaultPath: `dive-computer-raw-${new Date().toISOString().split('T')[0]}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      
      if (filePath) {
        await writeTextFile(filePath, json);
        logger.info('Saved raw dive files to:', filePath);
      }
    } catch (error) {
      logger.error('Error saving raw dive files:', error);
      // Fallback to browser download method
      try {
        const exportData = {
          exportDate: new Date().toISOString(),
          diveComputer: selectedProduct || 'Unknown',
          files: rawDiveFiles.map(f => ({
            name: f.name,
            timestamp: f.timestamp,
            data: Array.from(f.data)
          }))
        };
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `dive-computer-raw-${new Date().toISOString().split('T')[0]}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      } catch (fallbackError) {
        logger.error('Fallback save also failed:', fallbackError);
      }
    }
  }, [rawDiveFiles, selectedProduct]);

  const cancelDownload = useCallback(() => {
    downloadManager.cancel();
  }, [downloadManager]);

  const toggleDiveSelection = (index: number) => {
    setDownloadedDives(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], selected: !updated[index].selected };
      return updated;
    });
  };

  const selectAllDives = () => {
    setDownloadedDives(prev => prev.map(d => ({ ...d, selected: true })));
  };

  const selectNoneDives = () => {
    setDownloadedDives(prev => prev.map(d => ({ ...d, selected: false })));
  };

  // Open the review modal when download completes
  const openReviewModal = () => {
    setShowReviewModal(true);
  };

  // Bulk import result type
  interface BulkImportResult {
    trips_created: number;
    dives_imported: number;
    samples_imported: number;
    tank_pressures_imported: number;
    tanks_imported: number;
    created_trip_ids: number[];
  }

  // Handle import from the review modal - uses bulk import for performance
  const handleReviewImport = async (groups: DiveGroup[]) => {
    logger.info('handleReviewImport called with', groups.length, 'groups');
    try {
      // Build bulk import data structure - all data in memory first
      const bulkGroups = groups
        .filter(group => group.dives.some(d => d.selected))
        .map(group => {
          const selectedDives = group.dives.filter(d => d.selected);
          
          return {
            trip_id: group.selectedTripId,
            new_trip_name: group.selectedTripId === null 
              ? (group.newTripName || group.defaultTripName) 
              : null,
            date_start: group.dateStart.toISOString().split('T')[0],
            date_end: group.dateEnd.toISOString().split('T')[0],
            dives: selectedDives.map(importableDive => {
              const dcDive = importableDive.dcDive;
              const dc = dcDive.diveComputers[0];
              const diveData = convertDive(dcDive, 0, 0); // tripId/diveNumber set by backend
              
              return {
                date: diveData.date,
                time: diveData.time,
                duration_seconds: diveData.duration_seconds,
                max_depth_m: diveData.max_depth_m,
                mean_depth_m: diveData.mean_depth_m,
                water_temp_c: diveData.water_temp_c,
                air_temp_c: diveData.air_temp_c,
                surface_pressure_bar: diveData.surface_pressure_bar,
                cns_percent: diveData.cns_percent,
                dive_computer_model: diveData.dive_computer_model,
                dive_computer_serial: diveData.dive_computer_serial,
                latitude: diveData.latitude,
                longitude: diveData.longitude,
                samples: dc?.samples?.map(s => ({
                  time_seconds: s.time.seconds,
                  depth_m: s.depth.mm / 1000,
                  temp_c: s.temperature ? (s.temperature.mkelvin / 1000) - 273.15 : undefined,
                  pressure_bar: s.pressure?.[0]?.pressure?.mbar ? s.pressure[0].pressure.mbar / 1000 : undefined,
                  ndl_seconds: s.ndl?.seconds,
                  rbt_seconds: s.rbt?.seconds,
                })) || [],
                tank_pressures: importableDive.tankPressures || [],
                // Include tank/gas mix data from cylinders
                tanks: dcDive.cylinders?.map((cyl, idx) => ({
                  sensor_id: idx,
                  gas_index: idx,
                  o2_percent: cyl.gasmix?.oxygen?.permille ? cyl.gasmix.oxygen.permille / 10 : undefined,
                  he_percent: cyl.gasmix?.helium?.permille ? cyl.gasmix.helium.permille / 10 : undefined,
                  start_pressure_bar: cyl.start?.mbar ? cyl.start.mbar / 1000 : undefined,
                  end_pressure_bar: cyl.end?.mbar ? cyl.end.mbar / 1000 : undefined,
                  volume_used_liters: undefined,
                })) || [],
              };
            }),
          };
        });
      
      if (bulkGroups.length === 0) {
        logger.info('No dives selected for import');
        setShowReviewModal(false);
        return;
      }
      
      // Single IPC call to import all data
      logger.info(`Bulk importing ${bulkGroups.length} groups`);
      const result = await invoke<BulkImportResult>('bulk_import_dives', {
        groups: bulkGroups,
      });
      
      logger.info(`Import complete: ${result.dives_imported} dives, ${result.samples_imported} samples, ${result.tank_pressures_imported} tank pressures, ${result.trips_created} trips created`);
      
      // Notify parent that trips changed (so sidebar refreshes)
      if (result.trips_created > 0 && onTripsChanged) {
        logger.debug('Calling onTripsChanged callback');
        onTripsChanged();
      }
      
      // Create minimal dive objects for the callback
      // Note: We don't have full dive data back from bulk import, just counts
      // If the caller needs full dive objects, they should refetch from DB
      const importedDives: Dive[] = [];
      onDivesImported(importedDives);
      setShowReviewModal(false);
      onClose();
    } catch (error) {
      logger.error('Failed to import dives from review modal:', error);
      throw error; // Re-throw so the review modal can show the error
    }
  };

  // Handle creating a new trip from the review modal
  // Note: Currently not wired up in UI - trips are created inline with just a name
  const handleCreateTripFromReview = async (): Promise<Trip | null> => {
    // Future enhancement: Open AddTripModal to create trip with full options
    // For now, trips are created inline in handleReviewImport with basic info
    return null;
  };

  const importSelectedDives = async () => {
    if (!tripId) {
      setErrorMessage('Please select a trip first');
      return;
    }
    
    try {
      const selectedDiveData = downloadedDives.filter(d => d.selected);
      const importedDives: Dive[] = [];
      
      // Calculate total samples for progress
      const totalSamples = selectedDiveData.reduce((sum, d) => {
        const dc = d.diveComputers[0];
        return sum + (dc?.samples?.length || 0);
      }, 0);
      
      // Switch to downloading step to show progress
      setStep('downloading');
      setImportStatus({
        phase: 'saving',
        currentDive: 0,
        totalDives: selectedDiveData.length,
        currentSamples: 0,
        totalSamples,
        message: 'Preparing to save dives...',
      });
      
      let samplesProcessed = 0;
      
      for (let i = 0; i < selectedDiveData.length; i++) {
        const dcDive = selectedDiveData[i];
        const diveData = convertDive(dcDive, tripId, i + 1);
        
        // Update progress status
        setImportStatus(prev => ({
          ...prev,
          currentDive: i + 1,
          message: `Saving dive ${i + 1} of ${selectedDiveData.length}...`,
        }));
        
        // Create the dive in the database
        const diveId = await invoke<number>('create_dive_from_computer', {
          tripId,
          date: diveData.date,
          time: diveData.time,
          durationSeconds: diveData.duration_seconds,
          maxDepthM: diveData.max_depth_m,
          meanDepthM: diveData.mean_depth_m,
          waterTempC: diveData.water_temp_c,
          airTempC: diveData.air_temp_c,
          surfacePressureBar: diveData.surface_pressure_bar,
          cnsPercent: diveData.cns_percent,
          diveComputerModel: diveData.dive_computer_model,
          diveComputerSerial: diveData.dive_computer_serial,
          latitude: diveData.latitude,
          longitude: diveData.longitude,
        });
        
        // Convert and insert samples if available
        const dc = dcDive.diveComputers[0];
        if (dc?.samples && dc.samples.length > 0) {
          const samples = dc.samples.map(s => ({
            id: 0, // Will be assigned by database
            dive_id: diveId,
            time_seconds: s.time.seconds,
            depth_m: s.depth.mm / 1000,
            temp_c: s.temperature ? (s.temperature.mkelvin / 1000) - 273.15 : undefined,
            // Get pressure from first tank (if available) and convert mbar to bar
            pressure_bar: s.pressure?.[0]?.pressure?.mbar ? s.pressure[0].pressure.mbar / 1000 : undefined,
            // NDL (no-deco limit) and RBT (remaining bottom time) from dive computer
            ndl_seconds: s.ndl?.seconds,
            rbt_seconds: s.rbt?.seconds,
          }));
          
          // Update status before batch insert
          setImportStatus(prev => ({
            ...prev,
            message: `Saving ${samples.length} samples for dive ${i + 1}...`,
          }));
          
          const count = await invoke<number>('insert_dive_samples', {
            diveId,
            samples,
          });
          
          samplesProcessed += count;
          setImportStatus(prev => ({
            ...prev,
            currentSamples: samplesProcessed,
          }));
          
          logger.info(`✅ Inserted ${count} samples for dive ${diveId}`);
        }
        
        importedDives.push({ ...diveData, id: diveId } as Dive);
        
        // Update progress bar
        setProgress({
          current: i + 1,
          maximum: selectedDiveData.length,
        });
      }
      
      // Mark as complete
      setImportStatus(prev => ({
        ...prev,
        phase: 'complete',
        message: `Successfully imported ${importedDives.length} dive(s)`,
      }));
      
      onDivesImported(importedDives);
      onClose();
    } catch (error) {
      logger.error('Failed to import dives:', error);
      setErrorMessage(`Failed to import dives: ${error}`);
      setImportStatus(prev => ({ ...prev, phase: 'idle' }));
      setStep('error');
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDepth = (mm: number): string => {
    return `${(mm / 1000).toFixed(1)}m`;
  };

  if (!isOpen) return null;

  return (
    <div className="dive-computer-modal-overlay" onClick={onClose}>
      <div className="modal dive-computer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {step === 'choose-import-method' && 'Import Dives'}
            {step === 'select-device' && 'Download from Dive Computer'}
            {step === 'scan-bluetooth' && 'Select Bluetooth Device'}
            {step === 'downloading' && 'Downloading Dives'}
            {step === 'complete' && 'Download Complete'}
            {step === 'error' && 'Error'}
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {step === 'choose-import-method' && (
            <div className="import-method-selection">
              <div className="method-options">
                <button 
                  className="method-option method-option-computer"
                  onClick={() => setStep('select-device')}
                >
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                    <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
                  </svg>
                  <h3>Import from Dive Computer</h3>
                  <p>Connect directly to your dive computer via Bluetooth, USB, or serial cable to download dive logs.</p>
                </button>
                
                <button 
                  className="method-option method-option-file"
                  onClick={handleImportFromFile}
                >
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                  </svg>
                  <h3>Import from File</h3>
                  <p>Import dive logs from existing files on your computer (FIT, SSRF, XML, JSON formats).</p>
                </button>
              </div>
            </div>
          )}

          {step === 'select-device' && (
            <div className="device-selection">
              <div className="form-group">
                <label>Manufacturer</label>
                <select 
                  value={selectedVendor} 
                  onChange={(e) => handleVendorChange(e.target.value)}
                  className="form-select"
                >
                  <option value="">Select manufacturer...</option>
                  {vendors.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Model</label>
                <select 
                  value={selectedProduct} 
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="form-select"
                  disabled={!selectedVendor}
                >
                  <option value="">Select model...</option>
                  {products.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {descriptor && (
                <div className="connection-options">
                  <label>Connection Type</label>
                  <div className="connection-buttons">
                    {availableConnections.includes('ble') && (
                      <button
                        className={`connection-btn ${connectionType === 'ble' ? 'active' : ''}`}
                        onClick={() => setConnectionType('ble')}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
                        </svg>
                        Bluetooth LE
                      </button>
                    )}
                    {availableConnections.includes('bluetooth') && (
                      <button
                        className={`connection-btn ${connectionType === 'bluetooth' ? 'active' : ''}`}
                        onClick={() => setConnectionType('bluetooth')}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
                        </svg>
                        Bluetooth
                      </button>
                    )}
                    {availableConnections.includes('serial') && (
                      <button
                        className={`connection-btn ${connectionType === 'serial' ? 'active' : ''}`}
                        onClick={() => setConnectionType('serial')}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M15 7v4h1v2h-3V5h2l-3-4-3 4h2v8H8v-2.07c.7-.37 1.2-1.08 1.2-1.93 0-1.21-.99-2.2-2.2-2.2-1.21 0-2.2.99-2.2 2.2 0 .85.5 1.56 1.2 1.93V13c0 1.11.89 2 2 2h3v3.05c-.71.37-1.2 1.1-1.2 1.95 0 1.22.99 2.2 2.2 2.2 1.21 0 2.2-.98 2.2-2.2 0-.85-.49-1.58-1.2-1.95V15h3c1.11 0 2-.89 2-2v-2h1V7h-4z"/>
                        </svg>
                        Serial Cable
                      </button>
                    )}
                    {availableConnections.includes('usbhid') && (
                      <button
                        className={`connection-btn ${connectionType === 'usbhid' ? 'active' : ''}`}
                        onClick={() => setConnectionType('usbhid')}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M15 7v4h1v2h-3V5h2l-3-4-3 4h2v8H8v-2.07c.7-.37 1.2-1.08 1.2-1.93 0-1.21-.99-2.2-2.2-2.2-1.21 0-2.2.99-2.2 2.2 0 .85.5 1.56 1.2 1.93V13c0 1.11.89 2 2 2h3v3.05c-.71.37-1.2 1.1-1.2 1.95 0 1.22.99 2.2 2.2 2.2 1.21 0 2.2-.98 2.2-2.2 0-.85-.49-1.58-1.2-1.95V15h3c1.11 0 2-.89 2-2v-2h1V7h-4z"/>
                        </svg>
                        USB
                      </button>
                    )}
                    {availableConnections.includes('usbstorage') && (
                      <button
                        className={`connection-btn ${connectionType === 'usbstorage' ? 'active' : ''}`}
                        onClick={() => setConnectionType('usbstorage')}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5.17l2 2H20v10z"/>
                        </svg>
                        USB Storage
                      </button>
                    )}
                  </div>
                  {availableConnections.length === 0 && (
                    <p className="warning-text">
                      No compatible connection methods available in this browser. 
                      This device may require a native application.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'scan-bluetooth' && (
            <div className="bluetooth-scan">
              <div className="scan-header">
                <p>Scanning for Bluetooth devices...</p>
                {isScanning && (
                  <div className="scan-indicator">
                    <div className="spinner"></div>
                  </div>
                )}
              </div>
              
              <div className="device-list">
                {discoveredDevices.length === 0 ? (
                  <p className="no-devices">
                    {isScanning 
                      ? 'Make sure your dive computer is in Bluetooth transfer mode...'
                      : 'No devices found. Try scanning again.'
                    }
                  </p>
                ) : (
                  discoveredDevices.map((device) => (
                    <button
                      key={device.address}
                      className={`device-item ${selectedDevice?.address === device.address ? 'selected' : ''}`}
                      onClick={() => setSelectedDevice(device)}
                    >
                      <div className="device-info">
                        <span className="device-name">{device.name || 'Unknown Device'}</span>
                        <span className="device-vendor">
                          {device.vendor && device.product 
                            ? `${device.vendor} ${device.product}` 
                            : device.address
                          }
                        </span>
                      </div>
                      {device.rssi && (
                        <span className="device-rssi">{device.rssi} dBm</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              <div className="scan-actions">
                {isScanning ? (
                  <button className="btn btn-secondary" onClick={stopScan}>
                    Stop Scanning
                  </button>
                ) : (
                  <button className="btn btn-secondary" onClick={startBluetoothScan}>
                    Scan Again
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'downloading' && (
            <div className="download-progress">
              <div className="progress-info">
                <span className="progress-state">
                  {/* Show import status if saving, otherwise show download status */}
                  {importStatus.phase === 'saving' ? (
                    importStatus.message
                  ) : (
                    <>
                      {downloadState === DownloadState.CONNECTING && 'Connecting to device...'}
                      {downloadState === DownloadState.DOWNLOADING && 'Downloading dives...'}
                      {downloadState === DownloadState.PARSING && 'Processing data...'}
                      {downloadState === DownloadState.IDLE && importStatus.phase === 'idle' && 'Ready'}
                    </>
                  )}
                </span>
                <span className="progress-percent">
                  {importStatus.phase === 'saving' 
                    ? `${importStatus.currentDive}/${importStatus.totalDives}`
                    : `${Math.round((progress.current / progress.maximum) * 100)}%`
                  }
                </span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: importStatus.phase === 'saving'
                      ? `${(importStatus.currentDive / importStatus.totalDives) * 100}%`
                      : `${(progress.current / progress.maximum) * 100}%` 
                  }}
                />
              </div>
              {/* Show dive count during download, or sample count during save */}
              {importStatus.phase === 'saving' ? (
                <div className="import-details">
                  <p className="dives-count">
                    💾 Saving dive {importStatus.currentDive} of {importStatus.totalDives}
                  </p>
                  {importStatus.totalSamples > 0 && (
                    <p className="samples-count">
                      📊 {importStatus.currentSamples.toLocaleString()} / {importStatus.totalSamples.toLocaleString()} samples
                    </p>
                  )}
                </div>
              ) : (
                downloadedDives.length > 0 && (
                  <p className="dives-count">{downloadedDives.length} dive(s) downloaded</p>
                )
              )}
            </div>
          )}

          {step === 'complete' && (
            <div className="download-complete">
              <div className="complete-header">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--accent-color)">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                <h3>Downloaded {downloadedDives.length} Dive{downloadedDives.length !== 1 ? 's' : ''}</h3>
              </div>

              <div className="dive-selection-header">
                <span>Select dives to import:</span>
                <div className="selection-actions">
                  <button className="btn-link" onClick={selectAllDives}>Select All</button>
                  <button className="btn-link" onClick={selectNoneDives}>Select None</button>
                </div>
              </div>

              <div className="downloaded-dives-list">
                {downloadedDives.map((dive, index) => (
                  <label key={index} className={`dive-item ${dive.isDuplicate ? 'duplicate' : ''}`}>
                    <input
                      type="checkbox"
                      checked={dive.selected}
                      onChange={() => toggleDiveSelection(index)}
                    />
                    <div className="dive-details">
                      <span className="dive-date">
                        {dive.when.toLocaleDateString()} {dive.when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {dive.isDuplicate && <span className="duplicate-badge">Already imported</span>}
                      </span>
                      <span className="dive-stats">
                        {formatDepth(dive.maxDepth.mm)} • {formatDuration(dive.duration.seconds)}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="download-error">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--danger-color)">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <h3>Download Failed</h3>
              <p className="error-message">{errorMessage}</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step === 'choose-import-method' && (
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          )}

          {step === 'select-device' && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleConnect}
                disabled={!descriptor || availableConnections.length === 0}
              >
                {requiresBluetoothScan(connectionType) ? 'Scan for Devices' : 'Connect'}
              </button>
            </>
          )}

          {step === 'scan-bluetooth' && (
            <>
              <button className="btn btn-secondary" onClick={() => setStep('select-device')}>
                Back
              </button>
              <button 
                className="btn btn-primary" 
                onClick={startDownload}
                disabled={!selectedDevice}
              >
                Download Dives
              </button>
            </>
          )}

          {step === 'downloading' && (
            <button className="btn btn-secondary" onClick={cancelDownload}>
              Cancel
            </button>
          )}

          {step === 'complete' && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
              {rawDiveFiles.length > 0 && (
                <button 
                  className="btn btn-secondary"
                  onClick={saveRawDiveFiles}
                  title="Save raw dive files for debugging"
                >
                  Save Raw Files
                </button>
              )}
              <button 
                className="btn btn-primary" 
                onClick={importSelectedDives}
                disabled={!downloadedDives.some(d => d.selected)}
              >
                Import {downloadedDives.filter(d => d.selected).length} Dive{downloadedDives.filter(d => d.selected).length !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {step === 'error' && (
            <>
              <button className="btn btn-secondary" onClick={() => setStep('select-device')}>
                Back
              </button>
              <button className="btn btn-primary" onClick={startDownload}>
                Retry
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dive Import Review Modal */}
      <DiveImportReviewModal
        isOpen={showReviewModal}
        onClose={() => {
          setShowReviewModal(false);
          onClose(); // Close the entire dive computer modal
        }}
        dives={downloadedDives.map((d, index) => ({
          id: `dive-${index}`,
          dcDive: d as DCDive,
          date: d.when,
          selected: d.selected,
          isDuplicate: d.isDuplicate,
          tankPressures: d.tankPressures,
        }))}
        existingTrips={allTrips}
        onImport={handleReviewImport}
        onCreateTrip={handleCreateTripFromReview}
      />
    </div>
  );
}

// Type declarations for Web Bluetooth API
interface RequestDeviceOptions {
  acceptAllDevices?: boolean;
  filters?: Array<{
    services?: string[];
    name?: string;
    namePrefix?: string;
  }>;
  optionalServices?: string[];
}

interface BluetoothDevice {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
  };
}

interface BluetoothRemoteGATTServer {
  device: BluetoothDevice;
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<unknown>;
}

// Type declarations for WebHID API
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
}

interface HIDInputReportEvent {
  device: HIDDevice;
  reportId: number;
  data: DataView;
}

interface WebHID {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options?: { filters?: Array<{ vendorId: number; productId?: number; usagePage?: number; usage?: number }> }): Promise<HIDDevice[]>;
}

// Type declarations for File System Access API
interface FileSystemFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}
