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

// Detectare containere video pe bază de magic bytes reale (nu extensie) —
// acoperă fișierele trimise de telefoane/laptopuri indiferent de OS
function isIsoBmffBuffer(buffer: Buffer): boolean {
  // MP4/MOV/3GP/M4V — toate folosesc containerul ISO-BMFF cu box "ftyp" la offset 4
  return buffer.length >= 8 && buffer.slice(4, 8).toString('ascii') === 'ftyp';
}
function isEbmlBuffer(buffer: Buffer): boolean {
  // WebM/MKV — header EBML
  return buffer.length >= 4 && buffer.slice(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
}
function isAviBuffer(buffer: Buffer): boolean {
  // AVI — RIFF....AVI
  return buffer.length >= 12
    && buffer.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.slice(8, 12).toString('ascii') === 'AVI ';
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
// Formate video acceptate din orice dispozitiv: MP4/M4V (Android + generic), MOV (iOS),
// WebM (Android/Chrome), 3GP (telefoane mai vechi), AVI, MKV, OGG
const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/3gpp2',
  'video/x-msvideo', 'video/x-matroska', 'video/ogg', 'video/mpeg', 'video/x-m4v',
] as const;
const ALLOWED_CHAT_TYPES = [...ALLOWED_IMAGE_TYPES, ALLOWED_PDF_TYPE, ...ALLOWED_VIDEO_TYPES] as const;

const ISO_BMFF_VIDEO_TYPES: readonly string[] = ['video/mp4', 'video/quicktime', 'video/3gpp', 'video/3gpp2', 'video/x-m4v'];
const EBML_VIDEO_TYPES: readonly string[] = ['video/webm', 'video/x-matroska'];

// Magic bytes pentru validare tip real (nu doar extensie)
const MAGIC_BYTES: Record<string, Buffer> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46]),
  'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]),
  'video/ogg': Buffer.from('OggS'),
};

// Detectează tipul REAL al fișierului din magic bytes, independent de mimetype-ul
// raportat de browser (care e adesea gol sau „application/octet-stream" pentru
// mp4 de pe laptop/Android). Ordinea contează: HEIC și MP4/MOV împart containerul
// ISO-BMFF, deci verificăm HEIC (imagine) înaintea video-ului generic.
export type DetectedKind = 'image' | 'video' | 'pdf' | null;

function isImageMagic(buffer: Buffer): boolean {
  if (isHeicBuffer(buffer)) return true;
  if (buffer.slice(0, 3).equals(MAGIC_BYTES['image/jpeg']!)) return true;
  if (buffer.slice(0, 4).equals(MAGIC_BYTES['image/png']!)) return true;
  // WebP: RIFF....WEBP
  if (buffer.length >= 12
    && buffer.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.slice(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}

export function detectKind(buffer: Buffer): DetectedKind {
  if (isImageMagic(buffer)) return 'image';
  if (buffer.slice(0, magicLen('application/pdf')).equals(MAGIC_BYTES['application/pdf']!)) return 'pdf';
  // Video: ISO-BMFF (mp4/mov/3gp/m4v), EBML (webm/mkv), AVI (RIFF+AVI), OGG
  if (isIsoBmffBuffer(buffer) && !isHeicBuffer(buffer)) return 'video';
  if (isEbmlBuffer(buffer)) return 'video';
  if (isAviBuffer(buffer)) return 'video';
  if (buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === 'OggS') return 'video';
  return null;
}

function magicLen(mime: string): number {
  return MAGIC_BYTES[mime]?.length ?? 0;
}

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return isHeicBuffer(buffer);
  if (ISO_BMFF_VIDEO_TYPES.includes(mimeType)) return isIsoBmffBuffer(buffer);
  if (EBML_VIDEO_TYPES.includes(mimeType)) return isEbmlBuffer(buffer);
  if (mimeType === 'video/x-msvideo') return isAviBuffer(buffer);
  if (mimeType === 'video/mpeg') {
    // MPEG-PS/ES nu are un magic byte unic universal — acceptăm start code-ul standard
    return buffer.length >= 4 && (buffer.slice(0, 3).equals(Buffer.from([0x00, 0x00, 0x01])) || buffer.slice(0, 4).equals(Buffer.from([0x47, 0x40, 0x00, 0x10])));
  }
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

// Extensii acceptate în chat (fallback când browserul raportează mimetype gol
// sau „application/octet-stream" — frecvent pentru mp4 de pe laptop/Android)
const ALLOWED_CHAT_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.pdf',
  '.mp4', '.m4v', '.mov', '.webm', '.3gp', '.3g2', '.avi', '.mkv', '.ogv', '.ogg', '.mpeg', '.mpg',
];
const GENERIC_MIMETYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_CHAT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Upload fișiere chat (PDF + imagini + video, max 75MB — videoclipurile de pe telefon depășesc 10MB).
// Filtrul e permisiv la mimetype (browserele raportează inconsistent video); validarea
// REALĂ se face în rută prin magic bytes (detectKind), deci nu se pierde securitatea.
export const uploadChatFile = multer({
  storage: memoryStorage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 }, // 100MB — maximul planului gratuit Cloudinary pentru video
  fileFilter: (_req, file, cb) => {
    const okMime = (ALLOWED_CHAT_TYPES as readonly string[]).includes(file.mimetype)
      || file.mimetype.startsWith('video/')
      || GENERIC_MIMETYPES.has(file.mimetype);
    if (okMime || hasAllowedExtension(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Doar PDF, imagini și video sunt permise în chat.'));
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
