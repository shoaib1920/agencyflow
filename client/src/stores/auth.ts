import { create } from 'zustand';
import type { Role, User } from '@/lib/types';

/**
 * The access token lives only in memory (never localStorage) so XSS can't
 * exfiltrate a long-lived credential. On reload we silently call /auth/refresh,
 * which uses the httpOnly cookie, to get a new one.
 */
interface AuthState {
  user: User | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'ready';
  setSession: (user: User, accessToken: string) => void;
  setUser: (user: User) => void;
  setToken: (accessToken: string) => void;
  clear: () => void;
  setStatus: (s: AuthState['status']) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: 'idle',
  setSession: (user, accessToken) => set({ user, accessToken, status: 'ready' }),
  setUser: (user) => set({ user }),
  setToken: (accessToken) => set({ accessToken }),
  clear: () => set({ user: null, accessToken: null, status: 'ready' }),
  setStatus: (status) => set({ status }),
}));

export const hasRole = (role: Role | undefined, ...allowed: Role[]) =>
  !!role && allowed.includes(role);

/** Convenience hook for permission checks in components. */
export function usePermissions() {
  const role = useAuth((s) => s.user?.role);
  return {
    role,
    isAdmin: role === 'admin',
    isStaff: hasRole(role, 'admin', 'manager'),
  };
}
