import { User, type UserDoc } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import {
  hashToken,
  randomId,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens';
import type { Role } from '../utils/types';

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export interface AuthResult {
  user: ReturnType<UserDoc['toJSON']>;
  accessToken: string;
  refreshToken: string;
}

/** User JSON for the browser; portal users get their company name for the header. */
export async function publicUser(user: UserDoc) {
  if (user.client) await user.populate('client', 'name company');
  return user.toJSON();
}

export async function issueTokens(user: UserDoc, family: string, userAgent?: string) {
  const jti = randomId();
  const refreshToken = signRefreshToken({ sub: user.id as string, jti, family });
  await RefreshToken.create({
    user: user._id,
    jti,
    family,
    tokenHash: hashToken(refreshToken),
    userAgent,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  const accessToken = signAccessToken({
    sub: user.id as string,
    role: user.role as Role,
    name: user.name,
    ...(user.client ? { clientId: String(user.client) } : {}),
  });
  return { accessToken, refreshToken, jti };
}

/** The first account ever registered becomes the agency admin; everyone after is a member. */
export async function register(
  input: { name: string; email: string; password: string },
  userAgent?: string,
): Promise<AuthResult> {
  if (await User.exists({ email: input.email })) throw AppError.conflict('Email is already registered');
  const isFirst = (await User.estimatedDocumentCount()) === 0;
  const user = (await User.create({
    ...input,
    role: isFirst ? 'admin' : 'member',
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  })) as UserDoc;
  const tokens = await issueTokens(user, randomId(), userAgent);
  return { user: await publicUser(user), ...tokens };
}

export async function login(
  input: { email: string; password: string },
  userAgent?: string,
): Promise<AuthResult> {
  const user = (await User.findOne({ email: input.email }).select('+password')) as UserDoc | null;
  // Same message for unknown email and bad password: don't leak which accounts exist
  if (!user || !(await user.comparePassword(input.password))) {
    throw AppError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) throw AppError.forbidden('This account has been deactivated');
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await issueTokens(user, randomId(), userAgent);
  return { user: await publicUser(user), ...tokens };
}

/**
 * Refresh-token rotation with reuse detection.
 * 1. Verify signature/expiry.  2. Look up the stored token by jti.
 * 3. If it was already rotated/revoked, someone is replaying an old token:
 *    revoke the entire family (forces every session from that login to re-auth).
 * 4. Otherwise revoke it and issue a fresh pair in the same family.
 */
export async function refresh(rawToken: string | undefined, userAgent?: string): Promise<AuthResult> {
  if (!rawToken) throw AppError.unauthorized('No refresh token');

  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw AppError.unauthorized('Refresh token expired or invalid');
  }

  const stored = await RefreshToken.findOne({ jti: payload.jti });
  if (!stored || stored.tokenHash !== hashToken(rawToken)) {
    throw AppError.unauthorized('Refresh token not recognised');
  }
  if (stored.revokedAt) {
    await RefreshToken.updateMany(
      { family: stored.family, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    throw AppError.unauthorized('Refresh token reuse detected; please sign in again');
  }

  const user = (await User.findById(stored.user)) as UserDoc | null;
  if (!user || !user.isActive) throw AppError.unauthorized('Account unavailable');

  const tokens = await issueTokens(user, stored.family, userAgent);
  stored.revokedAt = new Date();
  stored.replacedBy = tokens.jti;
  await stored.save();

  return { user: await publicUser(user), ...tokens };
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  try {
    const { family } = verifyRefreshToken(rawToken);
    await RefreshToken.updateMany(
      { family, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
  } catch {
    // token already invalid; nothing to revoke
  }
}

export async function getMe(userId: string) {
  const user = await User.findById(userId).populate('client', 'name company').lean();
  if (!user) throw AppError.notFound('User');
  const { password: _pw, __v: _v, ...rest } = user as typeof user & { password?: string; __v?: number };
  return rest;
}

export async function updateProfile(
  userId: string,
  input: { name?: string; title?: string; avatarColor?: string },
) {
  const user = await User.findByIdAndUpdate(userId, input, { new: true, runValidators: true });
  if (!user) throw AppError.notFound('User');
  return user.toJSON();
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = (await User.findById(userId).select('+password')) as UserDoc | null;
  if (!user) throw AppError.notFound('User');
  if (!(await user.comparePassword(currentPassword))) {
    throw AppError.badRequest('Current password is incorrect');
  }
  user.password = newPassword;
  await user.save();
  // Revoke every refresh token so other devices must sign in with the new password
  await RefreshToken.updateMany(
    { user: user._id, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}
