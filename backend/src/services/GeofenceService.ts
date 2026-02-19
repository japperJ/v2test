import pool from '../db/pool.js';

export interface FenceCheckResult {
  inside: boolean;
  hasFence: boolean;
}

export class GeofenceService {
  async isPointInFence(siteId: string, lat: number, lng: number): Promise<FenceCheckResult> {
    // Check whether the site has a geofence polygon configured
    const fenceCheck = await pool.query(
      'SELECT geofence_polygon IS NOT NULL AS has_fence FROM sites WHERE id = $1',
      [siteId]
    );

    if (!fenceCheck.rows[0]?.has_fence) {
      return { inside: false, hasFence: false };
    }

    // ST_MakePoint takes (longitude, latitude) — X=lng, Y=lat
    const result = await pool.query(
      `SELECT ST_Covers(
        geofence_polygon,
        ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
      ) AS inside
      FROM sites WHERE id = $1`,
      [siteId, lng, lat]
    );

    return {
      inside: result.rows[0]?.inside ?? false,
      hasFence: true,
    };
  }
}

export const geofenceService = new GeofenceService();
