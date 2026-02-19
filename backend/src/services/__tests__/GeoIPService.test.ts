import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('maxmind', () => ({
  open: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

import * as maxmind from 'maxmind';
import fs from 'fs';
import { geoIPService } from '../GeoIPService.js';

const mockOpen = maxmind.open as ReturnType<typeof vi.fn>;
const mockExistsSync = (fs as unknown as { existsSync: ReturnType<typeof vi.fn> }).existsSync;

// Access private state to reset the singleton between tests
const svc = geoIPService as unknown as {
  initialized: boolean;
  cityReader: unknown;
  anonReader: unknown;
  cache: { clear(): void };
};

describe('GeoIPService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton state so each test starts from scratch
    svc.initialized = false;
    svc.cityReader = null;
    svc.anonReader = null;
    svc.cache.clear();
    // Provide fake paths and make existsSync report they exist
    process.env.MAXMIND_CITY_DB_PATH = '/fake/city.mmdb';
    process.env.MAXMIND_ANONYMOUSIP_DB_PATH = '/fake/anon.mmdb';
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    delete process.env.MAXMIND_CITY_DB_PATH;
    delete process.env.MAXMIND_ANONYMOUSIP_DB_PATH;
  });

  describe('initialize()', () => {
    it('loads both readers without throwing when maxmind.open resolves', async () => {
      mockOpen
        .mockResolvedValueOnce({ get: vi.fn().mockReturnValue(null) }) // city
        .mockResolvedValueOnce({ get: vi.fn().mockReturnValue(null) }); // anon

      await expect(geoIPService.initialize()).resolves.toBeUndefined();

      expect(mockOpen).toHaveBeenCalledTimes(2);
      expect(geoIPService.isReady()).toBe(true);
    });

    it('warns and skips city db when the file does not exist', async () => {
      mockExistsSync
        .mockReturnValueOnce(false) // city: missing
        .mockReturnValueOnce(true); // anon: present
      mockOpen.mockResolvedValueOnce({ get: vi.fn().mockReturnValue(null) }); // anon reader

      await expect(geoIPService.initialize()).resolves.toBeUndefined();

      expect(geoIPService.isReady()).toBe(false); // cityReader stays null
      expect(mockOpen).toHaveBeenCalledTimes(1);  // only anon opened
    });

    it('catches city database open failure and continues initializing', async () => {
      mockOpen
        .mockRejectedValueOnce(new Error('ENOENT: no such file'))  // city: throws
        .mockResolvedValueOnce({ get: vi.fn().mockReturnValue(null) }); // anon: ok

      await expect(geoIPService.initialize()).resolves.toBeUndefined();

      expect(geoIPService.isReady()).toBe(false); // cityReader remains null after catch
    });
  });

  describe('lookup()', () => {
    it('returns an empty result when called before initialize', () => {
      // cityReader and anonReader are null — no readers to query
      const result = geoIPService.lookup('1.2.3.4');
      expect(result).toEqual({});
    });

    it('returns GeoIPResult with country, city, lat and lng for a valid IP', async () => {
      const mockCityGet = vi.fn().mockReturnValue({
        country: { iso_code: 'US' },
        city: { names: { en: 'Ashburn' } },
        location: { latitude: 39.0437, longitude: -77.4875 },
      });
      mockOpen
        .mockResolvedValueOnce({ get: mockCityGet })
        .mockResolvedValueOnce({ get: vi.fn().mockReturnValue(null) });

      await geoIPService.initialize();
      const result = geoIPService.lookup('1.2.3.4');

      expect(result.country).toBe('US');
      expect(result.city).toBe('Ashburn');
      expect(result.lat).toBe(39.0437);
      expect(result.lng).toBe(-77.4875);
    });

    it('returns empty result gracefully when cityReader.get throws for invalid IP', async () => {
      const mockCityGet = vi.fn().mockImplementation(() => {
        throw new Error('Invalid IP address');
      });
      mockOpen
        .mockResolvedValueOnce({ get: mockCityGet })
        .mockResolvedValueOnce({ get: vi.fn().mockReturnValue(null) });

      await geoIPService.initialize();

      // Must not throw — error is caught internally and empty result returned
      const result = geoIPService.lookup('not-an-ip');
      expect(result).toEqual({});
    });

    it('caches results — cityReader.get is called only once for repeated lookups', async () => {
      const mockCityGet = vi.fn().mockReturnValue({
        country: { iso_code: 'US' },
        city: { names: { en: 'Ashburn' } },
        location: { latitude: 39.0437, longitude: -77.4875 },
      });
      mockOpen
        .mockResolvedValueOnce({ get: mockCityGet })
        .mockResolvedValueOnce({ get: vi.fn().mockReturnValue(null) });

      await geoIPService.initialize();

      geoIPService.lookup('1.2.3.4');
      geoIPService.lookup('1.2.3.4'); // second call must hit cache

      expect(mockCityGet).toHaveBeenCalledTimes(1);
    });

    it('sets isProxy and isAnonymous when anonReader reports proxy flags', async () => {
      const mockAnonGet = vi.fn().mockReturnValue({
        is_public_proxy: true,
        is_anonymous: true,
      });
      mockOpen
        .mockResolvedValueOnce({ get: vi.fn().mockReturnValue(null) }) // city reader
        .mockResolvedValueOnce({ get: mockAnonGet });                   // anon reader

      await geoIPService.initialize();
      const result = geoIPService.lookup('1.2.3.4');

      expect(result.isProxy).toBe(true);
      expect(result.isAnonymous).toBe(true);
    });

    it('handles anonReader.get throwing — returns partial result without throwing', async () => {
      mockOpen
        .mockResolvedValueOnce({ get: vi.fn().mockReturnValue(null) }) // city: ok, returns null
        .mockResolvedValueOnce({
          get: vi.fn().mockImplementation(() => { throw new Error('invalid IP'); }),
        }); // anon: get() throws

      await geoIPService.initialize();
      const result = geoIPService.lookup('1.2.3.4');

      // Catch block swallows the anon error — result is still returned
      expect(result).toEqual({});
    });
  });
});
