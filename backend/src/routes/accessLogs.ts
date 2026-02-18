import { FastifyInstance } from 'fastify';
import { accessLogService } from '../services/AccessLogService.js';
import { authenticate } from '../middleware/authenticate.js';

export async function accessLogRoutes(app: FastifyInstance) {
  app.get<{
    Params: { siteId: string };
    Querystring: { allowed?: string; limit?: string; offset?: string };
  }>('/api/admin/sites/:siteId/access-logs', { preHandler: [authenticate] }, async (request, reply) => {
    const { siteId } = request.params;
    const { allowed, limit, offset } = request.query;

    const result = await accessLogService.findBySite(siteId, {
      allowed: allowed !== undefined ? allowed === 'true' : undefined,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    return reply.send(result);
  });
}
