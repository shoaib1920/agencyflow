import { Types, type FilterQuery, type SortOrder } from 'mongoose';
import { Invoice, nextSequence, type InvoiceAttrs } from '../models/Invoice';
import { Client } from '../models/Client';
import { Lead } from '../models/Lead';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { buildMeta, escapeRegex } from '../utils/pagination';
import type { AuthUser } from '../utils/types';
import { env } from '../config/env';
import { logActivity } from './activity.service';
import { notify } from './notification.service';
import { emailLayout, sendMail } from './mail.service';
import { renderInvoicePdf } from './invoice.pdf';

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}
export interface InvoiceInput {
  client: string;
  project?: string | null;
  lead?: string | null;
  items: InvoiceItemInput[];
  currency?: string;
  taxRate?: number;
  discount?: number;
  issueDate?: Date | null;
  dueDate: Date;
  notes?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Totals are always derived on the server; values sent by the browser are ignored. */
export function computeTotals(items: InvoiceItemInput[], taxRate = 0, discount = 0) {
  const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const safeDiscount = Math.min(round2(discount), subtotal);
  const tax = round2(((subtotal - safeDiscount) * taxRate) / 100);
  return { subtotal, discount: safeDiscount, tax, total: round2(subtotal - safeDiscount + tax) };
}

/** `overdue` is a view of `sent` + past due date, computed at read time. */
export function displayStatus(inv: { status: string; dueDate: Date }, now = new Date()) {
  return inv.status === 'sent' && inv.dueDate < now ? 'overdue' : inv.status;
}

const withDisplay = <T extends { status: string; dueDate: Date }>(inv: T) => ({
  ...inv,
  displayStatus: displayStatus(inv),
});

async function generateNumber() {
  const year = new Date().getFullYear();
  const seq = await nextSequence(`invoice-${year}`);
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}

interface ListInput {
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  search?: string;
  status?: string;
  client?: string;
}

export async function listInvoices(q: ListInput, scopeClientId?: string) {
  const filter: FilterQuery<InvoiceAttrs> = {};
  if (scopeClientId) {
    filter.client = scopeClientId;
    filter.status = { $in: ['sent', 'paid'] }; // portal users never see drafts or voided invoices
  } else if (q.client) {
    filter.client = q.client;
  }
  if (q.status === 'overdue') {
    filter.status = 'sent';
    filter.dueDate = { $lt: new Date() };
  } else if (q.status === 'sent') {
    filter.status = 'sent';
    filter.dueDate = { $gte: new Date() };
  } else if (q.status && !scopeClientId) {
    filter.status = q.status;
  } else if (q.status && scopeClientId && ['sent', 'paid'].includes(q.status)) {
    filter.status = q.status;
  }
  if (q.search) filter.number = new RegExp(escapeRegex(q.search), 'i');

  const sortSpec: Record<string, SortOrder> = { [q.sort]: q.order === 'asc' ? 1 : -1, _id: -1 };
  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .sort(sortSpec)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('client', 'name company')
      .populate('project', 'title')
      .lean(),
    Invoice.countDocuments(filter),
  ]);
  return { items: items.map(withDisplay), meta: buildMeta(q.page, q.limit, total) };
}

async function loadInvoice(id: string, scopeClientId?: string) {
  const filter: FilterQuery<InvoiceAttrs> = { _id: id };
  if (scopeClientId) {
    filter.client = scopeClientId;
    filter.status = { $in: ['sent', 'paid'] };
  }
  const inv = await Invoice.findOne(filter)
    .populate('client', 'name company email country')
    .populate('project', 'title')
    .populate('createdBy', 'name')
    .lean();
  if (!inv) throw AppError.notFound('Invoice');
  return inv;
}

export async function getInvoice(id: string, scopeClientId?: string) {
  return withDisplay(await loadInvoice(id, scopeClientId));
}

async function assertRefs(input: Partial<InvoiceInput>) {
  if (input.client && !(await Client.exists({ _id: input.client }))) throw AppError.badRequest('Client does not exist');
  if (input.project) {
    const project = await Project.findById(input.project).select('client').lean();
    if (!project) throw AppError.badRequest('Project does not exist');
    if (input.client && String(project.client) !== String(input.client)) {
      throw AppError.badRequest('That project belongs to a different client');
    }
  }
}

export async function createInvoice(actorId: string, input: InvoiceInput) {
  await assertRefs(input);
  const totals = computeTotals(input.items, input.taxRate, input.discount);
  const invoice = await Invoice.create({
    ...input,
    project: input.project || undefined,
    lead: input.lead || undefined,
    issueDate: input.issueDate ?? new Date(),
    ...totals,
    number: await generateNumber(),
    createdBy: actorId,
  });
  await logActivity({
    actorId,
    action: 'created',
    entityType: 'invoice',
    entityId: invoice._id,
    entityName: `${invoice.number} (${invoice.currency} ${invoice.total})`,
  });
  return getInvoice(String(invoice._id));
}

export async function updateInvoice(actorId: string, id: string, input: Partial<InvoiceInput>) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw AppError.notFound('Invoice');
  if (invoice.status === 'paid' || invoice.status === 'void') {
    throw AppError.conflict(`A ${invoice.status} invoice can't be edited`);
  }
  await assertRefs({ client: input.client ?? String(invoice.client), project: input.project ?? undefined });
  Object.assign(invoice, {
    ...input,
    project: input.project === null ? undefined : (input.project ?? invoice.project),
  });
  const totals = computeTotals(invoice.items, invoice.taxRate, invoice.discount);
  Object.assign(invoice, totals);
  await invoice.save();
  await logActivity({ actorId, action: 'updated', entityType: 'invoice', entityId: invoice._id, entityName: invoice.number });
  return getInvoice(id);
}

export async function invoicePdf(id: string, scopeClientId?: string) {
  const inv = await loadInvoice(id, scopeClientId);
  const client = inv.client as unknown as { name: string; company?: string; email: string; country?: string };
  const buffer = await renderInvoicePdf({
    ...inv,
    client,
    project: inv.project as unknown as { title: string } | null,
    discount: inv.discount ?? 0,
    taxRate: inv.taxRate ?? 0,
    issueDate: inv.issueDate ?? inv.createdAt,
  });
  return { buffer, filename: `${inv.number}.pdf` };
}

/** draft -> sent (emails the client with the PDF), sent -> paid, draft/sent -> void. */
export async function changeStatus(actor: AuthUser, id: string, action: 'send' | 'pay' | 'void') {
  const invoice = await Invoice.findById(id).populate<{ client: { _id: Types.ObjectId; name: string; email: string } }>(
    'client',
    'name email',
  );
  if (!invoice) throw AppError.notFound('Invoice');

  const allowed: Record<typeof action, string[]> = { send: ['draft', 'sent'], pay: ['sent'], void: ['draft', 'sent'] };
  if (!allowed[action].includes(invoice.status)) {
    throw AppError.conflict(`Can't ${action} an invoice that is ${invoice.status}`);
  }

  let emailed = false;
  if (action === 'send') {
    invoice.status = 'sent';
    invoice.sentAt = new Date();
    await invoice.save();
    const { buffer, filename } = await invoicePdf(id);
    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(invoice.total);
    const result = await sendMailWithPdf(invoice.client.email, `Invoice ${invoice.number} from AgencyFlow`, {
      heading: `Invoice ${invoice.number}`,
      paragraphs: [
        `Hi ${invoice.client.name.split(' ')[0]},`,
        `Please find attached invoice ${invoice.number} for ${money}, due on ${invoice.dueDate.toDateString()}.`,
        'You can also view all your invoices and project progress in the client portal.',
      ],
      cta: { label: 'Open client portal', url: `${env.appUrl}/portal` },
    }, { filename, content: buffer });
    emailed = result.sent;
    // Let portal users of this client know in-app as well
    const portalUsers = await User.find({ client: invoice.client._id, isActive: true }).select('_id').lean();
    await notify({
      recipients: portalUsers.map((u) => u._id),
      actorId: actor.id,
      type: 'invoice',
      title: `New invoice ${invoice.number}`,
      body: `${money} due ${invoice.dueDate.toDateString()}`,
      link: '/portal',
    });
  } else if (action === 'pay') {
    invoice.status = 'paid';
    invoice.paidAt = new Date();
    await invoice.save();
  } else {
    invoice.status = 'void';
    await invoice.save();
  }

  await logActivity({
    actorId: actor.id,
    action: { send: 'sent', pay: 'marked as paid', void: 'voided' }[action],
    entityType: 'invoice',
    entityId: invoice._id,
    entityName: invoice.number,
  });
  return { invoice: await getInvoice(id), emailed };
}

function sendMailWithPdf(
  to: string,
  subject: string,
  layout: Parameters<typeof emailLayout>[0],
  attachment: { filename: string; content: Buffer },
) {
  return sendMail(to, subject, emailLayout(layout), [attachment]);
}

export async function deleteInvoice(actorId: string, id: string) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw AppError.notFound('Invoice');
  if (invoice.status === 'paid' || invoice.status === 'sent') {
    throw AppError.conflict('Sent or paid invoices are records: void them instead of deleting');
  }
  invoice.deletedAt = new Date();
  invoice.deletedBy = new Types.ObjectId(actorId);
  await invoice.save();
  await logActivity({ actorId, action: 'deleted', entityType: 'invoice', entityId: invoice._id, entityName: invoice.number });
}

/** Prefills a draft from a won lead: one line item with the deal title and value. */
export async function createFromLead(actorId: string, leadId: string) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw AppError.notFound('Lead');
  if (lead.stage !== 'won' || !lead.client) throw AppError.badRequest('Only won leads (with a client) can be invoiced');
  const existing = await Invoice.findOne({ lead: leadId }).select('_id').lean();
  if (existing) return getInvoice(String(existing._id));
  return createInvoice(actorId, {
    client: String(lead.client),
    lead: leadId,
    items: [{ description: lead.title, quantity: 1, unitPrice: lead.value }],
    dueDate: new Date(Date.now() + 14 * 86_400_000),
    notes: 'Payment due within 14 days. Thank you for your business!',
  });
}

/** Money KPIs for the dashboard, computed in one aggregation with $facet. */
export async function invoiceSummary() {
  const now = new Date();
  const [res] = await Invoice.aggregate<{
    paid: { total: number; count: number }[];
    outstanding: { total: number; count: number }[];
    overdue: { total: number; count: number }[];
    draft: { total: number; count: number }[];
  }>([
    { $match: { deletedAt: null, status: { $ne: 'void' } } },
    {
      $facet: {
        paid: [{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }],
        outstanding: [
          { $match: { status: 'sent', dueDate: { $gte: now } } },
          { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
        ],
        overdue: [
          { $match: { status: 'sent', dueDate: { $lt: now } } },
          { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
        ],
        draft: [{ $match: { status: 'draft' } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }],
      },
    },
  ]);
  const pick = (a?: { total: number; count: number }[]) => ({ total: a?.[0]?.total ?? 0, count: a?.[0]?.count ?? 0 });
  return { paid: pick(res?.paid), outstanding: pick(res?.outstanding), overdue: pick(res?.overdue), draft: pick(res?.draft) };
}
