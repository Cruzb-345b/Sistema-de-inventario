import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';

const PORT = parseInt(process.env.PORT || '4000', 10);
const app = createApp();

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Hardware Resilient Backend] Listening on port ${PORT} (PID: ${process.pid})`);
  // eslint-disable-next-line no-console
  console.log(`[Health Endpoint] http://localhost:${PORT}/api/health`);
});

// Resilient Graceful Shutdown
function handleShutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`\nReceived ${signal}. Shutting down HTTP server gracefully...`);
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force shutdown if cleanup hangs
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error('Graceful shutdown timed out. Forcing process exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
