/*componente principal de la interfaz-define barra de navegacion*/
import React, { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DeviceDashboard } from './components/DeviceDashboard';
import { AuthPortal } from './components/AuthPortal';
import { getStoredUser, AuthUser } from './lib/auth';
import { Server } from 'lucide-react';

const DEFAULT_OPERATOR: AuthUser = {
  id: 'op-01-datacenter',
  name: 'Operador de Infraestructura',
  email: 'operador@datacenter.net',
  role: 'ADMIN',
  provider: 'local',
};

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthUser>(() => getStoredUser() || DEFAULT_OPERATOR);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-gray-100 font-sans flex flex-col selection:bg-gray-700 selection:text-white">
      {/* Top System Bar in Dark Mission-Critical Theme */}
      <nav className="bg-[#0e131d] border-b border-gray-800/90 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center space-x-3">
              <div className="p-1.5 bg-gray-100 text-gray-950 shadow-sm">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm tracking-wider uppercase text-gray-100 font-mono">
                    Hardware Resilient System
                  </span>
                  <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                    LIVE OPS
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono tracking-tight hidden md:block">
                  Neon PostgreSQL Serverless • Telemetría Continua • Sin Bloqueos
                </div>
              </div>
            </div>

            {/* Operational Controls */}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ErrorBoundary>
          <DeviceDashboard />
        </ErrorBoundary>
      </main>

      {/* Optional Auth & Access Modal (Non-blocking) */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative max-w-md w-full">
            <button
              type="button"
              onClick={() => setShowAuthModal(false)}
              className="absolute -top-10 right-0 text-gray-400 hover:text-white font-mono text-xs px-2.5 py-1 bg-gray-900 border border-gray-700 cursor-pointer flex items-center space-x-1"
            >
              <span>✕ Cerrar Ventana</span>
            </button>
            <AuthPortal
              onAuthenticated={(user) => {
                setCurrentUser(user);
                setShowAuthModal(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Footer in Dark Theme */}
      <footer className="border-t border-gray-800 bg-[#0e131d] py-3 text-center text-xs font-mono text-gray-500">
        Hardware Resilient System • Neon PostgreSQL • Telemetría en Vivo
      </footer>
    </div>
  );
};

export default App;
