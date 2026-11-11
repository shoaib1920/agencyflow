import { Schema, model, type InferSchemaType } from 'mongoose';
import { softDeleteFields, softDeletePlugin } from '../utils/softDelete';

export const LEAD_STAGES = ['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

const leadSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    contactName: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    country: { type: String, trim: true },
    value: { type: Number, default: 0, min: 0 },
    stage: { type: String, enum: LEAD_STAGES, default: 'new' },
    /** Position within a Kanban column (fractional indexing: insert between neighbours). */
    position: { type: Number, default: 0 },
    source: { type: String, trim: true },
    notes: { type: String, maxlength: 5000 },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
    client: { type: Schema.Types.ObjectId, ref: 'Client' },
    wonAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    ...softDeleteFields,
  },
  { timestamps: true },
);

leadSchema.index({ stage: 1, position: 1 });
leadSchema.index({ stage: 1, wonAt: 1 });
leadSchema.index({ owner: 1 });

export type LeadAttrs = InferSchemaType<typeof leadSchema>;
leadSchema.plugin(softDeletePlugin);
export const Lead = model('Lead', leadSchema);
