import type { Response } from 'express';

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

/** Every successful response has the shape { success, data, message, meta }. */
export function sendSuccess<T>(
  res: Response,
  data: T,
  { status = 200, message, meta }: { status?: number; message?: string; meta?: ApiMeta } = {},
) {
  return res
    .status(status)
    .json({ success: true, data, message: message ?? null, meta: meta ?? null });
}
