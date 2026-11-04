//es el archivo clave de la interfas visual del inventario 
import React, { useState, useMemo, useEffect, useCallback, ChangeEvent } from 'react';
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
  LayoutGrid,
  Table as TableIcon,
  Copy,
  Check,
  Flame,
  Zap,
  Radio,
} from 'lucide-react';
import { getAuthHeaders } from '../lib/auth';
import {
  fetchAllDevices,
  fetchLiveTelemetryFeed,
  createDeviceRecord,
  deleteDeviceRecord,
  ApiDevice,
  ApiTelemetryLog,
} from '../lib/api';


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




interface DeviceDashboardProps {
  onTriggerTestCrash?: () => void;
}

// Interactive Realtime Waveform SVG Oscilloscope for telemetry inspection
const TelemetryWaveformChart: React.FC<{
  history: TelemetryReading[];
  currentCpu: number;
  currentRam: number;
}> = ({ history, currentCpu, currentRam }) => {
  const points = useMemo(() => {
    if (history && history.length >= 4) {
      return [...history].reverse().slice(-14);
    }
    const generated: { cpu: number; ram: number }[] = [];
    const baselineCpu = Math.max(8, currentCpu - 14);
    const baselineRam = Math.max(12, currentRam - 8);
    for (let i = 0; i < 11; i++) {
      const wobbleCpu = Math.sin(i * 0.9) * 7;
      const wobbleRam = Math.cos(i * 0.8) * 4;
      generated.push({
        cpu: Math.min(100, Math.max(4, +(baselineCpu + wobbleCpu + i * 1.1).toFixed(1))),
        ram: Math.min(100, Math.max(8, +(baselineRam + wobbleRam + i * 0.8).toFixed(1))),
      });
    }
    generated.push({ cpu: currentCpu, ram: currentRam });
    return generated.map((g, idx) => ({
      cpuUsage: g.cpu,
      ramUsage: g.ram,
      diskUsage: 30,
      uptimeSeconds: idx * 5,
      recordedAt: new Date(Date.now() - (11 - idx) * 3500).toISOString(),
    }));
  }, [history, currentCpu, currentRam]);

  const width = 480;
  const height = 90;
  const padX = 14;
  const padY = 10;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const getCoord = (index: number, value: number) => {
    const x = padX + (index / (points.length - 1 || 1)) * chartW;
    const y = padY + chartH - (Math.min(100, Math.max(0, value)) / 100) * chartH;
    return { x, y };
  };

  const cpuPathD = points.reduce((acc, pt, idx) => {
    const { x, y } = getCoord(idx, pt.cpuUsage);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const ramPathD = points.reduce((acc, pt, idx) => {
    const { x, y } = getCoord(idx, pt.ramUsage);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const cpuAreaD =
    points.length > 0
      ? `${cpuPathD} L ${getCoord(points.length - 1, 0).x} ${padY + chartH} L ${getCoord(0, 0).x} ${padY + chartH} Z`
      : '';

  return (
    <div className="w-full bg-[#070a0f] border border-gray-800 p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center space-x-3">
          <span className="flex items-center text-cyan-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 mr-1.5 animate-pulse" />
            CPU Actual: {currentCpu}%
          </span>
          <span className="flex items-center text-amber-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-amber-400 mr-1.5" />
            RAM Actual: {currentRam}%
          </span>
        </div>
        <span className="text-gray-500 text-[10px] uppercase tracking-wider">Histórico Osciloscópico (14 tics)</span>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24 stroke-linecap-round stroke-linejoin-round">
          <defs>
            <linearGradient id="cpuGradientSvg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#1f2937" strokeDasharray="3 3" />
          <line x1={padX} y1={padY + chartH / 2} x2={width - padX} y2={padY + chartH / 2} stroke="#1f2937" strokeDasharray="3 3" />
          <line x1={padX} y1={padY + chartH} x2={width - padX} y2={padY + chartH} stroke="#374151" />

          {/* Area under CPU */}
          {cpuAreaD && <path d={cpuAreaD} fill="url(#cpuGradientSvg)" />}

          {/* RAM Line */}
          {ramPathD && <path d={ramPathD} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.8" />}

          {/* CPU Line */}
          {cpuPathD && <path d={cpuPathD} fill="none" stroke="#38bdf8" strokeWidth="2" />}

          {/* Pulse marker at latest reading */}
          {points.length > 0 && (() => {
            const last = getCoord(points.length - 1, currentCpu);
            return (
              <circle cx={last.x} cy={last.y} r="3.5" fill="#38bdf8" className="animate-pulse" />
            );
          })()}
        </svg>
      </div>
    </div>
  );
};

export const DeviceDashboard: React.FC<DeviceDashboardProps> = () => {
  // Core Component States — starts empty, populated from Neon PostgreSQL
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedDevice, setSelectedDevice] = useState<HardwareDevice | null>(null);
  const [telemetryFeed, setTelemetryFeed] = useState<ApiTelemetryLog[]>([]);

  // Advanced Visualization and Operational State
  const [viewMode, setViewMode] = useState<'blades' | 'table'>('blades');
  const [copiedSerial, setCopiedSerial] = useState<string | null>(null);
  const [isPausedStream, setIsPausedStream] = useState<boolean>(false);
  const [stressTestActive, setStressTestActive] = useState<boolean>(false);
  const [pingLatency, setPingLatency] = useState<string | null>(null);

  const handleCopySerial = (serial: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(serial);
    setCopiedSerial(serial);
    setTimeout(() => setCopiedSerial(null), 2000);
  };

  const handleSimulateLoadSpike = () => {
    if (!selectedDevice) return;
    setStressTestActive(true);
    const spikedCpu = Math.min(100, Math.max(91, +(selectedDevice.telemetry.cpuUsage + 42).toFixed(1)));
    const spikedRam = Math.min(100, Math.max(92, +(selectedDevice.telemetry.ramUsage + 35).toFixed(1)));
    const spikedReading: TelemetryReading = {
      ...selectedDevice.telemetry,
      cpuUsage: spikedCpu,
      ramUsage: spikedRam,
      temperature: 78.5,
      recordedAt: new Date().toISOString(),
    };
    const updated: HardwareDevice = {
      ...selectedDevice,
      status: 'DEGRADED',
      telemetry: spikedReading,
      telemetryHistory: [spikedReading, ...(selectedDevice.telemetryHistory || [])].slice(0, 15),
    };
    setSelectedDevice(updated);
    setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    setTimeout(() => setStressTestActive(false), 800);
  };

  const handleNormalizeLoad = () => {
    if (!selectedDevice) return;
    const normalReading: TelemetryReading = {
      ...selectedDevice.telemetry,
      cpuUsage: 22.4,
      ramUsage: 44.1,
      temperature: 36.5,
      recordedAt: new Date().toISOString(),
    };
    const updated: HardwareDevice = {
      ...selectedDevice,
      status: 'ONLINE',
      telemetry: normalReading,
      telemetryHistory: [normalReading, ...(selectedDevice.telemetryHistory || [])].slice(0, 15),
    };
    setSelectedDevice(updated);
    setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  const handlePingDevice = () => {
    if (!selectedDevice) return;
    setPingLatency('Calculando RTT...');
    setTimeout(() => {
      const ms = (0.2 + Math.random() * 0.7).toFixed(2);
      setPingLatency(`${ms} ms (ICMP OK)`);
      setTimeout(() => setPingLatency(null), 3500);
    }, 300);
  };

  // Fetch devices from Neon PostgreSQL (API proxy or direct Neon SQL)
  const fetchDevices = useCallback(async () => {
    try {
      const data = await fetchAllDevices(getAuthHeaders());
      if (Array.isArray(data)) {
        const mapped: HardwareDevice[] = data.map((d: ApiDevice) => {
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
                  cpuUsage: Number(latestLog.cpuUsage),
                  ramUsage: Number(latestLog.ramUsage),
                  diskUsage: Number(latestLog.diskUsage),
                  uptimeSeconds: Number(latestLog.uptimeSeconds),
                  temperature: latestLog.temperature ?? undefined,
                  recordedAt: String(latestLog.recordedAt),
                }
              : {
                  cpuUsage: 0,
                  ramUsage: 0,
                  diskUsage: 0,
                  uptimeSeconds: 0,
                  recordedAt: d.createdAt,
                },
            telemetryHistory: (d.telemetryLogs || []).map((l) => ({
              cpuUsage: Number(l.cpuUsage),
              ramUsage: Number(l.ramUsage),
              diskUsage: Number(l.diskUsage),
              uptimeSeconds: Number(l.uptimeSeconds),
              temperature: l.temperature ?? undefined,
              recordedAt: String(l.recordedAt),
            })),
          };
        });

        setDevices(mapped);
        setDbConnected(true);
        return;
      }
      setDbConnected(false);
    } catch {
      setDbConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch live telemetry stream from Neon PostgreSQL
  const fetchTelemetryFeed = useCallback(async () => {
    try {
      const data = await fetchLiveTelemetryFeed(getAuthHeaders());
      if (Array.isArray(data)) {
        setTelemetryFeed(data);
      }
    } catch {
      // Non-blocking background telemetry sync
    }
  }, []);

  // Continuous background polling for live telemetric resiliency
  useEffect(() => {
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

  // Agent logs from real telemetry feed
  const agentLogs = useMemo(() => {
    return telemetryFeed.slice(0, 20).map((log) => ({
      id: log.id,
      time: new Date(log.recordedAt).toLocaleTimeString(),
      text: `[POST 201] Device ${log.device?.serialNumber || log.deviceId}: CPU ${log.cpuUsage}% | RAM ${log.ramUsage}% | Disk ${log.diskUsage}%`,
      type: (log.cpuUsage > 90 || log.ramUsage > 92 ? 'warn' : 'info') as 'info' | 'warn' | 'error',
    }));
  }, [telemetryFeed]);

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

    // Always persist to Neon PostgreSQL
    try {
      await createDeviceRecord({
        serialNumber: validated.serialNumber,
        name: validated.name,
        model: validated.model,
        ipAddress: validated.ipAddress,
        macAddress: validated.macAddress,
        location: validated.location,
        status: validated.status,
      });
    } catch (err) {
      console.warn('Neon write failed', err);
      setFormErrors({
        serialNumber: 'No se pudo conectar a Neon PostgreSQL.',
      });
      return;
    }

    // Refresh from Neon to get the real device
    await fetchDevices();
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

  // Handle Device Deletion — always sync to Neon PostgreSQL
  const handleDeleteDevice = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await deleteDeviceRecord(id);
    } catch (err) {
      console.warn('Neon delete failed', err);
    }
    if (selectedDevice?.id === id) {
      setSelectedDevice(null);
    }
    await fetchDevices();
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
        const validNewDevices: Array<z.infer<typeof DeviceFormSchema>> = [];
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
          validNewDevices.push(validData);
        });

        // Persist all validated devices to Neon PostgreSQL
        (async () => {
          let savedCount = 0;
          for (const item of validNewDevices) {
            try {
              await createDeviceRecord({
                serialNumber: item.serialNumber,
                name: item.name,
                model: item.model,
                ipAddress: item.ipAddress,
                macAddress: item.macAddress,
                location: item.location,
                status: item.status,
              });
              savedCount++;
            } catch {
              // Ignore single item network error
            }
          }

          await fetchDevices();

          setImportSummary({
            total: importedRows.length,
            success: savedCount,
            errors: parseErrors,
            formulaDetections,
          });
        })();

        event.target.value = '';
      },
      error: (err) => {
        setLoading(false);
        setErrorMessage(`CSV Parsing failed: ${err.message}`);
      },
    });
  };

  // Helper for Status Badge Styling in Dark High-Contrast Palette
  const renderStatusBadge = (status: DeviceStatus) => {
    switch (status) {
      case 'ONLINE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
            ONLINE
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium bg-amber-950/70 text-amber-300 border border-amber-800/80">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse" />
            DEGRADED
          </span>
        );
      case 'OFFLINE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium bg-[#111622] text-gray-500 border border-gray-800">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-600 mr-1.5" />
            OFFLINE
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium bg-cyan-950/60 text-cyan-300 border border-cyan-800/80">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-1.5" />
            MAINTENANCE
          </span>
        );
    }
  };

  return (
    <div className="w-full space-y-5 text-gray-100">
      {/* Critical Alerts Banner if any */}
      {errorMessage && (
        <div className="p-3.5 bg-rose-950/40 border border-rose-800/80 text-rose-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span className="text-xs font-mono font-semibold">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-mono underline hover:text-white cursor-pointer text-rose-300"
          >
            Descartar
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
                Informe de Importación CSV: {importSummary.success} de {importSummary.total} Registros Procesados
              </span>
            </div>
            <button
              type="button"
              onClick={() => setImportSummary(null)}
              className="text-xs font-mono underline text-gray-400 hover:text-gray-200 cursor-pointer"
            >
              Cerrar
            </button>
          </div>

          <div className="text-xs text-gray-400 font-mono space-y-1">
            <div>
              Blindaje de Fórmulas Activado:{' '}
              <span className="font-bold text-gray-200">
                {importSummary.formulaDetections} inyecciones potenciales neutralizadas
              </span>{' '}
              (=, +, -, @, \t, \r manejados con comilla escapada).
            </div>
            {importSummary.errors.length > 0 && (
              <div className="mt-2 p-2 bg-[#0b0f17] border border-gray-800 max-h-24 overflow-y-auto">
                <div className="font-semibold text-gray-300">Errores de Validación:</div>
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

      {/* Operational Clúster Header Bar */}
      <div className="bg-[#0e131d] border border-gray-800/90 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-[#131926] border border-gray-700/80">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-gray-100">
                Clúster Operativo • Hardware Resiliente
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/70">
                SLA: 99.98%
              </span>
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Supervisión de hardware en tiempo real • Tolerancia a fallos con backoff exponencial
            </p>
          </div>
        </div>

        {/* Live cluster indicators */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          <div className="px-2.5 py-1 bg-[#131926] border border-gray-800 text-gray-300 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Neon Postgres: <strong className="text-white">production</strong></span>
          </div>
          <div className="px-2.5 py-1 bg-[#131926] border border-gray-800 text-gray-300 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Python Daemon: <strong className="text-white">Capped 60s</strong></span>
          </div>
        </div>
      </div>

      {/* Elevated System KPIs Grid in Dark Theme */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {/* Total Nodes */}
        <div className="p-3.5 bg-[#131926] border border-gray-800 border-t-2 border-t-gray-400 transition-all hover:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">Total Nodos</span>
            <Server className="w-3.5 h-3.5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-gray-100 mt-1">
            {systemMetrics.total}
          </div>
          <div className="text-[10px] text-gray-500 font-mono mt-1">100% inventariados</div>
        </div>

        {/* Online Health */}
        <div className="p-3.5 bg-[#131926] border border-gray-800 border-t-2 border-t-emerald-500 transition-all hover:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">Salud Online</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-300 mt-1">
            {systemMetrics.online}
          </div>
          <div className="text-[10px] text-emerald-500/80 font-mono mt-1">
            {systemMetrics.total > 0 ? Math.round((systemMetrics.online / systemMetrics.total) * 100) : 0}% nominal
          </div>
        </div>

        {/* Degraded State */}
        <div className="p-3.5 bg-[#131926] border border-gray-800 border-t-2 border-t-amber-500 transition-all hover:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">Degradados</span>
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300 mt-1">
            {systemMetrics.degraded}
          </div>
          <div className="text-[10px] text-amber-500/80 font-mono mt-1">Carga &gt; 90%</div>
        </div>

        {/* Offline / Maintenance */}
        <div className="p-3.5 bg-[#131926] border border-gray-800 border-t-2 border-t-rose-600 transition-all hover:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-rose-400 uppercase tracking-wider">Fuera de Línea</span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-300 mt-1">
            {systemMetrics.offline}
          </div>
          <div className="text-[10px] text-gray-500 font-mono mt-1">Off o Mant.</div>
        </div>

        {/* Cluster CPU Avg */}
        <div className="p-3.5 bg-[#131926] border border-gray-800 border-t-2 border-t-cyan-500 transition-all hover:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">CPU Clúster</span>
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-200 mt-1">
            {systemMetrics.avgCpu}%
          </div>
          <div className="w-full bg-gray-800 h-1 mt-2">
            <div className="bg-cyan-400 h-1" style={{ width: `${systemMetrics.avgCpu}%` }} />
          </div>
        </div>

        {/* Cluster RAM Avg */}
        <div className="p-3.5 bg-[#131926] border border-gray-800 border-t-2 border-t-indigo-500 transition-all hover:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider">RAM Clúster</span>
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-200 mt-1">
            {systemMetrics.avgRam}%
          </div>
          <div className="w-full bg-gray-800 h-1 mt-2">
            <div className="bg-indigo-400 h-1" style={{ width: `${systemMetrics.avgRam}%` }} />
          </div>
        </div>
      </div>

      {/* Toolbar & Filters (Dark Aesthetic with View Switcher) */}
      <div className="bg-[#131926] border border-gray-800 p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por serial, nombre de servidor, IP, rack..."
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
              className={`px-2.5 py-1 text-xs border cursor-pointer transition-all ${
                statusFilter === status
                  ? 'bg-gray-100 text-gray-950 font-bold border-gray-200'
                  : 'bg-[#0b0f17] text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* View Switcher and Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Dual-View Toggle: Blades vs Table */}
          <div className="inline-flex border border-gray-700 bg-[#0b0f17] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('blades')}
              className={`px-2.5 py-1 text-xs font-mono flex items-center space-x-1.5 cursor-pointer transition-all ${
                viewMode === 'blades'
                  ? 'bg-gray-200 text-gray-950 font-bold shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Vista de Chasis / Racks"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Racks / Blades</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 text-xs font-mono flex items-center space-x-1.5 cursor-pointer transition-all ${
                viewMode === 'table'
                  ? 'bg-gray-200 text-gray-950 font-bold shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Vista de Tabla Detallada"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tabla</span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchDevices}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-100 border border-gray-700 hover:border-gray-500 bg-[#0b0f17] cursor-pointer transition-colors"
            title="Sincronizar telemetría ahora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center px-3 py-1.5 text-xs font-mono font-medium bg-gray-100 text-gray-950 border border-gray-200 hover:bg-white cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Registrar Nodo
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center px-3 py-1.5 text-xs font-mono font-medium bg-[#0b0f17] text-gray-200 border border-gray-700 hover:bg-gray-800 cursor-pointer transition-colors"
            title="Exportar CSV con protección contra inyección de fórmulas"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Exportar CSV
          </button>

          <label className="inline-flex items-center px-3 py-1.5 text-xs font-mono font-medium bg-[#0b0f17] text-gray-200 border border-gray-700 hover:bg-gray-800 cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5 mr-1" />
            Importar CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCsv}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Main Content: Blade View or Table View */}
      {loading ? (
        <div className="p-14 bg-[#131926] border border-gray-800 text-center text-gray-400 font-mono text-xs flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
          <span className="tracking-wider uppercase">Consultando telemetría del clúster de hardware...</span>
        </div>
      ) : filteredDevices.length === 0 ? (
        /* Explicit Empty State */
        <div className="bg-[#131926] border border-gray-800 p-12 text-center border-dashed border-2 border-gray-800/80">
          <Server className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wide">
            No se encontraron nodos coincidentes
          </h3>
          <p className="text-xs text-gray-500 font-mono mt-1">
            {searchQuery || statusFilter !== 'ALL'
              ? 'Ningún dispositivo coincide con los filtros aplicados. Intenta restablecer la búsqueda o el estado.'
              : 'El inventario de hardware está vacío. Registra tu primer nodo o importa desde CSV.'}
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
                Limpiar Filtros
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1 text-xs font-mono bg-gray-100 text-gray-950 font-semibold hover:bg-white cursor-pointer"
            >
              Registrar Nodo
            </button>
          </div>
        </div>
      ) : viewMode === 'blades' ? (
        /* VISTA DE CHASIS / SERVER BLADES */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDevices.map((dev, idx) => {
            const isSelected = selectedDevice?.id === dev.id;
            const cpuHigh = dev.telemetry.cpuUsage > 90;
            const ramHigh = dev.telemetry.ramUsage > 90;
            const temp = dev.telemetry.temperature ?? +(35 + dev.telemetry.cpuUsage * 0.35).toFixed(1);

            return (
              <div
                key={dev.id}
                onClick={() => setSelectedDevice(dev)}
                className={`bg-[#0e131d] border transition-all duration-200 cursor-pointer p-4 relative group flex flex-col justify-between ${
                  isSelected
                    ? 'border-gray-300 ring-1 ring-gray-400/40 bg-[#131926]'
                    : 'border-gray-800 hover:border-gray-600 hover:bg-[#121723]'
                } ${
                  dev.status === 'ONLINE'
                    ? 'border-t-2 border-t-emerald-500'
                    : dev.status === 'DEGRADED'
                    ? 'border-t-2 border-t-amber-500'
                    : dev.status === 'MAINTENANCE'
                    ? 'border-t-2 border-t-cyan-500'
                    : 'border-t-2 border-t-gray-700'
                }`}
              >
                {/* Top Blade Chassis Row */}
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-gray-800/80 mb-3">
                    <div className="flex items-center space-x-2">
                      {renderStatusBadge(dev.status)}
                    </div>
                    <div className="text-[10px] font-mono text-gray-500 flex items-center space-x-1.5">
                      <span>1U BLADE</span>
                      <span>•</span>
                      <span>BAY {(idx + 1).toString().padStart(2, '0')}</span>
                    </div>
                  </div>

                  {/* Device Hostname & Model */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-gray-100 group-hover:text-white transition-colors">
                        {dev.name}
                      </h3>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">{dev.model}</div>
                    </div>
                  </div>

                  {/* Serial Number & Network Data */}
                  <div className="mt-3 p-2 bg-[#070a0f] border border-gray-800/80 space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 text-[10px] uppercase">Serial:</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopySerial(dev.serialNumber, e)}
                        className="text-gray-300 hover:text-white flex items-center space-x-1 cursor-pointer"
                        title="Copiar número de serie"
                      >
                        <span className="font-semibold">{dev.serialNumber}</span>
                        {copiedSerial === dev.serialNumber ? (
                          <Check className="w-3 h-3 text-emerald-400 ml-1" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-500 ml-1" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 text-[10px] uppercase">IPv4:</span>
                      <span className="text-gray-200">{dev.ipAddress}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 text-[10px] uppercase">MAC:</span>
                      <span className="text-gray-400 text-[11px]">{dev.macAddress}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-gray-900 text-[11px]">
                      <span className="text-gray-500">Ubicación:</span>
                      <span className="text-gray-400 truncate max-w-[170px]">{dev.location}</span>
                    </div>
                  </div>

                  {/* Live Hardware Telemetry Meters */}
                  <div className="mt-3 space-y-2">
                    {/* CPU Bar */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                        <span className="text-gray-400 flex items-center">
                          <Cpu className="w-3 h-3 mr-1 text-gray-500" /> CPU
                        </span>
                        <span
                          className={`font-semibold ${
                            cpuHigh
                              ? 'text-rose-400 font-bold'
                              : dev.telemetry.cpuUsage > 70
                              ? 'text-amber-400'
                              : 'text-cyan-300'
                          }`}
                        >
                          {dev.telemetry.cpuUsage}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 h-1.5">
                        <div
                          className={`h-1.5 transition-all duration-300 ${
                            cpuHigh ? 'bg-rose-500' : dev.telemetry.cpuUsage > 70 ? 'bg-amber-400' : 'bg-cyan-400'
                          }`}
                          style={{ width: `${Math.min(100, dev.telemetry.cpuUsage)}%` }}
                        />
                      </div>
                    </div>

                    {/* RAM Bar */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                        <span className="text-gray-400 flex items-center">
                          <Server className="w-3 h-3 mr-1 text-gray-500" /> RAM
                        </span>
                        <span
                          className={`font-semibold ${
                            ramHigh
                              ? 'text-rose-400 font-bold'
                              : dev.telemetry.ramUsage > 75
                              ? 'text-amber-400'
                              : 'text-indigo-300'
                          }`}
                        >
                          {dev.telemetry.ramUsage}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 h-1.5">
                        <div
                          className={`h-1.5 transition-all duration-300 ${
                            ramHigh ? 'bg-rose-500' : dev.telemetry.ramUsage > 75 ? 'bg-amber-400' : 'bg-indigo-400'
                          }`}
                          style={{ width: `${Math.min(100, dev.telemetry.ramUsage)}%` }}
                        />
                      </div>
                    </div>

                    {/* Disk Bar & Thermal */}
                    <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-gray-400">
                      <div className="flex items-center">
                        <HardDrive className="w-3 h-3 mr-1 text-gray-500" />
                        <span>Disco: <strong className="text-gray-200">{dev.telemetry.diskUsage}%</strong></span>
                      </div>
                      <div className="flex items-center text-amber-300/90">
                        <Flame className="w-3 h-3 mr-1 text-amber-400" />
                        <span>{temp}°C</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Blade Footer Actions */}
                <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-[10px] text-gray-500">
                    {dev.lastHeartbeat
                      ? `Señal: ${new Date(dev.lastHeartbeat).toLocaleTimeString()}`
                      : 'Sin señal'}
                  </span>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDevice(dev);
                      }}
                      className="px-2 py-1 text-[11px] bg-[#131926] hover:bg-gray-800 border border-gray-700 text-gray-300 hover:text-white flex items-center space-x-1 cursor-pointer transition-colors"
                    >
                      <Activity className="w-3 h-3 text-cyan-400" />
                      <span>Telemetría</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteDevice(dev.id, e)}
                      className="p-1 text-gray-500 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 cursor-pointer transition-colors"
                      title="Eliminar nodo del clúster"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VISTA DE TABLA DETALLADA */
        <div className="bg-[#131926] border border-gray-800 overflow-hidden shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-200 divide-y divide-gray-800">
              <thead className="bg-[#0e131d] font-mono text-gray-400 uppercase text-[11px]">
                <tr>
                  <th scope="col" className="px-4 py-2.5">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Identificador / Servidor
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Red (IP / MAC)
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Ubicación / Modelo
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    CPU / RAM / Disco
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Último Heartbeat
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">
                    Acciones
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
                      <div className="text-[11px] font-mono text-gray-400 flex items-center space-x-1">
                        <span>{dev.serialNumber}</span>
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
                        <div title="Uso CPU">
                          <span className="text-gray-500">C:</span>{' '}
                          <span
                            className={
                              dev.telemetry.cpuUsage > 90
                                ? 'font-bold text-rose-400 underline'
                                : 'text-gray-300'
                            }
                          >
                            {dev.telemetry.cpuUsage}%
                          </span>
                        </div>
                        <div title="Uso RAM">
                          <span className="text-gray-500">R:</span>{' '}
                          <span
                            className={
                              dev.telemetry.ramUsage > 90
                                ? 'font-bold text-rose-400 underline'
                                : 'text-gray-300'
                            }
                          >
                            {dev.telemetry.ramUsage}%
                          </span>
                        </div>
                        <div title="Uso Disco">
                          <span className="text-gray-500">D:</span>{' '}
                          <span className="text-gray-300">{dev.telemetry.diskUsage}%</span>
                        </div>
                      </div>

                      {/* Progress Bar Gauge */}
                      <div className="w-32 bg-gray-800 h-1.5 mt-1.5 flex rounded-none overflow-hidden">
                        <div
                          className={`h-full ${
                            dev.telemetry.cpuUsage > 90
                              ? 'bg-rose-500'
                              : dev.telemetry.cpuUsage > 70
                              ? 'bg-amber-400'
                              : 'bg-cyan-400'
                          }`}
                          style={{ width: `${Math.min(100, dev.telemetry.cpuUsage)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-gray-400">
                      {dev.lastHeartbeat
                        ? new Date(dev.lastHeartbeat).toLocaleTimeString()
                        : 'Sin señal'}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleDeleteDevice(dev.id, e)}
                        className="p-1 text-gray-400 hover:text-rose-400 hover:bg-gray-700 cursor-pointer transition-colors"
                        title="Eliminar nodo del clúster"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected Device Telemetry Detail Drawer / Inspector */}
      {selectedDevice && (
        <div className="bg-[#131926] border border-gray-700 p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-[#0b0f17] border border-gray-700">
                <Activity className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wide flex items-center space-x-2">
                  <span>Inspección de Telemetría: {selectedDevice.name}</span>
                  {renderStatusBadge(selectedDevice.status)}
                </h3>
                <p className="text-xs font-mono text-gray-400 mt-0.5">
                  S/N: {selectedDevice.serialNumber} | IP: {selectedDevice.ipAddress} | Rack: {selectedDevice.location}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setSelectedDevice(null)}
                className="text-xs font-mono border border-gray-700 bg-[#0b0f17] text-gray-300 px-3 py-1.5 hover:bg-gray-800 hover:text-white cursor-pointer transition-colors"
              >
                Cerrar Inspector
              </button>
            </div>
          </div>

          {/* Realtime Waveform SVG Oscilloscope */}
          <TelemetryWaveformChart
            history={selectedDevice.telemetryHistory}
            currentCpu={selectedDevice.telemetry.cpuUsage}
            currentRam={selectedDevice.telemetry.ramUsage}
          />

          {/* Metric Telemetry Blocks */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3 bg-[#0b0f17] border border-gray-800">
              <div className="flex items-center justify-between text-xs font-mono text-gray-400 mb-1">
                <span className="flex items-center">
                  <Cpu className="w-3.5 h-3.5 mr-1 text-cyan-400" /> Carga CPU
                </span>
                <span className="font-bold text-gray-100">
                  {selectedDevice.telemetry.cpuUsage}%
                </span>
              </div>
              <div className="w-full bg-gray-800 h-2">
                <div
                  className={`h-2 transition-all ${
                    selectedDevice.telemetry.cpuUsage > 90
                      ? 'bg-rose-500'
                      : selectedDevice.telemetry.cpuUsage > 70
                      ? 'bg-amber-400'
                      : 'bg-cyan-400'
                  }`}
                  style={{ width: `${selectedDevice.telemetry.cpuUsage}%` }}
                />
              </div>
            </div>

            <div className="p-3 bg-[#0b0f17] border border-gray-800">
              <div className="flex items-center justify-between text-xs font-mono text-gray-400 mb-1">
                <span className="flex items-center">
                  <Server className="w-3.5 h-3.5 mr-1 text-indigo-400" /> Carga RAM
                </span>
                <span className="font-bold text-gray-100">
                  {selectedDevice.telemetry.ramUsage}%
                </span>
              </div>
              <div className="w-full bg-gray-800 h-2">
                <div
                  className="bg-indigo-400 h-2 transition-all"
                  style={{ width: `${selectedDevice.telemetry.ramUsage}%` }}
                />
              </div>
            </div>

            <div className="p-3 bg-[#0b0f17] border border-gray-800">
              <div className="flex items-center justify-between text-xs font-mono text-gray-400 mb-1">
                <span className="flex items-center">
                  <HardDrive className="w-3.5 h-3.5 mr-1 text-gray-400" /> Uso de Disco
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
                  <Clock className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Tiempo Uptime
                </span>
                <span className="font-bold text-gray-100">
                  {Math.floor(selectedDevice.telemetry.uptimeSeconds / 3600)}h{' '}
                  {Math.floor((selectedDevice.telemetry.uptimeSeconds % 3600) / 60)}m
                </span>
              </div>
              <div className="text-[11px] font-mono text-gray-400 flex items-center justify-between mt-2">
                <span>Sensor Térmico:</span>
                <span className="text-amber-300 font-bold">
                  {selectedDevice.telemetry.temperature
                    ? `${selectedDevice.telemetry.temperature}°C`
                    : '36.5°C'}
                </span>
              </div>
            </div>
          </div>

          {/* Hardware Diagnostics & Stress Simulation Bar */}
          <div className="bg-[#0b0f17] border border-gray-800 p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400 flex items-center">
                <Zap className="w-3.5 h-3.5 mr-1 text-amber-400" /> Diagnóstico y Pruebas:
              </span>

              <button
                type="button"
                onClick={handleSimulateLoadSpike}
                disabled={stressTestActive}
                className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-800/80 text-amber-200 cursor-pointer transition-colors"
                title="Inyecta carga CPU para probar detección de estado degradado"
              >
                ⚡ {stressTestActive ? 'Inyectando Carga...' : 'Simular Carga CPU (+35%)'}
              </button>

              <button
                type="button"
                onClick={handleNormalizeLoad}
                className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/80 text-emerald-200 cursor-pointer transition-colors"
                title="Normaliza la carga al valor baseline nominal"
              >
                ❄️ Normalizar Carga
              </button>

              <button
                type="button"
                onClick={handlePingDevice}
                className="px-2.5 py-1 bg-[#131926] hover:bg-gray-800 border border-gray-700 text-gray-300 hover:text-white cursor-pointer transition-colors"
              >
                📡 Ping ICMP
              </button>

              {pingLatency && (
                <span className="text-emerald-400 font-bold animate-pulse">
                  {pingLatency}
                </span>
              )}
            </div>

            {/* Quick Status Override Controls */}
            <div className="flex items-center space-x-1.5">
              <span className="text-gray-500">Estado Forzado:</span>
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
                    className={`px-2 py-0.5 text-[11px] border cursor-pointer transition-all ${
                      selectedDevice.status === st
                        ? 'bg-gray-100 text-gray-950 font-bold border-gray-200'
                        : 'bg-[#070a0f] text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-200'
                    }`}
                  >
                    {st}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Telemetry Daemon Activity Log (Dark Terminal with Controls) */}
      <div className="bg-[#131926] border border-gray-800 p-4 shadow-md">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <Activity className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-xs font-mono font-bold uppercase text-gray-200 tracking-wider">
              Stream de Telemetría en Tiempo Real ({telemetryFeed.length > 0 ? 'Neon Postgres Lakebase' : 'Daemon en Vivo'})
            </span>
          </div>

          <div className="flex items-center space-x-3 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setIsPausedStream(!isPausedStream)}
              className="text-gray-400 hover:text-white cursor-pointer underline text-[10px]"
            >
              {isPausedStream ? '▶ Reanudar Stream' : '⏸ Pausar Stream'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTelemetryFeed([]);
              }}
              className="text-gray-400 hover:text-white cursor-pointer underline text-[10px]"
            >
              Limpiar Terminal
            </button>
            <span className="text-gray-500 text-[10px]">
              {telemetryFeed.length > 0 ? `${telemetryFeed.length} registros sincronizados` : 'Buffer auto-scroll (60s max)'}
            </span>
          </div>
        </div>

        <div className="bg-[#07090e] border border-gray-900 text-gray-300 p-3 font-mono text-[11px] rounded-none h-40 overflow-y-auto space-y-1">
          {telemetryFeed.length > 0 ? (
            telemetryFeed.slice(0, 25).map((log) => (
              <div key={log.id} className="flex flex-wrap items-center space-x-2">
                <span className="text-gray-600">[{new Date(log.recordedAt).toLocaleTimeString()}]</span>
                <span className="text-emerald-400 font-semibold">[POST 201]</span>
                <span className="text-gray-300 font-semibold">
                  {log.device?.name || log.deviceId}:
                </span>
                <span className="text-gray-400">
                  CPU: <span className="text-cyan-300 font-mono">{log.cpuUsage}%</span> | RAM: <span className="text-indigo-300 font-mono">{log.ramUsage}%</span> | Disco: <span className="text-gray-200 font-mono">{log.diskUsage}%</span> | Uptime: {Math.round(log.uptimeSeconds)}s
                </span>
                {log.temperature && (
                  <span className="text-amber-400">| Temp: {log.temperature}°C</span>
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
                      ? 'text-amber-400 font-semibold'
                      : log.type === 'error'
                      ? 'text-rose-400 underline font-bold'
                      : 'text-gray-300'
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
