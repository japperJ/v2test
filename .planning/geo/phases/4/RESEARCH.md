# Phase 4 Research: Artifacts & GDPR Compliance (Geo-fenced multi-site webserver)

This research is scoped to Phase 4 goals:
- screenshot/artifact capture for blocked requests
- log retention enforcement via partition drops
- GDPR export + deletion workflows
- audit trail of admin write operations

It is written to align with the current codebase state:
- `backend/src/jobs/logRetention.ts` is a placeholder scheduled daily at 02:00.
- `access_logs` is range-partitioned monthly on `timestamp` and includes `screenshot_url TEXT` (`backend/migrations/002_create_access_logs.sql`).
- `AccessLogService.log()` currently inserts anonymized IPs via `anonymizeIP()` but **does not** store `screenshot_url`.
- A `worker` service exists in `infrastructure/docker-compose.yml`, and `workers/` already depends on BullMQ + Playwright + AWS S3 SDK.

---

## Architecture decisions

### Separate worker process (recommended)
**Decision:** keep Playwright screenshot capture out of the Fastify request path and run it in the existing `workers/` package as its own process/container.

**Why:**
- Playwright/Chromium startup and rendering are heavy and failure-prone under request latency constraints.
- Queue-based execution provides retries/backoff and isolates crashes.
- Your `docker-compose.yml` already defines a `worker` service, so this is consistent with current ops.

**BullMQ concepts to use (high confidence):**
- `Queue` in backend to enqueue screenshot jobs.
- `Worker` in `workers/` to process jobs.
- Worker-level `concurrency` should be low for CPU/memory-heavy Playwright tasks; scale horizontally by running more worker replicas rather than large concurrency (BullMQ concurrency guidance) [BullMQ Parallelism & Concurrency](https://docs.bullmq.io/guide/parallelism-and-concurrency).

### Capture trigger: “blocked access log” → enqueue job
**Decision:** enqueue screenshot jobs only when `allowed=false` (blocked), using the already-logged access event as the anchor.

**Implementation implication:** you’ll likely want the access log insert to return an identifier so the worker can update `access_logs.screenshot_url` later. Right now `AccessLogService.log()` returns `void`.

### Storage model: store object *key*, not a permanent URL (recommended)
**Decision:** treat `access_logs.screenshot_url` as an **object key** (or `s3://bucket/key`) rather than a long-lived public URL.

**Why:**
- Screenshots can contain personal data. Avoid public object ACLs.
- Prefer generating short-lived presigned GET URLs at read-time (admin UI) using `@aws-sdk/s3-request-presigner` [AWS presigner docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_s3_request_presigner.html).

If you keep using a literal URL, make it an internal URL that requires authentication (e.g., backend `/api/admin/access-logs/:id/screenshot`) and have the backend stream from S3.

---

## BullMQ + Playwright worker

### Worker isolation & scaling
BullMQ provides two levers:
- **Per-worker concurrency** (good for I/O heavy jobs; risky for CPU/memory heavy browser work).
- **Multiple worker processes** (true parallelism) [BullMQ Parallelism & Concurrency](https://docs.bullmq.io/guide/parallelism-and-concurrency).

**Recommendation for Playwright:**
- Start with `concurrency = 1` or `2` per worker.
- Scale by running more `worker` containers if needed.

### Failure handling: retries/backoff
Use BullMQ attempts + backoff (fixed/exponential) for transient failures like DNS, target timeouts, temporary MinIO errors [BullMQ Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs).

**Guideline:**
- Use small `attempts` (e.g., 3–5), exponential backoff with jitter.
- Mark permanent failures (invalid URL, forbidden host) as non-retriable (job should fail without retries).

### Playwright-in-Docker stability patterns
Playwright’s official Docker guidance highlights common stability flags:
- use `--init` to avoid zombie processes (PID 1 issues)
- use `--ipc=host` for Chromium shared memory to reduce crashes
- pin Playwright Docker image versions
- avoid Alpine (unsupported due to musl) [Playwright Docker](https://playwright.dev/docs/docker)

**Practical recommendations (worker container):**
1. Prefer basing the worker Docker image on the official Playwright image (pinned) when possible.
2. If you build your own image, ensure browsers + system deps are installed (Playwright’s example uses `npx playwright install --with-deps`) [Playwright Docker](https://playwright.dev/docs/docker).
3. Keep browser launches lean:
   - `chromium.launch({ headless: true })`
   - set navigation timeouts; avoid `waitUntil: 'networkidle'` as it’s discouraged for readiness semantics (shown in Playwright API docs around navigation) [Playwright Page API](https://playwright.dev/docs/api/class-page#page-screenshot).
4. Hard resource limits:
   - job timeout guard (BullMQ has per-job timeouts; also enforce internal Playwright timeouts)
   - maximum page load time
   - maximum screenshot size and fullPage setting (default `fullPage=false`) [Playwright screenshot options](https://playwright.dev/docs/api/class-page#page-screenshot).

### Security considerations for “visit the URL and screenshot it”
This feature is inherently risky if the worker browses arbitrary URLs:
- SSRF (worker can reach internal services)
- malware/phishing pages, crypto miners
- data exfiltration via browser

**Mitigations to consider (strongly recommended):**
- Allowlist hosts per site (only screenshot the site’s known hostname(s))
- Block private IP ranges and link-local, and reject non-HTTP(S)
- Run worker with restricted network egress if feasible
- Use non-root user + sandbox where possible; Playwright docs note root disables Chromium sandbox by default; for untrusted browsing, they recommend non-root + seccomp profile [Playwright Docker](https://playwright.dev/docs/docker)

**Note:** Playwright’s Docker page explicitly states the image is intended for testing/dev and not recommended to visit untrusted sites [Playwright Docker](https://playwright.dev/docs/docker). Treat this as a high-risk feature if you permit arbitrary URLs.

---

## MinIO/S3 integration

### MinIO compatibility notes (S3 API)
MinIO is explicitly positioned as **S3-compatible object storage**, which is why using the AWS SDK for JavaScript v3 against MinIO endpoints is a common and supported pattern (the S3 API surface is the contract) [MinIO README](https://github.com/minio/minio).

There is also an official MinIO JavaScript Client SDK (`minio` on npm) which provides high-level APIs and includes presigned operations; it can be used instead of AWS SDK v3 if you prefer MinIO-specific ergonomics [minio-js README](https://github.com/minio/minio-js).

For a function-by-function reference (including `presignedUrl`, `presignedGetObject`, and `presignedPutObject`), see MinIO’s JavaScript Client API Reference on `docs.min.io` [MinIO JavaScript Client API Reference](https://docs.min.io/enterprise/aistor-object-store/developers/sdk/javascript/api/).

Research note: an older docs URL path (`https://min.io/docs/minio/linux/developers/javascript/API.html`) currently returns HTTP 404.

**Important project-state/licensing note (high confidence):** as of Feb 2026, the `minio/minio` repository indicates it was archived and is now read-only, and it includes explicit guidance about AGPLv3 obligations and “source-only distribution” for the community edition [MinIO README](https://github.com/minio/minio).
This may affect:
- your willingness to depend on `minio/minio:latest` images long-term,
- your patching/security-update strategy,
- and your licensing/compliance posture.

### Direct SDK upload from worker (recommended)
Given screenshots are produced in the worker (as buffers), upload directly using AWS SDK v3 `PutObjectCommand` [AWS PutObjectCommand docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand/).

**Why not presigned PUT from backend?**
- No browser/client is uploading; the worker already has the bytes.
- Direct upload avoids an extra round trip and failure mode.

### Presigned GET for admin UI
For viewing screenshots in the admin UI, generate presigned GET URLs via `getSignedUrl()` [AWS presigner docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_s3_request_presigner.html).

If you end up switching to `minio` (minio-js) in the worker, the SDK also supports presigned operations, including `presignedGetObject` / `presignedPutObject` and a generic `presignedUrl` API [minio-js README](https://github.com/minio/minio-js).

**Policy recommendation:**
- Bucket/object should be private.
- Presigned GET should be short-lived (e.g., 60–300 seconds) and generated only for authenticated admins.

### Handling upload failures gracefully
Pattern:
1. Create access log row first (blocked event).
2. Enqueue screenshot job with `access_log_id`, `site_id`, and `url`.
3. Worker:
   - capture screenshot buffer
   - upload to S3
   - update `access_logs.screenshot_url` to object key
4. If upload fails:
   - retry job with backoff
   - after final failure, update `access_logs.screenshot_url` to NULL and store error info elsewhere (job failure reason; or a dedicated `artifact_failures` table) so admins can see why screenshot is missing.

---

## Log retention SQL (partition drops)

Your `access_logs` is declaratively partitioned by RANGE (`timestamp`) and partitions are monthly (`access_logs_2026_02`, `access_logs_2026_03`, …) [migration](../backend/migrations/002_create_access_logs.sql).

PostgreSQL best practice for bulk deletion in partitioned tables is to **drop or detach partitions** instead of running large `DELETE` statements. Dropping a partition is fast and avoids vacuum overhead [PostgreSQL 16 partitioning overview](https://www.postgresql.org/docs/16/ddl-partitioning.html).

### Recommended approach
- Daily job computes a cutoff timestamp: `now() - retention_days`.
- Identify partitions whose upper bound is older than the cutoff.
- Drop them.

### Detach vs drop
- **DROP TABLE partition_name**: fastest removal; deletes data immediately.
- **ALTER TABLE access_logs DETACH PARTITION partition_name [CONCURRENTLY]**: useful if you want to export/backup the partition before dropping; `CONCURRENTLY` reduces lock level but has restrictions [ALTER TABLE DETACH PARTITION](https://www.postgresql.org/docs/16/sql-altertable.html).

For “retention enforcement”, dropping is usually fine. If you want a safety window, detach concurrently, export via `COPY`, then drop.

### How to list partitions to drop (SQL sketch)
PostgreSQL stores partition information in catalogs. A common approach is:
- list child tables via `pg_inherits`
- inspect partition bounds via `pg_class.relpartbound` rendered through `pg_get_expr()`

Example (conceptual):
- get children of `access_logs`
- parse `FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM-01')` to compute partition range

**Research note:** You’ll need to implement the “parse bounds” step carefully. Alternatively, rely on partition naming convention (`access_logs_YYYY_MM`) and compute expected ranges from the name (simpler, but depends on consistent naming).

### Scheduling
You already schedule at `0 2 * * *` (daily 02:00) in `backend/src/jobs/logRetention.ts`. That’s appropriate; ensure the job is started during backend boot.

---

## GDPR implementation approach

### GDPR “anchors” worth aligning to (non-legal advice)
The core technical design goals in this phase map cleanly onto several GDPR concepts:
- **Data minimisation + storage limitation**: keep only what you need, and delete it when you no longer need it (maps directly to retention enforcement) [GDPR Article 5(1)(c),(e)](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- **Data protection by design and by default**: implement privacy-protecting defaults and technical measures such as pseudonymisation (maps to IP anonymisation + not making screenshots public) [GDPR Article 25](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- **Transparent DSAR handling + timelines**: provide responses “without undue delay” and generally within one month, with conditions for extension (maps to your DSAR endpoints/workflow and auditability) [GDPR Article 12(3)](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- **Right of access**: DSAR export is essentially implementing the “right of access” response (what data is processed and a copy of data) [GDPR Article 15](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- **Right to erasure**: DSAR deletion is an implementation of erasure where applicable, subject to exceptions (your policy/legal team must decide when exceptions apply) [GDPR Article 17](https://eur-lex.europa.eu/eli/reg/2016/679/oj).

### Current limitation: anonymized IP prevents exact subject matching
`AccessLogService.log()` stores `ip_address` as `anonymizeIP(entry.ipAddress)`.

This is good for privacy, but it introduces a DSAR problem:
- A data subject usually knows their **real** IP, not the anonymized representation.
- Many distinct IPs can collapse to the same anonymized value, so exporting/deleting by anonymized IP can unintentionally expose/delete other users’ records.

### Recommended technical pattern: add an `ip_hash` (keyed) for DSAR matching
**Decision:** store an additional deterministic, keyed hash of the original IP (e.g., `ip_hash = HMAC-SHA256(secret, canonical_ip)`), while continuing to store anonymized `ip_address` for reporting.

Benefits:
- A subject request can be fulfilled by computing the same `ip_hash` from a submitted IP.
- The database does not store the raw IP.
- Collision risk is negligible with SHA-256.

**Implementation implications (for Phase 4 planning):**
- Add a DB migration adding `ip_hash BYTEA` (or `TEXT` hex) to `access_logs` partitions (add to parent; propagates).
- Update logging pipeline to compute `ip_hash` before anonymization.
- DSAR endpoints accept either real IP (compute hash) or anonymized IP (fallback).

### Export (admin API)
**Goal:** download all access logs for a subject identifier.

Recommended outputs:
- JSON: easiest, preserves structure.
- CSV: common admin use.

Implementation notes:
- Use streaming responses for large exports to avoid memory blowups.
- Filter by `ip_hash` (preferred) or `ip_address` (fallback).
- Consider including only fields necessary for DSAR to reduce collateral personal data (data minimization).

### Deletion / erasure
If you can match a specific subject via `ip_hash`, you have two main approaches:

1) **Delete rows** matching the subject
- Pros: simplest; aligns with “erase”.
- Cons: may reduce security auditability (but you’ll have `audit_log`).

2) **Further anonymize rows**
- Pros: preserves aggregate metrics.
- Cons: must define what “further anonymized” means; may still be personal data depending on remaining fields.

Given logs may contain URLs and user agents, and you have a clear retention policy, deleting rows for confirmed subject requests is often the cleanest. If you need to retain security metadata, consider retaining only coarse-grained aggregates (but that is a policy/legal decision).

### Auditability for GDPR operations
- DSAR export and deletion must create `audit_log` entries (who, what, when, parameters, success/failure).
- Consider storing a “request record” (GDPR request table) if you need lifecycle tracking (received → processed → fulfilled).

---

## Audit log schema

### Table purpose
Record **all admin write operations**:
- site create/update/delete
- user/role changes (if applicable)
- GDPR export and deletion operations

### Recommended minimal schema
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `timestamp TIMESTAMPTZ NOT NULL DEFAULT now()`
- `actor_user_id UUID NULL REFERENCES users(id)` (NULL only for system jobs)
- `action TEXT NOT NULL` (e.g., `SITE_CREATE`, `SITE_UPDATE`, `GDPR_EXPORT`, `GDPR_DELETE`)
- `entity_type TEXT NULL` (e.g., `site`, `access_logs`, `gdpr_request`)
- `entity_id UUID NULL`
- `request_id TEXT NULL` (correlate to Fastify request id / tracing)
- `ip_address INET NULL` (admin’s IP)
- `user_agent TEXT NULL`
- `success BOOLEAN NOT NULL DEFAULT true`
- `error TEXT NULL` (failure reason)
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb` (freeform details; include filters like `ip_hash_prefix` rather than full identifiers if sensitive)
- `before JSONB NULL` and `after JSONB NULL` (optional; beware storing secrets)

### Indexing strategy
- `(timestamp DESC)` for time-based browsing
- `(actor_user_id, timestamp DESC)` for per-admin investigation
- `(entity_type, entity_id, timestamp DESC)` for entity history
- Possibly GIN on `metadata` if you expect query-by-keys, but avoid premature indexing.

---

## Risks / pitfalls to avoid

1. **SSRF & unsafe browsing in Playwright worker**
   - Enforce strict URL allowlists and block private networks.
   - Consider running browser sandbox (non-root + seccomp) per Playwright Docker guidance.

2. **Overloading the worker**
   - Keep concurrency low for Playwright.
   - Use BullMQ retries/backoff for transient errors.

3. **Leaking artifacts**
   - Do not make bucket public.
   - Avoid storing permanent URLs; generate presigned GET URLs.

4. **MinIO dependency risks (maintenance + licensing)**
   - The upstream `minio/minio` repository indicates it is archived/read-only and highlights AGPLv3 obligations and a “source-only distribution” approach for the community edition [MinIO README](https://github.com/minio/minio).
   - If you rely on `minio/minio:latest`, prefer pinning and have a clear plan for security updates and/or alternatives.

5. **GDPR export by anonymized IP could leak other subjects’ data**
   - Add `ip_hash` for deterministic matching.
   - If you must export by anonymized IP, clearly warn admins and restrict to tightly-scoped time ranges.

6. **Partition management locks**
   - Dropping a partition is fast, but ensure you don’t drop current/future partitions.
   - If you detach concurrently, mind restrictions (`CONCURRENTLY` cannot run with a default partition; cannot run in a transaction block) [ALTER TABLE](https://www.postgresql.org/docs/16/sql-altertable.html).

---

## Sources
- BullMQ workers: https://docs.bullmq.io/guide/workers
- BullMQ parallelism/concurrency guidance: https://docs.bullmq.io/guide/parallelism-and-concurrency
- BullMQ retry/backoff: https://docs.bullmq.io/guide/retrying-failing-jobs
- Playwright Docker guidance: https://playwright.dev/docs/docker
- Playwright screenshot API: https://playwright.dev/docs/api/class-page#page-screenshot
- AWS SDK v3 PutObjectCommand: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand/
- AWS SDK v3 S3 presigner: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_s3_request_presigner.html
- MinIO server (state/licensing/source-only distribution): https://github.com/minio/minio
- MinIO JavaScript Client SDK (minio-js): https://github.com/minio/minio-js
- MinIO JavaScript Client API Reference (docs.min.io): https://docs.min.io/enterprise/aistor-object-store/developers/sdk/javascript/api/
- PostgreSQL partitioning and partition maintenance concepts: https://www.postgresql.org/docs/16/ddl-partitioning.html
- PostgreSQL ALTER TABLE DETACH PARTITION details: https://www.postgresql.org/docs/16/sql-altertable.html
- GDPR (Regulation (EU) 2016/679, consolidated text): https://eur-lex.europa.eu/eli/reg/2016/679/oj
