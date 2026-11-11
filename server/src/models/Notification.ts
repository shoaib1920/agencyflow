import { Schema, model, type InferSchemaType } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'task_assigned',
  'lead_stage',
  'lead_won',
  'mention',
  'comment',
  'reminder',
  'invoice',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String },
    link: { type: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

export type NotificationAttrs = InferSchemaType<typeof notificationSchema>;
export const Notification = model('Notification', notificationSchema);
