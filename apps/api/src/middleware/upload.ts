import multer from 'multer';
import { Request } from 'express';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

// Detectare HEIC prin magic bytes (ftyp la offset 4)
function isHeicBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer.slice(4, 8).toString('ascii') !== 'ftyp') return false;
  const brand = buffer.slice(8, 12).toString('ascii');
  return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'MiHE', 'MiHB'].includes(brand);
}

// Compresie WebP: max lățime/înălțime + calitate reglabilă
// HEIC este convertit la JPEG mai întâi (heic-convert), apoi procesat de sharp
// Cloudinary servește AVIF automat (fetch_format: 'auto') browserelor care îl suportă
export async function compressToWebp(
  buffer: Buffer,
  opts: { width?: number; height?: number; quality?: number } = {},
): Promise<Buffer> {
  const { width = 2560, height = 2560, quality = 92 } = opts;

  let processBuffer = buffer;
  if (isHeicBuffer(buffer)) {
    const jpegArrayBuffer = await heicConvert({
      buffer: new Uint8Array(buffer),
      format: 'JPEG',
      quality: 0.95,
    });
    processBuffer = Buffer.from(jpegArrayBuffer);
  }

  return sharp(processBuffer)
    .rotate()
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .withMetadata({ exif: {} })
    .webp({ quality, effort: 4 })
    .toBuffer();
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
const ALLOWED_PDF_TYPE = 'application/pdf';
const ALLOWED_CHAT_TYPES = [...ALLOWED_IMAGE_TYPES, ALLOWED_PDF_TYPE] as const;

// Magic bytes pentru validare tip real (nu doar extensie)
const MAGIC_BYTES: Record<string, Buffer> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46]),
  'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]),
};

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return isHeicBuffer(buffer);
  const magic = MAGIC_BYTES[mimeType];
  if (!magic) return false;
  // WebP are RIFF la 0 și WEBP la 8 — verificăm ambele
  if (mimeType === 'image/webp') {
    return buffer.slice(0, 4).equals(magic) && buffer.slice(8, 12).equals(Buffer.from('WEBP'));
  }
  return buffer.slice(0, magic.length).equals(magic);
}

const memoryStorage = multer.memoryStorage();

// Upload imagini idei (max 10 fișiere, 5MB fiecare)
export const uploadIdeaImages = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req: Request, file, cb) => {
    if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Doar imagini JPG, PNG sau WebP sunt permise.'));
    }
  },
});

// Upload PDF idee (max 1 fișier, 20MB)
export const uploadIdeaPdf = multer({
  storage: memoryStorage,
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === ALLOWED_PDF_TYPE) {
      cb(null, true);
    } else {
      cb(new Error('Doar fișiere PDF sunt permise.'));
    }
  },
});

// Upload fișiere chat (PDF + imagini, max 10MB)
export const uploadChatFile = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_CHAT_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Doar PDF și imagini sunt permise în chat.'));
    }
  },
});

// Upload avatar (max 10MB — sharp comprimă oricum la WebP mic)
export const uploadAvatar = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Format nesuportat: ${file.mimetype}. Folosește JPG, PNG sau WebP.`));
    }
  },
});
