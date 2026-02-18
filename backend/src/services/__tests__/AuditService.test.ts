import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/pool.js', () => ({
  default: {
    query: vi.fn(),
  },
}));

import pool from '../../db/pool.js';
import { AuditService, AUDIT_ACTIONS } from '../AuditService.js';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    service = new AuditService();
    vi.clearAllMocks();
  });

  describe('record()', () => {
    it('inserts an audit row with the provided params', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.record({
        actorUserId: 'user-1',
        action: AUDIT_ACTIONS.SITE_CREATE,
        entityType: 'site',
        entityId: 'site-1',
        success: true,
      });

      expect(mockPool.query).toHaveBeenCalledOnce();
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO audit_log');
      expect(params[0]).toBe('user-1');
      expect(params[1]).toBe(AUDIT_ACTIONS.SITE_CREATE);
      expect(params[2]).toBe('site');
      expect(params[3]).toBe('site-1');
      expect(params[4]).toBe(true);
    });

    it('defaults success to true when not provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.record({ action: AUDIT_ACTIONS.LOGIN_SUCCESS });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params[4]).toBe(true);
    });

    it('records a failure entry with error message', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.record({
        actorUserId: null,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        success: false,
        error: 'invalid_credentials',
      });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params[4]).toBe(false);
      expect(params[5]).toBe('invalid_credentials');
    });

    it('stores metadata as JSON string', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const metadata = { count: 5, siteId: 'abc' };

      await service.record({
        action: AUDIT_ACTIONS.GDPR_EXPORT,
        metadata,
      });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params[6]).toBe(JSON.stringify(metadata));
    });

    it('does not throw when the DB insert fails (best-effort logging)', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB connection error'));

      // Must resolve without throwing
      await expect(
        service.record({ action: AUDIT_ACTIONS.SITE_DELETE, entityId: 'site-x' })
      ).resolves.toBeUndefined();
    });
  });

  describe('singleton export', () => {
    it('exports auditService as a singleton instance of AuditService', async () => {
      const { auditService } = await import('../AuditService.js');
      expect(auditService).toBeInstanceOf(AuditService);
    });
  });

  describe('AUDIT_ACTIONS', () => {
    it('exports expected action constants', () => {
      expect(AUDIT_ACTIONS.SITE_CREATE).toBe('SITE_CREATE');
      expect(AUDIT_ACTIONS.LOGIN_SUCCESS).toBe('LOGIN_SUCCESS');
      expect(AUDIT_ACTIONS.LOGIN_FAILED).toBe('LOGIN_FAILED');
      expect(AUDIT_ACTIONS.LOGOUT).toBe('LOGOUT');
      expect(AUDIT_ACTIONS.GDPR_EXPORT).toBe('GDPR_EXPORT');
      expect(AUDIT_ACTIONS.GDPR_PURGE).toBe('GDPR_PURGE');
    });
  });
});
