import { z } from 'zod';
import { objectId } from './common';
import { paginationQuery } from '../utils/pagination';
import { ROLES, TEAM_ROLES } from '../utils/types';
import { INVOICE_STATUSES } from '../models/Invoice';
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
  emailNotifications: z.boolean().optional(),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

// ---------- Users / team ----------
export const createUserSchema = registerSchema.extend({
  role: z.enum(TEAM_ROLES).default('member'),
  title: optionalText(80),
});
export const updateUserSchema = z.object({
  role: z.enum(TEAM_ROLES).optional(),
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
  estimatedHours: z.coerce.number().min(0).max(100000).optional().nullable(),
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
export const taskUpdate = taskBody.partial().extend({ position: z.number().finite().optional() });

export const projectIdParam = z.object({ projectId: objectId });
export const projectTaskParams = z.object({ projectId: objectId, taskId: objectId });
export const projectFileParams = z.object({ id: objectId, fileId: objectId });

// ---------- Invites ----------
export const inviteSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  name: optionalText(80),
  role: z.enum(ROLES),
  title: optionalText(80),
  client: objectId.optional(),
});
export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(80),
  password,
});
export const tokenQuery = z.object({ token: z.string().min(20).max(200) });

// ---------- Invoices ----------
const invoiceItem = z.object({
  description: z.string().trim().min(1, 'Description is required').max(300),
  quantity: z.coerce.number().min(0).max(100000),
  unitPrice: z.coerce.number().min(0).max(100_000_000),
});
export const invoiceBody = z.object({
  client: objectId,
  project: objectId.optional().nullable(),
  lead: objectId.optional().nullable(),
  items: z.array(invoiceItem).min(1, 'Add at least one line item').max(100),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  discount: z.coerce.number().min(0).default(0),
  issueDate: optionalDate,
  dueDate: z.coerce.date(),
  notes: optionalText(2000),
});
export const invoiceUpdate = invoiceBody.partial();
export const invoiceListQuery = paginationQuery.extend({
  status: z.enum([...INVOICE_STATUSES, 'overdue']).optional(),
  client: objectId.optional(),
  sort: z.enum(['number', 'issueDate', 'dueDate', 'total', 'createdAt']).default('issueDate'),
});
export const invoiceAction = z.object({ action: z.enum(['send', 'pay', 'void']) });

// ---------- Comments ----------
export const commentBody = z.object({
  body: z.string().trim().min(1, 'Write something').max(4000),
  task: objectId.optional().nullable(),
  mentions: z.array(objectId).max(20).default([]),
  internal: z.boolean().optional(),
});
export const commentQuery = z.object({ task: objectId.optional() });

// ---------- Time tracking ----------
export const timerStart = z.object({ task: objectId });
export const manualTime = z.object({
  task: objectId,
  minutes: z.coerce.number().int().min(1).max(24 * 60),
  note: optionalText(300),
  date: optionalDate,
});

// ---------- Search, CSV, trash, AI ----------
export const searchQuery = z.object({ q: z.string().trim().min(2).max(100) });
export const importBody = z.object({ rows: z.array(z.record(z.unknown())).min(1).max(1000) });
export const trashParams = z.object({ type: z.enum(['client', 'lead', 'project', 'invoice']), id: objectId });
export const aiBody = z.object({ action: z.enum(['summary', 'email', 'next_steps']) });
