-- Migration 002: Create partitioned access_logs table

CREATE TABLE access_logs (
  id UUID DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET NOT NULL,
  user_agent TEXT,
  url TEXT,
  allowed BOOLEAN NOT NULL,
  reason VARCHAR(100),
  ip_country VARCHAR(2),
  ip_city VARCHAR(100),
  ip_lat NUMERIC(10, 6),
  ip_lng NUMERIC(10, 6),
  gps_lat NUMERIC(10, 6),
  gps_lng NUMERIC(10, 6),
  gps_accuracy NUMERIC(10, 2),
  screenshot_url TEXT,
  PRIMARY KEY (id, timestamp),
  CHECK (timestamp >= '2026-02-01')
) PARTITION BY RANGE (timestamp);

-- Create first partition: Feb 2026
CREATE TABLE access_logs_2026_02 PARTITION OF access_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE INDEX idx_access_logs_2026_02_site ON access_logs_2026_02(site_id, timestamp DESC);
CREATE INDEX idx_access_logs_2026_02_allowed ON access_logs_2026_02(allowed);

-- Create partition for March 2026 (forward-looking)
CREATE TABLE access_logs_2026_03 PARTITION OF access_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE INDEX idx_access_logs_2026_03_site ON access_logs_2026_03(site_id, timestamp DESC);
CREATE INDEX idx_access_logs_2026_03_allowed ON access_logs_2026_03(allowed);
