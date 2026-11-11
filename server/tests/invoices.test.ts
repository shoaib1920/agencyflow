import request from 'supertest';
import { app, loginAs } from './helpers';
import { computeTotals } from '../src/services/invoice.service';
import { Invoice } from '../src/models/Invoice';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function makeClient(token: string) {
  const res = await request(app).post('/api/clients').set(auth(token)).send({ name: 'Emma Wilson', company: 'Brightleaf', email: 'emma@brightleaf.dev' });
  return res.body.data._id as string;
}

const draft = (client: string) => ({
  client,
  items: [
    { description: 'Design', quantity: 2, unitPrice: 500 },
    { description: 'Build', quantity: 1, unitPrice: 1999.99 },
  ],
  taxRate: 10,
  discount: 100,
  dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  // A tampered total from the browser must be ignored
  total: 1,
});

describe('Invoices', () => {
  it('computes totals on the server', () => {
    expect(computeTotals([{ description: 'x', quantity: 3, unitPrice: 33.333 }], 10, 0)).toEqual({
      subtotal: 100, discount: 0, tax: 10, total: 110,
    });
    // discount can never exceed the subtotal
    expect(computeTotals([{ description: 'x', quantity: 1, unitPrice: 50 }], 0, 80).total).toBe(0);
  });

  it('creates a numbered draft, ignores client-sent totals, and walks the status workflow', async () => {
    const { token } = await loginAs('admin');
    const client = await makeClient(token);

    const created = await request(app).post('/api/invoices').set(auth(token)).send(draft(client));
    expect(created.status).toBe(201);
    const inv = created.body.data;
    expect(inv.number).toMatch(/^INV-\d{4}-0001$/);
    expect(inv.subtotal).toBe(2999.99);
    expect(inv.tax).toBe(290); // (2999.99 - 100) * 10%
    expect(inv.total).toBe(3189.99);
    expect(inv.status).toBe('draft');

    const second = await request(app).post('/api/invoices').set(auth(token)).send(draft(client));
    expect(second.body.data.number).toMatch(/-0002$/);

    // can't pay a draft
    const payDraft = await request(app).post(`/api/invoices/${inv._id}/status`).set(auth(token)).send({ action: 'pay' });
    expect(payDraft.status).toBe(409);

    const sent = await request(app).post(`/api/invoices/${inv._id}/status`).set(auth(token)).send({ action: 'send' });
    expect(sent.status).toBe(200);
    expect(sent.body.data.invoice.status).toBe('sent');

    const paid = await request(app).post(`/api/invoices/${inv._id}/status`).set(auth(token)).send({ action: 'pay' });
    expect(paid.body.data.invoice.status).toBe('paid');

    // paid invoices are locked
    const edit = await request(app).patch(`/api/invoices/${inv._id}`).set(auth(token)).send({ notes: 'change' });
    expect(edit.status).toBe(409);

    const pdf = await request(app).get(`/api/invoices/${inv._id}/pdf`).set(auth(token));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('reports overdue invoices and money totals on the dashboard', async () => {
    const { token } = await loginAs('admin');
    const client = await makeClient(token);
    const res = await request(app).post('/api/invoices').set(auth(token)).send(draft(client));
    await request(app).post(`/api/invoices/${res.body.data._id}/status`).set(auth(token)).send({ action: 'send' });
    await Invoice.updateOne({ _id: res.body.data._id }, { dueDate: new Date(Date.now() - 86_400_000) });

    const overdue = await request(app).get('/api/invoices?status=overdue').set(auth(token));
    expect(overdue.body.meta.total).toBe(1);
    expect(overdue.body.data[0].displayStatus).toBe('overdue');

    const dash = await request(app).get('/api/dashboard').set(auth(token));
    expect(dash.body.data.money.overdue).toEqual({ total: 3189.99, count: 1 });
  });

  it('drafts an invoice from a won lead only once', async () => {
    const { token } = await loginAs('admin');
    const lead = await request(app).post('/api/leads').set(auth(token)).send({
      title: 'Shop build', contactName: 'Jo', company: 'Peak', email: 'jo@peak.dev', value: 12000, stage: 'won',
    });
    const first = await request(app).post(`/api/invoices/from-lead/${lead.body.data._id}`).set(auth(token));
    expect(first.status).toBe(201);
    expect(first.body.data.total).toBe(12000);
    const again = await request(app).post(`/api/invoices/from-lead/${lead.body.data._id}`).set(auth(token));
    expect(again.body.data._id).toBe(first.body.data._id);
  });

  it('keeps invoices away from members', async () => {
    const { token } = await loginAs('member');
    const res = await request(app).get('/api/invoices').set(auth(token));
    expect(res.status).toBe(403);
  });
});
