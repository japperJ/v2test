-- Migration 005: Create audit_log table

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_timestamp ON audit_log (timestamp DESC);
CREATE INDEX idx_audit_log_actor ON audit_log (actor_user_id, timestamp DESC);
CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
