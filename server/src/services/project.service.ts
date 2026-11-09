import { Types, type FilterQuery, type SortOrder } from 'mongoose';
import { Project, type ProjectAttrs } from '../models/Project';
import { Task } from '../models/Task';
import { Client } from '../models/Client';
import { Activity } from '../models/Activity';
import { AppError } from '../utils/AppError';
import { buildMeta, escapeRegex } from '../utils/pagination';
import type { AuthUser } from '../utils/types';
import { logActivity } from './activity.service';
import { deleteStoredFile, storeFile } from './upload.service';

/** Members only see projects they are assigned to; admins and managers see everything. */
function scopeFilter(user: AuthUser): FilterQuery<ProjectAttrs> {
  return user.role === 'member' ? { members: new Types.ObjectId(user.id) } : {};
}

export async function assertProjectAccess(user: AuthUser, projectId: string) {
  const project = await Project.findOne({ _id: projectId, ...scopeFilter(user) });
  if (!project) throw AppError.notFound('Project');
  return project;
}

interface ListInput {
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  search?: string;
  status?: ProjectAttrs['status'];
  client?: string;
}

export async function listProjects(user: AuthUser, q: ListInput) {
  const filter: FilterQuery<ProjectAttrs> = { ...scopeFilter(user) };
  if (q.status) filter.status = q.status;
  if (q.client) filter.client = q.client;
  if (q.search) filter.title = new RegExp(escapeRegex(q.search), 'i');
  const sortSpec: Record<string, SortOrder> = { [q.sort]: q.order === 'asc' ? 1 : -1, _id: 1 };

  const [items, total] = await Promise.all([
    Project.find(filter)
      .select('-attachments')
      .sort(sortSpec)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('client', 'name company')
      .populate('members', 'name avatarColor')
      .lean(),
    Project.countDocuments(filter),
  ]);

  // Task progress for the visible page in a single aggregation
  const counts = await Task.aggregate<{ _id: Types.ObjectId; total: number; done: number }>([
    { $match: { project: { $in: items.map((p) => p._id) } } },
    {
      $group: {
        _id: '$project',
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
      },
    },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  const withProgress = items.map((p) => {
    const c = byId.get(String(p._id));
    return { ...p, taskCount: c?.total ?? 0, doneCount: c?.done ?? 0 };
  });

  return { items: withProgress, meta: buildMeta(q.page, q.limit, total) };
}

export async function getProject(user: AuthUser, id: string) {
  const project = await Project.findOne({ _id: id, ...scopeFilter(user) })
    .populate('client', 'name company email')
    .populate('members', 'name email avatarColor role')
    .populate('attachments.uploadedBy', 'name')
    .lean();
  if (!project) throw AppError.notFound('Project');
  return project;
}

export async function createProject(actorId: string, input: Partial<ProjectAttrs>) {
  if (!(await Client.exists({ _id: input.client }))) throw AppError.badRequest('Client does not exist');
  const project = await Project.create({ ...input, createdBy: actorId });
  await logActivity({
    actorId,
    action: 'created',
    entityType: 'project',
    entityId: project._id,
    entityName: project.title,
    projectId: project._id,
  });
  return project.toJSON();
}

export async function updateProject(actorId: string, id: string, input: Partial<ProjectAttrs>) {
  const project = await Project.findByIdAndUpdate(id, input, { new: true, runValidators: true });
  if (!project) throw AppError.notFound('Project');
  await logActivity({
    actorId,
    action: input.status === 'completed' ? 'completed' : 'updated',
    entityType: 'project',
    entityId: project._id,
    entityName: project.title,
    projectId: project._id,
    meta: { fields: Object.keys(input) },
  });
  return project.toJSON();
}

export async function deleteProject(actorId: string, id: string) {
  const project = await Project.findByIdAndDelete(id);
  if (!project) throw AppError.notFound('Project');
  await Promise.all([
    Task.deleteMany({ project: id }),
    Activity.deleteMany({ project: id }),
    ...project.attachments.map((a) => deleteStoredFile(a.storage, a.url, a.publicId ?? undefined)),
  ]);
  await logActivity({
    actorId,
    action: 'deleted',
    entityType: 'project',
    entityId: project._id,
    entityName: project.title,
  });
}

export async function addAttachment(user: AuthUser, id: string, file: Express.Multer.File) {
  const project = await assertProjectAccess(user, id);
  const stored = await storeFile(file);
  project.attachments.push({
    name: file.originalname,
    url: stored.url,
    size: file.size,
    mimeType: file.mimetype,
    storage: stored.storage,
    publicId: stored.publicId,
    uploadedBy: new Types.ObjectId(user.id),
  });
  await project.save();
  await logActivity({
    actorId: user.id,
    action: 'uploaded',
    entityType: 'project',
    entityId: project._id,
    entityName: file.originalname,
    projectId: project._id,
  });
  return project.attachments[project.attachments.length - 1];
}

export async function removeAttachment(user: AuthUser, id: string, fileId: string) {
  const project = await assertProjectAccess(user, id);
  const file = project.attachments.id(fileId);
  if (!file) throw AppError.notFound('File');
  await deleteStoredFile(file.storage, file.url, file.publicId ?? undefined);
  file.deleteOne();
  await project.save();
}
