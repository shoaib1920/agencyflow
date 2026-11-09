import { Schema, model } from 'mongoose';

/**
 * One document per issued refresh token. Tokens are rotated on every refresh;
 * all tokens from one login share a `family`. If an already-rotated token is
 * presented again (likely stolen), the whole family is revoked.
 */
const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true },
    revokedAt: { type: Date },
    replacedBy: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// MongoDB TTL index cleans up expired tokens automatically
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model('RefreshToken', refreshTokenSchema);
