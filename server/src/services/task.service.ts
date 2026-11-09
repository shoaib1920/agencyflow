import { Types } from 'mongoose';
import { Task, type TaskAttrs } from '../models/Task';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import type { AuthUser } from '../utils/types';
import { logActivity } from './activity.service';
import { notify } from './notification.service';
import { assertProjectAccess } from './project.service';

type ProjectDoc = Awaited<ReturnType<typeof assertProjectAccess>>;

export async function listTasks(user: AuthUser, projectId: string) {
  await assertProjectAccess(user, projectId);
  return Task.find({ project: projectId })
    .sort({ status: 1, dueDate: 1, createdAt: -1 })
    .populate('assignee', 'name avatarColor')
    .lean();
}

async function notifyAssignee(actor: AuthUser, assigneeId: string, taskTitle: string, projectId: string, projectTitle: string) {
  await notify({
    recipients: [assigneeId],
    actorId: actor.id,
    type: 'task_assigned',
    title: `New task: ${taskTitle}`,
    body: `${actor.name} assigned you a task in ${projectTitle}`,
    link: `/projects/${projectId}`,
  });
}

/** Assignee must be an active user; if they aren't on the project yet, add them so they can see it. */
async function ensureAssignee(project: ProjectDoc, id: unknown) {
  if (!id) return;
  if (!(await User.exists({ _id: id, isActive: true }))) {
    throw AppError.badRequest('Assignee does not exist');
  }
  if (!project.members.some((m) => String(m) === String(id))) {
    project.members.push(new Types.ObjectId(String(id)));
    await project.save();
  }
}

export async function createTask(user: AuthUser, projectId: string, input: Partial<TaskAttrs>) {
  const project = await assertProjectAccess(user, projectId);
  await ensureAssignee(project, input.assignee);
  const task = await Task.create({
    ...input,
    project: projectId,
    createdBy: user.id,
    completedAt: input.status === 'done' ? new Date() : undefined,
  });
  await logActivity({
    actorId: user.id,
    action: 'created task',
    entityType: 'task',
    entityId: task._id,
    entityName: task.title,
    projectId,
  });
  if (task.assignee) {
    await notifyAssignee(user, String(task.assignee), task.title, projectId, project.title);
  }
  return task.populate('assignee', 'name avatarColor');
}

export async function updateTask(
  user: AuthUser,
  projectId: string,
  taskId: string,
  input: Partial<TaskAttrs>,
) {
  const project = await assertProjectAccess(user, projectId);
  const task = await Task.findOne({ _id: taskId, project: projectId });
  if (!task) throw AppError.notFound('Task');
  await ensureAssignee(project, input.assignee);

  const prevStatus = task.status;
  const prevAssignee = task.assignee ? String(task.assignee) : null;
  Object.assign(task, input);
  if (input.status === 'done' && prevStatus !== 'done') task.completedAt = new Date();
  if (input.status && input.status !== 'done') task.completedAt = undefined;
  await task.save();

  if (input.status && input.status !== prevStatus) {
    await logActivity({
      actorId: user.id,
      action: input.status === 'done' ? 'completed task' : `moved task to ${input.status}`,
      entityType: 'task',
      entityId: task._id,
      entityName: task.title,
      projectId,
    });
  }
  const newAssignee = task.assignee ? String(task.assignee) : null;
  if (newAssignee && newAssignee !== prevAssignee) {
    await notifyAssignee(user, newAssignee, task.title, projectId, project.title);
  }
  return task.populate('assignee', 'name avatarColor');
}

export async function deleteTask(user: AuthUser, projectId: string, taskId: string) {
  await assertProjectAccess(user, projectId);
  const task = await Task.findOneAndDelete({ _id: taskId, project: projectId });
  if (!task) throw AppError.notFound('Task');
  await logActivity({
    actorId: user.id,
    action: 'deleted task',
    entityType: 'task',
    entityId: task._id,
    entityName: task.title,
    projectId,
  });
}

/** "My tasks" across all projects, used on the dashboard. */
export async function myOpenTasks(userId: string) {
  return Task.find({ assignee: userId, status: { $ne: 'done' } })
    .sort({ dueDate: 1 })
    .limit(8)
    .populate('project', 'title')
    .lean();
}
