import pool from '../db/pool.js';
import { CreateSiteInput, Site, UpdateSiteInput } from '../models/Site.js';

// Explicit column list — uses ST_AsGeoJSON to return geofence_polygon as JSON string
const SITE_COLUMNS = `id, slug, hostname, name, access_mode,
  ip_allowlist, ip_denylist, country_allowlist, country_denylist, block_vpn_proxy,
  geofence_type, ST_AsGeoJSON(geofence_polygon) AS geofence_polygon,
  geofence_center, geofence_radius_km, enabled, request_count, created_at, updated_at`;

// ST_AsGeoJSON returns a JSON string; parse it back to an object (null if not set)
function parseRow(row: Record<string, unknown>): Site {
  const geofenceRaw = row.geofence_polygon;
  return {
    ...row,
    geofence_polygon:
      typeof geofenceRaw === 'string' ? JSON.parse(geofenceRaw) : null,
  } as Site;
}

export class SiteService {
  async create(input: CreateSiteInput): Promise<Site> {
    const { rows } = await pool.query<Site>(
      `INSERT INTO sites (slug, hostname, name, access_mode, ip_allowlist, ip_denylist,
        country_allowlist, country_denylist, block_vpn_proxy, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.slug,
        input.hostname ?? null,
        input.name,
        input.access_mode ?? 'disabled',
        input.ip_allowlist ? `{${input.ip_allowlist.join(',')}}` : null,
        input.ip_denylist ? `{${input.ip_denylist.join(',')}}` : null,
        input.country_allowlist ? `{${input.country_allowlist.join(',')}}` : null,
        input.country_denylist ? `{${input.country_denylist.join(',')}}` : null,
        input.block_vpn_proxy ?? true,
        input.enabled ?? true,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<Site | null> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT ${SITE_COLUMNS} FROM sites WHERE id = $1`,
      [id]
    );
    return rows[0] ? parseRow(rows[0]) : null;
  }

  async findByHostname(hostname: string): Promise<Site | null> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT ${SITE_COLUMNS} FROM sites WHERE hostname = $1 AND enabled = true`,
      [hostname]
    );
    return rows[0] ? parseRow(rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Site | null> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT ${SITE_COLUMNS} FROM sites WHERE slug = $1 AND enabled = true`,
      [slug]
    );
    return rows[0] ? parseRow(rows[0]) : null;
  }

  async findAll(): Promise<Site[]> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT ${SITE_COLUMNS} FROM sites ORDER BY created_at DESC`
    );
    return rows.map(parseRow);
  }

  async update(id: string, input: UpdateSiteInput): Promise<Site | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.slug !== undefined) { fields.push(`slug = $${idx++}`); values.push(input.slug); }
    if (input.hostname !== undefined) { fields.push(`hostname = $${idx++}`); values.push(input.hostname); }
    if (input.name !== undefined) { fields.push(`name = $${idx++}`); values.push(input.name); }
    if (input.access_mode !== undefined) { fields.push(`access_mode = $${idx++}`); values.push(input.access_mode); }
    if (input.ip_allowlist !== undefined) { fields.push(`ip_allowlist = $${idx++}`); values.push(input.ip_allowlist ? `{${input.ip_allowlist.join(',')}}` : null); }
    if (input.ip_denylist !== undefined) { fields.push(`ip_denylist = $${idx++}`); values.push(input.ip_denylist ? `{${input.ip_denylist.join(',')}}` : null); }
    if (input.country_allowlist !== undefined) { fields.push(`country_allowlist = $${idx++}`); values.push(input.country_allowlist ? `{${input.country_allowlist.join(',')}}` : null); }
    if (input.country_denylist !== undefined) { fields.push(`country_denylist = $${idx++}`); values.push(input.country_denylist ? `{${input.country_denylist.join(',')}}` : null); }
    if (input.block_vpn_proxy !== undefined) { fields.push(`block_vpn_proxy = $${idx++}`); values.push(input.block_vpn_proxy); }
    if (input.enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(input.enabled); }
    if (input.geofence_polygon !== undefined) {
      if (input.geofence_polygon === null) {
        fields.push(`geofence_polygon = $${idx++}`);
        values.push(null);
      } else {
        fields.push(`geofence_polygon = ST_SetSRID(ST_GeomFromGeoJSON($${idx++}), 4326)::geography`);
        values.push(JSON.stringify(input.geofence_polygon));
      }
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const { rows } = await pool.query<Record<string, unknown>>(
      `UPDATE sites SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${SITE_COLUMNS}`,
      values
    );
    return rows[0] ? parseRow(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      'DELETE FROM sites WHERE id = $1',
      [id]
    );
    return (rowCount ?? 0) > 0;
  }
}

export const siteService = new SiteService();
