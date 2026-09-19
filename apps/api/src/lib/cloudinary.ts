import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME'] ?? '',
  api_key: process.env['CLOUDINARY_API_KEY'] ?? '',
  api_secret: process.env['CLOUDINARY_API_SECRET'] ?? '',
  secure: true,
});

export { cloudinary };

export async function uploadImage(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: 'image', quality: 'auto', fetch_format: 'auto' }, (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload eșuat'));
        resolve(result.secure_url);
      })
      .end(buffer);
  });
}

export async function uploadPdf(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: 'raw' }, (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload PDF eșuat'));
        resolve(result.secure_url);
      })
      .end(buffer);
  });
}

// Video — streaming direct către Cloudinary (nu base64), important pentru fișiere mari de pe telefon.
// iOS filmează HEVC/H.265 în container .mov, pe care Chrome/Firefox pe desktop NU îl redă.
// De aceea generăm o variantă transcodată la MP4/H.264 (redabilă peste tot), la calitate
// bună (q_auto:good) și cap 1080p. Transcodarea pornește ca EAGER la upload (async), ca
// varianta redabilă să fie gata înainte ca cineva să dea click. Livrăm URL-ul eager (mp4).
// Fallback pe original dacă eager lipsește (frontendul aplică atunci transformarea la livrare).
export async function uploadVideo(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder,
          resource_type: 'video',
          eager: [{ format: 'mp4', quality: 'auto:good', width: 1080, crop: 'limit' }],
          eager_async: true,
        },
        (err, result) => {
          if (err || !result) return reject(err ?? new Error('Upload video eșuat'));
          resolve(result.eager?.[0]?.secure_url ?? result.secure_url);
        },
      )
      .end(buffer);
  });
}

export async function deleteAsset(publicId: string, resourceType: 'image' | 'raw' | 'video' = 'image'): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

// Extrage publicId din URL Cloudinary (ex: "group_avatars/abc123" din https://res.cloudinary.com/.../upload/v123/group_avatars/abc123.jpg)
export function extractPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^./]+)?$/);
  return match?.[1] ?? null;
}
