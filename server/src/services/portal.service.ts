import { Types } from 'mongoose';
import { Client } from '../models/Client';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { Invoice } from '../models/Invoice';
import { AppError } from '../utils/AppError';
import type { AuthUser } from '../utils/types';
import { displayStatus } from './invoice.service';

/**
 * Everything a client-portal user can see is filtered by their own clientId, taken from
 * the signed access token, never from the request. Internal data (budgets, team notes,
 * drafts) is left out on purpose.
 */
function clientIdOf(user: AuthUser) {
  if (user.role !== 'client' || !user.clientId) throw AppError.forbidden();
  return new Types.ObjectId(user.clientId);
}

export async function portalOverview(user: AuthUser) {
  const clientId = clientIdOf(user);
  const [client, projects, invoices] = await Promise.all([
    Client.findById(clientId).select('name company email').lean(),
    Project.find({ client: clientId }).select('title status deadline description').sort({ deadline: 1 }).lean(),
    Invoice.find({ client: clientId, status: { $in: ['sent', 'paid'] } })
      .select('number total currency status dueDate issueDate paidAt')
      .sort({ issueDate: -1 })
      .lean(),
  ]);
  if (!client) throw AppError.notFound('Client');

  const counts = await Task.aggregate<{ _id: Types.ObjectId; total: number; done: number }>([
    { $match: { project: { $in: projects.map((p) => p._id) } } },
    { $group: { _id: '$project', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  const invoiceRows = invoices.map((i) => ({ ...i, displayStatus: displayStatus(i) }));
  const due = invoiceRows.filter((i) => i.status === 'sent');

  return {
    client,
    projects: projects.map((p) => ({ ...p, taskCount: byId.get(String(p._id))?.total ?? 0, doneCount: byId.get(String(p._id))?.done ?? 0 })),
    invoices: invoiceRows,
    amountDue: due.reduce((n, i) => n + i.total, 0),
    overdueCount: due.filter((i) => i.displayStatus === 'overdue').length,
  };
}

export async function portalProject(user: AuthUser, projectId: string) {
  const clientId = clientIdOf(user);
  const project = await Project.findOne({ _id: projectId, client: clientId })
    .select('title description status deadline members attachments createdAt')
    .populate('members', 'name avatarColor title')
    .lean();
  if (!project) throw AppError.notFound('Project');
  const tasks = await Task.find({ project: projectId })
    .select('title status dueDate completedAt priority')
    .sort({ status: 1, dueDate: 1 })
    .lean();
  return {
    ...project,
    attachments: (project.attachments ?? []).map((a) => ({ _id: a._id, name: a.name, url: a.url, size: a.size, mimeType: a.mimeType, createdAt: a.createdAt })),
    tasks,
  };
}
