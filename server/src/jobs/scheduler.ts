import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Task } from '../models/Task';
import { notify } from '../services/notification.service';
import { purgeExpired } from '../services/trash.service';

/**
 * Due-date reminders: tasks due within 24h or already overdue get one reminder per day
 * (in-app + email). `lastReminderAt` makes the job safe to run any number of times.
 */
export async function sendTaskReminders(now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 24 * 3_600_000);
  const dayAgo = new Date(now.getTime() - 20 * 3_600_000);
  const tasks = await Task.find({
    status: { $ne: 'done' },
    assignee: { $ne: null },
    dueDate: { $ne: null, $lte: soon },
    $or: [{ lastReminderAt: null }, { lastReminderAt: { $lt: dayAgo } }],
  })
    .populate('project', 'title deletedAt')
    .limit(500);

  let sent = 0;
  for (const task of tasks) {
    const project = task.project as unknown as { _id: unknown; title: string; deletedAt?: Date } | null;
    if (!project || project.deletedAt) continue;
    const overdue = task.dueDate! < now;
    await notify({
      recipients: [task.assignee!],
      type: 'reminder',
      title: overdue ? `Overdue: ${task.title}` : `Due soon: ${task.title}`,
      body: `${project.title} · due ${task.dueDate!.toDateString()}`,
      link: `/projects/${String(project._id)}`,
      email: true,
    });
    task.lastReminderAt = now;
    await task.save();
    sent++;
  }
  return sent;
}

/**
 * In-process cron. Note: on Render's free tier the server sleeps when idle, so jobs only
 * run while it is awake; admins can also trigger them from POST /api/jobs/:name.
 */
export function startScheduler() {
  if (!env.CRON_ENABLED || env.isTest) return;
  cron.schedule('0 * * * *', () => {
    sendTaskReminders()
      .then((n) => n && logger.info({ n }, 'Task reminders sent'))
      .catch((err) => logger.error({ err }, 'Reminder job failed'));
  });
  cron.schedule('30 3 * * *', () => {
    purgeExpired()
      .then((n) => n && logger.info({ n }, 'Trash purged'))
      .catch((err) => logger.error({ err }, 'Purge job failed'));
  });
  logger.info('Background jobs scheduled (hourly reminders, daily trash purge)');
}
