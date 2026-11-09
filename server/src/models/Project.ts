import { Schema, model, type InferSchemaType } from 'mongoose';

export const PROJECT_STATUSES = ['planning', 'active', 'on-hold', 'completed'] as const;

const attachmentSchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    storage: { type: String, enum: ['cloudinary', 'local'], required: true },
    publicId: { type: String },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const projectSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, maxlength: 5000 },
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    budget: { type: Number, default: 0, min: 0 },
    deadline: { type: Date },
    status: { type: String, enum: PROJECT_STATUSES, default: 'planning' },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    attachments: [attachmentSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

projectSchema.index({ client: 1 });
projectSchema.index({ members: 1 });
projectSchema.index({ status: 1, deadline: 1 });

export type ProjectAttrs = InferSchemaType<typeof projectSchema>;
export const Project = model('Project', projectSchema);
