import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { AppError } from '../utils/AppError';
import { logActivity } from './activity.service';
import type { Role } from '../utils/types';

/** Team members by default; portal users only when asked for (admin team page). */
export async function listUsers({ includeInactive = false, includeClients = false } = {}) {
  const filter: Record<string, unknown> = includeInactive ? {} : { isActive: true };
  if (!includeClients) filter.role = { $ne: 'client' };
  return User.find(filter)
    .sort({ role: 1, name: 1 })
    .select('name email role title avatarColor isActive lastLoginAt createdAt client')
    .populate('client', 'name company')
    .lean();
}

export async function createUser(
  actorId: string,
  input: { name: string; email: string; password: string; role: Role; title?: string },
) {
  if (await User.exists({ email: input.email })) throw AppError.conflict('Email is already registered');
  const user = await User.create(input);
  await logActivity({
    actorId,
    action: 'invited',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    meta: { role: user.role },
  });
  return user.toJSON();
}

export async function updateUser(
  actorId: string,
  id: string,
  input: { role?: Role; isActive?: boolean; title?: string },
) {
  if (actorId === id && (input.role !== undefined || input.isActive === false)) {
    throw AppError.badRequest('You cannot change your own role or deactivate yourself');
  }
  const user = await User.findById(id);
  if (!user) throw AppError.notFound('User');
  if (user.role === 'client' && input.role) {
    throw AppError.badRequest('Portal users belong to a client and cannot be given a team role');
  }

  // Never leave the agency without an admin
  if (user.role === 'admin' && (input.role && input.role !== 'admin' || input.isActive === false)) {
    const admins = await User.countDocuments({ role: 'admin', isActive: true });
    if (admins <= 1) throw AppError.badRequest('At least one active admin is required');
  }

  const prevRole = user.role;
  Object.assign(user, input);
  await user.save();

  if (input.isActive === false) {
    await RefreshToken.updateMany({ user: user._id }, { $set: { revokedAt: new Date() } });
  }
  if (input.role && input.role !== prevRole) {
    await logActivity({
      actorId,
      action: 'changed role of',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      meta: { from: prevRole, to: input.role },
    });
  }
  return user.toJSON();
}
