import React from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DeviceDashboard } from './components/DeviceDashboard';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <DeviceDashboard />
    </ErrorBoundary>
  );
};

export default App;
