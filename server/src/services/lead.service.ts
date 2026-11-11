import { Lead, type LeadAttrs, type LeadStage } from '../models/Lead';
import { Client } from '../models/Client';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { escapeRegex } from '../utils/pagination';
import { logActivity } from './activity.service';
import { notify } from './notification.service';
import { emitToAll } from '../socket';

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  proposal: 'Proposal Sent',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

/** The board loads every lead once; columns are grouped client-side. */
export async function listLeads(search?: string) {
  const rx = search ? new RegExp(escapeRegex(search), 'i') : null;
  const filter = rx ? { $or: [{ title: rx }, { company: rx }, { contactName: rx }] } : {};
  return Lead.find(filter)
    .sort({ stage: 1, position: 1 })
    .populate('owner', 'name avatarColor')
    .lean();
}

async function nextPosition(stage: LeadStage) {
  const last = await Lead.findOne({ stage }).sort({ position: -1 }).select('position').lean();
  return (last?.position ?? 0) + 1000;
}

export async function getLead(id: string) {
  const lead = await Lead.findById(id).populate('owner', 'name avatarColor').populate('client', 'name').lean();
  if (!lead) throw AppError.notFound('Lead');
  return lead;
}

export async function createLead(actorId: string, input: Partial<LeadAttrs>) {
  const stage = (input.stage ?? 'new') as LeadStage;
  const lead = await Lead.create({
    ...input,
    stage,
    owner: input.owner ?? actorId,
    position: await nextPosition(stage),
    createdBy: actorId,
  });
  if (stage === 'won') await convertToClient(actorId, lead.id as string);
  await logActivity({
    actorId,
    action: 'created',
    entityType: 'lead',
    entityId: lead._id,
    entityName: lead.title,
  });
  emitToAll('leads:changed', { id: lead.id });
  return getLead(lead.id as string);
}

export async function updateLead(actorId: string, id: string, input: Partial<LeadAttrs>) {
  const { stage, ...rest } = input;
  const lead = await Lead.findByIdAndUpdate(id, rest, { new: true, runValidators: true });
  if (!lead) throw AppError.notFound('Lead');
  if (stage && stage !== lead.stage) {
    await moveLead(actorId, id, { stage: stage as LeadStage, position: await nextPosition(stage as LeadStage) });
  } else {
    emitToAll('leads:changed', { id });
  }
  return getLead(id);
}

export async function deleteLead(actorId: string, id: string) {
  const lead = await Lead.findOneAndUpdate({ _id: id }, { $set: { deletedAt: new Date(), deletedBy: actorId } }, { new: true });
  if (!lead) throw AppError.notFound('Lead');
  await logActivity({
    actorId,
    action: 'deleted',
    entityType: 'lead',
    entityId: lead._id,
    entityName: lead.title,
  });
  emitToAll('leads:changed', { id });
}

/**
 * Moving a lead on the Kanban: update stage + position, log it, notify
 * the owner and managers, and auto-convert to a Client when it lands in "won".
 */
export async function moveLead(
  actorId: string,
  id: string,
  { stage, position }: { stage: LeadStage; position: number },
) {
  const lead = await Lead.findById(id);
  if (!lead) throw AppError.notFound('Lead');
  const from = lead.stage as LeadStage;

  lead.stage = stage;
  lead.position = position;
  if (stage === 'won' && !lead.wonAt) lead.wonAt = new Date();
  if (stage !== 'won' && from === 'won') lead.wonAt = undefined;
  await lead.save();

  let client = null;
  if (from !== stage) {
    if (stage === 'won') client = await convertToClient(actorId, id);

    await logActivity({
      actorId,
      action: 'moved',
      entityType: 'lead',
      entityId: lead._id,
      entityName: lead.title,
      meta: { from, to: stage },
    });

    const managers = await User.find({ role: { $in: ['admin', 'manager'] }, isActive: true })
      .select('_id')
      .lean();
    const recipients = [...managers.map((m) => m._id), ...(lead.owner ? [lead.owner] : [])];
    await notify({
      recipients,
      actorId,
      type: stage === 'won' ? 'lead_won' : 'lead_stage',
      title:
        stage === 'won'
          ? `Deal won: ${lead.title}`
          : `${lead.title} moved to ${STAGE_LABELS[stage]}`,
      body:
        stage === 'won'
          ? `${lead.company || lead.contactName} is now a client.`
          : `From ${STAGE_LABELS[from]} to ${STAGE_LABELS[stage]}`,
      link: stage === 'won' && client ? `/clients?open=${String(client._id)}` : '/leads',
    });
  }

  emitToAll('leads:changed', { id });
  return { lead: await getLead(id), client };
}

/** Idempotent: a lead converts to at most one client. */
export async function convertToClient(actorId: string, leadId: string) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw AppError.notFound('Lead');
  if (lead.client) return Client.findById(lead.client).lean();

  const client = await Client.create({
    name: lead.contactName,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    country: lead.country,
    status: 'active',
    notes: `Converted from lead "${lead.title}"${lead.notes ? `\n\n${lead.notes}` : ''}`,
    sourceLead: lead._id,
    createdBy: actorId,
  });
  lead.client = client._id;
  await lead.save();

  await logActivity({
    actorId,
    action: 'converted lead into client',
    entityType: 'client',
    entityId: client._id,
    entityName: client.name,
    meta: { leadId: lead.id as string },
  });
  return client.toJSON();
}
