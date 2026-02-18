import * as ipaddr from 'ipaddr.js';
import { URL } from 'url';

// Private, loopback, and link-local IP ranges to block (SSRF mitigation).
const BLOCKED_RANGES: [string, number][] = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['100.64.0.0', 10], // CGNAT
];

function isPrivateIP(hostname: string): boolean {
  try {
    const addr = ipaddr.parse(hostname);
    for (const [range, bits] of BLOCKED_RANGES) {
      try {
        const rangeAddr = ipaddr.parse(range);
        if (addr.kind() === rangeAddr.kind() && addr.match([rangeAddr as never, bits])) {
          return true;
        }
      } catch {
        // Skip ranges that don't match the address family
      }
    }
    return false;
  } catch {
    // hostname is not a raw IP address — let through (it's a domain name)
    return false;
  }
}

/**
 * Returns true only if it is safe to dispatch a Playwright screenshot request to `url`.
 *
 * Safety rules:
 *  1. Scheme must be http or https.
 *  2. The resolved hostname must match `allowedHostname` (derived from the site record).
 *  3. The hostname must not resolve to a private/loopback/link-local address.
 */
export function isSafeScreenshotUrl(url: string, allowedHostname: string): boolean {
  if (!allowedHostname) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.hostname !== allowedHostname) return false;
    if (isPrivateIP(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
