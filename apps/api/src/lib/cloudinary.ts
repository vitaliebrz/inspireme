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

export async function deleteAsset(publicId: string, resourceType: 'image' | 'raw' = 'image'): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
