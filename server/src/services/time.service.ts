import { Types } from 'mongoose';
import { TimeEntry } from '../models/TimeEntry';
import { Task } from '../models/Task';
import { AppError } from '../utils/AppError';
import type { AuthUser } from '../utils/types';
import { assertProjectAccess } from './project.service';

const minutesBetween = (a: Date, b: Date) => Math.max(1, Math.round((b.getTime() - a.getTime()) / 60_000));

async function assertTask(user: AuthUser, projectId: string, taskId: string) {
  await assertProjectAccess(user, projectId);
  const task = await Task.findOne({ _id: taskId, project: projectId }).select('title').lean();
  if (!task) throw AppError.notFound('Task');
  return task;
}

/** The running timer of a user, with task and project titles for the top-bar chip. */
export async function runningTimer(userId: string) {
  return TimeEntry.findOne({ user: userId, endedAt: null })
    .populate('task', 'title')
    .populate('project', 'title')
    .lean();
}

/** Stops whatever is running (if anything). Returns the finished entry. */
export async function stopTimer(userId: string) {
  const entry = await TimeEntry.findOne({ user: userId, endedAt: null });
  if (!entry) return null;
  entry.endedAt = new Date();
  entry.minutes = minutesBetween(entry.startedAt, entry.endedAt);
  await entry.save();
  return entry.toJSON();
}

/** Starting a timer stops the previous one: a person can only work on one task at a time. */
export async function startTimer(user: AuthUser, projectId: string, taskId: string) {
  await assertTask(user, projectId, taskId);
  await stopTimer(user.id);
  await TimeEntry.create({ user: user.id, project: projectId, task: taskId, startedAt: new Date() });
  return runningTimer(user.id);
}

export async function addManualEntry(
  user: AuthUser,
  projectId: string,
  input: { task: string; minutes: number; note?: string; date?: Date | null },
) {
  await assertTask(user, projectId, input.task);
  const endedAt = input.date ? new Date(input.date) : new Date();
  const startedAt = new Date(endedAt.getTime() - input.minutes * 60_000);
  const entry = await TimeEntry.create({
    user: user.id,
    project: projectId,
    task: input.task,
    startedAt,
    endedAt,
    minutes: input.minutes,
    note: input.note,
  });
  return entry.toJSON();
}

export async function deleteEntry(user: AuthUser, id: string) {
  const entry = await TimeEntry.findById(id);
  if (!entry) throw AppError.notFound('Time entry');
  if (String(entry.user) !== user.id && !['admin', 'manager'].includes(user.role)) throw AppError.forbidden();
  await entry.deleteOne();
}

/** Hours per person and per task for a project, plus the latest entries. */
export async function projectTime(user: AuthUser, projectId: string) {
  const project = await assertProjectAccess(user, projectId);
  const pid = new Types.ObjectId(projectId);
  const [byUser, byTask, recent] = await Promise.all([
    TimeEntry.aggregate<{ _id: Types.ObjectId; minutes: number; name: string; avatarColor?: string }>([
      { $match: { project: pid, endedAt: { $ne: null } } },
      { $group: { _id: '$user', minutes: { $sum: '$minutes' } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $unwind: '$u' },
      { $project: { minutes: 1, name: '$u.name', avatarColor: '$u.avatarColor' } },
      { $sort: { minutes: -1 } },
    ]),
    TimeEntry.aggregate<{ _id: Types.ObjectId; minutes: number }>([
      { $match: { project: pid, endedAt: { $ne: null } } },
      { $group: { _id: '$task', minutes: { $sum: '$minutes' } } },
    ]),
    TimeEntry.find({ project: pid, endedAt: { $ne: null } })
      .sort({ endedAt: -1 })
      .limit(10)
      .populate('user', 'name avatarColor')
      .populate('task', 'title')
      .lean(),
  ]);
  const totalMinutes = byUser.reduce((n, u) => n + u.minutes, 0);
  return {
    totalMinutes,
    estimatedHours: project.estimatedHours ?? null,
    byUser,
    byTask: Object.fromEntries(byTask.map((t) => [String(t._id), t.minutes])),
    recent,
  };
}
