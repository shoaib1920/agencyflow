import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import { currentUser } from '../middleware/auth';
import * as projectService from '../services/project.service';
import * as taskService from '../services/task.service';
import { listActivity } from '../services/activity.service';

type ListQuery = Parameters<typeof projectService.listProjects>[1];

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await projectService.listProjects(
    currentUser(req),
    req.query as unknown as ListQuery,
  );
  sendSuccess(res, items, { meta });
});

export const get = asyncHandler(async (req, res) => {
  sendSuccess(res, await projectService.getProject(currentUser(req), req.params.id as string));
});

export const create = asyncHandler(async (req, res) => {
  const project = await projectService.createProject(currentUser(req).id, req.body);
  sendSuccess(res, project, { status: 201, message: 'Project created' });
});

export const update = asyncHandler(async (req, res) => {
  const project = await projectService.updateProject(
    currentUser(req).id,
    req.params.id as string,
    req.body,
  );
  sendSuccess(res, project, { message: 'Project updated' });
});

export const remove = asyncHandler(async (req, res) => {
  await projectService.deleteProject(currentUser(req).id, req.params.id as string);
  sendSuccess(res, null, { message: 'Project deleted' });
});

export const activity = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  await projectService.assertProjectAccess(user, req.params.id as string);
  sendSuccess(res, await listActivity({ projectId: req.params.id as string, limit: 30 }));
});

export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('No file uploaded (field name must be "file")');
  const file = await projectService.addAttachment(currentUser(req), req.params.id as string, req.file);
  sendSuccess(res, file, { status: 201, message: 'File uploaded' });
});

export const deleteFile = asyncHandler(async (req, res) => {
  await projectService.removeAttachment(
    currentUser(req),
    req.params.id as string,
    req.params.fileId as string,
  );
  sendSuccess(res, null, { message: 'File removed' });
});

// ---- Tasks (nested under /projects/:projectId/tasks) ----
export const listTasks = asyncHandler(async (req, res) => {
  sendSuccess(res, await taskService.listTasks(currentUser(req), req.params.projectId as string));
});

export const createTask = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(currentUser(req), req.params.projectId as string, req.body);
  sendSuccess(res, task, { status: 201, message: 'Task created' });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await taskService.updateTask(
    currentUser(req),
    req.params.projectId as string,
    req.params.taskId as string,
    req.body,
  );
  sendSuccess(res, task, { message: 'Task updated' });
});

export const deleteTask = asyncHandler(async (req, res) => {
  await taskService.deleteTask(currentUser(req), req.params.projectId as string, req.params.taskId as string);
  sendSuccess(res, null, { message: 'Task deleted' });
});
