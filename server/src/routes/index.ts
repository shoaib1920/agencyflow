import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { uploadSingle } from '../middleware/upload';
import { idParam } from '../schemas/common';
import * as s from '../schemas';
import * as auth from '../controllers/auth.controller';
import * as users from '../controllers/user.controller';
import * as clients from '../controllers/client.controller';
import * as leads from '../controllers/lead.controller';
import * as projects from '../controllers/project.controller';
import * as misc from '../controllers/misc.controller';
import * as invoices from '../controllers/invoice.controller';
import * as collab from '../controllers/collab.controller';
import * as tools from '../controllers/tools.controller';
import { routes } from './registry';
import { env } from '../config/env';
import { z } from 'zod';
import { objectId } from '../schemas/common';

/*
 * Permission matrix (portal "client" users are excluded from every internal route)
 *  clients    read: team            create/update/import/export: admin, manager   delete: admin
 *  leads      read/create/move: team                                   delete/import/export: admin, manager
 *  projects   read: team (members: only theirs)                        create/update/delete: admin, manager
 *  tasks      read/create/update, comments, time: anyone on the project            delete: admin, manager
 *  invoices   admin, manager (portal clients: read their own sent/paid invoices + PDF)
 *  team       read: team    invite/update: admin    portal invites: admin, manager
 *  trash      list/restore: admin, manager    purge: admin
 */
const TEAM = ['admin', 'manager', 'member'] as const;
const STAFF = ['admin', 'manager'] as const;
const ADMIN = ['admin'] as const;
const EVERYONE = ['admin', 'manager', 'member', 'client'] as const;

const projectParam = z.object({ id: objectId });
const typeIdParams = s.trashParams;

// ---------- Auth & invites (public parts) ----------
const authRouter = Router();
const a = routes(authRouter, '/api/auth', 'Auth');
a('post', '/register', { summary: 'Create an account (first user becomes admin)', auth: false, body: s.registerSchema }, auth.register);
a('post', '/login', { summary: 'Sign in: returns an access token and sets the refresh cookie', auth: false, body: s.loginSchema }, auth.login);
a('post', '/refresh', { summary: 'Rotate the refresh token (cookie) and get a new access token', auth: false }, auth.refresh);
a('post', '/logout', { summary: 'Revoke the session family and clear the cookie', auth: false }, auth.logout);
a('get', '/invite', { summary: 'Preview an invite before accepting it', auth: false, query: s.tokenQuery }, collab.previewInvite);
a('post', '/accept-invite', { summary: 'Accept an invite: create the account and sign in', auth: false, body: s.acceptInviteSchema }, collab.acceptInvite);
a('get', '/me', { summary: 'Current user' }, auth.me);
a('patch', '/me', { summary: 'Update own profile and email preferences', body: s.updateProfileSchema }, auth.updateProfile);
a('patch', '/me/password', { summary: 'Change password (signs out other devices)', body: s.changePasswordSchema }, auth.changePassword);

// ---------- Team & invites ----------
const userRouter = Router();
const u = routes(userRouter, '/api/users', 'Team');
u('get', '/', { summary: 'Team list (admins: ?all=true includes inactive and portal users)', roles: TEAM }, users.list);
u('post', '/', { summary: 'Add a team member with a temporary password', roles: ADMIN, body: s.createUserSchema }, users.create);
u('patch', '/:id', { summary: 'Change role or activate/deactivate', roles: ADMIN, params: idParam, body: s.updateUserSchema }, users.update);

const inviteRouter = Router();
const inv = routes(inviteRouter, '/api/invites', 'Team');
inv('get', '/', { summary: 'Pending invites (?client= for one client)', roles: STAFF }, collab.listInvites);
inv('post', '/', { summary: 'Invite a team member (admin) or a client portal user (admin, manager)', roles: STAFF, body: s.inviteSchema }, collab.createInvite);
inv('delete', '/:id', { summary: 'Revoke a pending invite', roles: STAFF, params: idParam }, collab.revokeInvite);

// ---------- Clients ----------
const clientRouter = Router();
const c = routes(clientRouter, '/api/clients', 'Clients');
c('get', '/', { summary: 'List clients (search, status filter, sort, pagination)', roles: TEAM, query: s.clientListQuery }, clients.list);
c('get', '/export', { summary: 'Download all clients as CSV', roles: STAFF, produces: 'text/csv' }, tools.exportClients);
c('post', '/import', { summary: 'Import clients from parsed CSV rows', roles: STAFF, body: s.importBody }, tools.importClients);
c('get', '/:id', { summary: 'Client with its projects', roles: TEAM, params: idParam }, clients.get);
c('post', '/', { summary: 'Create client', roles: STAFF, body: s.clientBody }, clients.create);
c('patch', '/:id', { summary: 'Update client', roles: STAFF, params: idParam, body: s.clientUpdate }, clients.update);
c('delete', '/:id', { summary: 'Move client to trash', roles: ADMIN, params: idParam }, clients.remove);

// ---------- Leads ----------
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.isTest ? 1000 : 30,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anon',
  message: { success: false, data: null, message: 'AI limit reached (30 per hour). Try again later.', meta: null },
});
const leadRouter = Router();
const l = routes(leadRouter, '/api/leads', 'Leads');
l('get', '/', { summary: 'All leads for the Kanban board', roles: TEAM }, leads.list);
l('get', '/export', { summary: 'Download all leads as CSV', roles: STAFF, produces: 'text/csv' }, tools.exportLeads);
l('post', '/import', { summary: 'Import leads from parsed CSV rows', roles: STAFF, body: s.importBody }, tools.importLeads);
l('get', '/:id', { summary: 'One lead', roles: TEAM, params: idParam }, leads.get);
l('post', '/', { summary: 'Create lead', roles: TEAM, body: s.leadBody }, leads.create);
l('patch', '/:id', { summary: 'Update lead', roles: TEAM, params: idParam, body: s.leadUpdate }, leads.update);
l('patch', '/:id/stage', { summary: 'Move lead on the board (Won creates a client)', roles: TEAM, params: idParam, body: s.leadStageSchema }, leads.move);
// The AI limiter runs after authentication so it can rate-limit per user, not per IP
l('post', '/:id/ai', { summary: 'AI assist: summary, follow-up email or next steps (Claude, 30/hour per user)', roles: TEAM, params: idParam, body: s.aiBody, pre: [aiLimiter] }, tools.aiLead);
l('delete', '/:id', { summary: 'Move lead to trash', roles: STAFF, params: idParam }, leads.remove);

// ---------- Projects, tasks, files, comments, time ----------
const projectRouter = Router();
const p = routes(projectRouter, '/api/projects', 'Projects');
p('get', '/', { summary: 'List projects (members: only theirs)', roles: TEAM, query: s.projectListQuery }, projects.list);
p('get', '/:id', { summary: 'Project with members and files', roles: TEAM, params: idParam }, projects.get);
p('post', '/', { summary: 'Create project', roles: STAFF, body: s.projectBody }, projects.create);
p('patch', '/:id', { summary: 'Update project', roles: STAFF, params: idParam, body: s.projectUpdate }, projects.update);
p('delete', '/:id', { summary: 'Move project (and its tasks) to trash', roles: STAFF, params: idParam }, projects.remove);
p('get', '/:id/activity', { summary: 'Project timeline', roles: TEAM, params: idParam }, projects.activity);
p('post', '/:id/files', { summary: 'Upload a file (multipart field "file", max 10 MB)', roles: TEAM, params: idParam, pre: [uploadSingle], multipart: true }, projects.uploadFile);
p('delete', '/:id/files/:fileId', { summary: 'Remove a file', roles: TEAM, params: s.projectFileParams }, projects.deleteFile);

const t = routes(projectRouter, '/api/projects', 'Tasks');
t('get', '/:projectId/tasks', { summary: 'Tasks of a project', roles: TEAM, params: s.projectIdParam }, projects.listTasks);
t('post', '/:projectId/tasks', { summary: 'Create task (assignee is notified)', roles: TEAM, params: s.projectIdParam, body: s.taskBody }, projects.createTask);
t('patch', '/:projectId/tasks/:taskId', { summary: 'Update task (status, board position, assignee...)', roles: TEAM, params: s.projectTaskParams, body: s.taskUpdate }, projects.updateTask);
t('delete', '/:projectId/tasks/:taskId', { summary: 'Move task to trash', roles: STAFF, params: s.projectTaskParams }, projects.deleteTask);

const cm = routes(projectRouter, '/api/projects', 'Comments');
cm('get', '/:id/comments', { summary: 'Comments on the project or one task (?task=). Portal users get non-internal only', roles: EVERYONE, params: projectParam, query: s.commentQuery }, collab.listComments);
cm('post', '/:id/comments', { summary: 'Comment with @mentions (mentioned users get notified + emailed)', roles: EVERYONE, params: projectParam, body: s.commentBody }, collab.addComment);
cm('get', '/:id/comment-counts', { summary: 'Comment count per task', roles: TEAM, params: projectParam }, collab.commentCounts);

const tm = routes(projectRouter, '/api/projects', 'Time tracking');
tm('get', '/:id/time', { summary: 'Hours per person and task, recent entries', roles: TEAM, params: projectParam }, collab.projectTime);
tm('post', '/:id/time', { summary: 'Log time manually', roles: TEAM, params: projectParam, body: s.manualTime }, collab.manual);
tm('post', '/:id/timer/start', { summary: 'Start a timer on a task (stops any running timer)', roles: TEAM, params: projectParam, body: s.timerStart }, collab.start);

const commentRouter = Router();
routes(commentRouter, '/api/comments', 'Comments')('delete', '/:id', { summary: 'Delete a comment (author or staff)', roles: EVERYONE, params: idParam }, collab.deleteComment);

const timeRouter = Router();
const tr = routes(timeRouter, '/api/time', 'Time tracking');
tr('get', '/running', { summary: 'My running timer', roles: TEAM }, collab.running);
tr('post', '/stop', { summary: 'Stop my running timer', roles: TEAM }, collab.stop);
tr('delete', '/:id', { summary: 'Delete a time entry (owner or staff)', roles: TEAM, params: idParam }, collab.deleteEntry);

// ---------- Invoices ----------
const invoiceRouter = Router();
const iv = routes(invoiceRouter, '/api/invoices', 'Invoices');
iv('get', '/', { summary: 'List invoices (status incl. overdue, client filter). Portal: own sent/paid only', roles: [...STAFF, 'client'], query: s.invoiceListQuery }, invoices.list);
iv('post', '/', { summary: 'Create a draft invoice (totals computed on the server)', roles: STAFF, body: s.invoiceBody }, invoices.create);
iv('post', '/from-lead/:leadId', { summary: 'Draft an invoice from a won lead', roles: STAFF, params: z.object({ leadId: objectId }) }, invoices.fromLead);
iv('get', '/:id', { summary: 'One invoice', roles: [...STAFF, 'client'], params: idParam }, invoices.get);
iv('get', '/:id/pdf', { summary: 'Invoice as PDF', roles: [...STAFF, 'client'], params: idParam, produces: 'application/pdf' }, invoices.pdf);
iv('patch', '/:id', { summary: 'Edit a draft or sent invoice', roles: STAFF, params: idParam, body: s.invoiceUpdate }, invoices.update);
iv('post', '/:id/status', { summary: 'send (emails PDF) | pay | void', roles: STAFF, params: idParam, body: s.invoiceAction }, invoices.changeStatus);
iv('delete', '/:id', { summary: 'Move a draft/void invoice to trash', roles: STAFF, params: idParam }, invoices.remove);

// ---------- Client portal ----------
const portalRouter = Router();
const po = routes(portalRouter, '/api/portal', 'Client portal');
po('get', '/', { summary: 'Portal home: company, projects with progress, invoices', roles: ['client'] }, collab.portalOverview);
po('get', '/projects/:id', { summary: 'One of my projects: tasks, files, team', roles: ['client'], params: idParam }, collab.portalProject);

// ---------- Search, trash, AI, jobs, dashboard, notifications ----------
const miscRouter = Router();
const m = routes(miscRouter, '/api', 'Workspace');
m('get', '/dashboard', { summary: 'KPIs, charts, money summary, activity, my tasks', roles: TEAM }, misc.dashboard);
m('get', '/activity', { summary: 'Workspace activity feed', roles: TEAM }, misc.activity);
m('get', '/search', { summary: 'Global search (Ctrl+K)', roles: TEAM, query: s.searchQuery }, tools.search);
m('get', '/notifications', { summary: 'Latest 20 notifications + unread count', roles: EVERYONE }, misc.notifications);
m('patch', '/notifications/read-all', { summary: 'Mark all as read', roles: EVERYONE }, misc.markRead);
m('patch', '/notifications/:id/read', { summary: 'Mark one as read', roles: EVERYONE, params: idParam }, misc.markRead);
m('get', '/trash', { summary: 'Items in the trash (kept 30 days)', roles: STAFF }, tools.listTrash);
m('post', '/trash/:type/:id/restore', { summary: 'Restore from trash', roles: STAFF, params: typeIdParams }, tools.restore);
m('delete', '/trash/:type/:id', { summary: 'Delete permanently', roles: ADMIN, params: typeIdParams }, tools.purge);
m('get', '/ai/status', { summary: 'Whether AI assist is configured', roles: TEAM }, tools.aiStatus);
m('post', '/jobs/:name', { summary: 'Run a background job now: reminders | purge-trash', roles: ADMIN, params: z.object({ name: z.enum(['reminders', 'purge-trash']) }) }, tools.runJob);

export const apiRouter = Router();
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/invites', inviteRouter);
apiRouter.use('/clients', clientRouter);
apiRouter.use('/leads', leadRouter);
apiRouter.use('/projects', projectRouter);
apiRouter.use('/comments', commentRouter);
apiRouter.use('/time', timeRouter);
apiRouter.use('/invoices', invoiceRouter);
apiRouter.use('/portal', portalRouter);
apiRouter.use('/', miscRouter);
