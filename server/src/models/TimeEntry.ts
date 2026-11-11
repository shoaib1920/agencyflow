import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Time logged against a task. A running timer has `endedAt = null`; a partial unique
 * index guarantees each user has at most one running timer at a time.
 */
const timeEntrySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    minutes: { type: Number, default: 0, min: 0 },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

timeEntrySchema.index({ project: 1, task: 1 });
timeEntrySchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { endedAt: null }, name: 'one_running_timer_per_user' },
);

export type TimeEntryAttrs = InferSchemaType<typeof timeEntrySchema>;
export const TimeEntry = model('TimeEntry', timeEntrySchema);
