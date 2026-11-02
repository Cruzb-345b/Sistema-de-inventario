/**
 * CSV Sanitizer to prevent Formula Injection (CSV Injection / CWE-1236).
 *
 * Execution characters: '=', '+', '-', '@', '\t', '\r'
 * When a field starts with any of these characters, prepend a single quote (')
 * to force spreadsheet software (Excel, LibreOffice, Google Sheets) to treat it as plain text.
 */

const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Sanitizes a single cell value for CSV export or storage.
 * @param value unknown input
 * @returns string sanitized against spreadsheet formula execution
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  if (str.length === 0) {
    return '';
  }

  const firstChar = str.charAt(0);
  if (DANGEROUS_PREFIXES.includes(firstChar)) {
    // Prepend single quote (') to neutralize formula execution
    return `'${str}`;
  }

  return str;
}

/**
 * Sanitizes all values in an object before generating CSV rows.
 */
export function sanitizeCsvRow<T extends Record<string, unknown>>(row: T): Record<keyof T, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, val] of Object.entries(row)) {
    sanitized[key] = sanitizeCsvCell(val);
  }

  return sanitized as Record<keyof T, string>;
}

/**
 * Strips the defensive prefix quote if the cell was defensively sanitized.
 * Useful when parsing imported rows into internal models.
 */
export function desanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value).trim();
  if (str.startsWith("'") && str.length > 1 && DANGEROUS_PREFIXES.includes(str.charAt(1))) {
    return str.substring(1);
  }

  return str;
}

/**
 * Converts an array of objects to safe CSV string format with formula shielding.
 */
export function formatSafeCsv(
  rows: Array<Record<string, unknown>>,
  columns?: string[]
): string {
  if (rows.length === 0) {
    return columns ? columns.join(',') : '';
  }

  const headers = columns || Object.keys(rows[0]);
  const headerLine = headers.map((h) => escapeCsvValue(h)).join(',');

  const dataLines = rows.map((row) => {
    return headers
      .map((header) => {
        const rawValue = row[header];
        const sanitized = sanitizeCsvCell(rawValue);
        return escapeCsvValue(sanitized);
      })
      .join(',');
  });

  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Helper to escape quotes and commas per RFC 4180
 */
function escapeCsvValue(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
