import { FastifyReply, FastifyRequest } from 'fastify';
import * as ipaddr from 'ipaddr.js';
import { geoIPService } from '../services/GeoIPService.js';
import { accessLogService } from '../services/AccessLogService.js';
import { getClientIP } from '../utils/getClientIP.js';
import { enqueueScreenshotJob } from '../queues/screenshotQueue.js';
import { isSafeScreenshotUrl } from '../utils/urlSafety.js';
import { Site } from '../models/Site.js';

interface RequestWithSite extends FastifyRequest {
  site?: Site;
}

type BlockReason =
  | 'ip_denied'
  | 'ip_not_allowlisted'
  | 'country_blocked'
  | 'vpn_proxy_detected'
  | 'site_disabled';

async function denyRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  site: Site,
  ip: string,
  reason: BlockReason
): Promise<void> {
  const geoData = geoIPService.lookup(ip);
  const result = await accessLogService.log({
    siteId: site.id,
    ipAddress: ip,
    userAgent: request.headers['user-agent'],
    url: request.url,
    allowed: false,
    reason,
    ipCountry: geoData.country,
    ipCity: geoData.city,
    ipLat: geoData.lat,
    ipLng: geoData.lng,
  });

  // Enqueue a screenshot capture job for IP-based denials.
  // Geo denials occur in the verify-location route, not here.
  // Guard: result must have id, site must have a hostname, and the URL must pass safety checks.
  if (result?.id && site.hostname) {
    const protocol = (request.headers['x-forwarded-proto'] as string) || request.protocol || 'https';
    const attemptedUrl = `${protocol}://${request.hostname}${request.url}`;
    if (isSafeScreenshotUrl(attemptedUrl, site.hostname)) {
      enqueueScreenshotJob({
        accessLogId: result.id,
        accessLogTimestamp: result.timestamp.toISOString(),
        siteId: site.id,
        siteSlug: site.slug,
        attemptedUrl,
        hostname: site.hostname,
      }).catch((err) => {
        console.error('[screenshotQueue] Failed to enqueue screenshot job:', err);
      });
    }
  }

  reply.status(403).send({ error: 'Forbidden', reason });
}

function ipMatchesCIDR(ip: string, cidr: string): boolean {
  try {
    const parsedIP = ipaddr.parse(ip);
    const [range, bits] = ipaddr.parseCIDR(cidr);
    return parsedIP.match([range, bits]);
  } catch {
    return false;
  }
}

function ipInList(ip: string, list: string[]): boolean {
  return list.some((entry) => {
    if (entry.includes('/')) {
      return ipMatchesCIDR(ip, entry);
    }
    return ip === entry;
  });
}

export async function ipAccessControl(
  request: RequestWithSite,
  reply: FastifyReply
): Promise<void> {
  const site = request.site;
  if (!site) return; // No site resolved — let route handler deal with it

  const ip = getClientIP(request);
  const accessMode = site.access_mode;

  // geo_only mode skips IP checks
  if (accessMode === 'geo_only') return;

  // Disabled mode blocks all
  if (accessMode === 'disabled') {
    await denyRequest(request, reply, site, ip, 'site_disabled');
    return;
  }

  // IP denylist check
  if (site.ip_denylist && site.ip_denylist.length > 0) {
    if (ipInList(ip, site.ip_denylist)) {
      await denyRequest(request, reply, site, ip, 'ip_denied');
      return;
    }
  }

  // IP allowlist check (if set, only IPs in list are allowed)
  if (site.ip_allowlist && site.ip_allowlist.length > 0) {
    if (!ipInList(ip, site.ip_allowlist)) {
      await denyRequest(request, reply, site, ip, 'ip_not_allowlisted');
      return;
    }
  }

  // GeoIP checks
  const geoData = geoIPService.lookup(ip);

  // VPN/Proxy detection
  if (site.block_vpn_proxy && (geoData.isVpn || geoData.isProxy || geoData.isTor || geoData.isAnonymous)) {
    await denyRequest(request, reply, site, ip, 'vpn_proxy_detected');
    return;
  }

  // Country denylist
  if (site.country_denylist && site.country_denylist.length > 0 && geoData.country) {
    if (site.country_denylist.includes(geoData.country)) {
      await denyRequest(request, reply, site, ip, 'country_blocked');
      return;
    }
  }

  // Country allowlist (if set, only countries in list are allowed)
  if (site.country_allowlist && site.country_allowlist.length > 0) {
    if (!geoData.country || !site.country_allowlist.includes(geoData.country)) {
      await denyRequest(request, reply, site, ip, 'country_blocked');
      return;
    }
  }

  // All checks passed
  // For ip_and_geo: defer final "allowed" logging to the GPS verify-location route
  if (accessMode === 'ip_and_geo') return;

  // ip_only: log allowed access
  await accessLogService.log({
    siteId: site.id,
    ipAddress: ip,
    userAgent: request.headers['user-agent'],
    url: request.url,
    allowed: true,
    ipCountry: geoData.country,
    ipCity: geoData.city,
    ipLat: geoData.lat,
    ipLng: geoData.lng,
  });
}
