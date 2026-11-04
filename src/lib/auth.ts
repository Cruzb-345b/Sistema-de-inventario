// gestor de sesion de personas y perimisos 
import { createAuthClient } from '@neon/auth';
import { apiUrl } from './api';

const authUrl =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_NEON_AUTH_URL) ||
  'https://ep-polished-firefly-b66u82ef.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth';


export const authClient = createAuthClient(authUrl);

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR' | 'AUDITOR';
  token?: string;
  provider?: 'neon' | 'local';
}

const STORAGE_KEY = 'resilient_auth_session';

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Ignore storage errors
  }
}

export function clearStoredUser(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function getAuthHeaders(): Record<string, string> {
  const user = getStoredUser();
  if (user?.token) {
    return {
      Authorization: `Bearer ${user.token}`,
      'Content-Type': 'application/json',
    };
  }
  return {
    'Content-Type': 'application/json',
  };
}

export async function loginWithCredentials(
  email: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  // 1. First attempt login through the backend API
  try {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (res.ok && data.success && data.data) {
      const user: AuthUser = {
        id: data.data.user.id,
        email: data.data.user.email,
        name: data.data.user.name,
        role: data.data.user.role || 'OPERATOR',
        token: data.data.token,
        provider: 'local',
      };
      setStoredUser(user);
      return { success: true, user };
    }
  } catch {
    // If backend direct request had network glitch, attempt Neon Auth cloud directly
  }

  // 2. Direct attempt via Neon Auth client SDK
  try {
    const neonRes = await authClient.signIn.email({
      email,
      password,
    });

    if (neonRes?.data?.user) {
      const sessionData = neonRes.data as {
        user: { id: string; email?: string; name?: string };
        session?: { token?: string };
      };
      const user: AuthUser = {
        id: sessionData.user.id,
        email: sessionData.user.email || email,
        name: sessionData.user.name || email.split('@')[0],
        role: 'OPERATOR',
        token: sessionData.session?.token,
        provider: 'neon',
      };
      setStoredUser(user);
      return { success: true, user };
    }


    if (neonRes?.error) {
      return { success: false, error: neonRes.error.message || 'Invalid credentials' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Authentication service unreachable';
    return { success: false, error: msg };
  }

  return { success: false, error: 'Invalid credentials or user not authorized' };
}

export async function registerWithCredentials(
  name: string,
  email: string,
  password: string,
  role: 'ADMIN' | 'OPERATOR' | 'AUDITOR' = 'OPERATOR'
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  try {
    const res = await fetch(apiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role }),
    });

    const data = await res.json();
    if (res.ok && data.success && data.data) {
      const user: AuthUser = {
        id: data.data.user.id,
        email: data.data.user.email,
        name: data.data.user.name,
        role: data.data.user.role,
        token: data.data.token,
        provider: 'local',
      };
      setStoredUser(user);
      return { success: true, user };
    }

    return { success: false, error: data.error?.message || 'Registration failed' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Registration request failed';
    return { success: false, error: msg };
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await authClient.signOut();
  } catch {
    // Ignore signout network error
  }
  clearStoredUser();
}
