import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Discussion on a project (task = undefined) or on a single task. `internal` comments
 * are hidden from client portal users; comments written by clients are never internal.
 */
const commentSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    internal: { type: Boolean, default: false },
  },
  { timestamps: true },
);

commentSchema.index({ project: 1, task: 1, createdAt: 1 });

export type CommentAttrs = InferSchemaType<typeof commentSchema>;
export const Comment = model('Comment', commentSchema);
