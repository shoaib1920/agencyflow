import { Types } from 'mongoose';
import { Comment } from '../models/Comment';
import { Task } from '../models/Task';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import type { AuthUser } from '../utils/types';
import { assertProjectAccess } from './project.service';
import { notify } from './notification.service';
import { logActivity } from './activity.service';

export async function listComments(user: AuthUser, projectId: string, taskId?: string) {
  await assertProjectAccess(user, projectId);
  const filter: Record<string, unknown> = { project: projectId, task: taskId ?? null };
  if (user.role === 'client') filter.internal = false; // internal team notes never reach the portal
  return Comment.find(filter)
    .sort({ createdAt: 1 })
    .populate('author', 'name avatarColor role')
    .populate('mentions', 'name')
    .lean();
}

/**
 * Posts a comment. Mentions are sent as user ids by the client (picked from the @ menu)
 * and re-validated here: only team members who can see the project can be mentioned.
 */
export async function addComment(
  user: AuthUser,
  projectId: string,
  input: { body: string; task?: string | null; mentions?: string[]; internal?: boolean },
) {
  const project = await assertProjectAccess(user, projectId);
  let taskTitle: string | undefined;
  let assignee: string | undefined;
  if (input.task) {
    const task = await Task.findOne({ _id: input.task, project: projectId }).select('title assignee').lean();
    if (!task) throw AppError.notFound('Task');
    taskTitle = task.title;
    assignee = task.assignee ? String(task.assignee) : undefined;
  }

  const memberIds = project.members.map(String);
  const requested = [...new Set(input.mentions ?? [])];
  const mentionable = requested.length
    ? await User.find({
        _id: { $in: requested },
        isActive: true,
        $or: [{ role: { $in: ['admin', 'manager'] } }, { _id: { $in: memberIds } }],
      })
        .select('_id')
        .lean()
    : [];
  const mentions = mentionable.map((u) => String(u._id));

  const comment = await Comment.create({
    project: projectId,
    task: input.task || undefined,
    author: user.id,
    body: input.body,
    mentions,
    internal: user.role === 'client' ? false : Boolean(input.internal),
  });

  const where = taskTitle ? `${taskTitle} (${project.title})` : project.title;
  const link = user.role === 'client' ? `/projects/${projectId}` : `/projects/${projectId}`;
  const preview = input.body.length > 140 ? `${input.body.slice(0, 140)}…` : input.body;

  if (mentions.length) {
    await notify({ recipients: mentions, actorId: user.id, type: 'mention', title: `${user.name} mentioned you on ${where}`, body: preview, link, email: true });
  }
  // Task assignee hears about comments on their task; the team hears about client messages
  const others = new Set<string>();
  if (assignee) others.add(assignee);
  if (user.role === 'client') memberIds.forEach((m) => others.add(m));
  mentions.forEach((m) => others.delete(m));
  if (others.size) {
    await notify({
      recipients: [...others],
      actorId: user.id,
      type: 'comment',
      title: user.role === 'client' ? `Client message on ${project.title}` : `New comment on ${where}`,
      body: preview,
      link,
      email: user.role === 'client',
    });
  }

  if (user.role !== 'client') {
    await logActivity({ actorId: user.id, action: 'commented on', entityType: taskTitle ? 'task' : 'project', entityId: comment.task ?? project._id, entityName: taskTitle ?? project.title, projectId });
  }
  return Comment.findById(comment._id).populate('author', 'name avatarColor role').populate('mentions', 'name').lean();
}

export async function deleteComment(user: AuthUser, id: string) {
  const comment = await Comment.findById(id);
  if (!comment) throw AppError.notFound('Comment');
  const isAuthor = String(comment.author) === user.id;
  if (!isAuthor && !['admin', 'manager'].includes(user.role)) throw AppError.forbidden();
  await comment.deleteOne();
}

/** Comment counts per task, for the task list badges. */
export async function commentCounts(projectId: string) {
  const rows = await Comment.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { project: new Types.ObjectId(projectId), task: { $ne: null } } },
    { $group: { _id: '$task', count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
}
