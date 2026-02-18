import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccessLogService } from '../AccessLogService.js';

vi.mock('../../db/pool.js', () => ({
  default: {
    query: vi.fn(),
  },
}));

import pool from '../../db/pool.js';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

describe('AccessLogService', () => {
  let service: AccessLogService;

  beforeEach(() => {
    service = new AccessLogService();
    vi.clearAllMocks();
  });

  describe('log()', () => {
    it('returns id and timestamp after successful insert', async () => {
      const mockTimestamp = new Date('2026-02-18T10:00:00Z');
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'new-log-id', timestamp: mockTimestamp }],
      });

      const result = await service.log({ siteId: 'site-1', ipAddress: '1.2.3.4', allowed: true });

      expect(result.id).toBe('new-log-id');
      expect(result.timestamp).toEqual(mockTimestamp);
      expect(mockPool.query).toHaveBeenCalledOnce();
    });

    it('anonymizes IPv4 — zeroes last octet before storing', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'log-id', timestamp: new Date() }],
      });

      await service.log({ siteId: 'site-1', ipAddress: '203.0.113.5', allowed: true });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params[1]).toBe('203.0.113.0');
    });

    it('anonymizes IPv6 — zeroes last 80 bits before storing', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'log-id', timestamp: new Date() }],
      });

      await service.log({ siteId: 'site-1', ipAddress: '2001:db8::1', allowed: true });

      const [, params] = mockPool.query.mock.calls[0];
      // Original IP must not be stored verbatim
      expect(params[1]).not.toBe('2001:db8::1');
      // First 48 bits (3 groups) are preserved
      expect(params[1]).toContain('2001');
    });

    it('uses RETURNING id, timestamp in the INSERT query', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'r-id', timestamp: new Date() }],
      });

      await service.log({ siteId: 'site-1', ipAddress: '1.2.3.4', allowed: false });

      const [sql] = mockPool.query.mock.calls[0];
      expect(sql).toContain('RETURNING id, timestamp');
    });
  });

  describe('findBySite()', () => {
    it('returns logs from query rows and parses total from count', async () => {
      const mockLogs = [{ id: '1', allowed: true }];
      mockPool.query
        .mockResolvedValueOnce({ rows: mockLogs })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const result = await service.findBySite('site-1');

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(5);
    });

    it('includes allowed=true in SELECT params when filtering allowed', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.findBySite('site-1', { allowed: true });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params).toContain(true);
    });

    it('includes allowed=false in SELECT params when filtering blocked', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.findBySite('site-1', { allowed: false });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params).toContain(false);
    });

    it('does not include a boolean when no allowed filter is given', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.findBySite('site-1');

      const [, params] = mockPool.query.mock.calls[0];
      expect(params).not.toContain(true);
      expect(params).not.toContain(false);
      expect(params[0]).toBe('site-1');
    });

    it('passes limit and offset as trailing params in SELECT query', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.findBySite('site-1', { limit: 20, offset: 40 });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params).toContain(20);
      expect(params).toContain(40);
    });
  });
});
