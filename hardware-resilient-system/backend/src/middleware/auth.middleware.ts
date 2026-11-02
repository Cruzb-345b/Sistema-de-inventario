import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
const JWKS = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;

export interface AuthenticatedUser {
  id: string;
  email?: string;
  [key: string]: unknown;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Optional or Required Neon Auth Bearer token verification
 */
export async function authenticateNeonUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No credentials provided; proceed as unauthenticated request
    return next();
  }

  const token = authHeader.split(' ')[1];

  if (!JWKS) {
    return next();
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = {
      id: payload.sub || (payload.id as string) || 'anonymous',
      email: payload.email as string | undefined,
      ...payload,
    };
    next();
  } catch (err) {
    // If token was provided but invalid/expired, warn and proceed or handle
    console.warn('[Neon Auth] JWT verification warning:', err instanceof Error ? err.message : err);
    next();
  }
}

/**
 * Endpoint to verify Neon Auth status and JWKS connectivity
 */
export async function getAuthStatus(req: Request, res: Response): Promise<void> {
  res.json({
    neonAuthEnabled: Boolean(jwksUrl),
    jwksUrl: jwksUrl || null,
    baseUrl: process.env.NEON_AUTH_BASE_URL || null,
    status: jwksUrl ? 'ACTIVE' : 'DISABLED',
  });
}
