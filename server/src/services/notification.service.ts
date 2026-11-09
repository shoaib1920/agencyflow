import { Types } from 'mongoose';
import { Notification } from '../models/Notification';
import { emitToUser } from '../socket';

interface NotifyInput {
  recipients: (string | Types.ObjectId)[];
  actorId?: string;
  type: 'task_assigned' | 'lead_stage' | 'lead_won' | 'system';
  title: string;
  body?: string;
  link?: string;
}

/**
 * Persist a notification per recipient, then push it live over Socket.io to
 * that user's room. The actor never notifies themselves.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const unique = [...new Set(input.recipients.map(String))].filter((id) => id !== input.actorId);
  if (unique.length === 0) return;

  const docs = await Notification.insertMany(
    unique.map((recipient) => ({
      recipient,
      actor: input.actorId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    })),
  );
  for (const doc of docs) emitToUser(String(doc.recipient), 'notification:new', doc.toJSON());
}

export async function listNotifications(userId: string, limit = 20) {
  const recipient = new Types.ObjectId(userId);
  const [items, unread] = await Promise.all([
    Notification.find({ recipient })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'name avatarColor')
      .lean(),
    Notification.countDocuments({ recipient, read: false }),
  ]);
  return { items, unread };
}

export async function markRead(userId: string, id?: string) {
  const filter = id ? { _id: id, recipient: userId } : { recipient: userId, read: false };
  await Notification.updateMany(filter, { $set: { read: true } });
}
