import React, { useState, useMemo, ChangeEvent } from 'react';
import Papa from 'papaparse';
import { z } from 'zod';
import {
  Server,
  Activity,
  Plus,
  Download,
  Upload,
  Search,
  RefreshCw,
  Trash2,
  Cpu,
  HardDrive,
  Clock,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { getAuthHeaders } from '../lib/auth';


export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'MAINTENANCE';

export interface TelemetryReading {
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  uptimeSeconds: number;
  temperature?: number;
  recordedAt: string;
}

export interface HardwareDevice {
  id: string;
  serialNumber: string;
  name: string;
  model: string;
  ipAddress: string;
  macAddress: string;
  location: string;
  status: DeviceStatus;
  lastHeartbeat: string | null;
  createdAt: string;
  telemetry: TelemetryReading;
  telemetryHistory: TelemetryReading[];
}

// Zod Validation Schema for Devices
const DeviceFormSchema = z.object({
  serialNumber: z
    .string()
    .trim()
    .min(3, 'Serial number must have at least 3 characters')
    .max(64, 'Max 64 characters'),
  name: z
    .string()
    .trim()
    .min(2, 'Name must have at least 2 characters')
    .max(100, 'Max 100 characters'),
  model: z
    .string()
    .trim()
    .min(2, 'Model required')
    .max(80, 'Max 80 characters'),
  ipAddress: z
    .string()
    .trim()
    .regex(
      /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      'Must be a valid IPv4 address'
    ),
  macAddress: z
    .string()
    .trim()
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Valid MAC format (XX:XX:XX:XX:XX:XX)'),
  location: z
    .string()
    .trim()
    .min(2, 'Location required')
    .max(120, 'Max 120 characters'),
  status: z.enum(['ONLINE', 'OFFLINE', 'DEGRADED', 'MAINTENANCE']),
});

// CSV Security: Formula Execution Neutralization
const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.length === 0) return '';
  if (DANGEROUS_PREFIXES.includes(str.charAt(0))) {
    return `'${str}`;
  }
  return str;
}

export function desanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (str.startsWith("'") && str.length > 1 && DANGEROUS_PREFIXES.includes(str.charAt(1))) {
    return str.substring(1);
  }
  return str;
}

// Initial resilient seed data
const INITIAL_DEVICES: HardwareDevice[] = [
  {
    id: 'dev-001',
    serialNumber: 'SRV-RACK-089A',
    name: 'Core Edge Router 01',
    model: 'Dell PowerEdge R640',
    ipAddress: '192.168.10.15',
    macAddress: '00:1A:2B:3C:4D:01',
    location: 'Datacenter A - Rack 04',
    status: 'ONLINE',
    lastHeartbeat: new Date().toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    telemetry: {
      cpuUsage: 34.2,
      ramUsage: 58.7,
      diskUsage: 41.5,
      uptimeSeconds: 846200,
      temperature: 42.5,
      recordedAt: new Date().toISOString(),
    },
    telemetryHistory: [],
  },
  {
    id: 'dev-002',
    serialNumber: 'SRV-STOR-112B',
    name: 'Distributed Storage Node',
    model: 'HP ProLiant DL380 Gen10',
    ipAddress: '192.168.10.16',
    macAddress: '00:1A:2B:3C:4D:02',
    location: 'Datacenter A - Rack 05',
    status: 'DEGRADED',
    lastHeartbeat: new Date(Date.now() - 120000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    telemetry: {
      cpuUsage: 94.6,
      ramUsage: 91.2,
      diskUsage: 89.4,
      uptimeSeconds: 1420500,
      temperature: 68.0,
      recordedAt: new Date(Date.now() - 120000).toISOString(),
    },
    telemetryHistory: [],
  },
  {
    id: 'dev-003',
    serialNumber: 'SRV-GATE-994C',
    name: 'Industrial Gateway Alpha',
    model: 'Advantech UNO-2484G',
    ipAddress: '192.168.20.5',
    macAddress: '00:1A:2B:3C:4D:03',
    location: 'Plant Substation 2',
    status: 'MAINTENANCE',
    lastHeartbeat: new Date(Date.now() - 3600000 * 4).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    telemetry: {
      cpuUsage: 0.0,
      ramUsage: 0.0,
      diskUsage: 22.0,
      uptimeSeconds: 0,
      temperature: 24.0,
      recordedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    },
    telemetryHistory: [],
  },
  {
    id: 'dev-004',
    serialNumber: 'SRV-SNSR-440D',
    name: 'Telemetry Aggregator Hub',
    model: 'Supermicro SuperServer',
    ipAddress: '192.168.10.22',
    macAddress: '00:1A:2B:3C:4D:04',
    location: 'Datacenter B - Rack 01',
    status: 'ONLINE',
    lastHeartbeat: new Date().toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    telemetry: {
      cpuUsage: 18.5,
      ramUsage: 42.1,
      diskUsage: 35.8,
      uptimeSeconds: 294000,
      temperature: 38.2,
      recordedAt: new Date().toISOString(),
    },
    telemetryHistory: [],
  },
];

interface ApiTelemetryLog {
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
    status: DeviceStatus;
  };
}

interface ApiDevice {
  id: string;
  serialNumber: string;
  name: string;
  model: string;
  ipAddress: string;
  macAddress: string;
  location: string;
  status: DeviceStatus;
  lastHeartbeat: string | null;
  createdAt: string;
  telemetryLogs?: ApiTelemetryLog[];
}

interface DeviceDashboardProps {
  onTriggerTestCrash?: () => void;
}

export const DeviceDashboard: React.FC<DeviceDashboardProps> = () => {
  // Core Component States
  const [devices, setDevices] = useState<HardwareDevice[]>(INITIAL_DEVICES);
  const [loading, setLoading] = useState<boolean>(false);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedDevice, setSelectedDevice] = useState<HardwareDevice | null>(null);
  const [telemetryFeed, setTelemetryFeed] = useState<ApiTelemetryLog[]>([]);

  // Fetch devices from Neon PostgreSQL Backend API (port 4000)
  const fetchDevices = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:4000/api/devices?limit=100', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {

        const json = (await res.json()) as { success: boolean; data: ApiDevice[] };
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const mapped: HardwareDevice[] = json.data.map((d: ApiDevice) => {
            const latestLog = d.telemetryLogs?.[0];
            return {
              id: d.id,
              serialNumber: d.serialNumber,
              name: d.name,
              model: d.model,
              ipAddress: d.ipAddress,
              macAddress: d.macAddress,
              location: d.location,
              status: d.status,
              lastHeartbeat: d.lastHeartbeat || d.createdAt,
              createdAt: d.createdAt,
              telemetry: latestLog
                ? {
                    cpuUsage: latestLog.cpuUsage,
                    ramUsage: latestLog.ramUsage,
                    diskUsage: latestLog.diskUsage,
                    uptimeSeconds: latestLog.uptimeSeconds,
                    temperature: latestLog.temperature ?? undefined,
                    recordedAt: latestLog.recordedAt,
                  }
                : {
                    cpuUsage: 15.0,
                    ramUsage: 35.0,
                    diskUsage: 25.0,
                    uptimeSeconds: 0,
                    recordedAt: new Date().toISOString(),
                  },
              telemetryHistory: (d.telemetryLogs || []).map((l) => ({
                cpuUsage: l.cpuUsage,
                ramUsage: l.ramUsage,
                diskUsage: l.diskUsage,
                uptimeSeconds: l.uptimeSeconds,
                temperature: l.temperature ?? undefined,
                recordedAt: l.recordedAt,
              })),
            };
          });


          setDevices(mapped);
          setDbConnected(true);
          return;
        }
      }
      setDbConnected(false);
    } catch {
      setDbConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch live telemetry stream from /api/telemetry/feed
  const fetchTelemetryFeed = React.useCallback(async () => {
    try {
      const res = await fetch('http://localhost:4000/api/telemetry/feed?limit=25', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {

        const json = (await res.json()) as { success: boolean; data: ApiTelemetryLog[] };
        if (json.success && Array.isArray(json.data)) {
          setTelemetryFeed(json.data);
        }
      }
    } catch {
      // Non-blocking background telemetry sync
    }
  }, []);

  // Continuous background polling for live telemetric resiliency
  React.useEffect(() => {
    fetchDevices();
    fetchTelemetryFeed();
    const timer = setInterval(() => {
      fetchDevices();
      fetchTelemetryFeed();
    }, 4000);
    return () => clearInterval(timer);
  }, [fetchDevices, fetchTelemetryFeed]);


  // Modal & Form States
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    serialNumber: '',
    name: '',
    model: '',
    ipAddress: '',
    macAddress: '',
    location: '',
    status: 'ONLINE' as DeviceStatus,
  });

  // CSV Import / Export feedback states
  const [importSummary, setImportSummary] = useState<{
    total: number;
    success: number;
    errors: string[];
    formulaDetections: number;
  } | null>(null);

  // Live Agent Simulation State
  const [isSimulatingAgent] = useState<boolean>(true);
  const [agentLogs, setAgentLogs] = useState<
    Array<{ id: string; time: string; text: string; type: 'info' | 'warn' | 'error' }>
  >([
    {
      id: 'log-0',
      time: new Date().toLocaleTimeString(),
      text: 'Resilient Agent Worker daemon initialized. Telemetry loop active in dark mode.',
      type: 'info',
    },
  ]);

  // Error Boundary deliberately triggerable test state
  const [shouldCrash] = useState<boolean>(false);
  if (shouldCrash) {
    throw new Error('Test Fault: Unhandled hardware bus exception triggered for ErrorBoundary validation.');
  }

  // Periodic Agent Telemetry Heartbeat Simulation
  React.useEffect(() => {
    if (!isSimulatingAgent) return;

    const interval = setInterval(() => {
      setDevices((prevDevices) => {
        if (prevDevices.length === 0) return prevDevices;

        const randomIndex = Math.floor(Math.random() * prevDevices.length);
        const target = prevDevices[randomIndex];

        if (target.status === 'MAINTENANCE' || target.status === 'OFFLINE') {
          return prevDevices;
        }

        const deltaCpu = (Math.random() - 0.48) * 8;
        const newCpu = Math.min(100, Math.max(2, +(target.telemetry.cpuUsage + deltaCpu).toFixed(1)));
        const deltaRam = (Math.random() - 0.48) * 4;
        const newRam = Math.min(100, Math.max(10, +(target.telemetry.ramUsage + deltaRam).toFixed(1)));
        const newDisk = +(target.telemetry.diskUsage + (Math.random() > 0.95 ? 0.1 : 0)).toFixed(1);
        const newTemp = +(35 + (newCpu * 0.35)).toFixed(1);

        const isDegraded = newCpu > 90 || newRam > 92;
        const updatedStatus: DeviceStatus = isDegraded ? 'DEGRADED' : 'ONLINE';

        const updatedReading: TelemetryReading = {
          cpuUsage: newCpu,
          ramUsage: newRam,
          diskUsage: newDisk,
          uptimeSeconds: target.telemetry.uptimeSeconds + 5,
          temperature: newTemp,
          recordedAt: new Date().toISOString(),
        };

        const updatedDevice: HardwareDevice = {
          ...target,
          status: updatedStatus,
          lastHeartbeat: new Date().toISOString(),
          telemetry: updatedReading,
          telemetryHistory: [updatedReading, ...(target.telemetryHistory || [])].slice(0, 15),
        };

        const nextList = [...prevDevices];
        nextList[randomIndex] = updatedDevice;

        setAgentLogs((prev) => [
          {
            id: `log-${Date.now()}`,
            time: new Date().toLocaleTimeString(),
            text: `[POST 201] Device ${target.serialNumber} reported: CPU ${newCpu}% | RAM ${newRam}% | Disk ${newDisk}%`,
            type: isDegraded ? 'warn' : 'info',
          },
          ...prev.slice(0, 30),
        ]);

        return nextList;
      });
    }, 3500);

    return () => clearInterval(interval);
  }, [isSimulatingAgent]);

  // Filtered devices calculation
  const filteredDevices = useMemo(() => {
    return devices.filter((dev) => {
      const matchesStatus = statusFilter === 'ALL' || dev.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === '' ||
        dev.name.toLowerCase().includes(q) ||
        dev.serialNumber.toLowerCase().includes(q) ||
        dev.ipAddress.includes(q) ||
        dev.location.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [devices, statusFilter, searchQuery]);

  // Aggregate Metrics
  const systemMetrics = useMemo(() => {
    const total = devices.length;
    const online = devices.filter((d) => d.status === 'ONLINE').length;
    const degraded = devices.filter((d) => d.status === 'DEGRADED').length;
    const offline = devices.filter((d) => d.status === 'OFFLINE' || d.status === 'MAINTENANCE').length;

    const avgCpu =
      total > 0
        ? Math.round(devices.reduce((acc, d) => acc + d.telemetry.cpuUsage, 0) / total)
        : 0;
    const avgRam =
      total > 0
        ? Math.round(devices.reduce((acc, d) => acc + d.telemetry.ramUsage, 0) / total)
        : 0;

    return { total, online, degraded, offline, avgCpu, avgRam };
  }, [devices]);

  // Handle Create Device Form Submission
  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const result = DeviceFormSchema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((err: z.ZodIssue) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      setFormErrors(errors);
      return;
    }

    const validated = result.data;

    const duplicate = devices.some(
      (d) => d.serialNumber.toLowerCase() === validated.serialNumber.toLowerCase()
    );
    if (duplicate) {
      setFormErrors({
        serialNumber: 'Serial number conflict: Unique constraint requires unique identifier.',
      });
      return;
    }

    const newDevice: HardwareDevice = {
      id: `dev-${Date.now().toString(36)}`,
      serialNumber: formData.serialNumber.trim(),
      name: formData.name.trim(),
      model: formData.model.trim(),
      ipAddress: formData.ipAddress.trim(),
      macAddress: formData.macAddress.trim(),
      location: formData.location.trim(),
      status: formData.status,
      lastHeartbeat: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      telemetry: {
        cpuUsage: 12.0,
        ramUsage: 35.0,
        diskUsage: 20.0,
        uptimeSeconds: 0,
        temperature: 32.0,
        recordedAt: new Date().toISOString(),
      },
      telemetryHistory: [],
    };

    // If connected to MySQL backend, persist via POST /api/devices
    if (dbConnected) {
      try {
        const res = await fetch('http://localhost:4000/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serialNumber: validated.serialNumber,
            name: validated.name,
            model: validated.model,
            ipAddress: validated.ipAddress,
            macAddress: validated.macAddress,
            location: validated.location,
            status: validated.status,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data?.id) {
            newDevice.id = json.data.id;
          }
        }
      } catch (err) {
        console.warn('MySQL backend unavailable, saving locally', err);
      }
    }

    setDevices([newDevice, ...devices]);
    setShowAddModal(false);
    setFormData({
      serialNumber: '',
      name: '',
      model: '',
      ipAddress: '',
      macAddress: '',
      location: '',
      status: 'ONLINE',
    });
  };

  // Handle Device Deletion with MySQL sync
  const handleDeleteDevice = async (id: string) => {
    if (dbConnected) {
      try {
        await fetch(`http://localhost:4000/api/devices/${id}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.warn('MySQL backend delete failed, deleting locally', err);
      }
    }
    setDevices(devices.filter((d) => d.id !== id));
    if (selectedDevice?.id === id) {
      setSelectedDevice(null);
    }
  };

  // CSV Export with Formula Injection Neutralization
  const handleExportCsv = () => {
    const rows = devices.map((d) => ({
      serialNumber: sanitizeCsvCell(d.serialNumber),
      name: sanitizeCsvCell(d.name),
      model: sanitizeCsvCell(d.model),
      ipAddress: sanitizeCsvCell(d.ipAddress),
      macAddress: sanitizeCsvCell(d.macAddress),
      location: sanitizeCsvCell(d.location),
      status: sanitizeCsvCell(d.status),
      cpuUsage: sanitizeCsvCell(`${d.telemetry.cpuUsage}%`),
      ramUsage: sanitizeCsvCell(`${d.telemetry.ramUsage}%`),
      diskUsage: sanitizeCsvCell(`${d.telemetry.diskUsage}%`),
      lastHeartbeat: sanitizeCsvCell(d.lastHeartbeat || 'N/A'),
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `hardware_inventory_shielded_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // CSV Import with PapaParse and Formula Security Sanitization
  const handleImportCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setImportSummary(null);

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setLoading(false);
        const importedRows = results.data;
        let formulaDetections = 0;
        const validNewDevices: HardwareDevice[] = [];
        const parseErrors: string[] = [];

        importedRows.forEach((row, index) => {
          const rowNumber = index + 1;
          const cleanRow: Record<string, string> = {};

          for (const [key, rawVal] of Object.entries(row)) {
            const rawStr = String(rawVal ?? '').trim();
            if (rawStr.length > 0 && DANGEROUS_PREFIXES.includes(rawStr.charAt(0))) {
              formulaDetections++;
            }
            cleanRow[key] = desanitizeCsvCell(rawVal);
          }

          const validation = DeviceFormSchema.safeParse({
            serialNumber: cleanRow.serialNumber || cleanRow.SerialNumber || '',
            name: cleanRow.name || cleanRow.Name || '',
            model: cleanRow.model || cleanRow.Model || 'Generic Edge Device',
            ipAddress: cleanRow.ipAddress || cleanRow.IPAddress || cleanRow.ip || '',
            macAddress: cleanRow.macAddress || cleanRow.MACAddress || '00:00:00:00:00:00',
            location: cleanRow.location || cleanRow.Location || 'Site Node',
            status: cleanRow.status || 'ONLINE',
          });

          if (!validation.success) {
            parseErrors.push(
              `Row ${rowNumber}: ${validation.error.issues.map((e: z.ZodIssue) => e.message).join(', ')}`
            );
            return;
          }

          const validData = validation.data;
          validNewDevices.push({
            id: `dev-csv-${Date.now()}-${index}`,
            serialNumber: validData.serialNumber,
            name: validData.name,
            model: validData.model,
            ipAddress: validData.ipAddress,
            macAddress: validData.macAddress,
            location: validData.location,
            status: validData.status,
            lastHeartbeat: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            telemetry: {
              cpuUsage: Math.floor(Math.random() * 40 + 10),
              ramUsage: Math.floor(Math.random() * 50 + 20),
              diskUsage: Math.floor(Math.random() * 60 + 10),
              uptimeSeconds: 3600,
              temperature: 38.0,
              recordedAt: new Date().toISOString(),
            },
            telemetryHistory: [],
          });
        });

        if (validNewDevices.length > 0) {
          setDevices((current) => {
            const map = new Map<string, HardwareDevice>();
            current.forEach((d) => map.set(d.serialNumber.toLowerCase(), d));
            validNewDevices.forEach((d) => map.set(d.serialNumber.toLowerCase(), d));
            return Array.from(map.values());
          });
        }

        setImportSummary({
          total: importedRows.length,
          success: validNewDevices.length,
          errors: parseErrors,
          formulaDetections,
        });

        event.target.value = '';
      },
      error: (err) => {
        setLoading(false);
        setErrorMessage(`CSV Parsing failed: ${err.message}`);
      },
    });
  };

  // Helper for Status Badge Styling in Dark Monochromatic Palette
  const renderStatusBadge = (status: DeviceStatus) => {
    switch (status) {
      case 'ONLINE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium bg-gray-100 text-gray-950 border border-gray-200">
            <CheckCircle2 className="w-3 h-3 mr-1 text-gray-900" />
            ONLINE
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium bg-gray-800 text-gray-200 border border-gray-600">
            <AlertCircle className="w-3 h-3 mr-1 text-gray-300" />
            DEGRADED
          </span>
        );
      case 'OFFLINE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium bg-[#111622] text-gray-500 border border-gray-800 line-through">
            OFFLINE
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium bg-transparent text-gray-400 border border-dashed border-gray-700">
            MAINTENANCE
          </span>
        );
    }
  };

  return (
    <div className="w-full space-y-6 text-gray-100">
      {/* Critical Alerts Banner if any */}
      {errorMessage && (
        <div className="p-4 bg-gray-900 border border-gray-700 text-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-gray-300" />
            <span className="text-xs font-mono font-semibold">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-mono underline hover:text-gray-300 cursor-pointer text-gray-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* CSV Import Notification Banner */}
      {importSummary && (
        <div className="p-4 bg-[#131926] border border-gray-700 text-gray-100 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-gray-300" />
              <span className="text-xs font-bold font-mono uppercase text-gray-100">
                CSV Import Report: {importSummary.success} of {importSummary.total} Records Validated
              </span>
            </div>
            <button
              type="button"
              onClick={() => setImportSummary(null)}
              className="text-xs font-mono underline text-gray-400 hover:text-gray-200 cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="text-xs text-gray-400 font-mono space-y-1">
            <div>
              Formula Shielding Triggered:{' '}
              <span className="font-bold text-gray-200">
                {importSummary.formulaDetections} potential formula injections neutralized
              </span>{' '}
              (=, +, -, @, \t, \r characters safely handled).
            </div>
            {importSummary.errors.length > 0 && (
              <div className="mt-2 p-2 bg-[#0b0f17] border border-gray-800 max-h-24 overflow-y-auto">
                <div className="font-semibold text-gray-300">Validation Failures:</div>
                {importSummary.errors.map((err, idx) => (
                  <div key={idx} className="text-[11px] text-gray-400">
                    • {err}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* System KPIs Grid in Dark Theme */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="p-3 bg-[#131926] border border-gray-800">
          <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Total Nodes</span>
          <div className="text-xl font-bold font-mono text-gray-100 mt-1">
            {systemMetrics.total}
          </div>
        </div>
        <div className="p-3 bg-[#131926] border border-gray-800">
          <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Online Health</span>
          <div className="text-xl font-bold font-mono text-gray-100 mt-1">
            {systemMetrics.online}
          </div>
        </div>
        <div className="p-3 bg-[#131926] border border-gray-800">
          <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Degraded State</span>
          <div className="text-xl font-bold font-mono text-gray-100 mt-1">
            {systemMetrics.degraded}
          </div>
        </div>
        <div className="p-3 bg-[#131926] border border-gray-800">
          <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Offline / Maint</span>
          <div className="text-xl font-bold font-mono text-gray-100 mt-1">
            {systemMetrics.offline}
          </div>
        </div>
        <div className="p-3 bg-[#131926] border border-gray-800">
          <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Cluster CPU Avg</span>
          <div className="text-xl font-bold font-mono text-gray-100 mt-1">
            {systemMetrics.avgCpu}%
          </div>
        </div>
        <div className="p-3 bg-[#131926] border border-gray-800">
          <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Cluster RAM Avg</span>
          <div className="text-xl font-bold font-mono text-gray-100 mt-1">
            {systemMetrics.avgRam}%
          </div>
        </div>
      </div>

      {/* Toolbar & Filters (Dark Aesthetic) */}
      <div className="bg-[#131926] border border-gray-800 p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search serial, hostname, IP address, rack..."
            className="w-full pl-9 pr-3 py-1.5 text-xs font-mono bg-[#0b0f17] border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-400"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center space-x-1.5 overflow-x-auto text-xs font-mono">
          {['ALL', 'ONLINE', 'DEGRADED', 'OFFLINE', 'MAINTENANCE'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1 text-xs border cursor-pointer ${
                statusFilter === status
                  ? 'bg-gray-100 text-gray-950 font-semibold border-gray-200'
                  : 'bg-[#0b0f17] text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Action Buttons: Add, Export, Import, and MySQL Status */}
        <div className="flex items-center flex-wrap gap-2">
          {/* MySQL Connection Status Indicator */}
          {dbConnected === true ? (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-emerald-950/70 text-emerald-300 border border-emerald-700/60 font-semibold"
                title="Conectado a Neon Lakebase Postgres (Branch: production)"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Neon Postgres Activo
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-cyan-950/70 text-cyan-300 border border-cyan-700/60 font-semibold"
                title="Neon Managed Auth (Better Auth) habilitado en branch production"
              >
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                Neon Auth
              </span>
            </div>
          ) : dbConnected === false ? (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-amber-950/50 text-amber-300 border border-amber-700/50"
              title="Modo local. Inicia el backend con 'npm run dev:backend' para conectar con Neon"
            >
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Modo Local
            </span>
          ) : null}

          <button
            type="button"
            onClick={fetchDevices}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-100 border border-gray-700 hover:border-gray-500 bg-[#0b0f17] cursor-pointer"
            title="Sincronizar con PostgreSQL"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center px-3 py-1.5 text-xs font-mono font-medium bg-gray-100 text-gray-950 border border-gray-200 hover:bg-white cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Device
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center px-3 py-1.5 text-xs font-mono font-medium bg-[#0b0f17] text-gray-200 border border-gray-700 hover:bg-gray-800 cursor-pointer"
            title="Export sanitized CSV with formula execution injection shielding"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Export CSV
          </button>

          <label className="inline-flex items-center px-3 py-1.5 text-xs font-mono font-medium bg-[#0b0f17] text-gray-200 border border-gray-700 hover:bg-gray-800 cursor-pointer">
            <Upload className="w-3.5 h-3.5 mr-1" />
            Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCsv}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Device Table (Dark Palette with Loading, Error, and Empty States) */}
      <div className="bg-[#131926] border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 font-mono text-xs flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-300" />
            <span>Querying hardware cluster telemetry...</span>
          </div>
        ) : filteredDevices.length === 0 ? (
          /* Explicit Empty State */
          <div className="p-12 text-center border-dashed border-2 border-gray-800 m-4">
            <Server className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wide">
              No Matching Hardware Nodes Found
            </h3>
            <p className="text-xs text-gray-500 font-mono mt-1">
              {searchQuery || statusFilter !== 'ALL'
                ? 'No devices match your active filter criteria. Try clearing search or status filters.'
                : 'Hardware inventory is currently empty. Add your first node or import from CSV.'}
            </p>
            <div className="mt-4 flex justify-center space-x-2">
              {(searchQuery || statusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('ALL');
                  }}
                  className="px-3 py-1 text-xs font-mono border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1 text-xs font-mono bg-gray-100 text-gray-950 font-semibold hover:bg-white cursor-pointer"
              >
                Register Node
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-200 divide-y divide-gray-800">
              <thead className="bg-[#0e131d] font-mono text-gray-400 uppercase text-[11px]">
                <tr>
                  <th scope="col" className="px-4 py-2.5">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Identifier / Name
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Network (IP / MAC)
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Location / Model
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    CPU / RAM / Disk
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Last Heartbeat
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80">
                {filteredDevices.map((dev) => (
                  <tr
                    key={dev.id}
                    onClick={() => setSelectedDevice(dev)}
                    className={`hover:bg-gray-800/50 cursor-pointer transition-colors ${
                      selectedDevice?.id === dev.id ? 'bg-gray-800/70' : ''
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {renderStatusBadge(dev.status)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-100">{dev.name}</div>
                      <div className="text-[11px] font-mono text-gray-400">
                        {dev.serialNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      <div className="text-gray-200">{dev.ipAddress}</div>
                      <div className="text-gray-500">{dev.macAddress}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="text-gray-300">{dev.location}</div>
                      <div className="text-gray-500 text-[11px]">{dev.model}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-3 text-[11px] font-mono">
                        <div title="CPU Usage">
                          <span className="text-gray-500">C:</span>{' '}
                          <span
                            className={
                              dev.telemetry.cpuUsage > 90
                                ? 'font-bold text-white underline'
                                : 'text-gray-300'
                            }
                          >
                            {dev.telemetry.cpuUsage}%
                          </span>
                        </div>
                        <div title="RAM Usage">
                          <span className="text-gray-500">R:</span>{' '}
                          <span
                            className={
                              dev.telemetry.ramUsage > 90
                                ? 'font-bold text-white underline'
                                : 'text-gray-300'
                            }
                          >
                            {dev.telemetry.ramUsage}%
                          </span>
                        </div>
                        <div title="Disk Usage">
                          <span className="text-gray-500">D:</span>{' '}
                          <span className="text-gray-300">{dev.telemetry.diskUsage}%</span>
                        </div>
                      </div>

                      {/* Progress Bar Gauge */}
                      <div className="w-32 bg-gray-800 h-1.5 mt-1.5 flex rounded-none overflow-hidden">
                        <div
                          className="bg-gray-200 h-full"
                          style={{ width: `${Math.min(100, dev.telemetry.cpuUsage)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-gray-400">
                      {dev.lastHeartbeat
                        ? new Date(dev.lastHeartbeat).toLocaleTimeString()
                        : 'No signal'}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleDeleteDevice(dev.id)}
                        className="p-1 text-gray-400 hover:text-gray-100 hover:bg-gray-700 cursor-pointer"
                        title="Remove node from cluster"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Device Telemetry Detail Drawer / Card */}
      {selectedDevice && (
        <div className="bg-[#131926] border border-gray-700 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-[#0b0f17] border border-gray-700">
                <Activity className="w-4 h-4 text-gray-200" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wide">
                  Node Telemetry Inspection: {selectedDevice.name}
                </h3>
                <p className="text-xs font-mono text-gray-400">
                  S/N: {selectedDevice.serialNumber} | IP: {selectedDevice.ipAddress} | Status:{' '}
                  {selectedDevice.status}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDevice(null)}
              className="text-xs font-mono border border-gray-700 bg-[#0b0f17] text-gray-300 px-2.5 py-1 hover:bg-gray-800 cursor-pointer"
            >
              Close Inspector
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-3 bg-[#0b0f17] border border-gray-800">
              <div className="flex items-center justify-between text-xs font-mono text-gray-400 mb-1">
                <span className="flex items-center">
                  <Cpu className="w-3.5 h-3.5 mr-1 text-gray-400" /> CPU Load
                </span>
                <span className="font-bold text-gray-100">
                  {selectedDevice.telemetry.cpuUsage}%
                </span>
              </div>
              <div className="w-full bg-gray-800 h-2">
                <div
                  className="bg-gray-100 h-2"
                  style={{ width: `${selectedDevice.telemetry.cpuUsage}%` }}
                />
              </div>
            </div>

            <div className="p-3 bg-[#0b0f17] border border-gray-800">
              <div className="flex items-center justify-between text-xs font-mono text-gray-400 mb-1">
                <span className="flex items-center">
                  <Server className="w-3.5 h-3.5 mr-1 text-gray-400" /> RAM Load
                </span>
                <span className="font-bold text-gray-100">
                  {selectedDevice.telemetry.ramUsage}%
                </span>
              </div>
              <div className="w-full bg-gray-800 h-2">
                <div
                  className="bg-gray-300 h-2"
                  style={{ width: `${selectedDevice.telemetry.ramUsage}%` }}
                />
              </div>
            </div>

            <div className="p-3 bg-[#0b0f17] border border-gray-800">
              <div className="flex items-center justify-between text-xs font-mono text-gray-400 mb-1">
                <span className="flex items-center">
                  <HardDrive className="w-3.5 h-3.5 mr-1 text-gray-400" /> Disk Usage
                </span>
                <span className="font-bold text-gray-100">
                  {selectedDevice.telemetry.diskUsage}%
                </span>
              </div>
              <div className="w-full bg-gray-800 h-2">
                <div
                  className="bg-gray-400 h-2"
                  style={{ width: `${selectedDevice.telemetry.diskUsage}%` }}
                />
              </div>
            </div>

            <div className="p-3 bg-[#0b0f17] border border-gray-800">
              <div className="flex items-center justify-between text-xs font-mono text-gray-400 mb-1">
                <span className="flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1 text-gray-400" /> System Uptime
                </span>
                <span className="font-bold text-gray-100">
                  {Math.floor(selectedDevice.telemetry.uptimeSeconds / 3600)}h{' '}
                  {Math.floor((selectedDevice.telemetry.uptimeSeconds % 3600) / 60)}m
                </span>
              </div>
              <div className="text-[11px] font-mono text-gray-500 mt-2">
                Temp:{' '}
                {selectedDevice.telemetry.temperature
                  ? `${selectedDevice.telemetry.temperature}°C`
                  : 'N/A'}
              </div>
            </div>
          </div>

          {/* Quick Status Override Controls */}
          <div className="flex items-center space-x-2 pt-2 border-t border-gray-800 text-xs font-mono">
            <span className="text-gray-400">Manual State Control:</span>
            {(['ONLINE', 'DEGRADED', 'OFFLINE', 'MAINTENANCE'] as DeviceStatus[]).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    const updated = { ...selectedDevice, status: st };
                    setSelectedDevice(updated);
                    setDevices(devices.map((d) => (d.id === updated.id ? updated : d)));
                  }}
                  className={`px-2 py-0.5 border cursor-pointer ${
                    selectedDevice.status === st
                      ? 'bg-gray-100 text-gray-950 font-bold border-gray-200'
                      : 'bg-[#0b0f17] text-gray-400 border-gray-700 hover:bg-gray-800'
                  }`}
                >
                  {st}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Live Telemetry Daemon Activity Log (Dark Terminal) */}
      <div className="bg-[#131926] border border-gray-800 p-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
          <div className="flex items-center space-x-2">
            <Activity className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-xs font-mono font-bold uppercase text-gray-200 tracking-wider">
              Live Hardware Telemetry Feed ({telemetryFeed.length > 0 ? 'Neon Postgres Stream' : 'Daemon Activity'})
            </span>
          </div>
          <span className="text-[10px] font-mono text-gray-500">
            {telemetryFeed.length > 0 ? `${telemetryFeed.length} live records` : 'Auto-scrolling stream | Capped backoff 60s'}
          </span>
        </div>
        <div className="bg-[#07090e] border border-gray-900 text-gray-300 p-3 font-mono text-[11px] rounded-none h-36 overflow-y-auto space-y-1">
          {telemetryFeed.length > 0 ? (
            telemetryFeed.slice(0, 20).map((log) => (
              <div key={log.id} className="flex flex-wrap items-center space-x-2">
                <span className="text-gray-600">[{new Date(log.recordedAt).toLocaleTimeString()}]</span>
                <span className="text-gray-300 font-semibold">
                  {log.device?.name || log.deviceId}:
                </span>
                <span className="text-gray-400">
                  CPU: <span className="text-gray-200 font-mono">{log.cpuUsage}%</span> | RAM: <span className="text-gray-200 font-mono">{log.ramUsage}%</span> | Disk: <span className="text-gray-200 font-mono">{log.diskUsage}%</span> | Uptime: {Math.round(log.uptimeSeconds)}s
                </span>
                {log.temperature && (
                  <span className="text-gray-400">| Temp: {log.temperature}°C</span>
                )}
              </div>
            ))
          ) : (
            agentLogs.map((log) => (
              <div key={log.id} className="flex space-x-2">
                <span className="text-gray-600">[{log.time}]</span>
                <span
                  className={
                    log.type === 'warn'
                      ? 'text-gray-300 font-semibold'
                      : log.type === 'error'
                      ? 'text-white underline'
                      : 'text-gray-400'
                  }
                >
                  {log.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>


      {/* Modal: Add Device with strict Zod Validation (Dark Theme) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#131926] border border-gray-700 max-w-lg w-full p-6 text-gray-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
              <h2 className="text-sm font-bold uppercase font-mono tracking-wider text-gray-100">
                Register New Hardware Node
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-gray-200 font-mono text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDevice} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-gray-400 mb-1">
                  Serial Number (Unique Hardware ID) *
                </label>
                <input
                  type="text"
                  value={formData.serialNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, serialNumber: e.target.value })
                  }
                  placeholder="e.g. SRV-RACK-902X"
                  className="w-full p-2 bg-[#0b0f17] border border-gray-700 text-gray-100 focus:outline-none focus:border-gray-400"
                />
                {formErrors.serialNumber && (
                  <p className="text-gray-300 font-semibold mt-1 text-[11px]">
                    ⚠ {formErrors.serialNumber}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 mb-1">Device Hostname *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Storage Alpha"
                    className="w-full p-2 bg-[#0b0f17] border border-gray-700 text-gray-100 focus:outline-none focus:border-gray-400"
                  />
                  {formErrors.name && (
                    <p className="text-gray-300 font-semibold mt-1 text-[11px]">
                      ⚠ {formErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">Hardware Model *</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="e.g. Dell PowerEdge R740"
                    className="w-full p-2 bg-[#0b0f17] border border-gray-700 text-gray-100 focus:outline-none focus:border-gray-400"
                  />
                  {formErrors.model && (
                    <p className="text-gray-300 font-semibold mt-1 text-[11px]">
                      ⚠ {formErrors.model}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 mb-1">IPv4 Address *</label>
                  <input
                    type="text"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    placeholder="192.168.1.100"
                    className="w-full p-2 bg-[#0b0f17] border border-gray-700 text-gray-100 focus:outline-none focus:border-gray-400"
                  />
                  {formErrors.ipAddress && (
                    <p className="text-gray-300 font-semibold mt-1 text-[11px]">
                      ⚠ {formErrors.ipAddress}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">MAC Address *</label>
                  <input
                    type="text"
                    value={formData.macAddress}
                    onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })}
                    placeholder="00:1A:2B:3C:4D:5E"
                    className="w-full p-2 bg-[#0b0f17] border border-gray-700 text-gray-100 focus:outline-none focus:border-gray-400"
                  />
                  {formErrors.macAddress && (
                    <p className="text-gray-300 font-semibold mt-1 text-[11px]">
                      ⚠ {formErrors.macAddress}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Physical Location / Rack *</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Datacenter B - Row 3, Rack 12"
                  className="w-full p-2 bg-[#0b0f17] border border-gray-700 text-gray-100 focus:outline-none focus:border-gray-400"
                />
                {formErrors.location && (
                  <p className="text-gray-300 font-semibold mt-1 text-[11px]">
                    ⚠ {formErrors.location}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Initial Status</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as DeviceStatus })
                  }
                  className="w-full p-2 bg-[#0b0f17] border border-gray-700 text-gray-100 focus:outline-none focus:border-gray-400"
                >
                  <option value="ONLINE">ONLINE</option>
                  <option value="OFFLINE">OFFLINE</option>
                  <option value="DEGRADED">DEGRADED</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-gray-100 text-gray-950 font-bold hover:bg-white cursor-pointer"
                >
                  Commit Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceDashboard;
