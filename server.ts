import path from 'path';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { createApp } from './backend/src/app';

// Load environment variables from .env.local and .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PORT = parseInt(process.env.PORT || '4000', 10);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrapFullStackServer() {
  // Initialize resilient Express API application
  const app = createApp();

  if (!isProduction) {
    // Development mode: Mount Vite dev server in middleware mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);
    console.log('[FullStack Server] Vite development middleware mounted seamlessly.');
  } else {
    // Production mode: Serve pre-built static client assets
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));

    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log(`[FullStack Server] Serving static production build from ${distPath}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log('===============================================================');
    console.log(`🚀 Resilient Full-Stack Server active on: http://localhost:${PORT}`);
    console.log(`📡 Backend API Endpoints:`);
    console.log(`   - Health check:     http://localhost:${PORT}/api/health`);
    console.log(`   - Neon Auth status: http://localhost:${PORT}/api/auth/status`);
    console.log(`   - Hardware devices: http://localhost:${PORT}/api/devices`);
    console.log(`   - Telemetry feed:   http://localhost:${PORT}/api/telemetry/feed`);
    console.log(`💻 Web Application:    http://localhost:${PORT}`);
    console.log('===============================================================');
  });
}

bootstrapFullStackServer().catch((err: unknown) => {
  console.error('[FullStack Server] Critical bootstrap failure:', err);
  process.exit(1);
});
