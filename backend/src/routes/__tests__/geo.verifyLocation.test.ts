import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/GeoIPService.js', () => ({
  geoIPService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    lookup: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('../../services/SiteService.js', () => ({
  siteService: {
    findByHostname: vi.fn().mockResolvedValue({
      id: 'site-1',
      slug: 'test-site',
      hostname: 'localhost',
      name: 'Test Site',
      access_mode: 'geo_only',
      enabled: true,
      block_vpn_proxy: false,
      ip_allowlist: null,
      ip_denylist: null,
      country_allowlist: null,
      country_denylist: null,
      request_count: 0,
    }),
    findBySlug: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../services/GeofenceService.js', () => ({
  geofenceService: {
    isPointInFence: vi.fn(),
  },
}));

vi.mock('../../services/AccessLogService.js', () => ({
  accessLogService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../utils/getClientIP.js', () => ({
  getClientIP: vi.fn().mockReturnValue('1.2.3.4'),
}));

import { buildApp } from '../../app.js';
import { geofenceService } from '../../services/GeofenceService.js';
import { accessLogService } from '../../services/AccessLogService.js';

const mockGeofence = geofenceService as { isPointInFence: ReturnType<typeof vi.fn> };
const mockLog = accessLogService as { log: ReturnType<typeof vi.fn> };

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_PAYLOAD = { lat: 40.7128, lng: -74.006, accuracy: 10, siteId: VALID_UUID };

describe('POST /api/protected/verify-location', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 allowed:true when point is inside fence', async () => {
    mockGeofence.isPointInFence.mockResolvedValueOnce({ inside: true, hasFence: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/protected/verify-location',
      payload: VALID_PAYLOAD,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.allowed).toBe(true);
    expect(body.reason).toBeUndefined();
  });

  it('returns 200 allowed:false with reason when point is outside fence', async () => {
    mockGeofence.isPointInFence.mockResolvedValueOnce({ inside: false, hasFence: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/protected/verify-location',
      payload: VALID_PAYLOAD,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.allowed).toBe(false);
    expect(body.reason).toBe('outside_geofence');
  });

  it('returns 200 allowed:true when no fence is set on the site', async () => {
    mockGeofence.isPointInFence.mockResolvedValueOnce({ inside: false, hasFence: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/protected/verify-location',
      payload: VALID_PAYLOAD,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.allowed).toBe(true);
  });

  it('returns 400 when lat is out of range', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/protected/verify-location',
      payload: { ...VALID_PAYLOAD, lat: 91 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when lng is out of range', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/protected/verify-location',
      payload: { ...VALID_PAYLOAD, lng: 181 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when siteId is not a UUID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/protected/verify-location',
      payload: { ...VALID_PAYLOAD, siteId: 'not-a-uuid' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('logs GPS fields to accessLogService', async () => {
    mockGeofence.isPointInFence.mockResolvedValueOnce({ inside: true, hasFence: true });

    await app.inject({
      method: 'POST',
      url: '/api/protected/verify-location',
      payload: VALID_PAYLOAD,
    });

    expect(mockLog.log).toHaveBeenCalledOnce();
    const logCall = mockLog.log.mock.calls[0][0];
    expect(logCall.gpsLat).toBe(VALID_PAYLOAD.lat);
    expect(logCall.gpsLng).toBe(VALID_PAYLOAD.lng);
    expect(logCall.gpsAccuracy).toBe(VALID_PAYLOAD.accuracy);
    expect(logCall.siteId).toBe(VALID_UUID);
  });
});
