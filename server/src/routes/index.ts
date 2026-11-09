import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadSingle } from '../middleware/upload';
import { idParam } from '../schemas/common';
import * as s from '../schemas';
import * as auth from '../controllers/auth.controller';
import * as users from '../controllers/user.controller';
import * as clients from '../controllers/client.controller';
import * as leads from '../controllers/lead.controller';
import * as projects from '../controllers/project.controller';
import * as misc from '../controllers/misc.controller';

/*
 * Permission matrix
 *  clients   read: all       create/update: admin, manager   delete: admin
 *  leads     read/create/update/move: all                    delete: admin, manager
 *  projects  read: all (members see only their projects)     create/update/delete: admin, manager
 *  tasks     read/create/update: anyone on the project       delete: admin, manager
 *  team      read: all (for assignee pickers)                create/update: admin
 */
const STAFF = ['admin', 'manager'] as const;

// ---------- Auth ----------
const authRouter = Router();
authRouter.post('/register', validate({ body: s.registerSchema }), auth.register);
authRouter.post('/login', validate({ body: s.loginSchema }), auth.login);
authRouter.post('/refresh', auth.refresh);
authRouter.post('/logout', auth.logout);
authRouter.get('/me', authenticate, auth.me);
authRouter.patch('/me', authenticate, validate({ body: s.updateProfileSchema }), auth.updateProfile);
authRouter.patch(
  '/me/password',
  authenticate,
  validate({ body: s.changePasswordSchema }),
  auth.changePassword,
);

// ---------- Team ----------
const userRouter = Router();
userRouter.use(authenticate);
userRouter.get('/', users.list);
userRouter.post('/', requireRole('admin'), validate({ body: s.createUserSchema }), users.create);
userRouter.patch(
  '/:id',
  requireRole('admin'),
  validate({ params: idParam, body: s.updateUserSchema }),
  users.update,
);

// ---------- Clients ----------
const clientRouter = Router();
clientRouter.use(authenticate);
clientRouter.get('/', validate({ query: s.clientListQuery }), clients.list);
clientRouter.get('/:id', validate({ params: idParam }), clients.get);
clientRouter.post('/', requireRole(...STAFF), validate({ body: s.clientBody }), clients.create);
clientRouter.patch(
  '/:id',
  requireRole(...STAFF),
  validate({ params: idParam, body: s.clientUpdate }),
  clients.update,
);
clientRouter.delete('/:id', requireRole('admin'), validate({ params: idParam }), clients.remove);

// ---------- Leads ----------
const leadRouter = Router();
leadRouter.use(authenticate);
leadRouter.get('/', leads.list);
leadRouter.get('/:id', validate({ params: idParam }), leads.get);
leadRouter.post('/', validate({ body: s.leadBody }), leads.create);
leadRouter.patch('/:id', validate({ params: idParam, body: s.leadUpdate }), leads.update);
leadRouter.patch('/:id/stage', validate({ params: idParam, body: s.leadStageSchema }), leads.move);
leadRouter.delete('/:id', requireRole(...STAFF), validate({ params: idParam }), leads.remove);

// ---------- Projects, tasks, files ----------
const projectRouter = Router();
projectRouter.use(authenticate);
projectRouter.get('/', validate({ query: s.projectListQuery }), projects.list);
projectRouter.get('/:id', validate({ params: idParam }), projects.get);
projectRouter.post('/', requireRole(...STAFF), validate({ body: s.projectBody }), projects.create);
projectRouter.patch(
  '/:id',
  requireRole(...STAFF),
  validate({ params: idParam, body: s.projectUpdate }),
  projects.update,
);
projectRouter.delete('/:id', requireRole(...STAFF), validate({ params: idParam }), projects.remove);
projectRouter.get('/:id/activity', validate({ params: idParam }), projects.activity);
projectRouter.post('/:id/files', validate({ params: idParam }), uploadSingle, projects.uploadFile);
projectRouter.delete(
  '/:id/files/:fileId',
  validate({ params: s.projectFileParams }),
  projects.deleteFile,
);

projectRouter.get('/:projectId/tasks', validate({ params: s.projectIdParam }), projects.listTasks);
projectRouter.post(
  '/:projectId/tasks',
  validate({ params: s.projectIdParam, body: s.taskBody }),
  projects.createTask,
);
projectRouter.patch(
  '/:projectId/tasks/:taskId',
  validate({ params: s.projectTaskParams, body: s.taskUpdate }),
  projects.updateTask,
);
projectRouter.delete(
  '/:projectId/tasks/:taskId',
  requireRole(...STAFF),
  validate({ params: s.projectTaskParams }),
  projects.deleteTask,
);

// ---------- Dashboard, activity, notifications ----------
// (auth applied per route so unknown /api paths still fall through to a 404)
const miscRouter = Router();
miscRouter.get('/dashboard', authenticate, misc.dashboard);
miscRouter.get('/activity', authenticate, misc.activity);
miscRouter.get('/notifications', authenticate, misc.notifications);
miscRouter.patch('/notifications/read-all', authenticate, misc.markRead);
miscRouter.patch(
  '/notifications/:id/read',
  authenticate,
  validate({ params: idParam }),
  misc.markRead,
);

export const apiRouter = Router();
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/clients', clientRouter);
apiRouter.use('/leads', leadRouter);
apiRouter.use('/projects', projectRouter);
apiRouter.use('/', miscRouter);
