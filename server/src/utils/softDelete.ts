import { Schema } from 'mongoose';

/** Fields every soft-deletable schema includes (spread into the schema definition so types stay inferred). */
export const softDeleteFields = {
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
};

/** True if a filter already talks about deletedAt anywhere (then the caller is in charge). */
function mentionsDeletedAt(filter: unknown): boolean {
  if (!filter || typeof filter !== 'object') return false;
  if (Array.isArray(filter)) return filter.some(mentionsDeletedAt);
  return Object.entries(filter as Record<string, unknown>).some(
    ([key, value]) => key === 'deletedAt' || mentionsDeletedAt(value),
  );
}

/** Use in a filter to include both live and deleted documents. */
export const ANY_DELETE_STATE = { $or: [{ deletedAt: null }, { deletedAt: { $ne: null } }] };

const QUERY_HOOKS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'countDocuments',
  'updateOne',
  'updateMany',
] as const;

/**
 * Soft delete: deleting sets `deletedAt` instead of removing the document, and every
 * query/aggregation automatically hides deleted documents unless the filter mentions
 * `deletedAt` explicitly (as the trash page does). Deleted items are purged after 30 days.
 */
export function softDeletePlugin(schema: Schema) {
  schema.index({ deletedAt: 1 });
  for (const hook of QUERY_HOOKS) {
    schema.pre(hook, function hideDeleted() {
      if (!mentionsDeletedAt(this.getFilter())) this.where({ deletedAt: null });
    });
  }
  schema.pre('aggregate', function hideDeletedInAggregate() {
    const first = this.pipeline()[0] as Record<string, unknown> | undefined;
    if (!first || !('$match' in first) || !mentionsDeletedAt(first.$match)) {
      this.pipeline().unshift({ $match: { deletedAt: null } });
    }
  });
}
