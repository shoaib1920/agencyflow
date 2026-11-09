import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../config/env';

export const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

if (env.cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface StoredFile {
  url: string;
  storage: 'cloudinary' | 'local';
  publicId?: string;
}

/** Uploads to Cloudinary when configured, otherwise writes to /uploads and serves it statically. */
export async function storeFile(file: Express.Multer.File): Promise<StoredFile> {
  if (env.cloudinaryEnabled) {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'agencyflow', resource_type: 'auto', use_filename: true },
        (err, res) => (err || !res ? reject(err ?? new Error('Upload failed')) : resolve(res)),
      );
      stream.end(file.buffer);
    });
    return { url: result.secure_url, storage: 'cloudinary', publicId: result.public_id };
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), file.buffer);
  return { url: `/uploads/${filename}`, storage: 'local' };
}

export async function deleteStoredFile(storage: string, url: string, publicId?: string) {
  try {
    if (storage === 'cloudinary' && publicId) {
      await cloudinary.uploader.destroy(publicId);
    } else if (storage === 'local') {
      await fs.unlink(path.join(UPLOAD_DIR, path.basename(url)));
    }
  } catch {
    // file already gone; nothing to do
  }
}
