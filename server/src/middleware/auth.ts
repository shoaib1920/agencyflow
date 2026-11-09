import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import { verifyAccessToken } from '../utils/tokens';
import type { Role } from '../utils/types';

/** Requires a valid `Authorization: Bearer <accessToken>` header. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized());
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, role: payload.role, name: payload.name };
    next();
  } catch {
    next(AppError.unauthorized('Access token expired or invalid'));
  }
};

/** Role guard: allow only the listed roles. Use after `authenticate`. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };

/** Narrow `req.user` for controllers that sit behind `authenticate`. */
export function currentUser(req: { user?: Express.Request['user'] }) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
