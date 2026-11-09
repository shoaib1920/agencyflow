import mongoose from 'mongoose';
import { env } from './env';

export async function connectDB(uri: string = env.MONGO_URI): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  if (!env.isTest) {
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
