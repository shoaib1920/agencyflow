import type { FilterQuery, SortOrder } from 'mongoose';
import { Client, type ClientAttrs } from '../models/Client';
import { Project } from '../models/Project';
import { AppError } from '../utils/AppError';
import { buildMeta, escapeRegex } from '../utils/pagination';
import { logActivity } from './activity.service';

interface ListInput {
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  search?: string;
  status?: ClientAttrs['status'];
}

export async function listClients({ page, limit, sort, order, search, status }: ListInput) {
  const filter: FilterQuery<ClientAttrs> = {};
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { company: rx }, { email: rx }, { country: rx }];
  }
  const sortSpec: Record<string, SortOrder> = { [sort]: order === 'asc' ? 1 : -1, _id: 1 };

  const [items, total] = await Promise.all([
    Client.find(filter)
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Client.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

export async function getClient(id: string) {
  const client = await Client.findById(id).populate('createdBy', 'name').lean();
  if (!client) throw AppError.notFound('Client');
  const projects = await Project.find({ client: id })
    .select('title status budget deadline')
    .sort({ createdAt: -1 })
    .lean();
  return { ...client, projects };
}

export async function createClient(actorId: string, input: Partial<ClientAttrs>) {
  const client = await Client.create({ ...input, createdBy: actorId });
  await logActivity({
    actorId,
    action: 'created',
    entityType: 'client',
    entityId: client._id,
    entityName: client.name,
  });
  return client.toJSON();
}

export async function updateClient(actorId: string, id: string, input: Partial<ClientAttrs>) {
  const client = await Client.findByIdAndUpdate(id, input, { new: true, runValidators: true });
  if (!client) throw AppError.notFound('Client');
  await logActivity({
    actorId,
    action: 'updated',
    entityType: 'client',
    entityId: client._id,
    entityName: client.name,
    meta: { fields: Object.keys(input) },
  });
  return client.toJSON();
}

export async function deleteClient(actorId: string, id: string) {
  if (await Project.exists({ client: id })) {
    throw AppError.conflict('This client has projects. Delete or reassign them first.');
  }
  const client = await Client.findByIdAndDelete(id);
  if (!client) throw AppError.notFound('Client');
  await logActivity({
    actorId,
    action: 'deleted',
    entityType: 'client',
    entityId: client._id,
    entityName: client.name,
  });
}
