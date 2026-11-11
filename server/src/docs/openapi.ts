import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { routeDocs } from '../routes/registry';

// zod-to-json-schema's generics recurse too deeply for TS on large schemas; the runtime is fine
const convert = zodToJsonSchema as unknown as (schema: ZodTypeAny, options: object) => Record<string, unknown>;

const toSchema = (schema: ZodTypeAny) => {
  const { $schema: _ignored, ...rest } = convert(schema, { target: 'openApi3', $refStrategy: 'none' });
  return rest;
};

const envelope = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {},
    message: { type: 'string', nullable: true },
    meta: { type: 'object', nullable: true },
  },
};

/** Builds an OpenAPI 3 document from the live route registry and the Zod request schemas. */
export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of routeDocs) {
    const path = r.path.replace(/:(\w+)/g, '{$1}');
    const parameters: unknown[] = [];

    if (r.params) {
      const props = (toSchema(r.params).properties ?? {}) as Record<string, unknown>;
      for (const [name, schema] of Object.entries(props)) parameters.push({ name, in: 'path', required: true, schema });
    }
    if (r.query) {
      const json = toSchema(r.query);
      const props = (json.properties ?? {}) as Record<string, unknown>;
      const required = new Set((json.required as string[] | undefined) ?? []);
      for (const [name, schema] of Object.entries(props)) parameters.push({ name, in: 'query', required: required.has(name), schema });
    }

    const roles = r.roles ? ` Roles: ${r.roles.join(', ')}.` : '';
    const op: Record<string, unknown> = {
      tags: [r.tag],
      summary: r.summary,
      description: `${r.auth ? 'Requires a Bearer access token.' : 'Public endpoint.'}${roles}`,
      parameters,
      security: r.auth ? [{ bearerAuth: [] }] : [],
      responses: {
        200: {
          description: 'Success',
          content: r.produces ? { [r.produces]: { schema: { type: 'string', format: 'binary' } } } : { 'application/json': { schema: envelope } },
        },
        400: { description: 'Validation failed (meta.errors has field messages)' },
        ...(r.auth ? { 401: { description: 'Missing or expired access token' } } : {}),
        ...(r.roles ? { 403: { description: 'Your role is not allowed' } } : {}),
      },
    };
    if (r.body) op.requestBody = { required: true, content: { 'application/json': { schema: toSchema(r.body) } } };
    if (r.multipart) {
      op.requestBody = {
        required: true,
        content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } },
      };
    }
    paths[path] = { ...(paths[path] ?? {}), [r.method]: op };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'AgencyFlow API',
      version: '2.0.0',
      description:
        'REST API for AgencyFlow. Sign in with POST /api/auth/login, copy `data.accessToken`, then click **Authorize**. ' +
        'Every response uses the envelope `{ success, data, message, meta }`. This document is generated from the route registry and Zod schemas.',
    },
    servers: [{ url: serverUrl }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  };
}
