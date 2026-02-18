import { describe, it, expect, vi } from 'vitest';
import { getClientIP } from '../getClientIP.js';
import { FastifyRequest } from 'fastify';

describe('getClientIP', () => {
  it('returns request.ip when valid IPv4', () => {
    const request = {
      ip: '192.168.1.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as FastifyRequest;
    expect(getClientIP(request)).toBe('192.168.1.1');
  });

  it('falls back to socket.remoteAddress for invalid IP', () => {
    const request = {
      ip: 'invalid',
      socket: { remoteAddress: '10.0.0.1' },
    } as unknown as FastifyRequest;
    expect(getClientIP(request)).toBe('10.0.0.1');
  });

  it('handles IPv6 addresses', () => {
    const request = {
      ip: '::1',
      socket: { remoteAddress: '::1' },
    } as unknown as FastifyRequest;
    expect(getClientIP(request)).toBe('::1');
  });
});
