import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import bcrypt from 'bcrypt';
import { ROLES } from '../utils/types';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLES, default: 'member', index: true },
    title: { type: String, trim: true, maxlength: 80 },
    avatarColor: { type: String, default: '#6366f1' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate: string) {
  return bcrypt.compare(candidate, this.password as string);
};

userSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs> & {
  comparePassword(candidate: string): Promise<boolean>;
};

export const User = model('User', userSchema);
