import React, { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DeviceDashboard } from './components/DeviceDashboard';
import { AuthPortal } from './components/AuthPortal';
import { getStoredUser, logoutUser, AuthUser } from './lib/auth';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());

  if (!currentUser) {
    return <AuthPortal onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  return (
    <ErrorBoundary>
      <div className="bg-[#0e131d] border-b border-gray-800 px-4 py-2 flex items-center justify-between text-xs font-mono text-gray-200">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Operador Activo: <strong>{currentUser.name}</strong> ({currentUser.role})</span>
        </div>
        <button
          type="button"
          onClick={async () => {
            await logoutUser();
            setCurrentUser(null);
          }}
          className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900 border border-red-800 text-red-200 cursor-pointer"
        >
          Cerrar Sesión
        </button>
      </div>
      <DeviceDashboard />
    </ErrorBoundary>
  );
};

export default App;
