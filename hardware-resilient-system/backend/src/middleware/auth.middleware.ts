import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
const JWKS = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'hardware-resilient-mission-critical-auth-secret-key-2026'
);

export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  [key: string]: unknown;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Generate Access Token with HMAC-SHA256
 */
export async function generateAccessToken(user: {
  id: string;
  email: string;
  name: string;
  role: string;
}): Promise<string> {
  return await new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('48h')
    .sign(JWT_SECRET);
}

/**
 * Multi-layer Neon Auth + JWT Bearer token verification
 */
export async function authenticateNeonUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  // 1. Try Neon Auth JWKS if configured
  if (JWKS) {
    try {
      const { payload } = await jwtVerify(token, JWKS);
      req.user = {
        id: (payload.sub || payload.id || 'anonymous') as string,
        email: payload.email as string | undefined,
        name: (payload.name || payload.email || 'Operator') as string,
        role: (payload.role || 'OPERATOR') as string,
        ...payload,
      };
      return next();
    } catch {
      // Fall through to local verification
    }
  }

  // 2. Try local HS256 verification
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    req.user = {
      id: (payload.sub || payload.id || 'anonymous') as string,
      email: payload.email as string | undefined,
      name: (payload.name || payload.email || 'Operator') as string,
      role: (payload.role || 'OPERATOR') as string,
      ...payload,
    };
    return next();
  } catch (err) {
    console.warn('[Auth Middleware] Invalid Bearer token:', err instanceof Error ? err.message : err);
    return next();
  }
}

/**
 * Protect routes: Requires valid authenticated user
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.user) {
    return next();
  }
  res.status(401).json({
    success: false,
    statusCode: 401,
    error: {
      code: 'UNAUTHORIZED_ACCESS',
      message: 'Access Restricted: You must authenticate with valid credentials to access this node.',
    },
  });
}

/**
 * Endpoint to verify Neon Auth status and JWKS connectivity
 */
export async function getAuthStatus(req: Request, res: Response): Promise<void> {
  res.json({
    neonAuthEnabled: Boolean(jwksUrl),
    jwksUrl: jwksUrl || null,
    baseUrl: process.env.NEON_AUTH_BASE_URL || null,
    status: jwksUrl ? 'ACTIVE' : 'LOCAL_ONLY',
  });
}
