import request from 'supertest';
import { app, loginAs } from './helpers';
import { Invitation } from '../src/models/Invitation';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setup() {
  const admin = await loginAs('admin');
  const mk = async (name: string, email: string) =>
    (await request(app).post('/api/clients').set(auth(admin.token)).send({ name, email })).body.data._id as string;
  const mine = await mk('Mine Co', 'mine@co.dev');
  const other = await mk('Other Co', 'other@co.dev');
  const project = async (client: string, title: string) =>
    (await request(app).post('/api/projects').set(auth(admin.token)).send({ client, title, budget: 5000 })).body.data._id as string;
  const myProject = await project(mine, 'My site');
  const otherProject = await project(other, 'Their app');

  // Invite a portal user for "Mine Co" and accept the invite
  const invite = await request(app).post('/api/invites').set(auth(admin.token)).send({ email: 'portal@mine.dev', role: 'client', client: mine });
  expect(invite.status).toBe(201);
  const token = new URL(invite.body.data.inviteUrl).searchParams.get('token')!;
  const preview = await request(app).get(`/api/auth/invite?token=${token}`);
  expect(preview.body.data).toMatchObject({ email: 'portal@mine.dev', role: 'client', clientName: 'Mine Co' });
  const accepted = await request(app).post('/api/auth/accept-invite').send({ token, name: 'Pat Portal', password: 'Portal123' });
  expect(accepted.status).toBe(201);

  return { admin, mine, other, myProject, otherProject, portalToken: accepted.body.data.accessToken as string, inviteToken: token };
}

describe('Invites and client portal', () => {
  it('stores only a hash of the invite token and makes it single-use', async () => {
    const { inviteToken } = await setup();
    const stored = await Invitation.findOne({});
    expect(stored!.tokenHash).not.toContain(inviteToken);
    const reuse = await request(app).post('/api/auth/accept-invite').send({ token: inviteToken, name: 'Again', password: 'Portal123' });
    expect(reuse.status).toBe(404);
  });

  it('only lets admins invite team members', async () => {
    const manager = await loginAs('manager');
    const res = await request(app).post('/api/invites').set(auth(manager.token)).send({ email: 'dev@x.dev', role: 'member' });
    expect(res.status).toBe(403);
  });

  it('shows a portal user only their own company', async () => {
    const { portalToken, myProject, otherProject } = await setup();
    const overview = await request(app).get('/api/portal').set(auth(portalToken));
    expect(overview.status).toBe(200);
    expect(overview.body.data.client.name).toBe('Mine Co');
    expect(overview.body.data.projects.map((p: { title: string }) => p.title)).toEqual(['My site']);
    expect(overview.body.data.projects[0].budget).toBeUndefined(); // internal numbers stay internal

    expect((await request(app).get(`/api/portal/projects/${myProject}`).set(auth(portalToken))).status).toBe(200);
    expect((await request(app).get(`/api/portal/projects/${otherProject}`).set(auth(portalToken))).status).toBe(404);
  });

  it('blocks portal users from every internal route', async () => {
    const { portalToken, myProject } = await setup();
    for (const url of ['/api/clients', '/api/leads', '/api/projects', `/api/projects/${myProject}`, '/api/dashboard', '/api/users', '/api/search?q=site']) {
      const res = await request(app).get(url).set(auth(portalToken));
      expect([url, res.status]).toEqual([url, 403]);
    }
  });

  it('hides draft invoices and internal comments from the portal', async () => {
    const { admin, portalToken, mine, myProject } = await setup();
    const body = { client: mine, items: [{ description: 'Build', quantity: 1, unitPrice: 100 }], dueDate: new Date(Date.now() + 86_400_000).toISOString() };
    const draft = await request(app).post('/api/invoices').set(auth(admin.token)).send(body);
    const sent = await request(app).post('/api/invoices').set(auth(admin.token)).send(body);
    await request(app).post(`/api/invoices/${sent.body.data._id}/status`).set(auth(admin.token)).send({ action: 'send' });

    const list = await request(app).get('/api/invoices').set(auth(portalToken));
    expect(list.body.data.map((i: { _id: string }) => i._id)).toEqual([sent.body.data._id]);
    expect((await request(app).get(`/api/invoices/${draft.body.data._id}/pdf`).set(auth(portalToken))).status).toBe(404);

    await request(app).post(`/api/projects/${myProject}/comments`).set(auth(admin.token)).send({ body: 'Team only note', internal: true });
    await request(app).post(`/api/projects/${myProject}/comments`).set(auth(admin.token)).send({ body: 'Hello client' });
    const asClient = await request(app).post(`/api/projects/${myProject}/comments`).set(auth(portalToken)).send({ body: 'Looks great!', internal: true });
    expect(asClient.body.data.internal).toBe(false); // clients can't post internal notes

    const seen = await request(app).get(`/api/projects/${myProject}/comments`).set(auth(portalToken));
    expect(seen.body.data.map((c: { body: string }) => c.body)).toEqual(['Hello client', 'Looks great!']);
  });
});
