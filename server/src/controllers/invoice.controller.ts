import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentUser } from '../middleware/auth';
import * as invoiceService from '../services/invoice.service';

type ListQuery = Parameters<typeof invoiceService.listInvoices>[0];

/** Portal users are transparently scoped to their own company's invoices. */
const scopeOf = (req: Parameters<typeof currentUser>[0]) => {
  const user = currentUser(req);
  return user.role === 'client' ? user.clientId : undefined;
};

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await invoiceService.listInvoices(req.query as unknown as ListQuery, scopeOf(req));
  sendSuccess(res, items, { meta });
});

export const get = asyncHandler(async (req, res) => {
  sendSuccess(res, await invoiceService.getInvoice(req.params.id as string, scopeOf(req)));
});

export const pdf = asyncHandler(async (req, res) => {
  const { buffer, filename } = await invoiceService.invoicePdf(req.params.id as string, scopeOf(req));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

export const create = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.createInvoice(currentUser(req).id, req.body);
  sendSuccess(res, invoice, { status: 201, message: `Invoice ${invoice.number} created` });
});

export const fromLead = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.createFromLead(currentUser(req).id, req.params.leadId as string);
  sendSuccess(res, invoice, { status: 201, message: `Draft invoice ${invoice.number} ready` });
});

export const update = asyncHandler(async (req, res) => {
  sendSuccess(res, await invoiceService.updateInvoice(currentUser(req).id, req.params.id as string, req.body), {
    message: 'Invoice updated',
  });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const { action } = req.body as { action: 'send' | 'pay' | 'void' };
  const result = await invoiceService.changeStatus(currentUser(req), req.params.id as string, action);
  const message =
    action === 'send'
      ? result.emailed
        ? 'Invoice sent to the client by email'
        : 'Invoice marked as sent (email not configured, so nothing was emailed)'
      : action === 'pay'
        ? 'Invoice marked as paid'
        : 'Invoice voided';
  sendSuccess(res, result, { message });
});

export const remove = asyncHandler(async (req, res) => {
  await invoiceService.deleteInvoice(currentUser(req).id, req.params.id as string);
  sendSuccess(res, null, { message: 'Invoice moved to trash' });
});
