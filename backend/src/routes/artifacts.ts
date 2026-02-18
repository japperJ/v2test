import { FastifyInstance } from 'fastify';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pool from '../db/pool.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

// Returns a short-lived presigned GET URL for a screenshot stored in MinIO/S3.
// The presigned URL expires after 5 minutes (300 seconds).
// Screenshots are stored as private objects — this is the only way admins access them.
export async function artifactRoutes(app: FastifyInstance) {
  app.get<{
    Params: { id: string };
    Querystring: { timestamp: string };
  }>(
    '/api/admin/access-logs/:id/screenshot-url',
    { preHandler: [authenticate, requireRole('admin')] },
    async (request, reply) => {
      const { id } = request.params;
      const { timestamp } = request.query;

      // timestamp is mandatory for partition pruning on the range-partitioned table
      if (!timestamp) {
        return reply
          .status(400)
          .send({ error: 'timestamp query parameter is required for partition pruning' });
      }

      const { rows } = await pool.query<{ screenshot_url: string | null }>(
        'SELECT screenshot_url FROM access_logs WHERE id = $1 AND timestamp = $2',
        [id, timestamp]
      );

      if (!rows.length || !rows[0].screenshot_url) {
        return reply.status(404).send({ error: 'Screenshot not found' });
      }

      const objectKey = rows[0].screenshot_url;

      const s3 = new S3Client({
        endpoint: process.env.AWS_ENDPOINT_URL,
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
        forcePathStyle: true,
      });

      const presignedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME!,
          Key: objectKey,
        }),
        { expiresIn: 300 } // 5-minute expiry — screenshots are sensitive
      );

      return reply.send({ url: presignedUrl });
    }
  );
}
