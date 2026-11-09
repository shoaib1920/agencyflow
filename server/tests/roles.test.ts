import request from 'supertest';
import { app, loginAs } from './helpers';

describe('Role guard', () => {
  it('forbids a member from creating a client', async () => {
    const { token } = await loginAs('member');
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme', email: 'acme@test.dev' });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('forbids a manager from deleting a client (admin only)', async () => {
    const { token } = await loginAs('manager');
    const created = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme', email: 'acme@test.dev' });
    expect(created.status).toBe(201);

    const del = await request(app)
      .delete(`/api/clients/${created.body.data._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(403);
  });

  it('only admins can manage the team', async () => {
    const member = await loginAs('member');
    const forbidden = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ name: 'New Person', email: 'new@test.dev', password: 'Password1' });
    expect(forbidden.status).toBe(403);

    const admin = await loginAs('admin');
    const ok = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'New Person', email: 'new@test.dev', password: 'Password1', role: 'manager' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.role).toBe('manager');
  });

  it('rejects requests with a tampered token', async () => {
    const res = await request(app).get('/api/clients').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });
});
