import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';

let mongo: MongoMemoryServer | null = null;

beforeAll(async () => {
  // Use a real local DB when MONGO_URI_TEST is set, otherwise spin up an in-memory MongoDB
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri();
  }
  await mongoose.connect(uri);
});

afterEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongo?.stop();
});
