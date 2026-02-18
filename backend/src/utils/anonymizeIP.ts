import * as ipaddr from 'ipaddr.js';

/**
 * Anonymize an IP address for GDPR compliance.
 * IPv4: Remove last octet (zeroed)  → 192.168.1.100 → 192.168.1.0
 * IPv6: Zero last 80 bits            → 2001:db8::1   → 2001:db8::
 */
export function anonymizeIP(ip: string): string {
  try {
    const parsed = ipaddr.parse(ip);

    if (parsed.kind() === 'ipv4') {
      const parts = (parsed as ipaddr.IPv4).octets;
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    } else {
      // IPv6: zero last 80 bits (last 5 of 8 groups)
      const parts = (parsed as ipaddr.IPv6).parts;
      const anonymized = [...parts.slice(0, 3), 0, 0, 0, 0, 0];
      return ipaddr.fromByteArray(
        anonymized.flatMap((p) => [p >> 8, p & 0xff]) as number[]
      ).toString();
    }
  } catch {
    // If parsing fails, return a safe placeholder
    return '0.0.0.0';
  }
}
