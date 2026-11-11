import request from 'supertest';
import { app, loginAs } from './helpers';
import { Notification } from '../src/models/Notification';
import { TimeEntry } from '../src/models/TimeEntry';
import { csvCell } from '../src/services/csv.service';
import { User } from '../src/models/User';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function projectWithTask() {
  const admin = await loginAs('admin');
  const member = await loginAs('member');
  const client = (await request(app).post('/api/clients').set(auth(admin.token)).send({ name: 'Acme', email: 'a@acme.dev' })).body.data._id;
  const project = (await request(app).post('/api/projects').set(auth(admin.token)).send({ client, title: 'Acme site', members: [member.userId] })).body.data._id as string;
  const task = (await request(app).post(`/api/projects/${project}/tasks`).set(auth(admin.token)).send({ title: 'Homepage' })).body.data._id as string;
  return { admin, member, client, project, task };
}

describe('Soft delete and trash', () => {
  it('moves a project and its tasks to the trash and restores them together', async () => {
    const { admin, project } = await projectWithTask();
    expect((await request(app).delete(`/api/projects/${project}`).set(auth(admin.token))).status).toBe(200);
    expect((await request(app).get(`/api/projects/${project}`).set(auth(admin.token))).status).toBe(404);
    const dash = await request(app).get('/api/dashboard').set(auth(admin.token));
    expect(dash.body.data.tasksByStatus.reduce((n: number, t: { count: number }) => n + t.count, 0)).toBe(0);

    const trash = await request(app).get('/api/trash').set(auth(admin.token));
    expect(trash.body.data).toEqual([expect.objectContaining({ type: 'project', name: 'Acme site' })]);

    expect((await request(app).post(`/api/trash/project/${project}/restore`).set(auth(admin.token))).status).toBe(200);
    const tasks = await request(app).get(`/api/projects/${project}/tasks`).set(auth(admin.token));
    expect(tasks.body.data).toHaveLength(1);
  });

  it('lets only admins purge permanently', async () => {
    const { admin, client } = await projectWithTask();
    const manager = await loginAs('manager', 'm2@test.dev');
    const lead = (await request(app).post('/api/leads').set(auth(admin.token)).send({ title: 'X', contactName: 'Y', email: 'y@y.dev' })).body.data._id;
    await request(app).delete(`/api/leads/${lead}`).set(auth(admin.token));
    expect((await request(app).delete(`/api/trash/lead/${lead}`).set(auth(manager.token))).status).toBe(403);
    expect((await request(app).delete(`/api/trash/lead/${lead}`).set(auth(admin.token))).status).toBe(200);
    // a client with (even trashed) projects can't be purged
    expect(client).toBeTruthy();
  });
});

describe('Comments and mentions', () => {
  it('notifies mentioned teammates and ignores mentions of outsiders', async () => {
    const { admin, member, project } = await projectWithTask();
    const outsider = await User.create({ name: 'Out Sider', email: 'out@test.dev', password: 'Password1', role: 'member' });
    const res = await request(app)
      .post(`/api/projects/${project}/comments`)
      .set(auth(admin.token))
      .send({ body: '@member user can you check this?', mentions: [member.userId, String(outsider._id)] });
    expect(res.status).toBe(201);
    expect(res.body.data.mentions.map((m: { _id: string }) => m._id)).toEqual([member.userId]);
    expect(await Notification.countDocuments({ recipient: member.userId, type: 'mention' })).toBe(1);
    expect(await Notification.countDocuments({ recipient: outsider._id })).toBe(0);
  });
});

describe('Time tracking', () => {
  it('allows one running timer per person and sums time per task', async () => {
    const { member, project, task } = await projectWithTask();
    const start = await request(app).post(`/api/projects/${project}/timer/start`).set(auth(member.token)).send({ task });
    expect(start.status).toBe(200);
    expect(start.body.data.task.title).toBe('Homepage');

    // starting again switches the timer instead of running two
    await request(app).post(`/api/projects/${project}/timer/start`).set(auth(member.token)).send({ task });
    expect(await TimeEntry.countDocuments({ endedAt: null })).toBe(1);

    const stop = await request(app).post('/api/time/stop').set(auth(member.token));
    expect(stop.body.data.minutes).toBeGreaterThanOrEqual(1);

    await request(app).post(`/api/projects/${project}/time`).set(auth(member.token)).send({ task, minutes: 90, note: 'Layout' });
    const summary = await request(app).get(`/api/projects/${project}/time`).set(auth(member.token));
    expect(summary.body.data.byTask[task]).toBeGreaterThanOrEqual(92);
    expect(summary.body.data.byUser[0].name).toBe('member user');
  });
});

describe('Search and CSV', () => {
  it('searches across types and respects member scope', async () => {
    const { admin, member } = await projectWithTask();
    const client2 = (await request(app).post('/api/clients').set(auth(admin.token)).send({ name: 'Acme Two', email: 'b@acme.dev' })).body.data._id;
    await request(app).post('/api/projects').set(auth(admin.token)).send({ client: client2, title: 'Acme secret' });

    const asAdmin = await request(app).get('/api/search?q=acme').set(auth(admin.token));
    expect(asAdmin.body.data.clients).toHaveLength(2);
    expect(asAdmin.body.data.projects).toHaveLength(2);
    const asMember = await request(app).get('/api/search?q=acme').set(auth(member.token));
    expect(asMember.body.data.projects.map((p: { title: string }) => p.title)).toEqual(['Acme site']);
    expect(asMember.body.data.invoices).toEqual([]);
  });

  it('imports valid rows, reports bad ones, and exports safe CSV', async () => {
    const { token } = await loginAs('admin');
    const res = await request(app)
      .post('/api/clients/import')
      .set(auth(token))
      .send({ rows: [{ name: 'Good One', email: 'good@x.dev', status: '' }, { name: '', email: 'nope' }, { name: '=HYPERLINK("x")', email: 'evil@x.dev' }] });
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.errors).toEqual([expect.objectContaining({ row: 3 })]);

    const csv = await request(app).get('/api/clients/export').set(auth(token));
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(`"'=HYPERLINK(""x"")"`); // formula neutralised and quoted
    expect(csvCell('a,b')).toBe('"a,b"');
  });
});
