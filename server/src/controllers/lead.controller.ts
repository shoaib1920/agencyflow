import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentUser } from '../middleware/auth';
import * as leadService from '../services/lead.service';

export const list = asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  sendSuccess(res, await leadService.listLeads(search));
});

export const get = asyncHandler(async (req, res) => {
  sendSuccess(res, await leadService.getLead(req.params.id as string));
});

export const create = asyncHandler(async (req, res) => {
  const lead = await leadService.createLead(currentUser(req).id, req.body);
  sendSuccess(res, lead, { status: 201, message: 'Lead created' });
});

export const update = asyncHandler(async (req, res) => {
  const lead = await leadService.updateLead(currentUser(req).id, req.params.id as string, req.body);
  sendSuccess(res, lead, { message: 'Lead updated' });
});

export const move = asyncHandler(async (req, res) => {
  const result = await leadService.moveLead(currentUser(req).id, req.params.id as string, req.body);
  sendSuccess(res, result, {
    message: result.client ? `Won! ${String(result.client.name)} was added as a client` : 'Lead moved',
  });
});

export const remove = asyncHandler(async (req, res) => {
  await leadService.deleteLead(currentUser(req).id, req.params.id as string);
  sendSuccess(res, null, { message: 'Lead deleted' });
});
