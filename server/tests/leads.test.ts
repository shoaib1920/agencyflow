import request from 'supertest';
import { app, loginAs } from './helpers';
import { Notification } from '../src/models/Notification';
import { Activity } from '../src/models/Activity';

describe('Lead stage changes', () => {
  const lead = {
    title: 'Website rebuild',
    contactName: 'Jordan Lee',
    company: 'Peak Outdoors',
    email: 'jordan@peak.dev',
    value: 18000,
  };

  it('moves a lead between stages, logs activity and notifies managers', async () => {
    const manager = await loginAs('manager');
    const member = await loginAs('member');

    const created = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${member.token}`)
      .send(lead);
    expect(created.status).toBe(201);
    expect(created.body.data.stage).toBe('new');

    const moved = await request(app)
      .patch(`/api/leads/${created.body.data._id}/stage`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ stage: 'proposal', position: 500 });
    expect(moved.status).toBe(200);
    expect(moved.body.data.lead.stage).toBe('proposal');
    expect(moved.body.data.lead.position).toBe(500);
    expect(moved.body.data.client).toBeNull();

    const notes = await Notification.find({ recipient: manager.userId });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.title).toMatch(/Proposal Sent/);
    expect(await Activity.countDocuments({ action: 'moved' })).toBe(1);
  });

  it('converts a lead into a client exactly once when it is won', async () => {
    const { token } = await loginAs('admin');
    const created = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send(lead);
    const id = created.body.data._id as string;

    const won = await request(app)
      .patch(`/api/leads/${id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'won', position: 1000 });
    expect(won.status).toBe(200);
    expect(won.body.data.client).toMatchObject({ name: 'Jordan Lee', company: 'Peak Outdoors' });
    expect(won.body.data.lead.wonAt).toBeTruthy();

    // Moving out and back in again must not create a duplicate client
    await request(app)
      .patch(`/api/leads/${id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'negotiation', position: 1 });
    await request(app)
      .patch(`/api/leads/${id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'won', position: 2 });

    const clients = await request(app).get('/api/clients').set('Authorization', `Bearer ${token}`);
    expect(clients.body.meta.total).toBe(1);
  });

  it('rejects an unknown stage', async () => {
    const { token } = await loginAs('admin');
    const created = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send(lead);
    const res = await request(app)
      .patch(`/api/leads/${created.body.data._id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'archived', position: 1 });
    expect(res.status).toBe(400);
  });
});
