import request from 'supertest';
import { app, loginAs } from './helpers';

describe('Clients CRUD', () => {
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    ({ token } = await loginAs('admin'));
  });

  it('creates, reads, updates and deletes a client', async () => {
    const created = await request(app)
      .post('/api/clients')
      .set(auth())
      .send({ name: 'Emma Wilson', company: 'Brightleaf', email: 'EMMA@brightleaf.com' });
    expect(created.status).toBe(201);
    expect(created.body.data.email).toBe('emma@brightleaf.com');
    const id = created.body.data._id as string;

    const got = await request(app).get(`/api/clients/${id}`).set(auth());
    expect(got.status).toBe(200);
    expect(got.body.data.projects).toEqual([]);

    const updated = await request(app)
      .patch(`/api/clients/${id}`)
      .set(auth())
      .send({ status: 'paused' });
    expect(updated.body.data.status).toBe('paused');

    const del = await request(app).delete(`/api/clients/${id}`).set(auth());
    expect(del.status).toBe(200);
    const gone = await request(app).get(`/api/clients/${id}`).set(auth());
    expect(gone.status).toBe(404);
  });

  it('validates input', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set(auth())
      .send({ name: '', email: 'nope', status: 'unknown' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.meta.errors)).toEqual(
      expect.arrayContaining(['name', 'email', 'status']),
    );
  });

  it('paginates, searches, filters and sorts on the server', async () => {
    for (let i = 0; i < 12; i++) {
      await request(app)
        .post('/api/clients')
        .set(auth())
        .send({
          name: `Client ${String(i).padStart(2, '0')}`,
          email: `c${i}@test.dev`,
          status: i % 2 ? 'active' : 'paused',
        });
    }

    const page2 = await request(app).get('/api/clients?page=2&limit=5&sort=name&order=asc').set(auth());
    expect(page2.body.meta).toMatchObject({ page: 2, limit: 5, total: 12, totalPages: 3 });
    expect(page2.body.data[0].name).toBe('Client 05');

    const filtered = await request(app).get('/api/clients?status=active&limit=50').set(auth());
    expect(filtered.body.meta.total).toBe(6);

    const search = await request(app).get('/api/clients?search=client 1').set(auth());
    expect(search.body.data.map((c: { name: string }) => c.name).sort()).toEqual([
      'Client 10',
      'Client 11',
    ]);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await request(app).get('/api/clients/123').set(auth());
    expect(res.status).toBe(400);
  });
});
