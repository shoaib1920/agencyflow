import { Schema, model, type InferSchemaType } from 'mongoose';
import { softDeleteFields, softDeletePlugin } from '../utils/softDelete';

/** `overdue` is derived (sent + past due date), never stored. */
export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const itemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 300 },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    number: { type: String, required: true, unique: true }, // INV-2026-0001
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    lead: { type: Schema.Types.ObjectId, ref: 'Lead' },
    items: { type: [itemSchema], validate: [(v: unknown[]) => v.length > 0, 'At least one item'] },
    currency: { type: String, default: 'USD' },
    taxRate: { type: Number, default: 0, min: 0, max: 100 }, // percent
    discount: { type: Number, default: 0, min: 0 }, // absolute amount
    // Totals are always computed on the server from the items (never trusted from the client)
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: 'draft' },
    issueDate: { type: Date, default: () => new Date() },
    dueDate: { type: Date, required: true },
    sentAt: { type: Date },
    paidAt: { type: Date },
    notes: { type: String, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    ...softDeleteFields,
  },
  { timestamps: true },
);

invoiceSchema.index({ client: 1, status: 1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.plugin(softDeletePlugin);

export type InvoiceAttrs = InferSchemaType<typeof invoiceSchema>;
export const Invoice = model('Invoice', invoiceSchema);

/** Atomic sequence generator (one document per sequence name). */
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = model('Counter', counterSchema);

export async function nextSequence(name: string): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  ).lean();
  return doc!.seq;
}
