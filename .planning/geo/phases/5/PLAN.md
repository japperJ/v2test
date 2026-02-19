---
phase: 5
plan: 1
type: implement
wave: 1
depends_on: []
files_modified:
  - backend/src/config.ts
  - backend/src/server.ts
  - backend/src/app.ts
  - backend/src/routes/health.ts
  - backend/src/routes/sites.ts
  - backend/src/routes/accessLogs.ts
  - backend/src/routes/gdpr.ts
  - backend/src/routes/artifacts.ts
  - backend/Dockerfile
  - infrastructure/docker-compose.yml
  - .github/workflows/ci.yml
  - backend/.env.example
  - workers/.env.example
  - workers/src/s3Client.ts
  - workers/src/screenshotWorker.ts
  - e2e/package.json
  - e2e/playwright.config.ts
  - e2e/tests/smoke.spec.ts
autonomous: true
must_haves:
  observable_truths:
    - "Backend fails fast at startup with descriptive error if required env vars are missing (before listen)."
    - "GET /health returns { postgres, redis, status } with status healthy|degraded based on real checks."
    - "Redis-backed rate limiting is enforced for auth/admin/protected routes with the specified limits."
    - "Unhandled errors and 404s return normalized JSON: { error, message, statusCode }."
    - "Swagger UI is available at /documentation and admin routes are tagged in their schemas."
    - "Helmet CSP is enabled with directives that allow Leaflet CDNs, OpenStreetMap tiles, and MinIO/S3 public origin (from MINIO_PUBLIC_ORIGIN)."
    - "Backend Docker image runs as non-root with NODE_ENV=production and remains multi-stage."
    - "Frontend builds cleanly via npm run build, and CI runs/builds accordingly."
    - "A runnable Playwright E2E smoke test exists under e2e/ for login → create site → list sites → logout."
  artifacts:
    - path: backend/src/config.ts
      has:
        - validateEnv
        - BackendConfig
        - envVarAliasMappingForS3AndAws
    - path: backend/src/routes/health.ts
      has:
        - realRedisPingCheck
        - postgresCheck
    - path: backend/src/app.ts
      has:
        - swaggerRegisteredBeforeRoutes
        - helmetCspEnabled
        - rateLimitRegistered
        - setErrorHandler
        - setNotFoundHandler
    - path: e2e/tests/smoke.spec.ts
      has:
        - loginFlow
        - createSiteFlow
        - listSitesFlow
        - logoutFlow
  key_links:
    - from: backend/src/server.ts
      to: backend/src/config.ts
      verify: "server.ts calls validateEnv() before buildApp() and app.listen()"
    - from: backend/src/routes/health.ts
      to: backend/src/db/pool.ts
      verify: "health checks Postgres with parameterless SELECT 1 using pool"
    - from: backend/src/routes/health.ts
      to: REDIS_URL
      verify: "health performs Redis PING using ioredis against REDIS_URL"
    - from: backend/src/app.ts
      to: "@fastify/swagger + @fastify/swagger-ui"
      verify: "swagger registered before registering any route modules"
    - from: backend/src/app.ts
      to: "@fastify/rate-limit"
      verify: "rate-limit plugin is registered with ioredis store and policies are applied to /api/auth/*, /api/admin/*, /api/protected/*"
    - from: backend/src/app.ts
      to: "@fastify/helmet"
      verify: "CSP directives include Leaflet CDN origins + OSM tile origin + MINIO_PUBLIC_ORIGIN"
---

# Phase 5 (Geo), Plan 1: Production Hardening

## Objective
Harden the application for production by introducing fail-fast environment validation, real readiness checks, Redis-backed rate limiting, OpenAPI documentation, CSP/security headers, normalized error responses, Docker hardening, a frontend production build gate, a minimal Playwright E2E smoke suite, and CI updates — without breaking existing backend unit tests (121 tests must still pass).

Scope sanity note: keep changes narrowly scoped to wiring/configuration required for the success criteria; avoid broad refactors, large schema migrations, or endpoint redesigns.

## Context
- @.planning/geo/phases/5/RESEARCH.md

Reference implementation points (must remain accurate):
- `backend/src/app.ts` is the central Fastify bootstrap and route registration point.
- `backend/src/routes/health.ts` currently checks Postgres but has a Redis placeholder.
- `backend/Dockerfile` exists and is multi-stage but runs as root.
- `frontend/vite.config.ts` exists; `frontend/package.json` defines `npm run build` (treat Vite config as verify-only unless build fails).
- `.github/workflows/ci.yml` exists and currently lints/tests but does not build frontend nor cache docker builds.

## Success Criteria (Phase 5)
- **SC-5.1 Rate limiting:** `@fastify/rate-limit` registered; Redis-backed for multi-instance; policies:
  - admin routes: 100 req / 15 min per IP
  - protected routes: 30 req / min per IP
  - auth routes: 10 req / 15 min per IP
- **SC-5.2 OpenAPI:** `@fastify/swagger` + `@fastify/swagger-ui` registered; `/documentation` works; all admin routes have schema tags.
- **SC-5.3 CSP/Security headers:** Helmet CSP re-enabled with correct directives for Leaflet CDN, OSM tiles, and MinIO/S3 presigned URLs via env `MINIO_PUBLIC_ORIGIN`; ensure X-Content-Type-Options and X-Frame-Options are present.
- **SC-5.4 Env validation:** `backend/src/config.ts` validates required env vars on startup; missing vars cause descriptive error before listening; fix S3/AWS env naming mismatch.
- **SC-5.5 Health checks:** `/health` returns `{ postgres: "ok"|"error", redis: "ok"|"error", status: "healthy"|"degraded" }` using real checks (including real Redis ping).
- **SC-5.6 Error normalization:** global Fastify error + 404 handlers return `{ error, message, statusCode }` for unhandled errors.
- **SC-5.7 E2E tests:** Playwright E2E tests in `e2e/` (workspace root) cover login → site create → site list → logout; 1 runnable suite.
- **SC-5.8 Docker hardening:** backend Dockerfile multi-stage, `NODE_ENV=production`, runs as non-root user; compose updated accordingly.
- **SC-5.9 Frontend build:** `frontend/` builds cleanly with `npm run build`; optimized bundle; build step added in CI.
- **SC-5.10 CI update:** `.github/workflows/ci.yml` docker build uses caching; optionally add E2E job stub.

## Dependency / ordering model (must follow)
Wave ordering is strict (later waves may assume earlier artifacts exist).

dependency_graph:
  ENV-001:
    needs: []
    creates: [backend/src/config.ts]
  HEALTH-001:
    needs: [backend/src/config.ts]
    creates: []
  RATE-001:
    needs: [backend/src/config.ts]
    creates: []
  ERR-001:
    needs: []
    creates: []
  API-001:
    needs: []
    creates: []
  HARD-001:
    needs: [backend/src/config.ts]
    creates: []
  DOCKER-001:
    needs: []
    creates: []
  E2E-001:
    needs: []
    creates: [e2e/package.json, e2e/playwright.config.ts]
  E2E-002:
    needs: [e2e/playwright.config.ts]
    creates: [e2e/tests/smoke.spec.ts]
  CI-001:
    needs: [e2e/package.json]
    creates: []

wave_order:
  - wave: 1
    tasks: [ENV-001]
  - wave: 2
    tasks: [HEALTH-001]
  - wave: 3
    tasks: [RATE-001]
  - wave: 4
    tasks: [ERR-001]
  - wave: 5
    tasks: [API-001]
  - wave: 6
    tasks: [HARD-001]
  - wave: 7
    tasks: [DOCKER-001]
  - wave: 8
    tasks: [E2E-001, E2E-002]
  - wave: 9
    tasks: [CI-001]

## Tasks

### Task ENV-001: Fail-fast env validation + fix S3/AWS naming mismatch
- **files:**
  - `backend/src/config.ts` (new)
  - `backend/src/server.ts`
  - `backend/.env.example`
  - `workers/.env.example`
  - `workers/src/s3Client.ts`
  - `workers/src/screenshotWorker.ts`
- **action:**
  - Introduce `backend/src/config.ts` that validates required environment variables using Zod.
  - Ensure startup validation runs *before* `app.listen()`:
    - `backend/src/server.ts` must call `validateEnv(process.env)` (or equivalent) and throw a descriptive error (include missing keys + hints) before calling `buildApp()` and `listen()`.
  - Resolve S3/AWS naming mismatch across backend + workers:
    - Canonicalize env vars used by runtime code to **one naming scheme** (recommended canonical names to align with current code: `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`).
    - Provide backwards-compatible aliasing from `.env.example` legacy names (e.g., `S3_ENDPOINT` → `AWS_ENDPOINT_URL`, `S3_ACCESS_KEY` → `AWS_ACCESS_KEY_ID`, `S3_SECRET_KEY` → `AWS_SECRET_ACCESS_KEY`, `S3_REGION` → `AWS_REGION`, `S3_BUCKET` → `S3_BUCKET_NAME`) and document deprecations.
    - Ensure the worker’s bucket env source is consistent (do not leave `S3_BUCKET_NAME` vs `S3_BUCKET` split-brain).
  - Include `MINIO_PUBLIC_ORIGIN` in config (required in production, optional in dev) to support CSP allowlists.
- **verify:**
  - Starting backend with a required env var missing fails immediately (no listening socket).
  - Error message includes the missing key(s) and points to `.env.example`.
  - Existing backend unit tests still pass after any required test env setup adjustments.
- **done:**
  - A single source of truth exists for env vars.
  - Server refuses to start with invalid env and provides actionable diagnostics.

### Task HEALTH-001: Real Redis health check + new /health response shape
- **files:**
  - `backend/src/routes/health.ts`
  - (optional) `backend/src/db/redis.ts` (new, if shared client is preferred)
- **action:**
  - Replace the Redis placeholder with a real Redis connectivity check (e.g., `PING` via `ioredis`) using the same `REDIS_URL` used elsewhere.
  - Update response shape exactly to:
    - `{ postgres: 'ok'|'error', redis: 'ok'|'error', status: 'healthy'|'degraded' }`
  - Ensure health endpoint returns HTTP 200 for healthy and HTTP 503 for degraded.
  - Add reasonable timeouts to avoid a stuck `/health` under partial outages.
- **verify:**
  - With Redis stopped, `/health` returns 503 and `{ redis: 'error', status: 'degraded' }`.
  - With Postgres stopped, `/health` returns 503 and `{ postgres: 'error', status: 'degraded' }`.
- **done:**
  - `/health` reflects real Postgres + Redis status and matches the required JSON schema.

### Task RATE-001: Redis-backed rate limiting (auth/admin/protected policies)
- **files:**
  - `backend/src/app.ts`
- **action:**
  - Register `@fastify/rate-limit` in a way that is mergeable with the existing `buildApp()` plugin/route registration structure.
  - Use Redis store (`ioredis`) for multi-instance correctness.
  - Apply policies using Fastify encapsulation scopes (preferred, to avoid touching every route file):
    - `/api/auth/*`: 10 requests / 15 minutes per IP
    - `/api/admin/*`: 100 requests / 15 minutes per IP
    - `/api/protected/*`: 30 requests / 1 minute per IP
    Implementation guidance:
    - Use `fastify.register(async (scope) => { await scope.register(rateLimit, { global: true, max, timeWindow, redis }); scope.register(<routes>); })` to apply a group policy to all routes registered within the scope.
    - If any specific route needs overrides, use route-level `config: { rateLimit: { ... } }` per `@fastify/rate-limit` docs.
  - Ensure `trustProxy` behavior is consistent (rate limiting should respect `TRUST_PROXY` already used in `buildApp()`).
- **verify:**
  - Repeated calls to `/api/auth/login` exceed and return 429 with predictable response body.
  - Admin routes (e.g., `GET /api/admin/sites`) are limited per spec.
  - Protected geo endpoint `POST /api/protected/verify-location` is limited per spec.
- **done:**
  - Rate limiting is enabled, Redis-backed, and differentiated by route group as required.

### Task ERR-001: Error normalization + 404 handler
- **files:**
  - `backend/src/app.ts`
  - (optional) `backend/src/utils/httpErrors.ts` (new, if helpful)
- **action:**
  - Add a global `setErrorHandler` in `buildApp()` that normalizes unhandled errors to:
    - `{ error, message, statusCode }`
  - Add a `setNotFoundHandler` returning the same normalized shape for unknown routes.
  - Avoid leaking stack traces in production (`NODE_ENV=production`), while preserving developer ergonomics in dev/test.
- **verify:**
  - A thrown error in a test route (or synthetic injection) returns the normalized shape.
  - Unknown route returns 404 with normalized shape.
  - Existing backend unit tests remain passing (adjust expectations only where necessary).
- **done:**
  - Unhandled errors and 404s are consistently shaped for the frontend and future OpenAPI schema work.

### Task API-001: Swagger/OpenAPI registration + admin route tags
- **files:**
  - `backend/src/app.ts`
  - `backend/src/routes/sites.ts`
  - `backend/src/routes/accessLogs.ts`
  - `backend/src/routes/gdpr.ts`
  - `backend/src/routes/artifacts.ts`
- **action:**
  - Register `@fastify/swagger` and `@fastify/swagger-ui`.
  - Ensure Swagger is registered **before** any routes in `buildApp()` so route discovery works.
  - Serve Swagger UI at `/documentation`.
  - Add schema tags to all admin routes (`/api/admin/*`) by adding `schema: { tags: ['admin'] }` (and security metadata if desired) to each admin route definition.
- **verify:**
  - Visiting `/documentation` returns Swagger UI.
  - Admin routes appear under an `admin` tag in the docs.
- **done:**
  - OpenAPI is wired correctly and admin routes are tagged.

### Task HARD-001: Re-enable CSP + security headers (Helmet)
- **files:**
  - `backend/src/app.ts`
  - `backend/src/config.ts` (if CSP depends on validated env)
- **action:**
  - Re-enable Helmet `contentSecurityPolicy` and configure directives that allow:
    - Leaflet CDN assets used by the frontend HTML: `https://unpkg.com`, `https://cdnjs.cloudflare.com`
    - OpenStreetMap tiles: `https://{s}.tile.openstreetmap.org` (allow wildcard subdomains)
    - Artifact URLs from MinIO/S3 public origin configured via `MINIO_PUBLIC_ORIGIN` (added to `img-src`)
  - Ensure Helmet continues to set other standard headers (e.g., `X-Content-Type-Options`, `X-Frame-Options`).
  - Ensure Swagger UI works under CSP; use the `@fastify/swagger` Helmet integration pattern (leveraging `instance.swaggerCSP.script` / `instance.swaggerCSP.style`) if needed.
- **verify:**
  - Browser loads the map page without CSP violations for Leaflet assets or OSM tiles.
  - Admin screenshot images load without CSP violations when served from `MINIO_PUBLIC_ORIGIN`.
  - Response headers include `content-security-policy`, `x-content-type-options`, and `x-frame-options` (or Helmet equivalents).
- **done:**
  - CSP is enabled with minimal allowlists tied to deployment env.

### Task DOCKER-001: Backend Docker hardening
- **files:**
  - `backend/Dockerfile`
  - `infrastructure/docker-compose.yml`
- **action:**
  - Keep a multi-stage build.
  - Ensure runtime stage:
    - sets `NODE_ENV=production`
    - runs as a non-root user (use the `node` user or create a dedicated user)
    - copies only what is needed for runtime
  - Update compose if needed to align with the new runtime user/paths.
- **verify:**
  - Backend container starts successfully and listens on port 3000.
  - Container runs as a non-root UID.
- **done:**
  - Production image is hardened without breaking current compose topology.

### Task E2E-001: Add Playwright project under workspace-root `e2e/`
- **files:**
  - `e2e/package.json` (new)
  - `e2e/playwright.config.ts` (new)
- **action:**
  - Create an isolated Playwright test project under `e2e/`.
  - Provide scripts to run the suite locally.
  - Configure base URL (e.g., `E2E_BASE_URL` defaulting to `http://localhost:5173`).
  - Keep the suite self-contained and deterministic (use unique site slugs per run).
- **verify:**
  - `npm test` (or equivalent) inside `e2e/` discovers and runs tests.
- **done:**
  - A minimal E2E harness exists in the required location.

### Task E2E-002: Implement smoke flow (login → create site → list sites → logout)
- **files:**
  - `e2e/tests/smoke.spec.ts` (new)
- **action:**
  - Implement a single Playwright test that:
    1) logs in via UI,
    2) creates a site via UI,
    3) verifies site appears in list,
    4) logs out and verifies access requires auth.
  - Test must be runnable against a local dev server (backend + frontend running).
- **verify:**
  - Running the suite against local dev services passes consistently.
- **done:**
  - One runnable smoke suite exists and covers the required flow.

### Task CI-001: CI build caching + frontend build gate (+ optional E2E stub)
- **files:**
  - `.github/workflows/ci.yml`
- **action:**
  - Add a frontend build step/job (`npm run build` in `frontend/`).
  - Update docker build job to use BuildKit caching (e.g., `docker/setup-buildx-action` + `docker/build-push-action` with `cache-from/cache-to`).
  - Optionally add an E2E job stub that documents required services and uses Playwright on Ubuntu runners.
- **verify:**
  - CI pipeline includes frontend build and docker build uses caching directives.
- **done:**
  - CI gates include frontend build and docker builds are optimized; E2E runway exists.

## Verification (end-to-end)
- Backend:
  - All existing backend tests pass (121).
  - `/health` matches new JSON shape and behavior.
  - Rate limiting behaves correctly for auth/admin/protected route groups.
  - `/documentation` loads and shows tagged admin routes.
  - CSP headers are present and allow required origins.
- Frontend:
  - `frontend/npm run build` succeeds.
- E2E:
  - One Playwright suite in `e2e/` runs against a local dev server.
- Docker/CI:
  - Backend image is non-root and still works in `infrastructure/docker-compose.yml`.
  - CI updated per SC-5.10.

VALIDATION: PASS
