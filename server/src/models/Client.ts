import { Schema, model, type InferSchemaType } from 'mongoose';

export const CLIENT_STATUSES = ['active', 'paused', 'closed'] as const;

const clientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    country: { type: String, trim: true },
    status: { type: String, enum: CLIENT_STATUSES, default: 'active' },
    notes: { type: String, maxlength: 5000 },
    sourceLead: { type: Schema.Types.ObjectId, ref: 'Lead' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

clientSchema.index({ status: 1, createdAt: -1 });
clientSchema.index({ name: 'text', company: 'text', email: 'text' });
clientSchema.index({ email: 1 });

export type ClientAttrs = InferSchemaType<typeof clientSchema>;
export const Client = model('Client', clientSchema);
