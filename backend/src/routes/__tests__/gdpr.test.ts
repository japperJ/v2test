import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/GeoIPService.js', () => ({
  geoIPService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    lookup: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('../../services/SiteService.js', () => ({
  siteService: {
    findByHostname: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../services/AccessLogService.js', () => ({
  accessLogService: {
    log: vi.fn().mockResolvedValue({ id: 'log-id', timestamp: new Date() }),
    findBySite: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
  },
}));

vi.mock('../../queues/screenshotQueue.js', () => ({
  enqueueScreenshotJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../db/pool.js', () => ({
  default: {
    query: vi.fn(),
  },
}));

vi.mock('../../services/AuditService.js', () => ({
  auditService: {
    record: vi.fn().mockResolvedValue(undefined),
  },
  AUDIT_ACTIONS: {
    GDPR_EXPORT: 'GDPR_EXPORT',
    GDPR_PURGE: 'GDPR_PURGE',
  },
}));

import pool from '../../db/pool.js';
import { buildApp } from '../../app.js';
import { auditService } from '../../services/AuditService.js';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };
const mockAudit = auditService as { record: ReturnType<typeof vi.fn> };

const ADMIN_TOKEN = 'Bearer mock-admin-token';
const VIEWER_TOKEN = 'Bearer mock-viewer-token';

vi.mock('jsonwebtoken', () => ({
  verify: vi.fn((token: string) => {
    if (token === 'mock-admin-token') return { userId: 'admin-id', role: 'admin' };
    if (token === 'mock-viewer-token') return { userId: 'viewer-id', role: 'viewer' };
    throw new Error('invalid token');
  }),
  sign: vi.fn().mockReturnValue('mock-token'),
}));

describe('GDPR routes', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/admin/gdpr/export', () => {
    it('returns 401 when no auth header is provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/gdpr/export',
        payload: { anonymizedIp: '203.0.113.0' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 when authenticated as viewer', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/gdpr/export',
        headers: { authorization: VIEWER_TOKEN },
        payload: { anonymizedIp: '203.0.113.0' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 400 when anonymizedIp is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/gdpr/export',
        headers: { authorization: ADMIN_TOKEN },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns JSON rows for admin with valid ip', async () => {
      const mockRows = [{ id: 'log-1', ip_address: '203.0.113.0', allowed: false }];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/gdpr/export',
        headers: { authorization: ADMIN_TOKEN },
        payload: { anonymizedIp: '203.0.113.0', format: 'json' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('records an audit entry on export', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await app.inject({
        method: 'POST',
        url: '/api/admin/gdpr/export',
        headers: { authorization: ADMIN_TOKEN },
        payload: { anonymizedIp: '203.0.113.0' },
      });

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'GDPR_EXPORT', success: true })
      );
    });
  });

  describe('DELETE /api/admin/gdpr/purge', () => {
    it('returns 401 when no auth header is provided', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/gdpr/purge',
        payload: { anonymizedIp: '203.0.113.0' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 when authenticated as viewer', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/gdpr/purge',
        headers: { authorization: VIEWER_TOKEN },
        payload: { anonymizedIp: '203.0.113.0' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 400 when anonymizedIp is missing', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/gdpr/purge',
        headers: { authorization: ADMIN_TOKEN },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns deleted count for admin', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 3 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/gdpr/purge',
        headers: { authorization: ADMIN_TOKEN },
        payload: { anonymizedIp: '203.0.113.0' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.deleted).toBe(3);
    });

    it('records an audit entry on purge', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 2 });

      await app.inject({
        method: 'DELETE',
        url: '/api/admin/gdpr/purge',
        headers: { authorization: ADMIN_TOKEN },
        payload: { anonymizedIp: '203.0.113.0' },
      });

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'GDPR_PURGE', success: true })
      );
    });
  });
});
