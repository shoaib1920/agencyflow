import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let message = 'Something went wrong';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    details = err.flatten().fieldErrors;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, [v.message]]));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err instanceof MulterError) {
    status = 400;
    message = err.message;
  } else if (typeof err === 'object' && err && (err as { code?: number }).code === 11000) {
    status = 409;
    const keys = Object.keys((err as { keyValue?: object }).keyValue ?? {});
    message = `${keys.join(', ') || 'Value'} already exists`;
  }

  if (status >= 500 && !env.isTest) console.error(err);

  res.status(status).json({
    success: false,
    data: null,
    message,
    meta: details ? { errors: details } : null,
    ...(env.isProd || status < 500 ? {} : { stack: (err as Error).stack }),
  });
};
