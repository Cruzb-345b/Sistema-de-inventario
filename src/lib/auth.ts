import { createAuthClient } from '@neon/auth';

const authUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NEON_AUTH_URL) ||
  'https://ep-polished-firefly-b66u82ef.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth';

export const authClient = createAuthClient(authUrl);

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
  createdAt?: string;
}

export async function getCurrentSession() {
  try {
    const session = await authClient.getSession();
    return session?.data || null;
  } catch (err) {
    console.warn('Failed to retrieve Neon Auth session:', err);
    return null;
  }
}
