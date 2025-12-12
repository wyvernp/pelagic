// SPDX-License-Identifier: GPL-2.0
/**
 * Abstract Transport Interface
 * Base class for all transport implementations (Serial, USB, Bluetooth, BLE)
 */

import { DCStatus, DCDirection } from '../types/index.js';

/**
 * Transport event types
 */
export type TransportEventType = 
  | 'connect'
  | 'disconnect'
  | 'error'
  | 'data';

/**
 * Transport event handler
 */
export type TransportEventHandler = (data?: unknown) => void;

/**
 * Abstract transport interface for dive computer communication
 */
export abstract class Transport {
  protected timeout: number = 5000;
  protected connected: boolean = false;
  protected eventHandlers: Map<TransportEventType, Set<TransportEventHandler>> = new Map();

  /**
   * Open the transport connection
   */
  abstract open(): Promise<DCStatus>;

  /**
   * Close the transport connection
   */
  abstract close(): Promise<DCStatus>;

  /**
   * Read data from the device
   * @param size Number of bytes to read
   * @returns Promise with [status, data, actualBytesRead]
   */
  abstract read(size: number): Promise<[DCStatus, Uint8Array, number]>;

  /**
   * Write data to the device
   * @param data Data to write
   * @returns Promise with [status, actualBytesWritten]
   */
  abstract write(data: Uint8Array): Promise<[DCStatus, number]>;

  /**
   * Poll for available data
   * @param timeout Timeout in milliseconds
   */
  abstract poll(timeout: number): Promise<DCStatus>;

  /**
   * Purge buffers
   * @param direction Which buffers to purge
   */
  abstract purge(direction: DCDirection): Promise<DCStatus>;

  /**
   * Set the read/write timeout
   * @param timeout Timeout in milliseconds
   */
  setTimeout(timeout: number): DCStatus {
    this.timeout = timeout;
    return DCStatus.SUCCESS;
  }

  /**
   * Get the current timeout
   */
  getTimeout(): number {
    return this.timeout;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Sleep for a specified duration
   * @param ms Milliseconds to sleep
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add event listener
   */
  on(event: TransportEventType, handler: TransportEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove event listener
   */
  off(event: TransportEventType, handler: TransportEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event
   */
  protected emit(event: TransportEventType, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  /**
   * Configure serial parameters (if applicable)
   */
  configure?(
    baudrate: number,
    databits: number,
    parity: number,
    stopbits: number,
    flowcontrol: number
  ): Promise<DCStatus>;

  /**
   * Set DTR (if applicable)
   */
  setDTR?(value: boolean): Promise<DCStatus>;

  /**
   * Set RTS (if applicable)
   */
  setRTS?(value: boolean): Promise<DCStatus>;

  /**
   * Get available bytes (if applicable)
   */
  getAvailable?(): Promise<number>;
}

/**
 * Transport factory function type
 */
export type TransportFactory = (address: string, options?: Record<string, unknown>) => Promise<Transport>;
