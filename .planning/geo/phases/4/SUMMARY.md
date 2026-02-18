---
phase: 4
plan: 1
status: complete
tasks_completed: 14/14
commits:
  - 5ce0b71
  - fdc8539
  - e0ceab3
  - 7fc5896
  - 1013aca
  - 8d38b0b
files_modified:
  - backend/package.json
  - backend/package-lock.json
  - backend/migrations/005_create_audit_log.sql
  - backend/src/services/AuditService.ts
  - backend/src/services/__tests__/AuditService.test.ts
  - backend/src/routes/gdpr.ts
  - backend/src/routes/__tests__/gdpr.test.ts
  - backend/src/routes/auth.ts
  - backend/src/routes/sites.ts
  - backend/src/services/AuthService.ts
  - backend/src/routes/accessLogs.ts
  - backend/src/routes/__tests__/auditLog.test.ts
  - backend/src/services/__tests__/AuthService.test.ts
  - backend/src/jobs/logRetention.ts
  - backend/src/jobs/__tests__/logRetention.test.ts
  - backend/src/queues/screenshotQueue.ts
  - backend/src/utils/urlSafety.ts
  - backend/src/services/AccessLogService.ts
  - backend/src/middleware/ipAccessControl.ts
  - backend/src/middleware/__tests__/ipAccessControl.test.ts
  - workers/src/screenshotWorker.ts
  - workers/src/s3Client.ts
  - workers/src/db/pool.ts
  - workers/src/types.ts
  - workers/src/index.ts
  - backend/src/routes/artifacts.ts
  - backend/src/app.ts
  - backend/src/services/__tests__/AccessLogService.test.ts
  - backend/src/app.test.ts
  - backend/src/routes/__tests__/geo.verifyLocation.test.ts
  - frontend/src/pages/GdprAdmin.tsx
  - frontend/src/App.tsx
  - frontend/src/components/Layout.tsx
  - frontend/src/components/LogDetailModal.tsx
  - frontend/src/lib/api.ts
deviations: []
decisions:
  - AccessLogService.log() returns { id, timestamp } via RETURNING instead of void
  - AuthService.logout() returns string|null (userId) for audit trail
  - Screenshot enqueue is fire-and-forget guarded by isSafeScreenshotUrl SSRF check
  - Partition names validated against /^access_logs_\d{4}_\d{2}$/ before DDL interpolation
  - Screenshots stored as private S3 object keys; presigned URL generated on demand with 300s expiry
---

# Phase 4, Plan 1 Summary — Artifacts & GDPR Compliance

## What Was Done

### WORKER-000: BullMQ Dependency
Added `bullmq ^5.4.2` to `backend/package.json`. Workers already had BullMQ; this enables the backend to act as a producer, enqueueing jobs for the worker process to consume.

### AUDIT-001 + AUDIT-002: Audit Log Infrastructure
Created `backend/migrations/005_create_audit_log.sql` with a fully-indexed `audit_log` table: UUID PK, timestamptz, actor_user_id FK→users, action VARCHAR(100), entity_type, entity_id, success, error TEXT, metadata JSONB. Indexes on `timestamp DESC`, `(actor_user_id, timestamp DESC)`, and `(entity_type, entity_id)`.

Created `backend/src/services/AuditService.ts` as a singleton with `AUDIT_ACTIONS` const object (LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, SITE_CREATE, SITE_UPDATE, SITE_DELETE, GDPR_EXPORT, GDPR_PURGE). The `record()` method catches all DB errors — audit logging is best-effort and never propagates failures to callers.

### GDPR-001 + AUDIT-003 + AUDIT-004: GDPR Routes and Audit Wiring
Created `backend/src/routes/gdpr.ts`:
- `POST /api/admin/gdpr/export` — exports access log rows by anonymized IP (optional siteId, JSON or CSV format, blob response)
- `DELETE /api/admin/gdpr/purge` — deletes rows for an anonymized IP; returns `{ deleted: number }`
- Both endpoints require admin auth and emit audit records

Modified `backend/src/routes/sites.ts` to call `auditService.record()` on site create (success + unique_violation conflict), update, and delete (AUDIT-003).

Modified `backend/src/services/AuthService.ts`: `logout()` now returns `Promise<string | null>` (userId from the matched refresh token row).

Modified `backend/src/routes/auth.ts` to emit LOGIN_SUCCESS, LOGIN_FAILED (with email metadata), and LOGOUT audit records (AUDIT-004).

Added `GET /api/admin/audit-log` to `backend/src/routes/accessLogs.ts`: admin-only, supports `?action=&userId=&limit=&offset=` query params, returns `{ logs, total }`.

### RETAIN-001: Partition-Based Log Retention
Replaced the placeholder `backend/src/jobs/logRetention.ts` with full implementation:
- Queries `pg_inherits` + `pg_get_expr(c.relpartbound, c.oid)` to discover all `access_logs_*` child partitions
- Validates partition names against `/^access_logs_\d{4}_\d{2}$/` allowlist before any DDL interpolation
- Parses the `TO` date from the partition bound string via regex
- Drops partitions where `toDate <= cutoff` (cutoff = now − LOG_RETENTION_DAYS, default 90, min 30, max 3650)
- Scheduled via `node-cron` at `0 2 * * *`

### WORKER-001 + WORKER-002 + WORKER-003: Screenshot Pipeline

**URL Safety (SSRF mitigation):** `backend/src/utils/urlSafety.ts` — `isSafeScreenshotUrl(url, allowedHostname)` rejects non-http/https schemes, hostnames that don't exactly match the site's `hostname`, and any private/loopback/CGNAT IP ranges.

**Queue Producer:** `backend/src/queues/screenshotQueue.ts` — lazily creates an IORedis + BullMQ Queue on first use. Job options: 3 attempts, exponential backoff (5s base), removeOnComplete, keep 100 failed. Payload: `{ accessLogId, accessLogTimestamp, siteId, siteSlug, attemptedUrl, hostname }`.

**AccessLogService change:** `log()` now returns `Promise<{ id: string; timestamp: Date }>` via `RETURNING id, timestamp`. Required for the enqueue guard in ipAccessControl.

**ipAccessControl change:** `denyRequest()` enqueues a screenshot job (fire-and-forget with `.catch(console.error)`) after logging the access event. Enqueue is gated by: `result?.id && site.hostname && isSafeScreenshotUrl(attemptedUrl, site.hostname)`.

**Workers service:** New `workers/src/screenshotWorker.ts` — BullMQ Worker (concurrency: 2):
1. Launches Chromium via Playwright
2. Navigates to `attemptedUrl` (`domcontentloaded`, 30s timeout)
3. Takes a full-page screenshot
4. Uploads to S3 at key `screenshots/{siteId}/{YYYY}/{MM}/{accessLogId}.png`
5. Updates `access_logs SET screenshot_url = $key WHERE id = $id AND timestamp = $ts` (partition-pruning safe)

**Presigned URL endpoint:** `backend/src/routes/artifacts.ts` — `GET /api/admin/access-logs/:id/screenshot-url?timestamp=...` requires admin, queries the access log to confirm it exists, then generates an `GetObjectCommand` presigned URL with 300s expiry via AWS SDK v3.

**Workers entrypoint:** Replaced `workers/src/index.ts` with global error handlers + `startScreenshotWorker()` + SIGTERM/SIGINT graceful shutdown.

### GDPR-002: Frontend GDPR Admin Panel
Created `frontend/src/pages/GdprAdmin.tsx`: IP input, format toggle (JSON/CSV), Export button (downloads blob via `gdprApi.exportData()`), Purge button with confirmation dialog (calls `gdprApi.purge()`), shows deleted count on success. Uses TanStack Query v5 `useMutation`.

Added `/gdpr` route to `frontend/src/App.tsx`, rendered under `<RequireAuth><Layout>`.

Added admin-only "🔒 GDPR" sidebar link to `frontend/src/components/Layout.tsx` (visible only when `user?.role === 'admin'`).

Added screenshot section to `frontend/src/components/LogDetailModal.tsx`: shows a "📸 View Screenshot" button when `log.screenshot_url` is truthy; on click fetches a presigned URL via `artifactsApi.getScreenshotUrl()` and renders the image inline with an "Open in new tab" link.

Extended `frontend/src/lib/api.ts` with `gdprApi` (exportData, purge) and `artifactsApi` (getScreenshotUrl).

## Test Results

**121 tests passing across 16 test files (35 new tests added in Phase 4)**

New test files:
- `AuditService.test.ts`: 7 tests
- `gdpr.test.ts`: 10 tests
- `auditLog.test.ts`: 6 tests
- `logRetention.test.ts`: 7 tests

Updated test files (due to interface changes):
- `AccessLogService.test.ts`: updated for `{ id, timestamp }` return type; 9 tests
- `ipAccessControl.test.ts`: added screenshotQueue mock + 4 enqueue behavior tests; 15 tests
- `AuthService.test.ts`: updated for `logout()` returning `string | null`; 12 tests
- `app.test.ts`: added screenshotQueue + AuditService mocks
- `geo.verifyLocation.test.ts`: added screenshotQueue + AuditService mocks

## Deviations

None from the plan. All 14 task IDs implemented exactly as specified.

## Verification

```
Test Files  16 passed (16)
      Tests  121 passed (121)
   Duration  2.47s
```
