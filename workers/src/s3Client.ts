import { S3Client } from '@aws-sdk/client-s3';

// S3Client configured for MinIO/S3 compatibility via env vars.
// forcePathStyle=true is required for MinIO (path-style bucket addressing).
export const s3Client = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});
