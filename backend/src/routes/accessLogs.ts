import { FastifyInstance } from 'fastify';
import { accessLogService } from '../services/AccessLogService.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import pool from '../db/pool.js';

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

  // GET /api/admin/audit-log — paginated audit log, admin only
  app.get<{
    Querystring: {
      action?: string;
      userId?: string;
      limit?: string;
      offset?: string;
    };
  }>('/api/admin/audit-log', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    const { action, userId, limit, offset } = request.query;

    const params: unknown[] = [];
    const conditions: string[] = [];
    let idx = 1;

    if (action) {
      conditions.push(`action = $${idx++}`);
      params.push(action);
    }
    if (userId) {
      conditions.push(`actor_user_id = $${idx++}`);
      params.push(userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitVal = limit ? Math.min(parseInt(limit, 10), 100) : 50;
    const offsetVal = offset ? parseInt(offset, 10) : 0;

    const [{ rows: logs }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT * FROM audit_log ${whereClause} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx}`,
        [...params, limitVal, offsetVal]
      ),
      pool.query(
        `SELECT COUNT(*) as count FROM audit_log ${whereClause}`,
        params
      ),
    ]);

    return reply.send({ logs, total: parseInt(countRows[0].count, 10) });
  });
}
