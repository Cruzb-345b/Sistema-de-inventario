import React, { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DeviceDashboard } from './components/DeviceDashboard';
import { AuthPortal } from './components/AuthPortal';
import { getStoredUser, logoutUser, AuthUser } from './lib/auth';
import {
  Server,
  FolderTree,
  ShieldCheck,
  Terminal,
  Copy,
  Check,
  AlertTriangle,
  Play,
  RotateCcw,
} from 'lucide-react';


type ActiveTab = 'dashboard' | 'codebase' | 'security' | 'agent';

// Repository file tree preview database for the interactive codebase browser
const REPO_FILES: Record<string, { lang: string; description: string; content: string }> = {
  'backend/src/schemas/device.schema.ts': {
    lang: 'typescript',
    description: 'Strict Zod schemas for device registration, updates, queries, and telemetry payloads without any.',
    content: `import { z } from 'zod';

export const DeviceStatusEnum = z.enum(['ONLINE', 'OFFLINE', 'DEGRADED', 'MAINTENANCE']);
export type DeviceStatus = z.infer<typeof DeviceStatusEnum>;

export const CreateDeviceSchema = z.object({
  serialNumber: z.string().trim().min(3).max(64),
  name: z.string().trim().min(2).max(100),
  model: z.string().trim().min(2).max(80),
  ipAddress: z.string().trim().regex(/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/),
  macAddress: z.string().trim().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/),
  location: z.string().trim().min(2).max(120),
  status: DeviceStatusEnum.default('OFFLINE'),
});

export const TelemetryPayloadSchema = z.object({
  cpuUsage: z.number().min(0).max(100),
  ramUsage: z.number().min(0).max(100),
  diskUsage: z.number().min(0).max(100),
  uptimeSeconds: z.number().min(0).default(0.0),
  temperature: z.number().min(-50).max(150).optional(),
});`,
  },
  'backend/src/utils/csvSanitizer.ts': {
    lang: 'typescript',
    description: 'Neutralizes Spreadsheet Formula Injection (=, +, -, @, \\t, \\r) by prepending a single quote.',
    content: `/**
 * CSV Sanitizer to prevent Formula Injection (CWE-1236).
 * Execution characters: '=', '+', '-', '@', '\\t', '\\r'
 */
const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\\t', '\\r'];

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.length === 0) return '';
  if (DANGEROUS_PREFIXES.includes(str.charAt(0))) {
    return \`'\${str}\`;
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
}`,
  },
  'backend/src/middleware/errorHandler.ts': {
    lang: 'typescript',
    description: 'Centralized global error middleware discriminating ZodError (400), Prisma P2002 (409), and generic Error (500).',
    content: `import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      statusCode: 400,
      error: {
        code: 'VALIDATION_ERROR',
        details: err.issues.map(e => ({ field: e.path.join('.'), message: e.message }))
      }
    });
    return;
  }

  if (isPrismaKnownRequestError(err) && err.code === 'P2002') {
    res.status(409).json({
      success: false,
      statusCode: 409,
      error: { code: 'CONFLICT_DUPLICATE_ENTRY', message: 'Unique constraint violation' }
    });
    return;
  }

  res.status(500).json({
    success: false,
    statusCode: 500,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal resilient backend error' }
  });
};`,
  },
  'backend/src/controllers/device.controller.ts': {
    lang: 'typescript',
    description: 'Resilient controller methods wrapped in try/catch delegating to next(error), with sanitized CSV export.',
    content: `// All controller actions wrapped in try/catch delegating to next(error)
public async recordTelemetry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = DeviceParamSchema.parse(req.params);
    const payload = TelemetryPayloadSchema.parse(req.body);

    const device = await prisma.device.findFirst({
      where: { OR: [{ id }, { serialNumber: id }] }
    });
    if (!device) throw new AppError('Device not found', 404);

    const isDegraded = payload.cpuUsage > 90 || payload.ramUsage > 92;
    const computedStatus = isDegraded ? 'DEGRADED' : 'ONLINE';

    const [log] = await prisma.$transaction([
      prisma.telemetryLog.create({
        data: { deviceId: device.id, ...payload }
      }),
      prisma.device.update({
        where: { id: device.id },
        data: { lastHeartbeat: new Date(), status: computedStatus }
      })
    ]);

    res.status(201).json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
}`,
  },
  'backend/prisma/schema.prisma': {
    lang: 'prisma',
    description: 'PostgreSQL database schema with Device and TelemetryLog cascade relations and performance indexes.',
    content: `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum DeviceStatus {
  ONLINE
  OFFLINE
  DEGRADED
  MAINTENANCE
}

model Device {
  id            String         @id @default(uuid())
  serialNumber  String         @unique
  name          String
  model         String
  ipAddress     String
  macAddress    String
  location      String
  status        DeviceStatus   @default(OFFLINE)
  lastHeartbeat DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  telemetryLogs TelemetryLog[]

  @@index([status])
  @@index([serialNumber])
}

model TelemetryLog {
  id            String   @id @default(uuid())
  deviceId      String
  device        Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  cpuUsage      Float
  ramUsage      Float
  diskUsage     Float
  uptimeSeconds Float    @default(0.0)
  temperature   Float?
  recordedAt    DateTime @default(now())

  @@index([deviceId, recordedAt])
}`,
  },
  'agent/agent.py': {
    lang: 'python',
    description: 'Python telemetry daemon: isolated try/except per sensor returning 0.0, and exponential backoff capped at 60s.',
    content: `#!/usr/bin/env python3
import time, os, signal, logging, requests, psutil

MAX_BACKOFF_SECONDS = 60.0
INITIAL_BACKOFF_SECONDS = 1.0

class TelemetryCollector:
    @staticmethod
    def get_cpu_usage() -> float:
        try:
            return round(float(psutil.cpu_percent(interval=0.2)), 2)
        except Exception:
            return 0.0

    @staticmethod
    def get_ram_usage() -> float:
        try:
            return round(float(psutil.virtual_memory().percent), 2)
        except Exception:
            return 0.0

    @staticmethod
    def get_disk_usage() -> float:
        try:
            return round(float(psutil.disk_usage('/').percent), 2)
        except Exception:
            return 0.0

class ResilientDispatcher:
    def __init__(self, endpoint_url: str):
        self.endpoint_url = endpoint_url
        self.current_backoff = INITIAL_BACKOFF_SECONDS

    def dispatch(self, payload: dict) -> bool:
        try:
            resp = requests.post(self.endpoint_url, json=payload, timeout=5.0)
            if resp.status_code in (200, 201):
                self.current_backoff = INITIAL_BACKOFF_SECONDS
                return True
            self._apply_backoff()
            return False
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            self._apply_backoff()
            return False

    def _apply_backoff(self):
        time.sleep(self.current_backoff)
        self.current_backoff = min(self.current_backoff * 2.0, MAX_BACKOFF_SECONDS)`,
  },
  'frontend/src/components/ErrorBoundary.tsx': {
    lang: 'typescript',
    description: 'React Class ErrorBoundary preventing unhandled rendering exceptions from crashing the application.',
    content: `import React, { Component, ErrorInfo, ReactNode } from 'react';

export class ErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { hasError: boolean; error: Error | null }
> {
  public override state = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught UI fault:', error, info);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-[#131823] border border-gray-800 text-gray-100">
          <h2 className="text-base font-bold text-gray-100">CRITICAL SUBSYSTEM FAULT INTERCEPTED</h2>
          <p className="text-xs text-gray-400 font-mono mt-1">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Recover System State
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}`,
  },
};

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedFile, setSelectedFile] = useState<string>('backend/src/utils/csvSanitizer.ts');
  const [copiedFile, setCopiedFile] = useState<boolean>(false);


  // Security Lab Interactive Testing State
  const [testFormulaInput, setTestFormulaInput] = useState<string>(
    "=cmd|'/C calc'!A0"
  );
  const [sanitizedResult, setSanitizedResult] = useState<{
    raw: string;
    sanitized: string;
    isDangerous: boolean;
    prefixMatched: string | null;
  }>({
    raw: "=cmd|'/C calc'!A0",
    sanitized: "'=cmd|'/C calc'!A0",
    isDangerous: true,
    prefixMatched: '=',
  });

  // Agent Backoff Simulation State
  const [simulatedBackoff, setSimulatedBackoff] = useState<number>(1.0);
  const [simulatedState, setSimulatedState] = useState<'IDLE' | 'CONNECTING' | 'SUCCESS' | 'BACKOFF'>('IDLE');
  const [simulatedLogs, setSimulatedLogs] = useState<string[]>([
    'Dispatcher initialized at initial backoff: 1.0s (dark console stream active)',
  ]);

  // Handle Security Sandbox sanitization recalculation
  const handleTestFormula = (val: string) => {
    setTestFormulaInput(val);
    const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
    const first = val.length > 0 ? val.charAt(0) : '';
    const isDangerous = dangerousPrefixes.includes(first);
    const sanitized = isDangerous ? `'${val}` : val;
    setSanitizedResult({
      raw: val,
      sanitized,
      isDangerous,
      prefixMatched: isDangerous ? first : null,
    });
  };

  // Simulate Agent dispatch attempt with failures and exponential backoff
  const simulateAgentFailure = () => {
    setSimulatedState('CONNECTING');
    setTimeout(() => {
      setSimulatedState('BACKOFF');
      const nextBackoff = Math.min(simulatedBackoff * 2.0, 60.0);
      setSimulatedLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] HTTP Timeout/ConnectionRefused reaching backend. Applying backoff sleep ${simulatedBackoff.toFixed(1)}s. Next cap will be ${nextBackoff.toFixed(1)}s.`,
        ...prev.slice(0, 15),
      ]);
      setSimulatedBackoff(nextBackoff);
    }, 600);
  };

  const simulateAgentSuccess = () => {
    setSimulatedState('CONNECTING');
    setTimeout(() => {
      setSimulatedState('SUCCESS');
      setSimulatedLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] HTTP 201 Created: Heartbeat received by backend! Exponential backoff reset to 1.0s.`,
        ...prev.slice(0, 15),
      ]);
      setSimulatedBackoff(1.0);
    }, 400);
  };

  const handleCopyCode = () => {
    const file = REPO_FILES[selectedFile];
    if (file) {
      navigator.clipboard.writeText(file.content);
      setCopiedFile(true);
      setTimeout(() => setCopiedFile(false), 2000);
    }
  };

  if (!currentUser) {
    return <AuthPortal onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  return (
    <div className="min-h-screen bg-[#0b0f17] text-gray-100 font-sans flex flex-col">
      {/* Top System Bar in Dark Theme */}
      <nav className="bg-[#0e131d] border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center space-x-3">
              <div className="p-1.5 bg-gray-100 text-gray-950">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-sm tracking-wider uppercase text-gray-100">
                  Hardware Resilient System
                </span>
                <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 bg-gray-800 text-gray-300 border border-gray-700">
                  CRITICAL-GRADE • DARK
                </span>
              </div>
            </div>

            {/* Navigation Tabs and User Session Controls */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-3 py-1.5 border cursor-pointer ${
                    activeTab === 'dashboard'
                      ? 'bg-gray-100 text-gray-950 font-bold border-gray-200'
                      : 'bg-[#131926] text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  Dashboard & Cluster
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('codebase')}
                  className={`px-3 py-1.5 border cursor-pointer ${
                    activeTab === 'codebase'
                      ? 'bg-gray-100 text-gray-950 font-bold border-gray-200'
                      : 'bg-[#131926] text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <FolderTree className="w-3.5 h-3.5 inline mr-1" />
                  Codebase Topography
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('security')}
                  className={`px-3 py-1.5 border cursor-pointer ${
                    activeTab === 'security'
                      ? 'bg-gray-100 text-gray-950 font-bold border-gray-200'
                      : 'bg-[#131926] text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 inline mr-1" />
                  CSV Security Lab
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('agent')}
                  className={`px-3 py-1.5 border cursor-pointer ${
                    activeTab === 'agent'
                      ? 'bg-gray-100 text-gray-950 font-bold border-gray-200'
                      : 'bg-[#131926] text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5 inline mr-1" />
                  Agent Daemon Lab
                </button>
              </div>

              {/* User Session & Logout Controls */}
              <div className="flex items-center space-x-2 pl-3 border-l border-gray-800">
                <div className="hidden lg:block text-right">
                  <div className="text-[11px] font-bold text-gray-200 truncate max-w-[130px] font-mono">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono flex items-center justify-end space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{currentUser.role}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await logoutUser();
                    setCurrentUser(null);
                  }}
                  className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 border border-red-800/80 text-red-200 text-xs font-mono transition-colors cursor-pointer"
                  title="Cerrar sesión segura y bloquear gateway"
                >
                  Cerrar Sesión
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>


      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* TAB 1: Live Hardware Telemetry Dashboard */}
        {activeTab === 'dashboard' && (
          <ErrorBoundary>
            <DeviceDashboard />
          </ErrorBoundary>
        )}

        {/* TAB 2: Architecture & Codebase Explorer (Dark Theme) */}
        {activeTab === 'codebase' && (
          <div className="space-y-4">
            <div className="bg-[#131926] border border-gray-800 p-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase font-mono text-gray-100">
                  Full-Stack Architecture & Repository Files
                </h2>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  Complete generated file tree under{' '}
                  <code className="bg-[#0b0f17] px-1 py-0.5 border border-gray-800 text-gray-300">
                    hardware-resilient-system/
                  </code>
                </p>
              </div>
              <div className="text-xs font-mono text-gray-400">
                12 Production Files Generated
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* File Selector Tree */}
              <div className="md:col-span-4 bg-[#131926] border border-gray-800 p-3 space-y-1">
                <div className="text-[11px] font-mono text-gray-500 uppercase tracking-wider mb-2 px-2">
                  Generated Topography
                </div>
                {Object.keys(REPO_FILES).map((filePath) => (
                  <button
                    key={filePath}
                    type="button"
                    onClick={() => {
                      setSelectedFile(filePath);
                      setCopiedFile(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 text-xs font-mono truncate transition-colors cursor-pointer border ${
                      selectedFile === filePath
                        ? 'bg-gray-100 text-gray-950 font-bold border-gray-200'
                        : 'bg-[#0b0f17] text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-200'
                    }`}
                  >
                    📄 {filePath}
                  </button>
                ))}
              </div>

              {/* File Code Viewer */}
              <div className="md:col-span-8 bg-[#131926] border border-gray-800 flex flex-col">
                <div className="p-3 border-b border-gray-800 bg-[#0e131d] flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs font-bold text-gray-200">
                      {selectedFile}
                    </div>
                    <div className="text-[11px] text-gray-400 font-sans mt-0.5">
                      {REPO_FILES[selectedFile]?.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center px-2.5 py-1 text-xs font-mono border border-gray-700 bg-[#0b0f17] text-gray-200 hover:bg-gray-800 cursor-pointer"
                  >
                    {copiedFile ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1 text-gray-100" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1 text-gray-400" />
                        Copy Code
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 bg-[#07090e] text-gray-200 font-mono text-xs overflow-x-auto flex-1 max-h-[500px] leading-relaxed border-t border-gray-900">
                  <code>{REPO_FILES[selectedFile]?.content}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Formula Injection Security Lab (Dark Theme) */}
        {activeTab === 'security' && (
          <div className="bg-[#131926] border border-gray-800 p-6 space-y-6">
            <div className="border-b border-gray-800 pb-4">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-gray-200" />
                <h2 className="text-base font-bold uppercase font-mono tracking-wider text-gray-100">
                  Spreadsheet Formula Injection Immunity (CWE-1236)
                </h2>
              </div>
              <p className="text-xs text-gray-400 font-mono mt-1">
                Mandatory defense per Rule 4: Neutralizes execution characters{' '}
                <span className="font-bold text-gray-200">{'='}</span>,{' '}
                <span className="font-bold text-gray-200">{'+'}</span>,{' '}
                <span className="font-bold text-gray-200">{'-'}</span>,{' '}
                <span className="font-bold text-gray-200">{'@'}</span>,{' '}
                <span className="font-bold text-gray-200">{'\\t'}</span>,{' '}
                <span className="font-bold text-gray-200">{'\\r'}</span> by prepending a single
                quote (<span className="font-bold text-gray-200">'</span>).
              </p>
            </div>

            {/* Interactive Sandbox */}
            <div className="space-y-4">
              <label className="block text-xs font-mono font-bold text-gray-300">
                Test Any String or Formula Injection Payload:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testFormulaInput}
                  onChange={(e) => handleTestFormula(e.target.value)}
                  placeholder="Enter formula like =cmd|' /C calc'!A0 or @SUM(A1:A5)"
                  className="flex-1 p-2 bg-[#0b0f17] border border-gray-700 font-mono text-xs text-gray-100 focus:outline-none focus:border-gray-400"
                />
              </div>

              {/* Preset Attack Vectors */}
              <div className="flex items-center space-x-2 text-xs font-mono">
                <span className="text-gray-500">Presets:</span>
                {[
                  "=cmd|' /C calc'!A0",
                  '@SUM(1+99)*cmd|calc',
                  '+1234567890',
                  '-2+3+cmd|calc',
                  '\tmaliciousTabIndented',
                  'SRV-SAFE-NORMAL-001',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => handleTestFormula(sample)}
                    className="px-2 py-0.5 border border-gray-700 bg-[#0b0f17] text-gray-300 hover:bg-gray-800 cursor-pointer"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              {/* Comparison Card in Dark Mode */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                <div className="p-4 bg-[#0e131d] border border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-gray-300 uppercase">
                      Raw User Input (Unsanitized)
                    </span>
                    {sanitizedResult.isDangerous ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-gray-800 text-gray-200 border border-gray-700">
                        VULNERABLE PREFIX [{sanitizedResult.prefixMatched}]
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-[#131926] text-gray-400 border border-gray-800">
                        SAFE PREFIX
                      </span>
                    )}
                  </div>
                  <pre className="p-3 bg-[#07090e] border border-gray-900 font-mono text-xs text-gray-200">
                    {sanitizedResult.raw}
                  </pre>
                  <p className="text-[11px] text-gray-400 font-mono mt-2">
                    If exported directly into CSV, Excel / LibreOffice will execute this as a macro
                    or formula trigger.
                  </p>
                </div>

                <div className="p-4 bg-[#111724] border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-gray-100 uppercase">
                      Sanitized Output (Safe for CSV)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-gray-100 text-gray-950 font-bold border border-gray-200">
                      IMMUNIZED WITH SINGLE-QUOTE
                    </span>
                  </div>
                  <pre className="p-3 bg-[#07090e] border border-gray-800 font-mono text-xs text-gray-100 font-bold">
                    {sanitizedResult.sanitized}
                  </pre>
                  <p className="text-[11px] text-gray-300 font-mono mt-2">
                    Spreadsheet engines interpret the leading single-quote as explicit text notation,
                    completely neutralizing formula evaluation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Agent Daemon & Resilience Simulator (Dark Theme) */}
        {activeTab === 'agent' && (
          <div className="bg-[#131926] border border-gray-800 p-6 space-y-6">
            <div className="border-b border-gray-800 pb-4">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-gray-200" />
                <h2 className="text-base font-bold uppercase font-mono tracking-wider text-gray-100">
                  Python Telemetry Agent Resilience Loop
                </h2>
              </div>
              <p className="text-xs text-gray-400 font-mono mt-1">
                Simulates Rule 6: Isolated sensor queries with 0.0 fallbacks and HTTP POST
                shielded with progressive exponential backoff (1s → 2s → 4s → ... → 60s max).
              </p>
            </div>

            {/* Backoff Status Gauge */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-[#0b0f17] border border-gray-800">
                <span className="text-xs font-mono text-gray-400 uppercase">
                  Current Backoff Interval
                </span>
                <div className="text-2xl font-bold font-mono text-gray-100 mt-1">
                  {simulatedBackoff.toFixed(1)}s
                </div>
                <div className="text-[11px] font-mono text-gray-500 mt-1">
                  Ceiling Cap: 60.0s
                </div>
              </div>

              <div className="p-4 bg-[#0b0f17] border border-gray-800">
                <span className="text-xs font-mono text-gray-400 uppercase">
                  Dispatcher Network State
                </span>
                <div className="text-xl font-bold font-mono text-gray-100 mt-1">
                  {simulatedState}
                </div>
                <div className="text-[11px] font-mono text-gray-500 mt-1">
                  Protected against Timeout & ConnectionError
                </div>
              </div>

              <div className="p-4 bg-[#0b0f17] border border-gray-800 flex flex-col justify-center space-y-2">
                <button
                  type="button"
                  onClick={simulateAgentFailure}
                  className="px-3 py-1.5 text-xs font-mono border border-gray-600 bg-gray-800 text-gray-100 hover:bg-gray-700 cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-gray-300" />
                  Simulate Network Outage (Trigger Backoff)
                </button>
                <button
                  type="button"
                  onClick={simulateAgentSuccess}
                  className="px-3 py-1.5 text-xs font-mono border border-gray-700 bg-[#131926] text-gray-200 hover:bg-gray-800 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 inline mr-1 text-gray-300" />
                  Simulate Network Recovery (Reset to 1.0s)
                </button>
              </div>
            </div>

            {/* Simulator Output Console */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-gray-400">
                <span>SIMULATED AGENT STDOUT / STDERR</span>
                <button
                  type="button"
                  onClick={() =>
                    setSimulatedLogs(['Dispatcher initialized at initial backoff: 1.0s'])
                  }
                  className="hover:underline flex items-center cursor-pointer text-gray-400 hover:text-gray-200"
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Clear Console
                </button>
              </div>
              <div className="p-4 bg-[#07090e] border border-gray-900 text-gray-300 font-mono text-xs rounded-none h-48 overflow-y-auto space-y-1">
                {simulatedLogs.map((line, i) => (
                  <div key={i} className="text-gray-300">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer in Dark Theme */}
      <footer className="border-t border-gray-800 bg-[#0e131d] py-3 text-center text-xs font-mono text-gray-500">
        Hardware Resilient System • Mission-Critical Dark Console • Zero Any • Zod Validated • Formula Shielded
      </footer>
    </div>
  );
};

export default App;
