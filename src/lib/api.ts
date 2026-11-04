/**
 * Resilient API & Direct Neon PostgreSQL Service
 * - Connects via Vite / Reverse Proxy (`/api/...`) when running locally or on LAN.
 * - Seamlessly falls back to Neon's HTTP SQL Serverless Driver (`@neondatabase/serverless`)
 *   when deployed to static hosting like GitHub Pages (https://cruzb-345b.github.io/Sistema-de-inventario/).
 */
/* el conector de red principal */
import { neon } from '@neondatabase/serverless';

export interface ApiTelemetryLog {
  id: string;
  deviceId: string;
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  uptimeSeconds: number;
  temperature?: number | null;
  recordedAt: string;
  device?: {
    id: string;
    serialNumber: string;
    name: string;
    location: string;
    status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'MAINTENANCE';
  };
}

export interface ApiDevice {
  id: string;
  serialNumber: string;
  name: string;
  model: string;
  ipAddress: string;
  macAddress: string;
  location: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'MAINTENANCE';
  lastHeartbeat: string | null;
  createdAt: string;
  telemetryLogs?: ApiTelemetryLog[];
}

const NEON_DB_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DATABASE_URL) ||
  'postgresql://neondb_owner:npg_cDS7vdmryZ8N@ep-polished-firefly-b66u82ef-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require';

// Direct SQL-over-HTTPS connection to Neon
export const neonSql = neon(NEON_DB_URL);

export function isGitHubPages(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('github.io');
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('RESILIENT_API_BASE');
    if (custom) return custom.replace(/\/$/, '');
  }

  const envUrl = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    if (isGitHubPages()) {
      return '';
    }
    return '';
  }

  return 'http://localhost:4000';
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

/**
 * Fetch all devices, with latest telemetry logs.
 * Tries local /api proxy first, falls back to direct Neon SQL over HTTPS.
 */
export async function fetchAllDevices(authHeaders: Record<string, string>): Promise<ApiDevice[]> {
  // If not on github.io, attempt local API first
  if (!isGitHubPages()) {
    try {
      const res = await fetch(apiUrl('/api/devices?limit=100'), {
        headers: authHeaders,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch {
      // Fall through to direct Neon SQL
    }
  }

  // Direct Neon PostgreSQL query over HTTPS
  const rows = await neonSql`
    SELECT 
      d.id, 
      d."serialNumber", 
      d.name, 
      d.model, 
      d."ipAddress", 
      d."macAddress", 
      d.location, 
      d.status,
      d."lastHeartbeat", 
      d."createdAt",
      COALESCE(
        json_agg(
          json_build_object(
            'id', t.id,
            'deviceId', t."deviceId",
            'cpuUsage', t."cpuUsage",
            'ramUsage', t."ramUsage",
            'diskUsage', t."diskUsage",
            'uptimeSeconds', t."uptimeSeconds",
            'temperature', t.temperature,
            'recordedAt', t."recordedAt"
          ) ORDER BY t."recordedAt" DESC
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'
      ) as "telemetryLogs"
    FROM "Device" d
    LEFT JOIN LATERAL (
      SELECT * FROM "TelemetryLog" WHERE "deviceId" = d.id ORDER BY "recordedAt" DESC LIMIT 15
    ) t ON true
    GROUP BY d.id
    ORDER BY d."updatedAt" DESC;
  `;

  return rows as unknown as ApiDevice[];
}

/**
 * Fetch live telemetry feed.
 * Tries local /api proxy first, falls back to direct Neon SQL over HTTPS.
 */
export async function fetchLiveTelemetryFeed(authHeaders: Record<string, string>): Promise<ApiTelemetryLog[]> {
  if (!isGitHubPages()) {
    try {
      const res = await fetch(apiUrl('/api/telemetry/feed?limit=25'), {
        headers: authHeaders,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch {
      // Fall through to direct Neon SQL
    }
  }

  const rows = await neonSql`
    SELECT 
      t.id, 
      t."deviceId", 
      t."cpuUsage", 
      t."ramUsage", 
      t."diskUsage", 
      t."uptimeSeconds", 
      t.temperature, 
      t."recordedAt",
      json_build_object(
        'id', d.id,
        'serialNumber', d."serialNumber",
        'name', d.name,
        'location', d.location,
        'status', d.status
      ) as device
    FROM "TelemetryLog" t
    LEFT JOIN "Device" d ON d.id = t."deviceId"
    ORDER BY t."recordedAt" DESC
    LIMIT 25;
  `;

  return rows as unknown as ApiTelemetryLog[];
}

/**
 * Create a new device.
 * Tries local API first, falls back to direct Neon SQL insert.
 */
export async function createDeviceRecord(data: {
  serialNumber: string;
  name: string;
  model: string;
  ipAddress: string;
  macAddress: string;
  location: string;
  status: string;
}): Promise<void> {
  if (!isGitHubPages()) {
    try {
      const res = await fetch(apiUrl('/api/devices'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) return;
    } catch {
      // Fall through to direct Neon SQL
    }
  }

  await neonSql`
    INSERT INTO "Device" (
      "id", "serialNumber", "name", "model", "ipAddress", "macAddress", "location", "status", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), ${data.serialNumber}, ${data.name}, ${data.model}, ${data.ipAddress}, ${data.macAddress}, ${data.location}, ${data.status}::"DeviceStatus", NOW(), NOW()
    );
  `;
}

/**
 * Delete a device.
 * Tries local API first, falls back to direct Neon SQL delete.
 */
export async function deleteDeviceRecord(id: string): Promise<void> {
  if (!isGitHubPages()) {
    try {
      const res = await fetch(apiUrl(`/api/devices/${id}`), {
        method: 'DELETE',
      });
      if (res.ok) return;
    } catch {
      // Fall through to direct Neon SQL
    }
  }

  await neonSql`DELETE FROM "TelemetryLog" WHERE "deviceId" = ${id};`;
  await neonSql`DELETE FROM "Device" WHERE "id" = ${id};`;
}
