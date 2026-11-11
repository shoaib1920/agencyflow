import { Schema, model, type InferSchemaType } from 'mongoose';

export const ENTITY_TYPES = ['client', 'lead', 'project', 'task', 'user', 'invoice'] as const;

const activitySchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // e.g. "created", "moved", "completed"
    entityType: { type: String, enum: ENTITY_TYPES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    entityName: { type: String, required: true },
    /** Set when the activity belongs to a project (tasks, files) so we can show a per-project timeline. */
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ createdAt: -1 });
activitySchema.index({ project: 1, createdAt: -1 });

export type ActivityAttrs = InferSchemaType<typeof activitySchema>;
export const Activity = model('Activity', activitySchema);
