/* eslint-disable no-console */
import { connectDB, disconnectDB } from '../config/db';
import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { Client } from '../models/Client';
import { Lead, type LeadStage } from '../models/Lead';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { Notification } from '../models/Notification';
import { Activity } from '../models/Activity';

const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);
const monthsAgo = (m: number, day = 12) => {
  const d = new Date();
  d.setMonth(d.getMonth() - m, day);
  return d;
};

async function seed() {
  await connectDB();
  console.log('Clearing collections...');
  await Promise.all(
    [User, RefreshToken, Client, Lead, Project, Task, Notification, Activity].map((m) =>
      (m as typeof User).deleteMany({}),
    ),
  );

  console.log('Creating team...');
  // .create() (not insertMany) so the bcrypt pre-save hook runs
  const admin = await User.create({
    name: 'Alex Morgan',
    email: 'admin@agencyflow.dev',
    password: 'Admin@123',
    role: 'admin',
    title: 'Founder',
    avatarColor: '#6366f1',
  });
  const manager = await User.create({
    name: 'Priya Shah',
    email: 'manager@agencyflow.dev',
    password: 'Manager@123',
    role: 'manager',
    title: 'Account Manager',
    avatarColor: '#0ea5e9',
  });
  const dev = await User.create({
    name: 'Sam Carter',
    email: 'sam@agencyflow.dev',
    password: 'Member@123',
    role: 'member',
    title: 'Full-stack Developer',
    avatarColor: '#10b981',
  });
  const designer = await User.create({
    name: 'Lina Ortiz',
    email: 'lina@agencyflow.dev',
    password: 'Member@123',
    role: 'member',
    title: 'Product Designer',
    avatarColor: '#f59e0b',
  });

  console.log('Creating clients...');
  const clientData = [
    ['Emma Wilson', 'Brightleaf Studio', 'United Kingdom', 'active'],
    ['Omar Haddad', 'Nimbus Logistics', 'UAE', 'active'],
    ['Sofia Rossi', 'Verde Cafe Group', 'Italy', 'active'],
    ['Daniel Kim', 'Kinetic Fitness', 'South Korea', 'active'],
    ['Hannah Becker', 'Becker & Sohn', 'Germany', 'paused'],
    ['Lucas Martin', 'Atelier Lumiere', 'France', 'active'],
    ['Aisha Khan', 'Crescent Health', 'Pakistan', 'active'],
    ['Noah Brown', 'Summit Realty', 'United States', 'closed'],
    ['Mia Jensen', 'Nordlys Travel', 'Denmark', 'active'],
    ['Ethan Clarke', 'Copperline Legal', 'Australia', 'paused'],
  ] as const;
  const clients = await Client.insertMany(
    clientData.map(([name, company, country, status], i) => ({
      name,
      company,
      country,
      status,
      email: `${name.split(' ')[0]!.toLowerCase()}@${company.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      phone: `+1 555 01${String(i).padStart(2, '0')}`,
      notes: i % 3 === 0 ? 'Prefers weekly status updates by email.' : undefined,
      createdBy: admin._id,
      createdAt: daysFromNow(-120 + i * 9),
    })),
  );

  console.log('Creating leads...');
  const leadData: [string, string, string, number, LeadStage, number?][] = [
    ['E-commerce rebuild', 'Jordan Lee', 'Peak Outdoors', 18000, 'new'],
    ['Brand refresh', 'Chloe Martin', 'Bloom Florists', 6500, 'new'],
    ['Booking app MVP', 'Ravi Patel', 'Spice Route', 24000, 'new'],
    ['SEO retainer', 'Grace Turner', 'Turner Dental', 3000, 'contacted'],
    ['Marketing site', 'Felix Wagner', 'Wagner Solar', 9000, 'contacted'],
    ['Internal dashboard', 'Yuki Tanaka', 'Tanaka Imports', 15000, 'proposal'],
    ['Mobile app redesign', 'Isabella Cruz', 'Cruz Wellness', 21000, 'proposal'],
    ['Webflow migration', 'Ben Foster', 'Foster Media', 7500, 'negotiation'],
    ['Customer portal', 'Zara Ahmed', 'Ahmed Freight', 32000, 'negotiation'],
    ['Landing pages', 'Leo Novak', 'Novak Coffee', 4000, 'lost'],
    ['Shopify store', 'Emma Wilson', 'Brightleaf Studio', 12000, 'won', 9],
    ['Fleet tracking UI', 'Omar Haddad', 'Nimbus Logistics', 28000, 'won', 6],
    ['Menu + ordering site', 'Sofia Rossi', 'Verde Cafe Group', 8500, 'won', 4],
    ['Member app', 'Daniel Kim', 'Kinetic Fitness', 19500, 'won', 2],
    ['Patient booking flow', 'Aisha Khan', 'Crescent Health', 14000, 'won', 0],
  ];
  const owners = [admin, manager, dev];
  const posByStage: Record<string, number> = {};
  const leads = await Lead.insertMany(
    leadData.map(([title, contactName, company, value, stage, wonMonthsAgo], i) => {
      posByStage[stage] = (posByStage[stage] ?? 0) + 1000;
      const client =
        stage === 'won' ? clients.find((c) => c.company === company)?._id : undefined;
      return {
        title,
        contactName,
        company,
        value,
        stage,
        position: posByStage[stage],
        email: `${contactName.split(' ')[0]!.toLowerCase()}@${company.toLowerCase().replace(/[^a-z]/g, '')}.com`,
        source: ['Referral', 'Website', 'LinkedIn', 'Upwork'][i % 4],
        owner: owners[i % owners.length]!._id,
        client,
        wonAt: wonMonthsAgo !== undefined ? monthsAgo(wonMonthsAgo) : undefined,
        createdBy: admin._id,
      };
    }),
  );
  // Link converted clients back to their source lead
  await Promise.all(
    leads
      .filter((l) => l.client)
      .map((l) => Client.updateOne({ _id: l.client }, { sourceLead: l._id })),
  );

  console.log('Creating projects and tasks...');
  const projectData = [
    { title: 'Brightleaf Shopify Store', client: clients[0]!, budget: 12000, deadline: daysFromNow(4), status: 'active', members: [dev, designer] },
    { title: 'Nimbus Fleet Dashboard', client: clients[1]!, budget: 28000, deadline: daysFromNow(30), status: 'active', members: [dev, manager] },
    { title: 'Verde Online Ordering', client: clients[2]!, budget: 8500, deadline: daysFromNow(6), status: 'active', members: [designer] },
    { title: 'Kinetic Member App', client: clients[3]!, budget: 19500, deadline: daysFromNow(60), status: 'planning', members: [dev, designer, manager] },
  ] as const;

  const projects = await Project.insertMany(
    projectData.map((p) => ({
      ...p,
      client: p.client._id,
      members: p.members.map((m) => m._id),
      description: `Delivery project for ${p.client.company}.`,
      createdBy: manager._id,
    })),
  );

  const taskTemplates: [string, 'low' | 'medium' | 'high' | 'urgent', 'todo' | 'in-progress' | 'done', number][] = [
    ['Kick-off call and requirements', 'high', 'done', -20],
    ['Wireframes', 'medium', 'done', -10],
    ['Visual design', 'high', 'in-progress', 2],
    ['Frontend build', 'high', 'in-progress', 6],
    ['API integration', 'urgent', 'todo', 8],
    ['QA and launch checklist', 'medium', 'todo', 12],
  ];
  const tasks = [];
  for (const [pi, project] of projects.entries()) {
    const members = projectData[pi]!.members;
    for (const [ti, [title, priority, status, due]] of taskTemplates.entries()) {
      if (pi === 3 && ti > 2) break; // planning project has fewer tasks
      tasks.push({
        project: project._id,
        title,
        priority,
        status: pi === 3 ? 'todo' : status,
        dueDate: daysFromNow(due + pi * 3),
        assignee: members[ti % members.length]!._id,
        completedAt: status === 'done' && pi !== 3 ? daysFromNow(due) : undefined,
        createdBy: manager._id,
      });
    }
  }
  await Task.insertMany(tasks);

  console.log('Creating activity and notifications...');
  const acts = [
    { actor: admin._id, action: 'created', entityType: 'client', entityId: clients[6]!._id, entityName: clients[6]!.name, at: -6 },
    { actor: manager._id, action: 'created', entityType: 'project', entityId: projects[3]!._id, entityName: projects[3]!.title, project: projects[3]!._id, at: -5 },
    { actor: dev._id, action: 'completed task', entityType: 'task', entityId: projects[0]!._id, entityName: 'Wireframes', project: projects[0]!._id, at: -3 },
    { actor: manager._id, action: 'moved', entityType: 'lead', entityId: leads[8]!._id, entityName: leads[8]!.title, meta: { from: 'proposal', to: 'negotiation' }, at: -2 },
    { actor: admin._id, action: 'converted lead into client', entityType: 'client', entityId: clients[6]!._id, entityName: clients[6]!.name, at: -1 },
    { actor: designer._id, action: 'moved task to in-progress', entityType: 'task', entityId: projects[2]!._id, entityName: 'Visual design', project: projects[2]!._id, at: -0.2 },
  ];
  await Activity.insertMany(
    acts.map(({ at, ...a }) => ({ ...a, createdAt: daysFromNow(at) })),
  );
  await Notification.insertMany([
    { recipient: admin._id, actor: manager._id, type: 'lead_stage', title: 'Customer portal moved to Negotiation', body: 'From Proposal Sent to Negotiation', link: '/leads' },
    { recipient: admin._id, actor: manager._id, type: 'lead_won', title: 'Deal won: Patient booking flow', body: 'Crescent Health is now a client.', link: '/clients', read: true },
    { recipient: dev._id, actor: manager._id, type: 'task_assigned', title: 'New task: API integration', body: 'Priya Shah assigned you a task in Brightleaf Shopify Store', link: `/projects/${String(projects[0]!._id)}` },
  ]);

  console.log('\nSeed complete');
  console.table([
    { role: 'admin', email: 'admin@agencyflow.dev', password: 'Admin@123' },
    { role: 'manager', email: 'manager@agencyflow.dev', password: 'Manager@123' },
    { role: 'member', email: 'sam@agencyflow.dev', password: 'Member@123' },
    { role: 'member', email: 'lina@agencyflow.dev', password: 'Member@123' },
  ]);
  await disconnectDB();
}

seed().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});
