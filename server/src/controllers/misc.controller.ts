import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentUser } from '../middleware/auth';
import * as notificationService from '../services/notification.service';
import { listActivity } from '../services/activity.service';
import { getStats } from '../services/dashboard.service';
import { myOpenTasks } from '../services/task.service';
import { invoiceSummary } from '../services/invoice.service';

export const dashboard = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const [stats, activity, myTasks, money] = await Promise.all([
    getStats(),
    listActivity({ limit: 12 }),
    myOpenTasks(user.id),
    isStaff ? invoiceSummary() : Promise.resolve(null), // money is staff-only
  ]);
  sendSuccess(res, { ...stats, activity, myTasks, money });
});

export const activity = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  sendSuccess(res, await listActivity({ limit }));
});

export const notifications = asyncHandler(async (req, res) => {
  const { items, unread } = await notificationService.listNotifications(currentUser(req).id);
  sendSuccess(res, items, { meta: { unread } });
});

export const markRead = asyncHandler(async (req, res) => {
  await notificationService.markRead(currentUser(req).id, req.params.id);
  sendSuccess(res, null);
});
