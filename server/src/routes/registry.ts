import type { RequestHandler, Router } from 'express';
import type { ZodTypeAny } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import type { Role } from '../utils/types';

type Method = 'get' | 'post' | 'patch' | 'delete';

export interface RouteDoc {
  method: Method;
  path: string; // full path, e.g. /api/clients/:id
  tag: string;
  summary: string;
  auth: boolean;
  roles?: readonly Role[];
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  multipart?: boolean;
  produces?: string;
}

/** Every route registered through `route()` lands here; the OpenAPI spec is built from it. */
export const routeDocs: RouteDoc[] = [];

interface Options {
  summary: string;
  /** false = public endpoint. Defaults to true. */
  auth?: boolean;
  roles?: readonly Role[];
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  /** Middleware that must run before validation (e.g. multer for uploads). */
  pre?: RequestHandler[];
  multipart?: boolean;
  produces?: string;
}

/**
 * Registers one endpoint: authentication -> role guard -> (pre) -> Zod validation -> handler,
 * and records the same metadata for the API documentation. One source of truth for both.
 */
export function routes(router: Router, basePath: string, tag: string) {
  return (method: Method, path: string, opts: Options, handler: RequestHandler) => {
    const chain: RequestHandler[] = [];
    if (opts.auth !== false) chain.push(authenticate);
    if (opts.roles) chain.push(requireRole(...opts.roles));
    if (opts.pre) chain.push(...opts.pre);
    if (opts.body || opts.query || opts.params) chain.push(validate({ body: opts.body, query: opts.query, params: opts.params }));
    router[method](path, ...chain, handler);
    routeDocs.push({
      method,
      path: `${basePath}${path === '/' ? '' : path}`,
      tag,
      summary: opts.summary,
      auth: opts.auth !== false,
      roles: opts.roles,
      body: opts.body,
      query: opts.query,
      params: opts.params,
      multipart: opts.multipart,
      produces: opts.produces,
    });
  };
}
