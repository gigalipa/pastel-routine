const crypto = require('node:crypto');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

function getS3ClientConfig() {
  const endpoint =
    process.env.AWS_ENDPOINT_URL_S3 ||
    process.env.S3_ENDPOINT ||
    process.env.NEON_STORAGE_ENDPOINT;
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-2';
  const bucket = process.env.S3_BUCKET || process.env.NEON_STORAGE_BUCKET || 'uploads';

  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true, // Required by Neon Object Storage
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  return { client, bucket };
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Formato de imagen inválido. Debe ser JPEG, PNG o WebP.');
  }
  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('La imagen supera el límite máximo de 5 MB.');
  }
  return { mimeType, buffer };
}

async function storePhotoObject({ userId, dataUrl }) {
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  const ext = mimeType.includes('webp') ? 'webp' : mimeType.includes('png') ? 'png' : 'jpg';
  const objectKey = `users/${userId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

  const s3Cfg = getS3ClientConfig();
  if (s3Cfg) {
    await s3Cfg.client.send(
      new PutObjectCommand({
        Bucket: s3Cfg.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType
      })
    );
    return { storageType: 'neon-s3', objectKey, mimeType, dataUrl: null };
  }

  return { storageType: 'db', objectKey, mimeType, dataUrl };
}

async function fetchPhotoObject({ storageType, objectKey, mimeType, dataUrl }) {
  if (storageType === 'neon-s3' || storageType === 's3') {
    const s3Cfg = getS3ClientConfig();
    if (s3Cfg) {
      const res = await s3Cfg.client.send(
        new GetObjectCommand({
          Bucket: s3Cfg.bucket,
          Key: objectKey
        })
      );
      const bytes = await res.Body.transformToByteArray();
      return { mimeType: mimeType || 'image/jpeg', buffer: Buffer.from(bytes) };
    }
  }
  if (dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    return { mimeType: parsed.mimeType, buffer: parsed.buffer };
  }
  throw new Error('Imagen no encontrada en el almacenamiento.');
}

async function deletePhotoObject({ storageType, objectKey }) {
  if ((storageType === 'neon-s3' || storageType === 's3') && objectKey) {
    const s3Cfg = getS3ClientConfig();
    if (s3Cfg) {
      try {
        await s3Cfg.client.send(
          new DeleteObjectCommand({
            Bucket: s3Cfg.bucket,
            Key: objectKey
          })
        );
      } catch {
        // Ignore deletion error if object already gone
      }
    }
  }
}

module.exports = {
  getS3ClientConfig,
  storePhotoObject,
  fetchPhotoObject,
  deletePhotoObject
};
