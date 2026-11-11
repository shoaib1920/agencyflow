import type { ZodTypeAny } from 'zod';
import { Client } from '../models/Client';
import { Lead, type LeadStage } from '../models/Lead';
import { clientBody, leadBody } from '../schemas';
import { logActivity } from './activity.service';

/**
 * Escapes one CSV cell. Values starting with = + - @ are prefixed with an apostrophe so a
 * spreadsheet never executes them as formulas (CSV / formula injection).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const BOM = String.fromCharCode(0xfeff);

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))];
  return BOM + lines.join('\r\n'); // BOM so Excel opens UTF-8 correctly
}

export const CLIENT_COLUMNS = ['name', 'company', 'email', 'phone', 'country', 'status', 'notes', 'createdAt'];
export const LEAD_COLUMNS = ['title', 'contactName', 'company', 'email', 'phone', 'country', 'value', 'stage', 'source', 'notes', 'createdAt'];

export async function exportClients() {
  const rows = await Client.find().sort({ createdAt: -1 }).lean();
  return toCsv(CLIENT_COLUMNS, rows as unknown as Record<string, unknown>[]);
}

export async function exportLeads() {
  const rows = await Lead.find().sort({ stage: 1, position: 1 }).lean();
  return toCsv(LEAD_COLUMNS, rows as unknown as Record<string, unknown>[]);
}

export interface ImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

/** Validates every row with the same Zod schema as the create endpoint; valid rows are inserted. */
function validateRows<T>(rows: Record<string, unknown>[], schema: ZodTypeAny) {
  const valid: T[] = [];
  const errors: ImportResult['errors'] = [];
  rows.forEach((raw, i) => {
    // Spreadsheets send empty strings; treat them as "not provided"
    const cleaned = Object.fromEntries(
      Object.entries(raw)
        .map(([k, v]) => [k.trim(), typeof v === 'string' ? v.trim() : v])
        .filter(([, v]) => v !== '' && v !== null && v !== undefined),
    );
    const parsed = schema.safeParse(cleaned);
    if (parsed.success) valid.push(parsed.data as T);
    else {
      const issue = parsed.error.issues[0];
      errors.push({ row: i + 2, message: `${issue?.path.join('.') || 'row'}: ${issue?.message ?? 'invalid'}` }); // +2: header + 1-based
    }
  });
  return { valid, errors };
}

export async function importClients(actorId: string, rows: Record<string, unknown>[]): Promise<ImportResult> {
  const { valid, errors } = validateRows<Record<string, unknown>>(rows, clientBody);
  if (valid.length) await Client.insertMany(valid.map((v) => ({ ...v, createdBy: actorId })));
  await logActivity({ actorId, action: `imported ${valid.length} clients`, entityType: 'client', entityId: actorId, entityName: 'from CSV' });
  return { created: valid.length, errors };
}

export async function importLeads(actorId: string, rows: Record<string, unknown>[]): Promise<ImportResult> {
  const { valid, errors } = validateRows<Record<string, unknown> & { stage: LeadStage }>(rows, leadBody);
  if (valid.length) {
    // Append each imported lead to the bottom of its column
    const tops = await Lead.aggregate<{ _id: string; max: number }>([{ $group: { _id: '$stage', max: { $max: '$position' } } }]);
    const next = new Map(tops.map((t) => [t._id, t.max]));
    await Lead.insertMany(
      valid.map((v) => {
        const position = (next.get(v.stage) ?? 0) + 1000;
        next.set(v.stage, position);
        return { ...v, position, owner: v.owner ?? actorId, createdBy: actorId, wonAt: v.stage === 'won' ? new Date() : undefined };
      }),
    );
  }
  await logActivity({ actorId, action: `imported ${valid.length} leads`, entityType: 'lead', entityId: actorId, entityName: 'from CSV' });
  return { created: valid.length, errors };
}
