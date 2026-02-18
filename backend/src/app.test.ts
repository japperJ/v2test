import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// Must be set before buildApp() is called
beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-app-test';
});

vi.mock('./services/SiteService.js', () => ({
  siteService: {
    findByHostname: vi.fn(),
    findBySlug: vi.fn(),
  },
}));

vi.mock('./services/GeoIPService.js', () => ({
  geoIPService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    lookup: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('./services/AccessLogService.js', () => ({
  accessLogService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./utils/getClientIP.js', () => ({
  getClientIP: vi.fn().mockReturnValue('1.2.3.4'),
}));

import { buildApp } from './app.js';
import { siteService } from './services/SiteService.js';

const mockSvc = siteService as {
  findByHostname: ReturnType<typeof vi.fn>;
  findBySlug: ReturnType<typeof vi.fn>;
};

const mockSite = {
  id: 'site-uuid-1',
  slug: 'test-site',
  name: 'Test Site',
  access_mode: 'geo_only' as const,
  enabled: true,
  block_vpn_proxy: false,
  ip_allowlist: null,
  ip_denylist: null,
  country_allowlist: null,
  country_denylist: null,
  request_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('App hostname routing for /api/protected/**', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it('resolves site from known Host header and returns 200', async () => {
    mockSvc.findByHostname.mockResolvedValueOnce(mockSite);

    const response = await app.inject({
      method: 'GET',
      url: '/api/protected/ping',
      headers: { host: 'known.example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockSvc.findByHostname).toHaveBeenCalledWith('known.example.com');
  });

  it('returns 404 for an unknown hostname', async () => {
    mockSvc.findByHostname.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/protected/ping',
      headers: { host: 'unknown.example.com' },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe('Site not found');
  });

  it('resolves site via X-Site-Slug header when host is localhost', async () => {
    mockSvc.findByHostname.mockResolvedValueOnce(null);
    mockSvc.findBySlug.mockResolvedValueOnce(mockSite);

    const response = await app.inject({
      method: 'GET',
      url: '/api/protected/ping',
      headers: { host: 'localhost', 'x-site-slug': 'test-site' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockSvc.findBySlug).toHaveBeenCalledWith('test-site');
  });

  it('returns 404 when host is localhost and no X-Site-Slug header is provided', async () => {
    mockSvc.findByHostname.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/protected/ping',
      headers: { host: 'localhost' },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe('Site not found');
  });
});
