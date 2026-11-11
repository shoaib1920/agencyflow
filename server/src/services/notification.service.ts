import { Types } from 'mongoose';
import { Notification, type NotificationType } from '../models/Notification';
import { User } from '../models/User';
import { emitToUser } from '../socket';
import { env } from '../config/env';
import { emailLayout, sendMail } from './mail.service';

interface NotifyInput {
  recipients: (string | Types.ObjectId)[];
  actorId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Also send an email to recipients who have email notifications on. */
  email?: boolean;
}

/**
 * Persist a notification per recipient, push it live over Socket.io to that user's room,
 * and optionally email it. The actor never notifies themselves.
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

  if (input.email) {
    const users = await User.find({ _id: { $in: unique }, isActive: true, emailNotifications: { $ne: false } })
      .select('email name')
      .lean();
    await Promise.all(
      users.map((u) =>
        sendMail(
          u.email,
          input.title,
          emailLayout({
            heading: input.title,
            paragraphs: [`Hi ${u.name.split(' ')[0]},`, input.body ?? ''].filter(Boolean),
            cta: input.link ? { label: 'Open in AgencyFlow', url: `${env.appUrl}${input.link}` } : undefined,
          }),
        ),
      ),
    );
  }
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
