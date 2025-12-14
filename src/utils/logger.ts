/**
 * Centralized logger utility for Pelagic Desktop.
 * 
 * In production builds, debug and info logs are suppressed.
 * Warnings and errors are always logged.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enabled: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default to 'info' in development, 'warn' in production
const IS_DEV = import.meta.env.DEV;

const config: LoggerConfig = {
  level: IS_DEV ? 'debug' : 'warn',
  enabled: true,
};

function shouldLog(level: LogLevel): boolean {
  if (!config.enabled) return false;
  return LOG_LEVELS[level] >= LOG_LEVELS[config.level];
}

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString().substring(11, 23);
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

/**
 * Logger utility with log level control.
 */
export const logger = {
  /**
   * Debug messages - only shown in development.
   */
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', message), ...args);
    }
  },

  /**
   * Info messages - general application flow.
   */
  info(message: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.log(formatMessage('info', message), ...args);
    }
  },

  /**
   * Warning messages - non-critical issues.
   */
  warn(message: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message), ...args);
    }
  },

  /**
   * Error messages - critical issues that affect functionality.
   */
  error(message: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message), ...args);
    }
  },

  /**
   * Set the minimum log level.
   */
  setLevel(level: LogLevel): void {
    config.level = level;
  },

  /**
   * Enable or disable all logging.
   */
  setEnabled(enabled: boolean): void {
    config.enabled = enabled;
  },
};

export default logger;
