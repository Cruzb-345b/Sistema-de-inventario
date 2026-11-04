//formulario visual de autenticacion- correos, contraseñas
import React, { useState } from 'react';
import {
  Lock,
  KeyRound,
  Shield,
  ShieldCheck,
  User,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Server,
  Zap,
} from 'lucide-react';
import { loginWithCredentials, registerWithCredentials, AuthUser } from '../lib/auth';

interface AuthPortalProps {
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'quick'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'OPERATOR' | 'AUDITOR'>('OPERATOR');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email || !password) {
      setErrorMessage('Por favor ingresa correo y contraseña');
      return;
    }

    try {
      setLoading(true);
      const result = await loginWithCredentials(email, password);
      if (result.success && result.user) {
        setSuccessMessage(`Bienvenido, ${result.user.name}`);
        setTimeout(() => {
          onAuthenticated(result.user!);
        }, 300);
      } else {
        setErrorMessage(result.error || 'Credenciales no válidas');
      }
    } catch {
      setErrorMessage('Error de conexión al verificar credenciales');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!name || !email || !password) {
      setErrorMessage('Todos los campos son obligatorios');
      return;
    }

    try {
      setLoading(true);
      const result = await registerWithCredentials(name, email, password, role);
      if (result.success && result.user) {
        setSuccessMessage(`Operador registrado exitosamente. Ingresando...`);
        setTimeout(() => {
          onAuthenticated(result.user!);
        }, 400);
      } else {
        setErrorMessage(result.error || 'Error al registrar operador');
      }
    } catch {
      setErrorMessage('Fallo al contactar el servidor de registro');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (presetEmail: string, presetPass: string) => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setErrorMessage(null);
    setLoading(true);

    try {
      const result = await loginWithCredentials(presetEmail, presetPass);
      if (result.success && result.user) {
        onAuthenticated(result.user);
      } else {
        setErrorMessage(result.error || 'Fallo en acceso de emergencia');
      }
    } catch {
      setErrorMessage('Error de comunicación con el nodo de acceso');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a0f] flex items-center justify-center p-4">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

      <div className="relative w-full max-w-md bg-[#131926] border border-gray-800 shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header and Mission Critical Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#0b0f17] border border-gray-700 text-gray-100 mb-1">
            <Shield className="w-6 h-6 text-gray-200" />
          </div>
          <div>
            <h1 className="text-base font-bold font-mono uppercase tracking-wider text-gray-100">
              Gateway de Control de Acceso
            </h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Hardware Resilient System • Neon PostgreSQL & Auth
            </p>
          </div>

          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-[#0b0f17] border border-gray-800 text-[10px] font-mono text-gray-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>PROTECCIÓN ACTIVA: JWKS ED25519 & HS256</span>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-[#0b0f17] p-1 border border-gray-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMessage(null);
            }}
            className={`py-1.5 text-center transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-gray-100 text-gray-950 font-bold'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Ingreso
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMessage(null);
            }}
            className={`py-1.5 text-center transition-colors cursor-pointer ${
              mode === 'register'
                ? 'bg-gray-100 text-gray-950 font-bold'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Registro
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('quick');
              setErrorMessage(null);
            }}
            className={`py-1.5 text-center transition-colors cursor-pointer ${
              mode === 'quick'
                ? 'bg-gray-100 text-gray-950 font-bold'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Acceso Demo
          </button>
        </div>

        {/* Error / Success Feedback Banner */}
        {errorMessage && (
          <div className="p-3 bg-red-950/40 border border-red-800/80 text-red-200 flex items-start space-x-2 text-xs font-mono">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 text-emerald-200 flex items-start space-x-2 text-xs font-mono">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* TAB 1: Login Form */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4 font-mono text-xs">
            <div>
              <label className="block text-gray-300 uppercase tracking-wider text-[11px] mb-1">
                Correo Electrónico / Identificador *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@datacenter.net"
                  required
                  className="w-full pl-9 pr-3 py-2 bg-[#0b0f17] border border-gray-700 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-300 uppercase tracking-wider text-[11px] mb-1">
                Contraseña de Seguridad *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-9 pr-10 py-2 bg-[#0b0f17] border border-gray-700 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-gray-100 hover:bg-white text-gray-950 font-bold uppercase tracking-wider text-xs border border-gray-200 transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <KeyRound className="w-4 h-4 animate-spin" />
                  <span>Verificando Credenciales...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Autenticar y Desbloquear</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* TAB 2: Register Form */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4 font-mono text-xs">
            <div>
              <label className="block text-gray-300 uppercase tracking-wider text-[11px] mb-1">
                Nombre del Operador *
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ing. Carlos Mendoza"
                  required
                  className="w-full pl-9 pr-3 py-2 bg-[#0b0f17] border border-gray-700 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-300 uppercase tracking-wider text-[11px] mb-1">
                Correo Corporativo *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@empresa.com"
                  required
                  className="w-full pl-9 pr-3 py-2 bg-[#0b0f17] border border-gray-700 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-300 uppercase tracking-wider text-[11px] mb-1">
                Contraseña (Mínimo 6 caracteres) *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="w-full pl-9 pr-10 py-2 bg-[#0b0f17] border border-gray-700 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-gray-300 uppercase tracking-wider text-[11px] mb-1">
                Nivel de Autorización / Rol
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'ADMIN' | 'OPERATOR' | 'AUDITOR')}
                className="w-full p-2 bg-[#0b0f17] border border-gray-700 text-gray-100 focus:outline-none focus:border-gray-300"
              >
                <option value="OPERATOR">OPERATOR - Monitoreo y Telemetría</option>
                <option value="ADMIN">ADMIN - Control Total de Nodos e Inventario</option>
                <option value="AUDITOR">AUDITOR - Consulta y Exportación de Registros</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-gray-100 hover:bg-white text-gray-950 font-bold uppercase tracking-wider text-xs border border-gray-200 transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Cpu className="w-4 h-4 animate-spin" />
                  <span>Registrando Operador...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Crear Cuenta de Operador</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* TAB 3: Quick 1-Click Access for Demo / Audit */}
        {mode === 'quick' && (
          <div className="space-y-3 font-mono text-xs">
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Selecciona una credencial preconfigurada para ingresar inmediatamente al clúster de hardware:
            </p>

            <button
              type="button"
              onClick={() => handleQuickLogin('admin@resilient.local', 'AdminMaster2026!')}
              disabled={loading}
              className="w-full p-3 bg-[#0b0f17] border border-gray-700 hover:border-gray-400 text-left transition-colors cursor-pointer group space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-100 flex items-center space-x-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>Administrador del Clúster</span>
                </span>
                <span className="px-1.5 py-0.5 bg-amber-950 border border-amber-800 text-amber-300 text-[10px]">
                  ROL: ADMIN
                </span>
              </div>
              <div className="text-[11px] text-gray-400">admin@resilient.local</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('operator@datacenter.net', 'Operator123!')}
              disabled={loading}
              className="w-full p-3 bg-[#0b0f17] border border-gray-700 hover:border-gray-400 text-left transition-colors cursor-pointer group space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-100 flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-blue-400" />
                  <span>Operador de Telemetría</span>
                </span>
                <span className="px-1.5 py-0.5 bg-blue-950 border border-blue-800 text-blue-300 text-[10px]">
                  ROL: OPERATOR
                </span>
              </div>
              <div className="text-[11px] text-gray-400">operator@datacenter.net</div>
            </button>
          </div>
        )}

        {/* Footer info */}
        <div className="pt-4 border-t border-gray-800/80 flex items-center justify-between text-[11px] font-mono text-gray-500">
          <span className="flex items-center space-x-1">
            <Server className="w-3 h-3 text-gray-400" />
            <span>Neon Postgres Lakebase</span>
          </span>
          <span>v1.0.0 Resilient</span>
        </div>
      </div>
    </div>
  );
};
