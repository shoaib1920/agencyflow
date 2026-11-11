import { Client } from '../models/Client';
import { Lead } from '../models/Lead';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { Invoice } from '../models/Invoice';
import { escapeRegex } from '../utils/pagination';
import type { AuthUser } from '../utils/types';
import { scopeFilter } from './project.service';

/**
 * Global search for the Ctrl+K palette: up to 5 hits per type, run in parallel.
 * Members only get tasks/projects they can access; invoices are staff-only.
 */
export async function globalSearch(user: AuthUser, q: string) {
  const rx = new RegExp(escapeRegex(q.trim()), 'i');
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const scope = scopeFilter(user);
  const visibleProjects = user.role === 'member' ? await Project.find(scope).distinct('_id') : null;

  const [clients, leads, projects, tasks, invoices] = await Promise.all([
    Client.find({ $or: [{ name: rx }, { company: rx }, { email: rx }] }).select('name company status').limit(5).lean(),
    Lead.find({ $or: [{ title: rx }, { company: rx }, { contactName: rx }] }).select('title company stage value').limit(5).lean(),
    Project.find({ ...scope, title: rx }).select('title status').populate('client', 'name company').limit(5).lean(),
    Task.find({ title: rx, ...(visibleProjects ? { project: { $in: visibleProjects } } : {}) })
      .select('title status project')
      .populate('project', 'title')
      .limit(5)
      .lean(),
    isStaff ? Invoice.find({ number: rx }).select('number total status client').populate('client', 'name').limit(5).lean() : [],
  ]);
  return { clients, leads, projects, tasks, invoices };
}
