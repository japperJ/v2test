---
phase: 4
type: implement
depends_on: ["Phase 3"]
autonomous: true
must_haves:
  observable_truths:
    - "When an IP-based access decision is denied (ipAccessControl), a screenshot capture job is enqueued and processed asynchronously."
    - "Screenshot capture failures do not crash the worker process; jobs retry with backoff and eventually fail cleanly."
    - "Captured screenshots are stored privately in MinIO/S3 and linked to the corresponding access log row via access_logs.screenshot_url."
    - "A daily retention job drops access_logs monthly partitions older than LOG_RETENTION_DAYS (default 90) and logs what it did."
    - "Admins can export access logs for an anonymized IP as JSON or CSV, and purge matching logs via authenticated admin endpoints."
    - "All admin write actions are recorded in an audit_log table (sites writes, GDPR export/purge, login/logout)."
  artifacts:
    - path: backend/src/queues/screenshotQueue.ts
      has: ["enqueueScreenshotJob", "SCREENSHOT_QUEUE_NAME"]
    - path: workers/src/screenshotWorker.ts
      has: ["startScreenshotWorker", "processScreenshotJob"]
    - path: backend/src/jobs/logRetention.ts
      has: ["startLogRetentionJob", "runLogRetentionOnce"]
    - path: backend/src/routes/gdpr.ts
      has: ["POST /api/admin/gdpr/export", "DELETE /api/admin/gdpr/purge"]
    - path: backend/migrations/005_create_audit_log.sql
      has: ["audit_log table"]
    - path: backend/src/services/AuditService.ts
      has: ["record", "AUDIT_ACTIONS"]
    - path: frontend/src/pages/GdprAdmin.tsx
      has: ["export flow", "purge confirmation"]
  key_links:
    - from: "backend/src/middleware/ipAccessControl.ts denyRequest()"
      to: "screenshot queue enqueue"
      verify: "denyRequest creates access log row AND enqueues screenshot job using returned access_log_id + timestamp"
    - from: "workers screenshot job"
      to: "MinIO/S3 putObject + DB update"
      verify: "worker uploads screenshot then updates access_logs.screenshot_url for the matching id+timestamp (partition pruning)"
    - from: "GDPR endpoints"
      to: "authenticate + requireRole('admin') + AuditService"
      verify: "export/purge both require admin and record audit_log entries"
    - from: "sites/admin write routes + auth routes"
      to: "AuditService"
      verify: "site create/update/delete and login/logout produce audit_log rows"
---

# Phase 4: Artifacts & GDPR Compliance

## Objective
Deliver privacy-aware artifact capture for blocked access attempts, enforce access log retention via partition drops, add GDPR export/purge endpoints plus a minimal admin UI, and introduce an audit log that records admin write actions across the system.

## Context (what exists today)
- Backend is Fastify (TypeScript, ESM) with RBAC via `authenticate` + `requireRole('admin')`.
- `access_logs` is monthly range-partitioned on `timestamp` and already includes `screenshot_url TEXT`.
- `AccessLogService.log()` currently inserts logs but returns `void` and does not write `screenshot_url`.
- `backend/src/jobs/logRetention.ts` is scheduled daily at 02:00 but is a placeholder.
- A `worker` service exists in `infrastructure/docker-compose.yml`; `workers/` already depends on BullMQ + Playwright + AWS S3 SDK.
- Phase 4 architecture split: **backend is the BullMQ producer only (enqueue)**, while **workers/ is the consumer + processor (Playwright + S3 + DB update)**.
- Frontend uses TanStack Query v5 object-form APIs; access token is in memory (module scope), not localStorage.

## Global implementation rules (Phase 4)
1. **SQL safety:** Use parameter placeholders for all value inputs. For any dynamic identifiers (partition/table names in retention DDL), derive them from PostgreSQL catalogs (not from request input) and apply strict allowlist validation (e.g. `^access_logs_\d{4}_\d{2}$`) before interpolating.
2. **RBAC:** GDPR endpoints must include `preHandler: [authenticate, requireRole('admin')]`.
3. **Token storage:** Keep access token in memory only (no localStorage) and reuse existing `authApi` interceptor behavior.
4. **Worker resiliency:** Worker must not crash on Playwright failures. Every job must catch errors, close browser resources in `finally`, and rely on BullMQ retries/backoff. Add top-level `unhandledRejection`/`uncaughtException` logging with a deliberate shutdown policy (documented).
5. **Artifact privacy:** Treat `access_logs.screenshot_url` as a **private object key** (or `s3://bucket/key`), not a public URL. Generate short-lived presigned GET URLs for admins when needed.
6. **MinIO/S3 compatibility:** Use AWS SDK v3 with explicit `endpoint` and `forcePathStyle: true` for MinIO.
7. **SSRF/unsafe browsing mitigation (minimum):** Only screenshot URLs that are http/https and match a controlled allowlist derived from the `site.hostname` (or a site allowlist field if added later). Block private/loopback/link-local IP targets.
8. **No surprise dependencies:** Prefer existing packages. Add new npm packages only if they materially reduce risk/complexity (and document why).

## Success criteria
- **SC-4.1 (Artifacts queued):** When a request is denied by IP access control, the backend creates an access log row and enqueues a screenshot job referencing that row.
- **SC-4.2 (Worker processes safely):** The screenshot worker processes jobs, retries transient failures with backoff, and does not crash the worker service on Playwright/browser errors.
- **SC-4.3 (Artifacts stored & linked):** For successful jobs, the worker uploads a PNG to MinIO/S3 and updates `access_logs.screenshot_url` for the corresponding log id.
- **SC-4.4 (Artifacts not public):** Screenshots are not publicly accessible; admin viewing uses a short-lived presigned URL or backend streaming endpoint.
- **SC-4.5 (Retention enforced):** The retention job runs daily at 02:00 and drops monthly `access_logs_*` partitions older than `LOG_RETENTION_DAYS` (default 90), recording actions in logs.
- **SC-4.6 (GDPR export):** `POST /api/admin/gdpr/export` returns all matching access logs for an anonymized IP as JSON or CSV.
- **SC-4.7 (GDPR purge):** `DELETE /api/admin/gdpr/purge` deletes all matching access logs rows for an anonymized IP and returns a clear result (count or status).
- **SC-4.8 (GDPR endpoints secured):** Both GDPR endpoints require admin role; non-admin requests receive 401/403.
- **SC-4.9 (Audit log exists):** Migration 005 creates `audit_log` and the backend writes audit entries for admin write operations.
- **SC-4.10 (Audit wiring):** Site create/update/delete, GDPR export/purge, and auth login/logout all write audit_log entries with actor + action + success/failure.
- **SC-4.11 (Frontend admin panel):** Frontend provides an admin-only GDPR panel to export (download) and purge (confirmation) by anonymized IP using TanStack Query v5.

---

## Task dependency ordering

dependency_graph:
  AUDIT-001:
    needs: []
    creates: [backend/migrations/005_create_audit_log.sql]
  AUDIT-002:
    needs: [backend/migrations/005_create_audit_log.sql]
    creates: [backend/src/services/AuditService.ts]
  WORKER-000:
    needs: []
    creates: [backend/package.json]
  WORKER-001:
    needs: [WORKER-000]
    creates: [backend/src/queues/screenshotQueue.ts]
  WORKER-002:
    needs: [WORKER-001]
    creates: [workers/src/screenshotWorker.ts]
  WORKER-003:
    needs: [WORKER-002]
    creates: [backend/src/routes/artifacts.ts, frontend screenshot display wiring]
  RETAIN-001:
    needs: []
    creates: [backend/src/jobs/logRetention.ts]
  GDPR-001:
    needs: [AUDIT-002]
    creates: [backend/src/routes/gdpr.ts]
  GDPR-002:
    needs: [GDPR-001]
    creates: [frontend/src/pages/GdprAdmin.tsx]
  AUDIT-003:
    needs: [AUDIT-002]
    creates: [backend/src/routes/sites.ts (audited)]
  AUDIT-004:
    needs: [AUDIT-002]
    creates: [backend/src/routes/auth.ts + backend/src/services/AuthService.ts (audited)]

Wave guidance (parallelizable):
- **Wave 1:** AUDIT-001, WORKER-000, RETAIN-001 (independent)
- **Wave 2:** AUDIT-002 (after migration), WORKER-002 (after queue), GDPR-001 (after audit service)
- **Wave 3:** AUDIT-003, AUDIT-004, GDPR-002, WORKER-003 (wiring/UI)

---

## Tasks

### WORKER-000 — Add BullMQ producer dependency to backend
- **files to modify:**
  - `backend/package.json`
- **key implementation details:**
  - Add `bullmq` to backend dependencies (backend is **producer only** — it enqueues jobs; it does not run a BullMQ Worker).
  - Keep Playwright + job processing in `workers/` only.
- **done-when:**
  - Backend can import BullMQ `Queue` to enqueue screenshot jobs.

### WORKER-001 — Backend screenshot queue + enqueue on denied access
- **files to modify:**
  - `backend/src/services/AccessLogService.ts`
  - `backend/src/middleware/ipAccessControl.ts`
- **files to create:**
  - `backend/src/queues/screenshotQueue.ts`
  - `backend/src/utils/urlSafety.ts` (or similar)
- **key implementation details:**
  - Change `AccessLogService.log()` to return `{ id, timestamp }` (or at least `id`) via `RETURNING` so the worker can later update `screenshot_url`.
  - Compute a **navigable attempted URL** for screenshotting:
    - Prefer an explicit header if present (e.g. `x-original-url`), else build from `(request.protocol or x-forwarded-proto) + hostname + request.url`.
    - Store the computed full URL in `access_logs.url`.
  - Scope screenshots to **IP-based denials only** (navigable GET URLs):
    - Enqueue the screenshot job **only** in `backend/src/middleware/ipAccessControl.ts` when `allowed === false`.
    - Do **not** enqueue screenshot jobs for geo denials (they occur on `POST /api/protected/verify-location` and are not browser-navigable for Playwright screenshots).
  - When blocked in `ipAccessControl.ts`, use the original attempted page URL:
    - `attemptedUrl = request.protocol + '://' + request.hostname + request.url`
  - Queue payload should minimally include: `{ accessLogId, accessLogTimestamp, siteId, attemptedUrl, hostname }`.
  - Add URL safety enforcement before enqueue: only http/https, matches allowlist derived from `site.hostname` (and reject/skip otherwise).
- **done-when:**
  - IP-based denied access paths create an access log row and enqueue a screenshot job with the returned `access_log_id` + `timestamp`.
  - No enqueue occurs for allowed access.
  - Unit tests validate enqueue is called only on denied decisions and is skipped for unsafe URLs.

### WORKER-002 — Screenshot capture worker (BullMQ + Playwright + MinIO/S3)
- **files to modify:**
  - `workers/src/index.ts`
- **files to create:**
  - `workers/src/screenshotWorker.ts`
  - `workers/src/s3Client.ts`
  - `workers/src/db/pool.ts` (or reuse a minimal pool wrapper)
  - `workers/src/types.ts`
- **key implementation details:**
  - BullMQ `Worker` consumes `SCREENSHOT_QUEUE_NAME` using `REDIS_URL`.
  - Job options:
    - `attempts`: 3–5
    - `backoff`: exponential
    - `removeOnComplete`: true (or keep last N)
    - `timeout`: configured (e.g. 60–120s)
  - Playwright:
    - launch Chromium headless
    - set strict navigation timeout
    - use `page.goto(url, { waitUntil: 'domcontentloaded' })`
    - take PNG screenshot (consider `fullPage=false` by default)
  - S3 upload:
    - AWS SDK v3 `S3Client` with `endpoint`, `region`, `credentials`, and `forcePathStyle: true`.
    - object key naming: `screenshots/{siteId}/{YYYY}/{MM}/{accessLogId}.png`
    - `ContentType: 'image/png'`
  - DB update:
    - `UPDATE access_logs SET screenshot_url = $1 WHERE id = $2 AND timestamp = $3` (parameterized; ensures correct partition pruning).
  - Crash resilience:
    - Wrap job processor in try/catch.
    - Always close `page`/`browser` in `finally`.
    - Add top-level process handlers that log, then allow orchestrator to restart (document policy).
- **done-when:**
  - Worker container starts and registers a BullMQ worker.
  - A successful job results in an uploaded object and `access_logs.screenshot_url` updated.
  - Failed Playwright navigations do not crash the worker; jobs retry and eventually land in failed state with logged error.

### WORKER-003 — Admin access to screenshots (presigned URL or streaming) + UI affordance
- **files to modify:**
  - `backend/src/app.ts`
  - `backend/src/routes/accessLogs.ts`
  - `frontend/src/components/LogDetailModal.tsx`
  - `frontend/src/lib/api.ts`
- **files to create:**
  - `backend/src/routes/artifacts.ts`
  - `backend/src/services/ArtifactService.ts` (optional helper)
- **key implementation details:**
  - Add an admin-only endpoint to retrieve a screenshot:
    - Option A (recommended): `GET /api/admin/access-logs/:id/screenshot-url` returns a short-lived presigned GET URL.
    - Option B: `GET /api/admin/access-logs/:id/screenshot` streams the object bytes.
  - Ensure screenshot objects remain private; presign expiry short (60–300s).
  - Frontend modal:
    - If `log.screenshot_url` is present (object key), show a “View screenshot” button.
    - Fetch presigned URL on demand and render `<img>` or open in new tab.
- **done-when:**
  - Admin can view screenshots for logs that have `screenshot_url`.
  - Non-admin access is denied.

---

### RETAIN-001 — Implement partition-based log retention (drop old monthly partitions)
- **files to modify:**
  - `backend/src/jobs/logRetention.ts`
- **files to create:**
  - `backend/src/jobs/__tests__/logRetention.test.ts`
  - `backend/src/jobs/partitionIntrospection.ts` (optional helper)
- **key implementation details:**
  - Env var: `LOG_RETENTION_DAYS` (default 90). Parse safely; enforce min/max bounds.
  - Implement `runLogRetentionOnce()` called by cron at `0 2 * * *`.
  - Determine cutoff timestamp = `now() - LOG_RETENTION_DAYS`.
  - Introspect partitions using PostgreSQL catalogs:
    - List child tables of `access_logs`.
    - For each child, obtain partition bounds via `pg_get_expr(c.relpartbound, c.oid)`.
    - Parse the FROM/TO dates and drop partitions whose **TO** date is <= cutoff date.
  - Drop using safe identifier handling:
    - Validate partition names match expected pattern.
    - Use `DROP TABLE IF EXISTS <partition>` (no user-provided identifiers).
  - Logging:
    - Log what partitions were dropped and why; log a no-op if none.
- **done-when:**
  - Running retention in a mocked test environment issues the expected catalog queries and drop statements.
  - Job does not attempt to drop current or future partitions.

---

### GDPR-001 — GDPR admin endpoints (export + purge by anonymized IP)
- **files to modify:**
  - `backend/src/app.ts`
  - `backend/src/services/AccessLogService.ts` (export/purge helpers)
- **files to create:**
  - `backend/src/routes/gdpr.ts`
  - `backend/src/services/GdprService.ts` (optional; keep route thin)
  - `backend/src/routes/__tests__/gdpr.test.ts`
- **key implementation details:**
  - Endpoints:
    - `POST /api/admin/gdpr/export`
      - body: `{ anonymizedIp: string, format: 'json' | 'csv' }` (optionally `siteId?: string`)
      - response: JSON array or streamed CSV
    - `DELETE /api/admin/gdpr/purge`
      - body: `{ anonymizedIp: string }` (optionally `siteId?: string`)
      - response: `{ deleted: number }` or 204
  - Security:
    - `preHandler: [authenticate, requireRole('admin')]`
  - Querying:
    - `SELECT ... FROM access_logs WHERE ip_address = $1` (and `AND site_id = $2` if provided)
    - Stream results to avoid memory spikes for large exports.
  - Purge:
    - `DELETE FROM access_logs WHERE ip_address = $1` (and optional site filter)
    - Return `rowCount`.
  - Auditing:
    - Record `GDPR_EXPORT` and `GDPR_PURGE` with actor id and minimal metadata (do not store raw IP beyond what’s already anonymized).
- **done-when:**
  - Admin can export JSON/CSV and purge logs for a given anonymized IP.
  - Non-admin calls are rejected.
  - Audit entries are written for both operations.

### GDPR-002 — Frontend GDPR admin panel (TanStack Query v5)
- **files to modify:**
  - `frontend/src/App.tsx`
  - `frontend/src/components/Layout.tsx`
  - `frontend/src/lib/api.ts`
- **files to create:**
  - `frontend/src/pages/GdprAdmin.tsx`
- **key implementation details:**
  - Add a route, e.g. `/gdpr` under `<RequireAuth>`.
  - Sidebar link visible only when `useAuth().data?.role === 'admin'`.
  - Form inputs:
    - anonymized IP
    - format selector (JSON/CSV)
  - Export flow:
    - Trigger a mutation that calls export endpoint and downloads the response as a file.
  - Purge flow:
    - Confirmation dialog; call purge endpoint; show deleted count.
- **done-when:**
  - Admin can export/purge from the UI.
  - Viewer cannot see the GDPR link and cannot access the page (route-level guard or server-side rejection is still the source of truth).

---

### AUDIT-001 — Migration: create audit_log table
- **files to create:**
  - `backend/migrations/005_create_audit_log.sql`
- **key implementation details:**
  - Table includes: `id`, `timestamp`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `success`, `error`, `metadata`.
  - Add indexes for `timestamp`, `actor_user_id`, and `(entity_type, entity_id)`.
- **done-when:**
  - Migration applies cleanly via existing migrate runner.

### AUDIT-002 — Implement AuditService
- **files to create:**
  - `backend/src/services/AuditService.ts`
- **files to modify:**
  - `backend/src/app.ts` (optional: decorate app with audit service if desired)
- **key implementation details:**
  - Provide a small `record()` API that accepts:
    - actor id (nullable)
    - action enum/string
    - entity type/id (optional)
    - request context metadata (ip/user agent) where available
    - success/failure + error message
  - Ensure writes are best-effort: failures to write audit logs should not break primary flows, but must be logged.
- **done-when:**
  - Audit entries can be written from routes/services without duplicating SQL.

### AUDIT-003 — Wire audit logging into site admin write routes
- **files to modify:**
  - `backend/src/routes/sites.ts`
- **key implementation details:**
  - On successful create/update/delete, record actions: `SITE_CREATE`, `SITE_UPDATE`, `SITE_DELETE`.
  - On failure (e.g., unique violation), record `success=false` with error code.
  - Include `entity_id = site.id` when available.
- **done-when:**
  - Site writes generate audit_log entries for both success and meaningful failure cases.

### AUDIT-004 — Wire audit logging into auth routes (login/logout)
- **files to modify:**
  - `backend/src/routes/auth.ts`
  - `backend/src/services/AuthService.ts`
- **key implementation details:**
  - Login:
    - On successful login, record `LOGIN_SUCCESS` with actor user id.
    - On invalid credentials, record `LOGIN_FAILED` with minimal metadata (no password, no raw token).
  - Logout:
    - Update AuthService.logout to optionally return `userId` for the token being revoked (so logout can be audited).
    - Record `LOGOUT`.
- **done-when:**
  - Successful and failed login attempts are auditable.
  - Logout is auditable when the refresh token maps to a user.

---

## Verification (what to run / what must be true)
- Backend unit tests:
  - New tests for retention logic (partition selection + safe drop decisions).
  - New tests for GDPR routes (RBAC enforcement, export format selection, purge result).
  - New tests for screenshot enqueue behavior (denied paths enqueue; allowed paths do not).
- Manual smoke tests (docker-compose stack):
  - Produce a denied access attempt and confirm:
    1) access log row exists with `allowed=false`
    2) worker processes job
    3) `screenshot_url` gets filled
    4) admin can view screenshot via presigned URL endpoint
  - Run retention once manually (or temporarily set low `LOG_RETENTION_DAYS`) and confirm old partitions are dropped.
  - GDPR export downloads JSON/CSV; purge deletes rows and is reflected in access logs UI.

## Open questions / decision points (documented, not blocking)
- Should GDPR export/purge scope be global across all sites, or optionally per-site? (Plan supports optional site filter.)
- Do we want a dedicated `minio-init` compose service to create `S3_BUCKET` automatically? (Recommended if the bucket is not created elsewhere.)

## Required environment variables (Phase 4)

Backend:
- `SCREENSHOT_QUEUE_REDIS_URL` (or reuse existing `REDIS_URL` if already standardized)
- AWS/MinIO vars already used for artifact access (presign/stream), if applicable to backend runtime

Workers:
- `REDIS_URL`
- `DATABASE_URL`
- `AWS_ENDPOINT_URL`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`
