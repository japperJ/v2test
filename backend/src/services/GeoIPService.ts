import * as maxmind from 'maxmind';
import { LRUCache } from 'lru-cache';
import fs from 'fs';

export interface GeoIPResult {
  country?: string;
  city?: string;
  lat?: number;
  lng?: number;
  isVpn?: boolean;
  isProxy?: boolean;
  isTor?: boolean;
  isAnonymous?: boolean;
}

class GeoIPService {
  private cityReader: maxmind.Reader<maxmind.CityResponse> | null = null;
  private anonReader: maxmind.Reader<maxmind.AnonymousIPResponse> | null = null;
  private cache: LRUCache<string, GeoIPResult>;
  private initialized = false;

  constructor() {
    this.cache = new LRUCache<string, GeoIPResult>({
      max: 10000,
      ttl: 5 * 60 * 1000, // 5 minutes
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const cityPath = process.env.MAXMIND_CITY_DB_PATH;
    const anonPath = process.env.MAXMIND_ANONYMOUSIP_DB_PATH;

    if (cityPath && fs.existsSync(cityPath)) {
      try {
        this.cityReader = await maxmind.open<maxmind.CityResponse>(cityPath);
        console.log('[GeoIP] City database loaded');
      } catch (err) {
        console.warn('[GeoIP] Failed to load city database:', err);
      }
    } else {
      console.warn('[GeoIP] City database not found at:', cityPath);
    }

    if (anonPath && fs.existsSync(anonPath)) {
      try {
        this.anonReader = await maxmind.open<maxmind.AnonymousIPResponse>(anonPath);
        console.log('[GeoIP] Anonymous IP database loaded');
      } catch (err) {
        console.warn('[GeoIP] Failed to load anonymous IP database:', err);
      }
    } else {
      console.warn('[GeoIP] Anonymous IP database not found at:', anonPath);
    }

    this.initialized = true;
  }

  lookup(ip: string): GeoIPResult {
    const cached = this.cache.get(ip);
    if (cached) return cached;

    const result: GeoIPResult = {};

    if (this.cityReader) {
      try {
        const city = this.cityReader.get(ip);
        if (city) {
          result.country = city.country?.iso_code;
          result.city = city.city?.names?.en;
          result.lat = city.location?.latitude;
          result.lng = city.location?.longitude;
        }
      } catch {
        // Invalid IP or lookup error — return empty result
      }
    }

    if (this.anonReader) {
      try {
        const anon = this.anonReader.get(ip);
        if (anon) {
          result.isVpn = (anon as Record<string, unknown>).is_vpn as boolean | undefined;
          result.isProxy = (anon as Record<string, unknown>).is_public_proxy as boolean | undefined;
          result.isTor = (anon as Record<string, unknown>).is_tor_exit_node as boolean | undefined;
          result.isAnonymous = (anon as Record<string, unknown>).is_anonymous as boolean | undefined;
        }
      } catch {
        // Ignore
      }
    }

    this.cache.set(ip, result);
    return result;
  }

  isReady(): boolean {
    return this.initialized && this.cityReader !== null;
  }
}

export const geoIPService = new GeoIPService();
