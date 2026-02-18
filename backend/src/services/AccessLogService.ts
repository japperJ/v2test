import pool from '../db/pool.js';
import { anonymizeIP } from '../utils/anonymizeIP.js';

export interface LogEntry {
  siteId: string;
  ipAddress: string;
  userAgent?: string;
  url?: string;
  allowed: boolean;
  reason?: string;
  ipCountry?: string;
  ipCity?: string;
  ipLat?: number;
  ipLng?: number;
  gpsLat?: number;
  gpsLng?: number;
  gpsAccuracy?: number;
}

export interface AccessLog extends LogEntry {
  id: string;
  timestamp: Date;
  screenshotUrl?: string;
}

export class AccessLogService {
  // Returns the id and timestamp of the newly inserted row so callers can
  // reference the log entry (e.g. screenshot queue consumers need both for
  // partition-pruned UPDATEs on access_logs).
  async log(entry: LogEntry): Promise<{ id: string; timestamp: Date }> {
    const anonymizedIP = anonymizeIP(entry.ipAddress);
    const { rows } = await pool.query<{ id: string; timestamp: Date }>(
      `INSERT INTO access_logs
        (site_id, ip_address, user_agent, url, allowed, reason,
         ip_country, ip_city, ip_lat, ip_lng,
         gps_lat, gps_lng, gps_accuracy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, timestamp`,
      [
        entry.siteId,
        anonymizedIP,
        entry.userAgent ?? null,
        entry.url ?? null,
        entry.allowed,
        entry.reason ?? null,
        entry.ipCountry ?? null,
        entry.ipCity ?? null,
        entry.ipLat ?? null,
        entry.ipLng ?? null,
        entry.gpsLat ?? null,
        entry.gpsLng ?? null,
        entry.gpsAccuracy ?? null,
      ]
    );
    return { id: rows[0].id, timestamp: rows[0].timestamp };
  }

  async findBySite(
    siteId: string,
    options: { allowed?: boolean; limit?: number; offset?: number } = {}
  ): Promise<{ logs: AccessLog[]; total: number }> {
    const { allowed, limit = 100, offset = 0 } = options;

    let whereClause = 'WHERE site_id = $1';
    const params: unknown[] = [siteId];
    let idx = 2;

    if (allowed !== undefined) {
      whereClause += ` AND allowed = $${idx++}`;
      params.push(allowed);
    }

    const [{ rows: logs }, { rows: countRows }] = await Promise.all([
      pool.query<AccessLog>(
        `SELECT * FROM access_logs ${whereClause} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM access_logs ${whereClause}`,
        params
      ),
    ]);

    return { logs, total: parseInt(countRows[0].count, 10) };
  }
}

export const accessLogService = new AccessLogService();
