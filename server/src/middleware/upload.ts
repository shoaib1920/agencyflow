import multer from 'multer';
import { AppError } from '../utils/AppError';

const ALLOWED = [
  /^image\//,
  /^application\/pdf$/,
  /^text\//,
  /^application\/(zip|x-zip-compressed)$/,
  /officedocument/,
  /^application\/msword$/,
  /^application\/vnd\.ms-excel$/,
];

/** Files are held in memory, then streamed to Cloudinary or written to disk by the service. */
export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.some((rx) => rx.test(file.mimetype))) cb(null, true);
    else cb(AppError.badRequest(`File type ${file.mimetype} is not allowed`));
  },
}).single('file');
