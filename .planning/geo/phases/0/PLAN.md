# Phase 0 — Foundation & Architecture Setup (Executable Plan)

**Goal:** Establish repo structure, local dev infrastructure, baseline backend/frontend projects, initial DB schema + migrations runner, CI pipeline, and MaxMind dataset documentation.

**Scope:** DEV-001 through DEV-009.

**Non-goals (Phase 0):** Implement IP allow/deny logic, GPS geofence enforcement, RBAC, screenshot workflows, production K8s manifests.

## Assumptions & constraints
- Runtime: Node.js 22.x LTS
- Backend: Fastify + TypeScript
- Frontend: React + TypeScript + Vite
- DB: PostgreSQL 16 + PostGIS
- Cache/queue: Redis 7
- Object storage: MinIO (S3-compatible)
- Migrations: SQL files executed in order, tracked in `schema_migrations`
- Planning artifacts live under `.planning/geo/` only; do **not** modify any existing `.planning/` governance content.

---

## Task: DEV-001 — Initialize Monorepo Structure
**Agent:** Coder
**Files:**
- `backend/.gitkeep` (optional)
- `backend/src/routes/.gitkeep`
- `backend/src/middleware/.gitkeep`
- `backend/src/services/.gitkeep`
- `backend/src/models/.gitkeep`
- `backend/src/utils/.gitkeep`
- `backend/src/jobs/.gitkeep`
- `frontend/.gitkeep`
- `workers/src/.gitkeep`
- `infrastructure/.gitkeep`

**Done when:**
- These directories exist:
  - `backend/src/routes/`
  - `backend/src/middleware/`
  - `backend/src/services/`
  - `backend/src/models/`
  - `backend/src/utils/`
  - `backend/src/jobs/`
  - `frontend/`
  - `workers/src/`
  - `infrastructure/`
- Empty directories are preserved via `.gitkeep` (or small placeholder README files).

### Subtasks
1. Create the directory tree exactly as specified.
2. Add `.gitkeep` files to any directories that would otherwise be empty at the end of Phase 0.
3. Ensure paths/casing are consistent (Windows + Linux friendly).

---

## Task: DEV-002 — Create Docker Compose Stack
**Agent:** Coder
**Files:**
- `infrastructure/docker-compose.yml`
- `infrastructure/docker-compose.dev.yml`

**docker-compose.yml must include these services (exact requirements):**
- **postgres**
  - image: `postgis/postgis:16-3.4`
  - ports: `5432:5432`
  - env:
    - `POSTGRES_DB=geofence`
    - `POSTGRES_USER=geofence`
    - `POSTGRES_PASSWORD=geofence_dev_pass`
  - volume: `postgres_data` mounted to `/var/lib/postgresql/data`
- **redis**
  - image: `redis:7-alpine`
  - ports: `6379:6379`
  - volume: `redis_data` mounted to `/data`
- **minio**
  - image: `minio/minio:latest`
  - ports: `9000:9000`, `9001:9001`
  - env:
    - `MINIO_ROOT_USER=minioadmin`
    - `MINIO_ROOT_PASSWORD=minioadmin`
  - command: `server /data --console-address ":9001"`
  - volume: `minio_data` mounted to `/data`
- **backend**
  - build context: `../backend`
  - port mapping: `3000:3000`
  - depends_on: `postgres`, `redis`
  - env_file: `../backend/.env`
- **worker**
  - build context: `../workers`
  - depends_on: `postgres`, `redis`, `minio`
  - env_file: `../workers/.env`

**docker-compose.dev.yml override requirements:**
- Add dev-friendly overrides (mount source code volumes for hot reload).
- Typical expectations:
  - mount `../backend:/app` and `../workers:/app` (or equivalent) so code changes reflect without image rebuild
  - keep `node_modules` handling sane (named volume or container-side install)
  - set development `command` such as `npm run dev` for backend/worker if those scripts exist in Phase 0

**Done when:**
- `docker compose -f infrastructure/docker-compose.yml config` would validate (syntactically correct, resolves paths).
- Services, ports, env, volumes, and depends_on match the spec above.

### Subtasks
1. Create `docker-compose.yml` with the 5 services and named volumes (`postgres_data`, `redis_data`, `minio_data`).
2. Create `docker-compose.dev.yml` that overrides backend/worker for bind-mount development.
3. Ensure relative paths are correct from `infrastructure/`.

---

## Task: DEV-003 — Setup backend project (Fastify + TypeScript)
**Agent:** Coder
**Files:**
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/.eslintrc.json`
- `backend/.prettierrc`
- `backend/src/app.ts`
- `backend/src/server.ts`
- `backend/src/routes/health.ts`
- `backend/.env.example`
- `backend/Dockerfile`

**Required content (must match these intents exactly):**
- `backend/package.json`
  - scripts: `dev`, `build`, `start`, `test`, `lint`, `migrate`
  - dependencies (at least):
    - `fastify`
    - `@fastify/jwt`, `@fastify/cors`, `@fastify/helmet`, `@fastify/swagger`, `@fastify/swagger-ui`, `@fastify/rate-limit`, `@fastify/cookie`
    - `pg`, `node-pg-migrate`
    - `maxmind`, `ipaddr.js`, `lru-cache`, `ioredis`, `node-cron`, `zod`
  - devDependencies (at least): `typescript`, `@types/node`, `tsx`, `vitest`, `@vitest/coverage-v8`, `eslint`, `prettier`
- `backend/tsconfig.json`
  - target: `ES2022`
  - module: `NodeNext`
  - strict: `true`
  - outDir: `dist`
- `backend/src/app.ts`
  - Export a Fastify app factory (e.g., `buildApp()`)
  - Register essential plugins (cors/helmet/jwt/cookie/rate-limit/swagger) and routes
  - Register `GET /health` from `src/routes/health.ts`
- `backend/src/server.ts`
  - Boot the server and listen on port `3000` (host `0.0.0.0` for container friendliness)
- `backend/src/routes/health.ts`
  - Health route returns JSON: `{ "status": "healthy" }`
- `backend/.env.example` must include keys:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `JWT_SECRET`
  - `MAXMIND_CITY_DB_PATH`
  - `MAXMIND_ANONYMOUSIP_DB_PATH`
  - `S3_ENDPOINT`
  - `S3_BUCKET`
  - `S3_ACCESS_KEY`
  - `S3_SECRET_KEY`
  - `NODE_ENV`
- `backend/Dockerfile`
  - Multi-stage build: builder stage compiles TypeScript; production stage runs compiled JS

**Done when:**
- Backend has a coherent TS project skeleton with a runnable health endpoint design.
- Env template exists and includes all required keys.
- Dockerfile is multi-stage and intended for production runtime.

### Subtasks
1. Create `package.json` with required scripts/deps/devDeps.
2. Create TS + lint/format configs.
3. Implement minimal Fastify app + server entrypoint + health route.
4. Add `.env.example` keys.
5. Add multi-stage Dockerfile.

---

## Task: DEV-004 — Setup frontend project (React + Vite + Tailwind)
**Agent:** Coder
**Files:**
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/tsconfig.json`
- `frontend/index.html`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`
- `frontend/Dockerfile`

**Required content (must match these intents exactly):**
- `frontend/package.json`
  - deps: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `axios`
  - devDeps: `vite`, `@vitejs/plugin-react`, `typescript`, `eslint`, `tailwindcss`, `autoprefixer`, `postcss`
- `frontend/vite.config.ts`
  - React plugin enabled
  - Dev proxy: requests to `/api` forward to `http://localhost:3000`
- `frontend/src/App.tsx`
  - Uses React Router
  - Renders “Hello World” with a styled heading (Tailwind styling is fine)
- `frontend/Dockerfile`
  - Nginx-based production image (commonly via multi-stage: build with node, serve with nginx)

**Done when:**
- Frontend skeleton exists with Vite config + React entrypoint + simple routed UI.
- Tailwind + PostCSS configs exist.
- Dockerfile is intended for production static serving.

### Subtasks
1. Create package manifests/configs.
2. Create minimal React app with router + styled “Hello World”.
3. Configure Tailwind/PostCSS.
4. Add Nginx-based Dockerfile.

---

## Task: DEV-005 — Create core database schema (migration 001)
**Agent:** Coder
**Files:**
- `backend/migrations/001_create_sites.sql`

**Required content (authoritative schema to implement in this repo):**
Create extensions + `sites` table designed for multi-site + geofence configuration.

Minimum SQL requirements:
1. Ensure required extensions exist:
   - `CREATE EXTENSION IF NOT EXISTS postgis;`
   - `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (for UUID generation if desired)
2. Create `sites` table (recommended baseline):
   - `id UUID PRIMARY KEY` (default `gen_random_uuid()`)
   - `name TEXT NOT NULL`
   - `slug TEXT NOT NULL UNIQUE`
   - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
   - Geofence baseline (GEOGRAPHY columns as requested):
     - `center GEOGRAPHY(POINT, 4326) NULL`
     - `radius_m INTEGER NULL` with a check constraint `radius_m > 0`
   - Auditing:
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
3. Add indexes:
   - Unique index on `slug` (or constraint)
   - GIST index for geospatial queries:
     - `CREATE INDEX sites_center_gix ON sites USING GIST (center);`

**Done when:**
- `001_create_sites.sql` runs cleanly on PostGIS-enabled Postgres.
- `sites` exists with geography columns and appropriate indexes.

### Subtasks
1. Write migration SQL with extensions + table + constraints.
2. Include GIST index for geography column(s).

---

## Task: DEV-006 — Create access_logs table with partitioning (migration 002)
**Agent:** Coder
**Files:**
- `backend/migrations/002_create_access_logs.sql`

**Required content (authoritative schema to implement in this repo):**
Create a partitioned `access_logs` table to support high-volume logging.

Minimum SQL requirements:
1. Create a partitioned parent table `access_logs` partitioned by time:
   - Use `PARTITION BY RANGE (ts)`
2. Recommended baseline columns:
   - `id BIGSERIAL` (or generated identity) plus `ts TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE`
   - `request_id UUID NULL`
   - `ip INET NOT NULL`
   - `method TEXT NOT NULL`
   - `path TEXT NOT NULL`
   - `status_code INTEGER NULL`
   - `decision TEXT NOT NULL` (e.g., `allow|deny|challenge`) with a CHECK constraint
   - `deny_reason TEXT NULL`
   - `user_agent TEXT NULL`
   - GPS capture (future-proof for Phase 2):
     - `gps_point GEOGRAPHY(POINT, 4326) NULL`
3. Create the **first partition**.
   - Use a fixed, explicit range (choose current month based on plan date):
     - `access_logs_2026_02` for `[2026-02-01, 2026-03-01)`
4. Add indexes (on parent so they propagate where appropriate):
   - `(site_id, ts)`
   - `(ip, ts)`
   - `decision`
   - GIST index on `gps_point` (optional now but recommended)

**Done when:**
- `002_create_access_logs.sql` runs after migration 001.
- `access_logs` is partitioned and the first partition exists.

### Subtasks
1. Create partitioned parent table.
2. Create first monthly partition for 2026-02.
3. Add practical indexes.

---

## Task: DEV-007 — Setup database migration system
**Agent:** Coder
**Files:**
- `backend/src/db/pool.ts`
- `backend/src/db/migrate.ts`

**Required behavior:**
- `pool.ts` exports a singleton `pg.Pool` configured via `DATABASE_URL`.
- `migrate.ts` implements a simple SQL migration runner:
  - Locates SQL files in `backend/migrations/`
  - Sorts them in ascending order (lexicographic works with `001_...`, `002_...`)
  - Ensures a `schema_migrations` table exists, e.g.:
    - `filename TEXT PRIMARY KEY`
    - `applied_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - Applies any migration whose filename is not recorded
  - Uses a transaction per migration (recommended) or a safe alternative documented in code
- `npm run migrate` (from DEV-003 scripts) should execute this runner.

**Done when:**
- Migration runner design exists and can be invoked via the planned npm script.
- Applied migrations are tracked idempotently.

### Subtasks
1. Create `pool.ts` with `pg` pool singleton.
2. Create `migrate.ts` that discovers and applies migrations with tracking.
3. Ensure errors are surfaced clearly (non-zero exit).

---

## Task: DEV-008 — Setup GitHub Actions CI/CD
**Agent:** Coder
**Files:**
- `.github/workflows/ci.yml`

**Workflow requirements:**
- Trigger: on push and pull_request to `main`
- Runs on: `ubuntu-latest`
- Use services:
  - postgres (with env matching dev defaults; ensure PostGIS-capable image if needed)
  - redis
- Jobs (minimum):
  1. **lint**: run `npm run lint`
  2. **test**: run `npm run test` with coverage
  3. **build**: run `docker build` (at minimum build backend and frontend images)

**Recommended structure (implementation choice):**
- Separate jobs per package (backend/frontend), each with `working-directory`.
- Use `actions/setup-node` with Node 22.
- Use `npm ci` before running scripts.

**Done when:**
- CI workflow exists and logically covers lint/test/build for the repo.
- Postgres and Redis services are declared for jobs that need them.

### Subtasks
1. Create workflow with triggers and three jobs.
2. Add postgres/redis services.
3. Ensure each job runs the correct package scripts.

---

## Task: DEV-009 — Document MaxMind GeoLite2 download process
**Agent:** Coder
**Files:**
- `backend/data/maxmind/.gitkeep`
- `backend/data/maxmind/README.md`
- `README.md`

**Required content:**
- `backend/data/maxmind/README.md` must explain:
  1. Sign up / log in at https://www.maxmind.com/
  2. Download databases:
     - `GeoLite2-City.mmdb`
     - `GeoIP2-Anonymous-IP.mmdb`
  3. Place the files in `backend/data/maxmind/`
  4. Set env vars in backend:
     - `MAXMIND_CITY_DB_PATH`
     - `MAXMIND_ANONYMOUSIP_DB_PATH`
- Root `README.md` must include:
  - Project overview (geo-fenced multi-site webserver)
  - Local setup steps (high level) referencing Docker Compose
  - Architecture summary (backend/frontend/workers + Postgres/Redis/MinIO)
  - A link to `DEPLOYMENT.md` (even if `DEPLOYMENT.md` is to be created in a later phase)

**Done when:**
- Placeholder directory exists and is committed.
- Clear human instructions exist for obtaining and placing MaxMind databases.
- Root README exists with overview + setup + architecture + link.

### Subtasks
1. Create `.gitkeep` in `backend/data/maxmind/`.
2. Write MaxMind download + placement instructions.
3. Write root README with overview and setup guidance.

---

## Verification (Phase 0)
After completing DEV-001…DEV-009, the following should be true:
- Repo contains the monorepo directories + infrastructure compose files.
- Backend and frontend skeleton projects exist with required config files.
- Migrations exist and a migration runner is in place.
- CI workflow exists for lint/test/build.
- MaxMind documentation exists and points to the env vars used by the backend.
