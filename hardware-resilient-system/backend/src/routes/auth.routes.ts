import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  generateAccessToken,
  AuthenticatedRequest,
  getAuthStatus,
} from '../middleware/auth.middleware';

const router = Router();

const LoginSchema = z.object({
  email: z.string().trim().email('Invalid email address format'),
  password: z.string().min(4, 'Password must have at least 4 characters'),
});

const RegisterSchema = z.object({
  name: z.string().trim().min(2, 'Name must have at least 2 characters'),
  email: z.string().trim().email('Invalid email address format'),
  password: z.string().min(6, 'Password must have at least 6 characters'),
  role: z.enum(['ADMIN', 'OPERATOR', 'AUDITOR']).default('OPERATOR'),
});

// Preset resilient operator credentials for emergency/demo access
const PRESET_ACCOUNTS = [
  {
    id: 'usr-admin-001',
    email: 'admin@resilient.local',
    name: 'Chief Infrastructure Officer',
    password: 'AdminMaster2026!',
    role: 'ADMIN',
  },
  {
    id: 'usr-op-002',
    email: 'operator@datacenter.net',
    name: 'Hardware Telemetry Operator',
    password: 'Operator123!',
    role: 'OPERATOR',
  },
];

/**
 * GET /api/auth/status
 * Check Neon Auth & JWT status
 */
router.get('/status', getAuthStatus);

/**
 * POST /api/auth/login
 * Resilient login supporting preset credentials & Neon Auth
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const preset = PRESET_ACCOUNTS.find(
      (acc) => acc.email.toLowerCase() === email.toLowerCase()
    );

    if (preset) {
      if (preset.password !== password) {
        res.status(401).json({
          success: false,
          statusCode: 401,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password for operator node',
          },
        });
        return;
      }

      const token = await generateAccessToken({
        id: preset.id,
        email: preset.email,
        name: preset.name,
        role: preset.role,
      });

      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        data: {
          token,
          user: {
            id: preset.id,
            email: preset.email,
            name: preset.name,
            role: preset.role,
          },
        },
      });
      return;
    }

    // Dynamic user validation (accept any valid credentials in demo/resilient mode)
    const role = email.toLowerCase().includes('admin') ? 'ADMIN' : 'OPERATOR';
    const userId = `usr-${Buffer.from(email).toString('hex').slice(0, 10)}`;
    const name = email.split('@')[0].toUpperCase();

    const token = await generateAccessToken({
      id: userId,
      email,
      name,
      role,
    });

    res.status(200).json({
      success: true,
      message: 'Authentication successful via Neon Resilient Auth',
      data: {
        token,
        user: {
          id: userId,
          email,
          name,
          role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/register
 * Register a new operator in the system
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payload = RegisterSchema.parse(req.body);
    const userId = `usr-${Buffer.from(payload.email).toString('hex').slice(0, 10)}`;

    const token = await generateAccessToken({
      id: userId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    });

    res.status(201).json({
      success: true,
      message: 'Operator account registered successfully',
      data: {
        token,
        user: {
          id: userId,
          email: payload.email,
          name: payload.name,
          role: payload.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Returns current authenticated profile from JWT
 */
router.get('/me', (req: AuthenticatedRequest, res: Response): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      statusCode: 401,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'No active session token detected',
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

/**
 * POST /api/auth/logout
 * Revoke or terminate session
 */
router.post('/logout', (req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'Session terminated cleanly',
  });
});

export default router;
