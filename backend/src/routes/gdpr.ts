import { FastifyInstance } from 'fastify';
import pool from '../db/pool.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditService, AUDIT_ACTIONS } from '../services/AuditService.js';

export async function gdprRoutes(app: FastifyInstance) {
  // POST /api/admin/gdpr/export
  // Returns all access log rows for a given anonymized IP address as JSON or CSV.
  app.post<{ Body: { anonymizedIp?: string; format?: string; siteId?: string } }>(
    '/api/admin/gdpr/export',
    { preHandler: [authenticate, requireRole('admin')] },
    async (request, reply) => {
      const { anonymizedIp, format = 'json', siteId } = request.body ?? {};

      if (!anonymizedIp || typeof anonymizedIp !== 'string') {
        return reply.status(400).send({ error: 'anonymizedIp is required' });
      }

      const params: unknown[] = [anonymizedIp];
      let whereClause = 'WHERE ip_address = $1::inet';
      if (siteId) {
        whereClause += ' AND site_id = $2';
        params.push(siteId);
      }

      const { rows } = await pool.query(
        `SELECT * FROM access_logs ${whereClause} ORDER BY timestamp DESC`,
        params
      );

      await auditService.record({
        actorUserId: request.user?.userId,
        action: AUDIT_ACTIONS.GDPR_EXPORT,
        entityType: 'ip_address',
        entityId: anonymizedIp,
        success: true,
        metadata: { recordCount: rows.length, siteId: siteId ?? null, format },
      });

      if (format === 'csv') {
        const header = 'id,timestamp,site_id,ip_address,allowed,reason,url\n';
        const csvRows = rows
          .map(
            (r) =>
              `"${r.id}","${r.timestamp}","${r.site_id}","${r.ip_address}",${r.allowed},"${r.reason ?? ''}","${(r.url ?? '').replace(/"/g, '""')}"`
          )
          .join('\n');
        reply.header('Content-Type', 'text/csv');
        reply.header(
          'Content-Disposition',
          `attachment; filename="gdpr-export-${Date.now()}.csv"`
        );
        return reply.send(header + csvRows);
      }

      return reply.send(rows);
    }
  );

  // DELETE /api/admin/gdpr/purge
  // Deletes all access log rows for a given anonymized IP address.
  app.delete<{ Body: { anonymizedIp?: string; siteId?: string } }>(
    '/api/admin/gdpr/purge',
    { preHandler: [authenticate, requireRole('admin')] },
    async (request, reply) => {
      const { anonymizedIp, siteId } = request.body ?? {};

      if (!anonymizedIp || typeof anonymizedIp !== 'string') {
        return reply.status(400).send({ error: 'anonymizedIp is required' });
      }

      const params: unknown[] = [anonymizedIp];
      let whereClause = 'WHERE ip_address = $1::inet';
      if (siteId) {
        whereClause += ' AND site_id = $2';
        params.push(siteId);
      }

      const result = await pool.query(
        `DELETE FROM access_logs ${whereClause}`,
        params
      );

      await auditService.record({
        actorUserId: request.user?.userId,
        action: AUDIT_ACTIONS.GDPR_PURGE,
        entityType: 'ip_address',
        entityId: anonymizedIp,
        success: true,
        metadata: { deleted: result.rowCount, siteId: siteId ?? null },
      });

      return reply.send({ deleted: result.rowCount ?? 0 });
    }
  );
}
