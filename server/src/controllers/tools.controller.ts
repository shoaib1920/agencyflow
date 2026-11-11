import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import { currentUser } from '../middleware/auth';
import { globalSearch } from '../services/search.service';
import * as csv from '../services/csv.service';
import * as trash from '../services/trash.service';
import { leadAssist, type AiAction } from '../services/ai.service';
import { sendTaskReminders } from '../jobs/scheduler';
import { env } from '../config/env';

export const search = asyncHandler(async (req, res) => {
  sendSuccess(res, await globalSearch(currentUser(req), String(req.query.q)));
});

// ---------- CSV ----------
const sendCsv = (res: Parameters<Parameters<typeof asyncHandler>[0]>[1], name: string, body: string) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${stamp}.csv"`);
  res.send(body);
};
export const exportClients = asyncHandler(async (_req, res) => sendCsv(res, 'clients', await csv.exportClients()));
export const exportLeads = asyncHandler(async (_req, res) => sendCsv(res, 'leads', await csv.exportLeads()));
export const importClients = asyncHandler(async (req, res) => {
  const result = await csv.importClients(currentUser(req).id, (req.body as { rows: Record<string, unknown>[] }).rows);
  sendSuccess(res, result, { message: `Imported ${result.created} clients` });
});
export const importLeads = asyncHandler(async (req, res) => {
  const result = await csv.importLeads(currentUser(req).id, (req.body as { rows: Record<string, unknown>[] }).rows);
  sendSuccess(res, result, { message: `Imported ${result.created} leads` });
});

// ---------- Trash ----------
export const listTrash = asyncHandler(async (_req, res) => {
  sendSuccess(res, await trash.listTrash(), { meta: { retentionDays: trash.RETENTION_DAYS } });
});
export const restore = asyncHandler(async (req, res) => {
  const { type, id } = req.params as { type: trash.TrashType; id: string };
  await trash.restore(currentUser(req).id, type, id);
  sendSuccess(res, null, { message: 'Restored' });
});
export const purge = asyncHandler(async (req, res) => {
  const { type, id } = req.params as { type: trash.TrashType; id: string };
  await trash.purge(type, id);
  sendSuccess(res, null, { message: 'Permanently deleted' });
});

// ---------- AI ----------
export const aiStatus = asyncHandler(async (_req, res) => {
  sendSuccess(res, { enabled: env.aiEnabled });
});
export const aiLead = asyncHandler(async (req, res) => {
  const { action } = req.body as { action: AiAction };
  sendSuccess(res, await leadAssist(req.params.id as string, action));
});

// ---------- Jobs (manual trigger for admins; cron runs them automatically) ----------
export const runJob = asyncHandler(async (req, res) => {
  const name = req.params.name;
  if (name === 'reminders') return sendSuccess(res, { sent: await sendTaskReminders() }, { message: 'Reminders processed' });
  if (name === 'purge-trash') return sendSuccess(res, { purged: await trash.purgeExpired() }, { message: 'Trash purged' });
  throw AppError.notFound('Job');
});
