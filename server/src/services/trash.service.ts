import type { Model } from 'mongoose';
import { Client } from '../models/Client';
import { Lead } from '../models/Lead';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { Invoice } from '../models/Invoice';
import { Activity } from '../models/Activity';
import { Comment } from '../models/Comment';
import { TimeEntry } from '../models/TimeEntry';
import { AppError } from '../utils/AppError';
import { ANY_DELETE_STATE } from '../utils/softDelete';
import { logActivity } from './activity.service';
import { deleteStoredFile } from './upload.service';

export const TRASH_TYPES = ['client', 'lead', 'project', 'invoice'] as const;
export type TrashType = (typeof TRASH_TYPES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the four models have different document shapes
const MODELS: Record<TrashType, Model<any>> = { client: Client, lead: Lead, project: Project, invoice: Invoice };
const LABEL_FIELD: Record<TrashType, string> = { client: 'name', lead: 'title', project: 'title', invoice: 'number' };

export const RETENTION_DAYS = 30;

export async function listTrash() {
  const groups = await Promise.all(
    TRASH_TYPES.map(async (type) => {
      const docs = await MODELS[type]
        .find({ deletedAt: { $ne: null } })
        .select(`${LABEL_FIELD[type]} deletedAt deletedBy`)
        .populate('deletedBy', 'name')
        .lean<{ _id: unknown; deletedAt: Date; deletedBy?: { name: string } }[]>();
      return docs.map((d) => ({
        _id: String(d._id),
        type,
        name: String((d as Record<string, unknown>)[LABEL_FIELD[type]] ?? ''),
        deletedAt: d.deletedAt,
        deletedBy: d.deletedBy?.name ?? null,
        purgeAt: new Date(d.deletedAt.getTime() + RETENTION_DAYS * 86_400_000),
      }));
    }),
  );
  return groups.flat().sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

export async function restore(actorId: string, type: TrashType, id: string) {
  const Model = MODELS[type];
  const doc = await Model.findOne({ _id: id, deletedAt: { $ne: null } });
  if (!doc) throw AppError.notFound('Deleted item');
  const deletedAt = doc.get('deletedAt') as Date;

  if (type === 'project') {
    const client = await Client.exists({ _id: doc.get('client') });
    if (!client) throw AppError.conflict('Restore the client of this project first.');
    // Bring back exactly the tasks that were removed together with the project
    await Task.updateMany({ project: id, deletedAt }, { $set: { deletedAt: null }, $unset: { deletedBy: 1 } });
  }
  if (type === 'invoice' && !(await Client.exists({ _id: doc.get('client') }))) {
    throw AppError.conflict('Restore the client of this invoice first.');
  }

  await Model.updateOne({ _id: id, deletedAt: { $ne: null } }, { $set: { deletedAt: null }, $unset: { deletedBy: 1 } });
  await logActivity({
    actorId,
    action: 'restored',
    entityType: type,
    entityId: doc._id,
    entityName: String(doc.get(LABEL_FIELD[type])),
  });
}

/** Permanently removes a trashed item and everything that only made sense with it. */
export async function purge(type: TrashType, id: string) {
  const Model = MODELS[type];
  const doc = await Model.findOne({ _id: id, deletedAt: { $ne: null } });
  if (!doc) throw AppError.notFound('Deleted item');

  if (type === 'client') {
    const linked =
      (await Project.exists({ client: id, ...ANY_DELETE_STATE })) ||
      (await Invoice.exists({ client: id, ...ANY_DELETE_STATE }));
    if (linked) throw AppError.conflict('This client still has projects or invoices (possibly in the trash).');
  }
  if (type === 'project') {
    const attachments = (doc.get('attachments') ?? []) as { storage: string; url: string; publicId?: string }[];
    await Promise.all([
      Task.deleteMany({ project: id }),
      Activity.deleteMany({ project: id }),
      Comment.deleteMany({ project: id }),
      TimeEntry.deleteMany({ project: id }),
      ...attachments.map((a) => deleteStoredFile(a.storage, a.url, a.publicId)),
    ]);
  }
  await Model.deleteOne({ _id: id });
}

/** Daily job: purge anything that has been in the trash longer than the retention period. */
export async function purgeExpired(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  let purged = 0;
  // Children before parents so client purges aren't blocked by expired projects
  for (const type of ['invoice', 'project', 'lead', 'client'] as TrashType[]) {
    const expired = await MODELS[type].find({ deletedAt: { $ne: null, $lt: cutoff } }).select('_id').lean();
    for (const d of expired) {
      try {
        await purge(type, String(d._id));
        purged++;
      } catch {
        // still linked to something newer in the trash; try again tomorrow
      }
    }
  }
  return purged;
}
