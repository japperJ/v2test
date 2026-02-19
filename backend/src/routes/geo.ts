import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { geofenceService } from '../services/GeofenceService.js';
import { accessLogService } from '../services/AccessLogService.js';
import { getClientIP } from '../utils/getClientIP.js';

const VerifyLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().positive(),
  siteId: z.string().uuid(),
});

export async function geoRoutes(fastify: FastifyInstance) {
  fastify.post('/api/protected/verify-location', async (request, reply) => {
    const result = VerifyLocationSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Invalid coordinates', details: result.error.format() });
    }

    const { lat, lng, accuracy, siteId } = result.data;

    const fenceResult = await geofenceService.isPointInFence(siteId, lat, lng);

    // No fence configured → GPS check passes by default
    const allowed = !fenceResult.hasFence || fenceResult.inside;
    const reason = !allowed ? 'outside_geofence' : undefined;

    const clientIp = getClientIP(request);
    await accessLogService.log({
      siteId,
      ipAddress: clientIp,
      userAgent: request.headers['user-agent'],
      url: request.url,
      allowed,
      reason,
      gpsLat: lat,
      gpsLng: lng,
      gpsAccuracy: accuracy,
    });

    return reply.send({ allowed, ...(reason ? { reason } : {}) });
  });
}
