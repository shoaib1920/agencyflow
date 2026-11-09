import { z } from 'zod';
import mongoose from 'mongoose';

export const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: 'Invalid id' });

export const idParam = z.object({ id: objectId });
