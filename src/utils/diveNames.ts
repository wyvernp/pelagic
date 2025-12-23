/**
 * Format a dive name based on the prefix setting.
 * Handles special cases like "#" prefix (no space) and "." suffix (period after number).
 * 
 * @param prefix - The dive name prefix from settings (e.g., "Dive", "#", ".", "No.", or "")
 * @param diveNumber - The dive number
 * @returns Formatted dive name string
 */
export function formatDiveName(prefix: string, diveNumber: number | string): string {
  if (!prefix) return String(diveNumber);
  if (prefix === '#') return `#${diveNumber}`;
  if (prefix === '.') return `${diveNumber}.`;
  return `${prefix} ${diveNumber}`;
}
