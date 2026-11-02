import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import deviceRoutes from './routes/device.routes';
import { errorHandler } from './middleware/errorHandler';
import { authenticateNeonUser, getAuthStatus } from './middleware/auth.middleware';

export function createApp(): Application {
  const app: Application = express();

  // Security and core middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(authenticateNeonUser);

  // Basic liveness probe with Neon backend details
  app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      service: 'hardware-resilient-backend',
      neon: {
        branch: process.env.NEON_BRANCH || 'unknown',
        databaseConfigured: Boolean(process.env.DATABASE_URL),
        authEnabled: Boolean(process.env.NEON_AUTH_JWKS_URL),
      },
    });
  });

  // Neon Auth status probe
  app.get('/api/auth/status', getAuthStatus);

  // Device & telemetry API routes
  app.use('/api/devices', deviceRoutes);

  // Fallback 404 handler for unknown routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      statusCode: 404,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} not found`,
      },
    });
  });

  // Centralized resilient error handler (must be registered last)
  app.use(errorHandler);

  return app;
}

export default createApp;
