import { FastifyRequest } from 'fastify';

/**
 * Extract the real client IP from a Fastify request.
 * With trustProxy=true, Fastify sets request.ip from X-Forwarded-For.
 * We validate it's a proper IP address.
 */
export function getClientIP(request: FastifyRequest): string {
  const ip = request.ip;

  // Basic IP validation
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^[0-9a-fA-F:]+$/;

  if (ipv4Regex.test(ip) || ipv6Regex.test(ip)) {
    return ip;
  }

  // Fallback to socket address
  return request.socket.remoteAddress ?? '0.0.0.0';
}
