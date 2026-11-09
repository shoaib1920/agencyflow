import { Types } from 'mongoose';
import { Activity } from '../models/Activity';
import type { ENTITY_TYPES } from '../models/Activity';

interface LogInput {
  actorId: string;
  action: string;
  entityType: (typeof ENTITY_TYPES)[number];
  entityId: Types.ObjectId | string;
  entityName: string;
  projectId?: Types.ObjectId | string;
  meta?: Record<string, unknown>;
}

/** Fire-and-forget audit trail; logging must never break the request that triggered it. */
export async function logActivity(input: LogInput): Promise<void> {
  try {
    await Activity.create({
      actor: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      project: input.projectId,
      meta: input.meta,
    });
  } catch (err) {
    console.error('Failed to log activity', err);
  }
}

export async function listActivity({ projectId, limit = 20 }: { projectId?: string; limit?: number }) {
  const filter = projectId ? { project: new Types.ObjectId(projectId) } : {};
  return Activity.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actor', 'name avatarColor')
    .lean();
}
