/* Componente principal de la interfaz con puerta de inicio de sesión y barra de navegación */
import React, { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DeviceDashboard } from './components/DeviceDashboard';
import { AuthPortal } from './components/AuthPortal';
import { getStoredUser, logoutUser, AuthUser } from './lib/auth';
import { Server, LogOut, User } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());

  // Si no hay sesión iniciada, mostrar la pantalla de inicio de sesión
  if (!currentUser) {
    return <AuthPortal onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-gray-100 font-sans flex flex-col selection:bg-gray-700 selection:text-white">
      {/* Barra superior de navegación */}
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

            {/* Controles de Sesión de Usuario */}
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center space-x-2 px-2.5 py-1 bg-[#131926] border border-gray-800">
                <User className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-mono text-gray-200">{currentUser.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                  {currentUser.role}
                </span>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="px-2.5 py-1 text-xs font-mono bg-red-950/40 hover:bg-red-900/60 border border-red-800/80 text-red-300 hover:text-red-100 transition-colors cursor-pointer flex items-center space-x-1.5"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Área principal del panel */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ErrorBoundary>
          <DeviceDashboard />
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-[#0e131d] py-3 text-center text-xs font-mono text-gray-500">
        Hardware Resilient System • Neon PostgreSQL • Telemetría en Vivo
      </footer>
    </div>
  );
};

export default App;
