import { Schema, model, type InferSchemaType } from 'mongoose';

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['task_assigned', 'lead_stage', 'lead_won', 'system'], required: true },
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
