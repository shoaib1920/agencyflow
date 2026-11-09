export const ROLES = ['admin', 'manager', 'member'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
