import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SiteService } from '../SiteService.js';

// Mock the pool
vi.mock('../../db/pool.js', () => ({
  default: {
    query: vi.fn(),
  },
}));

import pool from '../../db/pool.js';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

describe('SiteService', () => {
  let service: SiteService;

  beforeEach(() => {
    service = new SiteService();
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates a site with parameterized query', async () => {
      const mockSite = { id: 'uuid-1', slug: 'test', name: 'Test Site', access_mode: 'disabled' };
      mockPool.query.mockResolvedValueOnce({ rows: [mockSite] });

      const result = await service.create({ slug: 'test', name: 'Test Site' });

      expect(mockPool.query).toHaveBeenCalledOnce();
      const [sql, params] = mockPool.query.mock.calls[0];
      // Verify parameterized query — no string interpolation
      expect(sql).toContain('$1');
      expect(params[0]).toBe('test');
      expect(result).toEqual(mockSite);
    });

    it('does not allow SQL injection via slug', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{}] });
      const maliciousSlug = "'; DROP TABLE sites; --";
      await service.create({ slug: maliciousSlug, name: 'Test' });
      const [, params] = mockPool.query.mock.calls[0];
      // The malicious string is passed as a parameter, never interpolated
      expect(params[0]).toBe(maliciousSlug);
    });

    it('formats array fields and optional values when all fields are provided', async () => {
      const mockSite = { id: 'uuid-2', slug: 'full', name: 'Full Site' };
      mockPool.query.mockResolvedValueOnce({ rows: [mockSite] });

      await service.create({
        slug: 'full',
        name: 'Full Site',
        hostname: 'full.example.com',
        access_mode: 'ip_only',
        ip_allowlist: ['1.2.3.0/24'],
        ip_denylist: ['5.5.5.5'],
        country_allowlist: ['US'],
        country_denylist: ['RU'],
        block_vpn_proxy: false,
        enabled: false,
      });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params[1]).toBe('full.example.com'); // hostname
      expect(params[3]).toBe('ip_only');           // access_mode
      expect(params[4]).toBe('{1.2.3.0/24}');      // ip_allowlist formatted
      expect(params[5]).toBe('{5.5.5.5}');          // ip_denylist formatted
      expect(params[6]).toBe('{US}');               // country_allowlist formatted
      expect(params[7]).toBe('{RU}');               // country_denylist formatted
      expect(params[8]).toBe(false);                // block_vpn_proxy
      expect(params[9]).toBe(false);                // enabled
    });
  });

  describe('findById', () => {
    it('returns null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.findById('non-existent-id');
      expect(result).toBeNull();
    });

    it('uses parameterized query and selects ST_AsGeoJSON for geofence_polygon', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'test-id', geofence_polygon: null }] });
      await service.findById('test-id');
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('$1');
      expect(sql).toContain('ST_AsGeoJSON(geofence_polygon)');
      expect(params[0]).toBe('test-id');
    });
  });

  describe('delete', () => {
    it('returns false when site not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      const result = await service.delete('non-existent');
      expect(result).toBe(false);
    });

    it('returns true when deleted', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      const result = await service.delete('existing-id');
      expect(result).toBe(true);
    });
  });

  describe('findByHostname', () => {
    it('returns null when no site matches the hostname', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.findByHostname('missing.example.com');
      expect(result).toBeNull();
    });

    it('returns the matching site when found', async () => {
      const mockSite = { id: 'uuid-3', hostname: 'test.example.com', enabled: true, geofence_polygon: null };
      mockPool.query.mockResolvedValueOnce({ rows: [mockSite] });
      const result = await service.findByHostname('test.example.com');
      expect(result?.id).toBe('uuid-3');
      expect(result?.hostname).toBe('test.example.com');
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('hostname = $1');
      expect(params[0]).toBe('test.example.com');
    });
  });

  describe('findAll', () => {
    it('returns all sites', async () => {
      const mockSites = [{ id: 'b', geofence_polygon: null }, { id: 'a', geofence_polygon: null }];
      mockPool.query.mockResolvedValueOnce({ rows: mockSites });
      const result = await service.findAll();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('b');
    });
  });

  describe('update', () => {
    it('delegates to findById when no fields are provided', async () => {
      const mockSite = { id: 'test-id', slug: 'original', geofence_polygon: null };
      mockPool.query.mockResolvedValueOnce({ rows: [mockSite] });
      const result = await service.update('test-id', {});
      expect(result?.id).toBe('test-id');
      const [sql] = mockPool.query.mock.calls[0];
      expect(sql).toContain('SELECT');
    });

    it('issues an UPDATE query and returns the updated site', async () => {
      const mockSite = { id: 'test-id', slug: 'new-slug', name: 'New Name', geofence_polygon: null };
      mockPool.query.mockResolvedValueOnce({ rows: [mockSite] });
      const result = await service.update('test-id', { slug: 'new-slug', name: 'New Name' });
      expect(result?.id).toBe('test-id');
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('UPDATE');
      expect(params[0]).toBe('new-slug');
    });

    it('returns null when the site does not exist after update', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.update('non-existent', { name: 'Ghost' });
      expect(result).toBeNull();
    });

    it('uses ST_SetSRID(ST_GeomFromGeoJSON(...)) when geofence_polygon GeoJSON is provided', async () => {
      const geojson = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'test-id', geofence_polygon: JSON.stringify(geojson) }] });

      await service.update('test-id', { geofence_polygon: geojson });

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('ST_SetSRID(ST_GeomFromGeoJSON(');
      expect(params[0]).toBe(JSON.stringify(geojson));
    });

    it('clears geofence_polygon when null is provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'test-id', geofence_polygon: null }] });

      await service.update('test-id', { geofence_polygon: null });

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('geofence_polygon');
      // null is passed as a parameter
      expect(params).toContain(null);
    });
  });
});
