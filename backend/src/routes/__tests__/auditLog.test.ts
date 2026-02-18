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
  },
}));

vi.mock('../../services/AccessLogService.js', () => ({
  accessLogService: {
    log: vi.fn().mockResolvedValue({ id: 'log-1', timestamp: new Date() }),
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
  auditService: { record: vi.fn().mockResolvedValue(undefined) },
  AUDIT_ACTIONS: {},
}));

vi.mock('jsonwebtoken', () => ({
  verify: vi.fn((token: string) => {
    if (token === 'admin-token') return { userId: 'admin-id', role: 'admin' };
    if (token === 'viewer-token') return { userId: 'viewer-id', role: 'viewer' };
    throw new Error('invalid token');
  }),
  sign: vi.fn().mockReturnValue('mock-token'),
}));

import pool from '../../db/pool.js';
import { buildApp } from '../../app.js';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

describe('GET /api/admin/audit-log', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit-log' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for a viewer role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-log',
      headers: { authorization: 'Bearer viewer-token' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns logs and total for admin', async () => {
    const mockLogs = [{ id: 'a1', action: 'SITE_CREATE', timestamp: new Date().toISOString() }];
    mockPool.query
      .mockResolvedValueOnce({ rows: mockLogs })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-log',
      headers: { authorization: 'Bearer admin-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.logs).toHaveLength(1);
  });

  it('filters by action when provided', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    await app.inject({
      method: 'GET',
      url: '/api/admin/audit-log?action=SITE_DELETE',
      headers: { authorization: 'Bearer admin-token' },
    });

    const [, params] = mockPool.query.mock.calls[0];
    expect(params).toContain('SITE_DELETE');
  });

  it('filters by userId when provided', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    await app.inject({
      method: 'GET',
      url: '/api/admin/audit-log?userId=user-abc',
      headers: { authorization: 'Bearer admin-token' },
    });

    const [, params] = mockPool.query.mock.calls[0];
    expect(params).toContain('user-abc');
  });

  it('uses no WHERE clause when no filters are provided', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    await app.inject({
      method: 'GET',
      url: '/api/admin/audit-log',
      headers: { authorization: 'Bearer admin-token' },
    });

    const [sql] = mockPool.query.mock.calls[0];
    expect(sql).not.toContain('WHERE');
  });
});
