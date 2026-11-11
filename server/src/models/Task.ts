import { Schema, model, type InferSchemaType } from 'mongoose';
import { softDeleteFields, softDeletePlugin } from '../utils/softDelete';

export const TASK_STATUSES = ['todo', 'in-progress', 'done'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const taskSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 5000 },
    assignee: { type: Schema.Types.ObjectId, ref: 'User' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    dueDate: { type: Date },
    completedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    position: { type: Number, default: 0 },
    lastReminderAt: { type: Date },
    ...softDeleteFields,
  },
  { timestamps: true },
);

taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ assignee: 1, status: 1 });

export type TaskAttrs = InferSchemaType<typeof taskSchema>;
taskSchema.plugin(softDeletePlugin);
export const Task = model('Task', taskSchema);
