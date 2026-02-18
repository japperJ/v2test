import { FastifyInstance } from 'fastify';
import { siteService } from '../services/SiteService.js';
import { CreateSiteSchema, UpdateSiteSchema } from '../models/Site.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditService, AUDIT_ACTIONS } from '../services/AuditService.js';

export async function siteRoutes(app: FastifyInstance) {
  // Create site — admin only
  app.post('/api/admin/sites', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    const result = CreateSiteSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Validation error', details: result.error.flatten() });
    }

    // Validate IP addresses
    const validation = validateIPLists(result.data.ip_allowlist, result.data.ip_denylist);
    if (!validation.valid) {
      return reply.status(400).send({ error: 'Invalid IP/CIDR entry', detail: validation.error });
    }

    try {
      const site = await siteService.create(result.data);
      await auditService.record({
        actorUserId: request.user?.userId,
        action: AUDIT_ACTIONS.SITE_CREATE,
        entityType: 'site',
        entityId: site.id,
        success: true,
        metadata: { slug: site.slug },
      });
      return reply.status(201).send(site);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        await auditService.record({
          actorUserId: request.user?.userId,
          action: AUDIT_ACTIONS.SITE_CREATE,
          entityType: 'site',
          entityId: null,
          success: false,
          error: 'unique_violation',
        });
        return reply.status(409).send({ error: 'Slug or hostname already exists' });
      }
      throw err;
    }
  });

  // List sites — viewer can read
  app.get('/api/admin/sites', { preHandler: [authenticate] }, async (_request, reply) => {
    const sites = await siteService.findAll();
    return reply.send(sites);
  });

  // Get site by ID — viewer can read
  app.get<{ Params: { id: string } }>('/api/admin/sites/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const site = await siteService.findById(request.params.id);
    if (!site) return reply.status(404).send({ error: 'Not found' });
    return reply.send(site);
  });

  // Update site — admin only
  app.patch<{ Params: { id: string } }>('/api/admin/sites/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    const result = UpdateSiteSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Validation error', details: result.error.flatten() });
    }

    const validation = validateIPLists(result.data.ip_allowlist, result.data.ip_denylist);
    if (!validation.valid) {
      return reply.status(400).send({ error: 'Invalid IP/CIDR entry', detail: validation.error });
    }

    const site = await siteService.update(request.params.id, result.data);
    if (!site) return reply.status(404).send({ error: 'Not found' });
    await auditService.record({
      actorUserId: request.user?.userId,
      action: AUDIT_ACTIONS.SITE_UPDATE,
      entityType: 'site',
      entityId: site.id,
      success: true,
    });
    return reply.send(site);
  });

  // Delete site — admin only
  app.delete<{ Params: { id: string } }>('/api/admin/sites/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    const deleted = await siteService.delete(request.params.id);
    if (!deleted) return reply.status(404).send({ error: 'Not found' });
    await auditService.record({
      actorUserId: request.user?.userId,
      action: AUDIT_ACTIONS.SITE_DELETE,
      entityType: 'site',
      entityId: request.params.id,
      success: true,
    });
    return reply.status(204).send();
  });
}

function validateIPLists(
  allowlist?: string[] | null,
  denylist?: string[] | null
): { valid: boolean; error?: string } {
  const all = [...(allowlist ?? []), ...(denylist ?? [])];
  for (const entry of all) {
    if (!isValidIPOrCIDR(entry)) {
      return { valid: false, error: `Invalid IP or CIDR: ${entry}` };
    }
  }
  return { valid: true };
}

function isValidIPOrCIDR(entry: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  const ipv6 = /^[0-9a-fA-F:]+?(\/\d{1,3})?$/;
  return ipv4.test(entry) || ipv6.test(entry);
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505';
}
