import { z } from 'zod';
import { objectId } from './common';
import { paginationQuery } from '../utils/pagination';
import { ROLES } from '../utils/types';
import { CLIENT_STATUSES } from '../models/Client';
import { LEAD_STAGES } from '../models/Lead';
import { PROJECT_STATUSES } from '../models/Project';
import { TASK_PRIORITIES, TASK_STATUSES } from '../models/Task';

const optionalText = (max = 5000) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalDate = z.coerce.date().optional().nullable();

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

// ---------- Auth ----------
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().toLowerCase(),
  password,
});
export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  title: optionalText(80),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

// ---------- Users / team ----------
export const createUserSchema = registerSchema.extend({
  role: z.enum(ROLES).default('member'),
  title: optionalText(80),
});
export const updateUserSchema = z.object({
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  title: optionalText(80),
});

// ---------- Clients ----------
export const clientBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  company: optionalText(120),
  email: z.string().trim().email().toLowerCase(),
  phone: optionalText(40),
  country: optionalText(60),
  status: z.enum(CLIENT_STATUSES).default('active'),
  notes: optionalText(),
});
export const clientUpdate = clientBody.partial();
export const clientListQuery = paginationQuery.extend({
  status: z.enum(CLIENT_STATUSES).optional(),
  sort: z.enum(['name', 'company', 'createdAt', 'status', 'country']).default('createdAt'),
});

// ---------- Leads ----------
export const leadBody = z.object({
  title: z.string().trim().min(1).max(160),
  contactName: z.string().trim().min(1).max(120),
  company: optionalText(120),
  email: z.string().trim().email().toLowerCase(),
  phone: optionalText(40),
  country: optionalText(60),
  value: z.coerce.number().min(0).default(0),
  stage: z.enum(LEAD_STAGES).default('new'),
  source: optionalText(60),
  notes: optionalText(),
  owner: objectId.optional(),
});
export const leadUpdate = leadBody.partial();
export const leadStageSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  position: z.number().finite(),
});

// ---------- Projects ----------
export const projectBody = z.object({
  title: z.string().trim().min(1).max(160),
  description: optionalText(),
  client: objectId,
  budget: z.coerce.number().min(0).default(0),
  deadline: optionalDate,
  status: z.enum(PROJECT_STATUSES).default('planning'),
  members: z.array(objectId).default([]),
});
export const projectUpdate = projectBody.partial();
export const projectListQuery = paginationQuery.extend({
  status: z.enum(PROJECT_STATUSES).optional(),
  client: objectId.optional(),
  sort: z.enum(['title', 'deadline', 'budget', 'createdAt', 'status']).default('createdAt'),
});

// ---------- Tasks ----------
export const taskBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText(),
  assignee: objectId.optional().nullable(),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  status: z.enum(TASK_STATUSES).default('todo'),
  dueDate: optionalDate,
});
export const taskUpdate = taskBody.partial();

export const projectIdParam = z.object({ projectId: objectId });
export const projectTaskParams = z.object({ projectId: objectId, taskId: objectId });
export const projectFileParams = z.object({ id: objectId, fileId: objectId });
