import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { env } from '../config/env';
import type { Role } from './types';

export interface AccessPayload {
  sub: string;
  role: Role;
  name: string;
  clientId?: string;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  family: string;
}

export const REFRESH_COOKIE = 'af_rt';

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
}

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const randomId = () => crypto.randomUUID();

/**
 * Cross-site cookies (Vercel frontend -> Render API) need SameSite=None + Secure.
 * Locally we use Lax so it works over plain http.
 */
export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSecure ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}
