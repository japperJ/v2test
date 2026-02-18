import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../services/GeoIPService.js', () => ({
  geoIPService: {
    lookup: vi.fn().mockReturnValue({}),
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

vi.mock('../../queues/screenshotQueue.js', () => ({
  enqueueScreenshotJob: vi.fn().mockResolvedValue(undefined),
}));

import { ipAccessControl } from '../ipAccessControl.js';
import { geoIPService } from '../../services/GeoIPService.js';
import { accessLogService } from '../../services/AccessLogService.js';
import { getClientIP } from '../../utils/getClientIP.js';
import { enqueueScreenshotJob } from '../../queues/screenshotQueue.js';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Site } from '../../models/Site.js';

const mockGeoIP = geoIPService as { lookup: ReturnType<typeof vi.fn> };
const mockLog = accessLogService as { log: ReturnType<typeof vi.fn> };
const mockGetIP = getClientIP as ReturnType<typeof vi.fn>;
const mockEnqueue = enqueueScreenshotJob as ReturnType<typeof vi.fn>;

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'site-1',
    slug: 'test',
    name: 'Test',
    access_mode: 'ip_only',
    enabled: true,
    block_vpn_proxy: false,
    request_count: 0,
    hostname: 'test.example.com',
    ip_allowlist: null,
    ip_denylist: null,
    country_allowlist: null,
    country_denylist: null,
    ...overrides,
  } as Site;
}

function makeRequest(site?: Site): FastifyRequest {
  return {
    site,
    headers: { 'user-agent': 'test-agent' },
    url: '/api/protected/ping',
    ip: '1.2.3.4',
    socket: { remoteAddress: '1.2.3.4' },
    hostname: 'test.example.com',
    protocol: 'https',
  } as unknown as FastifyRequest;
}

function makeReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

describe('ipAccessControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeoIP.lookup.mockReturnValue({});
    mockGetIP.mockReturnValue('1.2.3.4');
    // Default: log returns undefined (no enqueue triggered)
    mockLog.log.mockResolvedValue(undefined);
  });

  it('allows request when no site attached', async () => {
    const reply = makeReply();
    await ipAccessControl(makeRequest(undefined), reply);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('blocks with site_disabled when access_mode is disabled', async () => {
    const reply = makeReply();
    await ipAccessControl(makeRequest(makeSite({ access_mode: 'disabled' })), reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    const logCall = mockLog.log.mock.calls[0][0];
    expect(logCall.reason).toBe('site_disabled');
    expect(logCall.allowed).toBe(false);
  });

  it('blocks IP in denylist', async () => {
    const reply = makeReply();
    mockGetIP.mockReturnValue('192.168.1.50');
    await ipAccessControl(
      makeRequest(makeSite({ ip_denylist: ['192.168.1.0/24'] as unknown as string[] })),
      reply
    );
    expect(reply.status).toHaveBeenCalledWith(403);
    const logCall = mockLog.log.mock.calls[0][0];
    expect(logCall.reason).toBe('ip_denied');
  });

  it('blocks IP not in allowlist', async () => {
    const reply = makeReply();
    mockGetIP.mockReturnValue('10.0.0.1');
    await ipAccessControl(
      makeRequest(makeSite({ ip_allowlist: ['192.168.1.0/24'] as unknown as string[] })),
      reply
    );
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(mockLog.log.mock.calls[0][0].reason).toBe('ip_not_allowlisted');
  });

  it('blocks VPN with reason vpn_proxy_detected', async () => {
    const reply = makeReply();
    mockGeoIP.lookup.mockReturnValue({ isVpn: true });
    await ipAccessControl(
      makeRequest(makeSite({ block_vpn_proxy: true })),
      reply
    );
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(mockLog.log.mock.calls[0][0].reason).toBe('vpn_proxy_detected');
  });

  it('blocks country in denylist with reason country_blocked', async () => {
    const reply = makeReply();
    mockGeoIP.lookup.mockReturnValue({ country: 'RU' });
    await ipAccessControl(
      makeRequest(makeSite({ country_denylist: ['RU'] as unknown as string[] })),
      reply
    );
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(mockLog.log.mock.calls[0][0].reason).toBe('country_blocked');
  });

  it('blocks country not in allowlist with reason country_blocked', async () => {
    const reply = makeReply();
    mockGeoIP.lookup.mockReturnValue({ country: 'CN' });
    await ipAccessControl(
      makeRequest(makeSite({ country_allowlist: ['US', 'GB'] as unknown as string[] })),
      reply
    );
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(mockLog.log.mock.calls[0][0].reason).toBe('country_blocked');
  });

  it('allows and logs when all checks pass', async () => {
    const reply = makeReply();
    mockLog.log.mockResolvedValue({ id: 'log-1', timestamp: new Date() });
    await ipAccessControl(makeRequest(makeSite()), reply);
    expect(reply.status).not.toHaveBeenCalled();
    const logCall = mockLog.log.mock.calls[0][0];
    expect(logCall.allowed).toBe(true);
  });

  it('blocks direct IP match in denylist (non-CIDR entry)', async () => {
    const reply = makeReply();
    mockGetIP.mockReturnValue('10.0.0.5');
    await ipAccessControl(
      makeRequest(makeSite({ ip_denylist: ['10.0.0.5'] as unknown as string[] })),
      reply
    );
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(mockLog.log.mock.calls[0][0].reason).toBe('ip_denied');
  });

  it('handles malformed IP in ipMatchesCIDR catch — request continues past denylist check', async () => {
    const reply = makeReply();
    mockGetIP.mockReturnValue('not-an-ip');
    await ipAccessControl(
      makeRequest(makeSite({ ip_denylist: ['192.168.1.0/24'] as unknown as string[] })),
      reply
    );
    // ipMatchesCIDR catch returns false — IP is not matched, denylist does not block
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('skips IP checks for geo_only mode', async () => {
    const reply = makeReply();
    await ipAccessControl(
      makeRequest(makeSite({
        access_mode: 'geo_only',
        ip_denylist: ['1.2.3.4'] as unknown as string[],
      })),
      reply
    );
    expect(reply.status).not.toHaveBeenCalled();
    expect(mockLog.log).not.toHaveBeenCalled();
  });

  describe('screenshot enqueue on denial', () => {
    it('enqueues a screenshot job when log returns id and site has hostname', async () => {
      const mockTimestamp = new Date('2026-02-18T12:00:00Z');
      mockLog.log.mockResolvedValueOnce({ id: 'log-abc', timestamp: mockTimestamp });

      const reply = makeReply();
      await ipAccessControl(
        makeRequest(makeSite({ ip_denylist: ['1.2.3.4'] as unknown as string[] })),
        reply
      );

      // Give the fire-and-forget enqueue a tick to run
      await new Promise((r) => setTimeout(r, 0));

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          accessLogId: 'log-abc',
          accessLogTimestamp: mockTimestamp.toISOString(),
          siteId: 'site-1',
          siteSlug: 'test',
          hostname: 'test.example.com',
        })
      );
    });

    it('does not enqueue when log returns undefined (mock returns no id)', async () => {
      mockLog.log.mockResolvedValueOnce(undefined);

      const reply = makeReply();
      await ipAccessControl(
        makeRequest(makeSite({ ip_denylist: ['1.2.3.4'] as unknown as string[] })),
        reply
      );

      await new Promise((r) => setTimeout(r, 0));

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('does not enqueue when site has no hostname', async () => {
      mockLog.log.mockResolvedValueOnce({ id: 'log-abc', timestamp: new Date() });

      const reply = makeReply();
      await ipAccessControl(
        makeRequest(makeSite({ hostname: null, ip_denylist: ['1.2.3.4'] as unknown as string[] })),
        reply
      );

      await new Promise((r) => setTimeout(r, 0));

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('does not enqueue for allowed requests', async () => {
      mockLog.log.mockResolvedValueOnce({ id: 'log-abc', timestamp: new Date() });

      const reply = makeReply();
      await ipAccessControl(makeRequest(makeSite()), reply);

      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });
});
