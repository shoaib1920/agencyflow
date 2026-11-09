import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentUser } from '../middleware/auth';
import * as clientService from '../services/client.service';

type ListQuery = Parameters<typeof clientService.listClients>[0];

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await clientService.listClients(req.query as unknown as ListQuery);
  sendSuccess(res, items, { meta });
});

export const get = asyncHandler(async (req, res) => {
  sendSuccess(res, await clientService.getClient(req.params.id as string));
});

export const create = asyncHandler(async (req, res) => {
  const client = await clientService.createClient(currentUser(req).id, req.body);
  sendSuccess(res, client, { status: 201, message: 'Client created' });
});

export const update = asyncHandler(async (req, res) => {
  const client = await clientService.updateClient(currentUser(req).id, req.params.id as string, req.body);
  sendSuccess(res, client, { message: 'Client updated' });
});

export const remove = asyncHandler(async (req, res) => {
  await clientService.deleteClient(currentUser(req).id, req.params.id as string);
  sendSuccess(res, null, { message: 'Client deleted' });
});
