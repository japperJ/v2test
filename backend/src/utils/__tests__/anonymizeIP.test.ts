import { describe, it, expect } from 'vitest';
import { anonymizeIP } from '../anonymizeIP.js';

describe('anonymizeIP', () => {
  it('removes last octet from IPv4', () => {
    expect(anonymizeIP('192.168.1.100')).toBe('192.168.1.0');
    expect(anonymizeIP('10.0.0.1')).toBe('10.0.0.0');
    expect(anonymizeIP('255.255.255.255')).toBe('255.255.255.0');
  });

  it('handles invalid IP gracefully', () => {
    expect(anonymizeIP('not-an-ip')).toBe('0.0.0.0');
    expect(anonymizeIP('')).toBe('0.0.0.0');
  });

  it('handles IPv6', () => {
    const result = anonymizeIP('2001:db8::1');
    expect(result).not.toBe('2001:db8::1');
    expect(result).toContain('2001');
  });
});
