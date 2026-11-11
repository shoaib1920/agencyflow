/** `client` is an external portal user who can only see their own company's work. */
export const ROLES = ['admin', 'manager', 'member', 'client'] as const;
export type Role = (typeof ROLES)[number];
export const TEAM_ROLES = ['admin', 'manager', 'member'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  /** Set only for portal users (role `client`). */
  clientId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
