import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;

export function buildMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Escape user input before using it inside a RegExp. */
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
