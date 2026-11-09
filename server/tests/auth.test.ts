import request from 'supertest';
import { app } from './helpers';

const creds = { name: 'Ada Lovelace', email: 'ada@test.dev', password: 'Password1' };

const refreshCookie = (cookies: string[] | string | undefined) =>
  ([] as string[]).concat(cookies ?? []).find((c) => c.startsWith('af_rt='));

describe('Auth', () => {
  it('registers the first user as admin and sets an httpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('admin');
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    const cookie = refreshCookie(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/);
  });

  it('registers later users as members and rejects duplicate emails', async () => {
    await request(app).post('/api/auth/register').send(creds);
    const second = await request(app)
      .post('/api/auth/register')
      .send({ ...creds, email: 'grace@test.dev' });
    expect(second.body.data.user.role).toBe('member');

    const dup = await request(app).post('/api/auth/register').send(creds);
    expect(dup.status).toBe(409);
  });

  it('validates the register payload', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'x', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toHaveProperty('email');
    expect(res.body.meta.errors).toHaveProperty('password');
  });

  it('logs in with valid credentials and rejects a wrong password', async () => {
    await request(app).post('/api/auth/register').send(creds);
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: 'WrongPass1' });
    expect(bad.status).toBe(401);
    expect(bad.body.message).toBe('Invalid email or password');
  });

  it('rotates the refresh token and detects reuse of an old one', async () => {
    const reg = await request(app).post('/api/auth/register').send(creds);
    const original = refreshCookie(reg.headers['set-cookie'])!;

    const first = await request(app).post('/api/auth/refresh').set('Cookie', original);
    expect(first.status).toBe(200);
    const rotated = refreshCookie(first.headers['set-cookie'])!;
    expect(rotated).not.toEqual(original);

    // Replaying the already-used token revokes the whole family...
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', original);
    expect(replay.status).toBe(401);
    expect(replay.body.message).toMatch(/reuse detected/);

    // ...so even the newest token no longer works
    const after = await request(app).post('/api/auth/refresh').set('Cookie', rotated);
    expect(after.status).toBe(401);
  });

  it('returns the current user from /me and 401 without a token', async () => {
    const reg = await request(app).post('/api/auth/register').send(creds);
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(creds.email);

    const anon = await request(app).get('/api/auth/me');
    expect(anon.status).toBe(401);
  });
});
