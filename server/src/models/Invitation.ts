import { Schema, model, type InferSchemaType } from 'mongoose';
import { ROLES } from '../utils/types';

/**
 * A pending invite. Only a SHA-256 hash of the one-time token is stored, so a database
 * leak can't be used to accept invites. Expired invites are removed by a TTL index.
 */
const invitationSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, trim: true },
    role: { type: String, enum: ROLES, required: true },
    title: { type: String, trim: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client' }, // for portal invites
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    acceptedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
invitationSchema.index({ email: 1 });

export type InvitationAttrs = InferSchemaType<typeof invitationSchema>;
export const Invitation = model('Invitation', invitationSchema);
