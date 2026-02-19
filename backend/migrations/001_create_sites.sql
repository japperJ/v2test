-- Migration 001: Create sites table with PostGIS support
-- Enable PostGIS extension (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  hostname VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  access_mode VARCHAR(20) NOT NULL DEFAULT 'disabled',
  ip_allowlist INET[],
  ip_denylist INET[],
  country_allowlist VARCHAR(2)[],
  country_denylist VARCHAR(2)[],
  block_vpn_proxy BOOLEAN DEFAULT true,
  geofence_type VARCHAR(20),
  geofence_polygon GEOGRAPHY(POLYGON, 4326),
  geofence_center GEOGRAPHY(POINT, 4326),
  geofence_radius_km NUMERIC(10, 2),
  enabled BOOLEAN DEFAULT true,
  request_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sites_hostname ON sites(hostname);
CREATE INDEX idx_sites_enabled ON sites(enabled);
CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_polygon);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
