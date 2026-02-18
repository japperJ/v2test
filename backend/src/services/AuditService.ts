import pool from '../db/pool.js';

export const AUDIT_ACTIONS = {
  SITE_CREATE: 'SITE_CREATE',
  SITE_UPDATE: 'SITE_UPDATE',
  SITE_DELETE: 'SITE_DELETE',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  GDPR_EXPORT: 'GDPR_EXPORT',
  GDPR_PURGE: 'GDPR_PURGE',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditParams {
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  success?: boolean;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class AuditService {
  // Writes an audit entry. Failures are logged but never propagated —
  // audit log writes must not break primary request flows.
  async record(params: AuditParams): Promise<void> {
    const {
      actorUserId = null,
      action,
      entityType = null,
      entityId = null,
      success = true,
      error = null,
      metadata = null,
    } = params;

    try {
      await pool.query(
        `INSERT INTO audit_log
           (actor_user_id, action, entity_type, entity_id, success, error, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          actorUserId,
          action,
          entityType,
          entityId,
          success,
          error,
          metadata !== null ? JSON.stringify(metadata) : null,
        ]
      );
    } catch (err) {
      console.error('[AuditService] Failed to write audit entry:', err);
    }
  }
}

export const auditService = new AuditService();
