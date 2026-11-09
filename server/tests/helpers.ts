import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import type { Role } from '../src/utils/types';

export const app = createApp();

/** Creates a user directly in the DB and logs in through the API. */
export async function loginAs(role: Role, email = `${role}@test.dev`) {
  await User.create({ name: `${role} user`, email, password: 'Password1', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Password1' });
  return {
    token: res.body.data.accessToken as string,
    userId: res.body.data.user._id as string,
    cookie: res.headers['set-cookie'] as unknown as string[],
  };
}
