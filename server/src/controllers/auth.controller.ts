import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { REFRESH_COOKIE, refreshCookieOptions } from '../utils/tokens';
import { currentUser } from '../middleware/auth';
import * as authService from '../services/auth.service';

function respondWithSession(res: Response, result: authService.AuthResult, status = 200) {
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
  // The refresh token lives only in the httpOnly cookie; the body carries the short-lived access token
  return sendSuccess(res, { user: result.user, accessToken: result.accessToken }, { status });
}

const readCookie = (req: Request) => req.cookies?.[REFRESH_COOKIE] as string | undefined;

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, req.get('user-agent'));
  respondWithSession(res, result, 201);
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, req.get('user-agent'));
  respondWithSession(res, result);
});

export const refresh = asyncHandler(async (req, res) => {
  try {
    const result = await authService.refresh(readCookie(req), req.get('user-agent'));
    respondWithSession(res, result);
  } catch (err) {
    const { maxAge: _maxAge, ...opts } = refreshCookieOptions();
    res.clearCookie(REFRESH_COOKIE, opts);
    throw err;
  }
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(readCookie(req));
  const { maxAge: _maxAge, ...opts } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, opts);
  sendSuccess(res, null, { message: 'Signed out' });
});

export const me = asyncHandler(async (req, res) => {
  sendSuccess(res, await authService.getMe(currentUser(req).id));
});

export const updateProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, await authService.updateProfile(currentUser(req).id, req.body), {
    message: 'Profile updated',
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  await authService.changePassword(currentUser(req).id, currentPassword, newPassword);
  sendSuccess(res, null, { message: 'Password changed. Other sessions were signed out.' });
});
