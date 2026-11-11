import crypto from 'crypto';
import { Invitation } from '../models/Invitation';
import { User, type UserDoc } from '../models/User';
import { Client } from '../models/Client';
import { AppError } from '../utils/AppError';
import { hashToken, randomId } from '../utils/tokens';
import type { AuthUser, Role } from '../utils/types';
import { env } from '../config/env';
import { logActivity } from './activity.service';
import { emailLayout, sendMail } from './mail.service';
import { issueTokens, type AuthResult } from './auth.service';

const INVITE_TTL_DAYS = 7;
const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export interface InviteInput {
  email: string;
  name?: string;
  role: Role;
  title?: string;
  client?: string;
}

/**
 * Creates a single-use invite link valid for 7 days. Only the token's hash is stored.
 * The link is returned to the inviter too, so invites work even before email is set up.
 */
export async function createInvite(actor: AuthUser, input: InviteInput) {
  if (input.role !== 'client' && actor.role !== 'admin') throw AppError.forbidden('Only admins can invite team members');
  if (input.role === 'client') {
    if (!input.client) throw AppError.badRequest('Choose which client this portal user belongs to');
    if (!(await Client.exists({ _id: input.client }))) throw AppError.badRequest('Client does not exist');
  } else {
    input.client = undefined;
  }
  if (await User.exists({ email: input.email })) throw AppError.conflict('A user with this email already exists');

  await Invitation.deleteMany({ email: input.email, acceptedAt: null }); // re-inviting replaces the old link
  const token = crypto.randomBytes(32).toString('base64url');
  const invite = await Invitation.create({
    ...input,
    tokenHash: hashToken(token),
    invitedBy: actor.id,
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
  });

  const inviteUrl = `${env.appUrl}/accept-invite?token=${token}`;
  const isPortal = input.role === 'client';
  const { sent } = await sendMail(
    input.email,
    isPortal ? 'Your AgencyFlow client portal invite' : `${actor.name} invited you to AgencyFlow`,
    emailLayout({
      heading: isPortal ? 'Your client portal is ready' : `Join your team on AgencyFlow`,
      paragraphs: [
        `Hi${input.name ? ` ${input.name.split(' ')[0]}` : ''},`,
        isPortal
          ? `${actor.name} invited you to follow your projects, files and invoices in real time.`
          : `${actor.name} invited you to join the workspace as ${input.role}.`,
        `This link is valid for ${INVITE_TTL_DAYS} days and can be used once.`,
      ],
      cta: { label: 'Accept invite', url: inviteUrl },
    }),
  );

  await logActivity({
    actorId: actor.id,
    action: isPortal ? 'invited portal user' : 'invited',
    entityType: 'user',
    entityId: invite._id,
    entityName: input.name || input.email,
    meta: { role: input.role },
  });
  return { invite: { _id: invite._id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt }, inviteUrl, emailed: sent };
}

async function findValidInvite(token: string) {
  const invite = await Invitation.findOne({ tokenHash: hashToken(token), acceptedAt: null, expiresAt: { $gt: new Date() } })
    .populate('client', 'name company')
    .populate('invitedBy', 'name');
  if (!invite) throw AppError.notFound('This invite link is invalid or has expired');
  return invite;
}

/** Public: lets the accept page show who invited you and to what. */
export async function previewInvite(token: string) {
  const invite = await findValidInvite(token);
  const client = invite.client as unknown as { name: string; company?: string } | null;
  return {
    email: invite.email,
    name: invite.name ?? '',
    role: invite.role,
    clientName: client ? client.company || client.name : null,
    invitedBy: (invite.invitedBy as unknown as { name: string } | null)?.name ?? null,
  };
}

export async function acceptInvite(
  token: string,
  input: { name: string; password: string },
  userAgent?: string,
): Promise<AuthResult> {
  const invite = await findValidInvite(token);
  if (await User.exists({ email: invite.email })) throw AppError.conflict('This email is already registered');

  const user = (await User.create({
    name: input.name,
    email: invite.email,
    password: input.password,
    role: invite.role,
    title: invite.title,
    client: invite.client ? (invite.client as unknown as { _id: unknown })._id : undefined,
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    lastLoginAt: new Date(),
  })) as UserDoc;
  invite.acceptedAt = new Date();
  await invite.save();

  const tokens = await issueTokens(user, randomId(), userAgent);
  return { user: user.toJSON(), ...tokens };
}

export async function listInvites(clientId?: string) {
  return Invitation.find({ acceptedAt: null, expiresAt: { $gt: new Date() }, ...(clientId ? { client: clientId } : {}) })
    .select('email name role client expiresAt createdAt')
    .populate('invitedBy', 'name')
    .sort({ createdAt: -1 })
    .lean();
}

export async function revokeInvite(actor: AuthUser, id: string) {
  const invite = await Invitation.findById(id);
  if (!invite) throw AppError.notFound('Invite');
  if (invite.role !== 'client' && actor.role !== 'admin') throw AppError.forbidden();
  await invite.deleteOne();
}
