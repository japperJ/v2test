---
phase: 1
plan: 1
type: implement
wave: 1
depends_on: [".planning/geo/phases/0/SUMMARY.md", ".planning/geo/phases/1/RESEARCH.md"]
autonomous: true
must_haves:
  observable_truths:
    - "Admin can create, list, edit, and delete Sites via /api/admin/sites with validated payloads and parameterized SQL."
    - "Requests can be allowed/denied based on resolved client IP (proxy-safe), per-site allow/deny lists, country filters, and VPN/proxy flags."
    - "Every access decision writes an access_logs row with anonymized IP (IPv4 /24, IPv6 /48) and optional GeoIP fields."
    - "React admin UI can manage Sites and view Access Logs using TanStack Query v5 (object signatures)."
    - "Backend unit+integration tests run in CI and enforce >= 80% coverage thresholds."
  constraints:
    - "All SQL must use parameterized queries ($1, $2, …); no string interpolation."
    - "Zod schemas exist for request payload validation and for model parsing."
    - "MaxMind service is a singleton with an LRU cache (max 10k, TTL 5 min)."
    - "Access token must NOT be stored in localStorage (if/when auth is added; Phase 1 should not introduce localStorage token usage)."
    - "React Query v5 API only (useQuery/useMutation with object options)."
---

# Phase 1 — MVP: IP-Based Access Control (Executable Task Plan)

This plan implements the Phase 1 MVP described in `.planning/geo/phases/1/RESEARCH.md`, building on the Phase 0 foundation.

## Global implementation rules (apply to all MVP tasks)

1. **SQL safety:** all DB access uses parameterized queries (`$1`, `$2`, …). Never build SQL via string concatenation of user input.
2. **Validation:**
   - **Zod** schemas must exist for all Site and AccessLog payloads.
   - **Fastify JSON Schemas** must be provided for request params/body/query and for responses on all admin endpoints.
3. **Proxy-safe IP:** do not parse `x-forwarded-for` manually. Use Fastify `trustProxy` and `request.ip`.
4. **MaxMind singleton:** open MMDB readers once; add an LRU cache (10k entries, TTL 5 minutes).
5. **IP anonymization:**
   - IPv4: zero last octet (e.g. `203.0.113.42` → `203.0.113.0`).
   - IPv6: zero last **80 bits** (keep first 48 bits; e.g. `2001:db8:85a3:1234:...` → `2001:db8:85a3::`).
6. **React Query v5:** `useQuery({ queryKey, queryFn })` and `useMutation({ mutationFn, onSuccess })` (object-only).
7. **Auth storage constraint:** Phase 1 should not introduce any localStorage token persistence. If API auth is added later, prefer httpOnly cookies or in-memory token.

## API surface (Phase 1)

### Admin API
- `POST   /api/admin/sites`
- `GET    /api/admin/sites`
- `GET    /api/admin/sites/:id`
- `PATCH  /api/admin/sites/:id`
- `DELETE /api/admin/sites/:id`

- `GET    /api/admin/access-logs` (query/filter + pagination)

### Protected route (non-admin, for demonstrable access control)
- `GET    /api/protected/ping`

### Access-control hook
- Add site-resolution + IP access control as Fastify hooks, **skipping** admin endpoints and `/health`.

## Data model anchors (from Phase 0 migrations)

### `sites` columns to model
From `backend/migrations/001_create_sites.sql`:
- `id uuid`
- `slug varchar(100)`
- `hostname varchar(255)`
- `name varchar(255)`
- `access_mode varchar(20)` default `disabled`
- `ip_allowlist inet[]`, `ip_denylist inet[]`
- `country_allowlist varchar(2)[]`, `country_denylist varchar(2)[]`
- `block_vpn_proxy boolean` default true
- `geofence_type varchar(20)`
- `geofence_polygon geography(polygon,4326)`
- `geofence_center geography(point,4326)`
- `geofence_radius_km numeric(10,2)`
- `enabled boolean` default true
- `request_count bigint` default 0
- `created_at timestamptz`, `updated_at timestamptz`

### `access_logs` columns to model
From `backend/migrations/002_create_access_logs.sql`:
- `id uuid`, `site_id uuid`, `timestamp timestamptz`
- `ip_address inet` (must be anonymized)
- `user_agent text`, `url text`
- `allowed boolean`, `reason varchar(100)`
- GeoIP: `ip_country`, `ip_city`, `ip_lat`, `ip_lng`
- GPS (Phase 2+): `gps_lat`, `gps_lng`, `gps_accuracy`
- `screenshot_url text`

> Note (risk): `sites.id` default uses `gen_random_uuid()`. If your Postgres image does not expose that function by default, add a **new** migration (Phase 1) to enable `pgcrypto`:
> `CREATE EXTENSION IF NOT EXISTS pgcrypto;`

---

## MVP-001 — Site Model and Service Layer

**Files to create/modify:**
- `backend/src/models/Site.ts`
- `backend/src/services/SiteService.ts`

**Done when:**
- Site type is defined with **all fields from the DB schema** (including geofence columns, even if Phase 1 UI doesn’t edit them).
- Zod schemas exist for:
  - DB row parsing (`SiteDbSchema`)
  - Create payload (`SiteCreateSchema`)
  - Patch payload (`SitePatchSchema`)
- CRUD methods use **parameterized queries** (`$1`, `$2`, …) and never interpolate user input.
- Service supports site lookup by hostname for middleware.

**Key implementation details:**

### 1) Types and Zod schemas (`backend/src/models/Site.ts`)
Define these exports (names are important for downstream usage):

- `export const AccessModeSchema = z.enum(['disabled', 'enforce']);`
  - Keep values minimal for Phase 1.
  - Interpretation: `disabled` = do not enforce IP rules; `enforce` = apply allow/deny logic.

- `export type AccessMode = z.infer<typeof AccessModeSchema>`

- `export type Site = {
    id: string;
    slug: string;
    hostname: string | null;
    name: string;
    accessMode: AccessMode;
    ipAllowlist: string[] | null;
    ipDenylist: string[] | null;
    countryAllowlist: string[] | null;
    countryDenylist: string[] | null;
    blockVpnProxy: boolean;
    geofenceType: string | null;
    geofencePolygonWkt: string | null;
    geofenceCenterWkt: string | null;
    geofenceRadiusKm: string | null; // keep as string to preserve NUMERIC without float issues
    enabled: boolean;
    requestCount: string; // BIGINT can exceed JS safe int; represent as string
    createdAt: string; // ISO
    updatedAt: string; // ISO
  }`

- Zod schemas:
  - `SiteDbSchema`: parses DB row shape coming from `pg`. Guidance:
    - Arrays: treat `inet[]` and `varchar[]` as `z.array(z.string()).nullable()`.
    - Timestamps: coerce `Date` or `string` to ISO string.
    - `request_count` may come back as string; accept `z.union([z.string(), z.number()])` and normalize to string.
  - `SiteCreateSchema`:
    - Required: `slug`, `name`
    - Optional: `hostname`, `accessMode`, lists, `blockVpnProxy`, `enabled`
    - Validate `slug` constraints: `^[a-z0-9-]{1,100}$` (document this; keep server authoritative)
    - Country codes: uppercase 2-letter ISO-3166 (regex `^[A-Z]{2}$`)
  - `SitePatchSchema`:
    - All fields optional (partial update)

> CIDR/IP validation in backend should be strict using `ipaddr.js` at parse-time (see MVP-007). At the model layer, accept strings and validate format in service/middleware.

### 2) DB service (`backend/src/services/SiteService.ts`)
Export a class:

- `export class SiteService { ... }`

Constructor and dependencies:
- `constructor(private readonly db = pool) {}` where `pool` is imported from `../db/pool.js`.

Public methods (exact signatures):
- `async createSite(input: z.infer<typeof SiteCreateSchema>): Promise<Site>`
- `async listSites(): Promise<Site[]>`
- `async getSiteById(id: string): Promise<Site | null>`
- `async getSiteByHostname(hostname: string): Promise<Site | null>`
- `async updateSite(id: string, patch: z.infer<typeof SitePatchSchema>): Promise<Site | null>`
- `async deleteSite(id: string): Promise<boolean>`

SQL patterns:
- Always parameterize.
- For arrays that must be typed, cast in SQL:
  - `$n::inet[]`, `$n::varchar(2)[]`
- For geography reads, **do not** return raw geography objects. Use `ST_AsText(...)`:
  - `ST_AsText(geofence_polygon) AS geofence_polygon_wkt`
  - `ST_AsText(geofence_center) AS geofence_center_wkt`

Field mapping conventions (keep consistent across codebase):
- DB snake_case → API camelCase.
- `access_mode` ↔ `accessMode`
- `ip_allowlist` ↔ `ipAllowlist`

Update strategy:
- Use a whitelist of patchable columns.
- Build a dynamic SET clause **safely** by constructing arrays of columns + values; column names must come from a fixed map (not from user input).

---

## MVP-002 — Site CRUD API routes

**Files to create/modify:**
- `backend/src/routes/sites.ts`

**Done when:**
- Routes exist and respond with stable JSON payloads.
- All endpoints validate params/body/query (Fastify JSON schema + Zod parsing).
- Errors are consistent:
  - `400` for validation errors
  - `404` when site not found

**Key implementation details:**

### Route registration
Export:
- `export async function sitesRoutes(app: FastifyInstance) { ... }`

Route paths (when registered with prefix `/api/admin`):
- `POST   /sites`
- `GET    /sites`
- `GET    /sites/:id`
- `PATCH  /sites/:id`
- `DELETE /sites/:id`

### Request/response shapes
Standardize the JSON:
- Create/Read/Update response: `{ site: Site }`
- List response: `{ sites: Site[] }`
- Delete response: `204 No Content`

### Handler wiring
- Instantiate `const siteService = new SiteService();` once per plugin registration.
- Use Zod at the start of each handler:
  - `const body = SiteCreateSchema.parse(request.body)`
  - `const params = z.object({ id: z.string().uuid() }).parse(request.params)`

---

## MVP-003 — Fastify schema validation

**Files to create/modify:**
- `backend/src/routes/sites.ts`

**Done when:**
- Every route has a `schema` with:
  - `params` schema where applicable
  - `body` schema where applicable
  - `querystring` schema where applicable
  - `response` schema for 200/201/204
- API rejects invalid inputs with `400`, including:
  - invalid `hostname` format (scheme, path, spaces, or invalid label characters)
  - invalid IP/CIDR entries in `ipAllowlist` / `ipDenylist`

**Key implementation details:**

Because we are not introducing a Zod→JSON-schema generator dependency in Phase 1, define JSON schemas explicitly.

Define reusable JSON-schema constants in `sites.ts`:
- `SiteJsonSchema` (response shape)
- `SiteCreateBodyJsonSchema`
- `SitePatchBodyJsonSchema`
- `SiteIdParamsJsonSchema`

Important JSON-schema details:
- Use `type: 'array', items: { type: 'string' }` for IP lists and country lists.
- Countries must be `minLength: 2, maxLength: 2` and pattern `^[A-Z]{2}$`.
- Ensure `additionalProperties: false` on request bodies.

Validation note:
- JSON-schema can only do basic structural checks for hostnames and IP strings; the backend must still do authoritative validation (e.g., `ipaddr.js` parsing for IP/CIDR) and return `400` on invalid entries.

---

## MVP-004 — Unit tests for Site service (coverage gate)

**Files to create/modify:**
- `backend/src/services/__tests__/SiteService.test.ts`
- `backend/src/routes/__tests__/sites.validation.test.ts`
- `backend/vitest.config.ts`
- (recommended helper) `backend/src/test/db.ts`

**Done when:**
- `npm run test:coverage` enforces coverage thresholds **>= 80%** for:
  - lines
  - functions
  - statements
  - branches
- SiteService CRUD is covered with both success and failure paths.
- Route-level validation tests exist and pass, including `400` for:
  - invalid hostname format
  - invalid IP/CIDR entries in `ipAllowlist` / `ipDenylist`
- Tests are stable in CI (GitHub Actions) using the provided `DATABASE_URL`.

**Key implementation details:**

### Vitest config (`backend/vitest.config.ts`)
Create a config that:
- Sets `test.environment = 'node'`.
- Enables coverage provider `v8`.
- Enforces thresholds:
  - `coverage.thresholds.lines = 80`
  - `coverage.thresholds.functions = 80`
  - `coverage.thresholds.statements = 80`
  - `coverage.thresholds.branches = 80`
- Excludes non-code paths as needed (e.g. `dist/**`).

### DB setup for tests
CI does **not** run migrations automatically. Tests must ensure schema exists.

Implement `backend/src/test/db.ts` with utilities:
- `async ensureSchema(): Promise<void>`
  - Reads and executes migration SQL files from `backend/migrations/` in sorted order (mirroring `src/db/migrate.ts`), **without** calling `pool.end()`.
- `async resetDb(): Promise<void>`
  - `TRUNCATE access_logs_2026_02, access_logs_2026_03, access_logs RESTART IDENTITY CASCADE` (or just `TRUNCATE access_logs RESTART IDENTITY CASCADE` depending on Postgres behavior with partitions)
  - `TRUNCATE sites RESTART IDENTITY CASCADE`

Test patterns:
- `beforeAll(ensureSchema)`
- `beforeEach(resetDb)`
- `afterAll(async () => pool.end())`

SiteService test cases (minimum):
- Create site with minimal payload.
- Reject duplicate slug / hostname (expect error; verify service surfaces a useful error message).
- List sites returns created.
- Update site partial patch.
- Delete site returns true then get returns null.

Route validation test cases (minimum) in `sites.validation.test.ts`:
- `POST /api/admin/sites` returns `400` for invalid `hostname` (e.g. includes `http://` or `/path` or spaces).
- `POST /api/admin/sites` returns `400` for invalid IP/CIDR values in lists (e.g. `999.1.1.1`, `10.0.0.0/99`, malformed IPv6).
- `PATCH /api/admin/sites/:id` returns `400` for invalid list entries as well.

---

## MVP-004A — Enforce backend coverage gate in CI

**Files to create/modify:**
- `.github/workflows/ci.yml`

**Depends on:** MVP-004

**Done when:**
- The GitHub Actions backend test job runs `npm run test:coverage` (not `npm run test`).
- CI fails when coverage drops below 80% (via vitest thresholds).

**Key implementation details:**
- Update the workflow’s backend test step(s) in the test-backend job to invoke the coverage script.
- Ensure the job runs in the `backend/` working directory (consistent with existing workflow patterns).

---

## MVP-005 — MaxMind GeoIP service (singleton, LRU cache)

**Files to create/modify:**
- `backend/src/services/GeoIPService.ts`

**Done when:**
- `GeoIPService` opens MMDB readers once and reuses them.
- Lookups are cached in an LRU cache with:
  - max 10,000 entries
  - TTL 5 minutes
- Missing/sparse fields from MaxMind responses do not crash.

**Key implementation details:**

### Interface
Export these:

- `export type GeoIPResult = {
    countryIso2: string | null;
    cityName: string | null;
    latitude: number | null;
    longitude: number | null;
    isAnonymous: boolean;
    isAnonymousVpn: boolean;
    isHostingProvider: boolean;
    isPublicProxy: boolean;
    isResidentialProxy: boolean;
    isTorExitNode: boolean;
  }`

- `export class GeoIPService {
    static async getInstance(): Promise<GeoIPService>;
    async lookup(ip: string): Promise<GeoIPResult>;
  }`

### Implementation guidance
- Use `maxmind.open()` with env paths:
  - `process.env.MAXMIND_CITY_DB_PATH`
  - `process.env.MAXMIND_ANONYMOUSIP_DB_PATH`
- Cache key: normalized IP string (use `ipaddr.process(ip).toString()`; see MVP-006).
- Treat “present only when true” flags as `!!resp?.is_anonymous_vpn` etc.
- If either DB fails to open, degrade gracefully:
  - City missing → `countryIso2/cityName/lat/lng = null`
  - AnonymousIP missing → all boolean flags false **and** expose an internal `sourceStatus` log warning once at startup (do not spam per request)

LRU implementation:
- `import { LRUCache } from 'lru-cache'`
- `new LRUCache<string, GeoIPResult>({ max: 10_000, ttl: 5 * 60 * 1000 })`

---

## MVP-006 — IP extraction utility

**Files to create/modify:**
- `backend/src/utils/getClientIP.ts`

**Done when:**
- Utility returns the normalized, canonical client IP used for both:
  - access decisions
  - GeoIP lookup
  - logging
- Does not manually parse `x-forwarded-for`.

**Key implementation details:**

Export:
- `export function getClientIP(request: FastifyRequest): string | null`

Rules:
- Use `request.ip`.
- Normalize using `ipaddr.process()` to collapse IPv4-mapped IPv6 into IPv4.
- Return `.toString()`.
- If invalid/empty, return `null`.

---

## MVP-007 — IP access control middleware

**Files to create/modify:**
- `backend/src/middleware/ipAccessControl.ts`

**Done when:**
- Middleware can decide allow/deny based on:
  - site.enabled
  - site.accessMode
  - ip allowlist/denylist (CIDR-aware)
  - country allowlist/denylist
  - block VPN/proxy based on MaxMind Anonymous IP DB
- Decision includes a stable `reason` string for logging.

**Key implementation details:**

### Request context contract
This middleware needs a resolved Site.

In `app.ts` (MVP-008) you will decorate the request:
- `request.site: Site | null`

### Exported API
Export one of these patterns (choose one and keep consistent):

**Preferred (plugin):**
- `export async function ipAccessControlPlugin(app: FastifyInstance) { ... }`
  - Registers a `preHandler` hook.

**Alternative (hook function):**
- `export async function ipAccessControlHook(request: FastifyRequest, reply: FastifyReply) { ... }`

### Rule parsing
- Use `ipaddr.js` for CIDR matching:
  - `const addr = ipaddr.process(clientIp)`
  - For each CIDR string `c`, parse once with `ipaddr.parseCIDR(c)` and match `addr.match(parsed)`.
- Maintain an internal parsed-rule cache:
  - `LRUCache<string, ParsedRules>` where key includes `site.id` + `site.updatedAt`.

### Decision algorithm (exact order)
1. If `request.site` is null → `allowed=false`, `reason='site_not_resolved'`.
2. If `site.enabled === false` → deny `reason='site_disabled'`.
3. Extract `clientIp` via `getClientIP()`; if null → deny `reason='ip_missing'`.
4. If `site.accessMode === 'disabled'` → allow `reason='access_mode_disabled'`.
5. If `ipDenylist` has a match → deny `reason='ip_denylist'`.
6. If `ipAllowlist` is non-empty AND no match → deny `reason='ip_not_allowlisted'`.
7. Lookup GeoIP via `GeoIPService.lookup(clientIp)`.
8. If `countryDenylist` contains `countryIso2` → deny `reason='country_blocked'`.
9. If `countryAllowlist` non-empty AND `countryIso2` not included → deny `reason='country_blocked'`.
10. If `site.blockVpnProxy` and any of these is true:
    - `isAnonymousVpn`, `isPublicProxy`, `isResidentialProxy`, `isTorExitNode`, `isHostingProvider`, `isAnonymous`
  → deny `reason='vpn_proxy_detected'`.
11. Otherwise allow `reason='ok'`.

The middleware must attach the computed decision to the request for logging (MVP-010):
- decorate request with `request.accessDecision = { allowed: boolean; reason: string; clientIp: string; geo: GeoIPResult }`

---

## MVP-011 — IP anonymization utility

**Files to create/modify:**
- `backend/src/utils/anonymizeIP.ts`

**Done when:**
- IPv4 anonymization zeroes last octet.
- IPv6 anonymization zeroes last 80 bits.
- Function is pure and safe on invalid input (throws a controlled error or returns null; pick one and document).

**Key implementation details:**

Export:
- `export function anonymizeIP(ip: string): string`

Implementation approach using `ipaddr.js`:
- `const addr = ipaddr.process(ip)`
- If IPv4:
  - `const o = addr.octets; o[3] = 0; return o.join('.')`
- If IPv6:
  - `const parts = addr.parts;` (8 x 16-bit)
  - zero indices 3..7
  - return `new ipaddr.IPv6(parts).toNormalizedString()`

---

## MVP-010 — AccessLog service

**Files to create/modify:**
- `backend/src/services/AccessLogService.ts`

**Depends on:** MVP-011

**Done when:**
- `AccessLogService` inserts access_logs rows with anonymized IP.
- Query method supports filtering and pagination.
- All SQL uses parameterized queries.

**Key implementation details:**

Exports:
- `export type AccessLog = {
    id: string;
    siteId: string;
    timestamp: string;
    ipAddress: string; // anonymized
    userAgent: string | null;
    url: string | null;
    allowed: boolean;
    reason: string | null;
    ipCountry: string | null;
    ipCity: string | null;
    ipLat: number | null;
    ipLng: number | null;
  }`

- `export class AccessLogService {
    async logDecision(input: {
      siteId: string;
      clientIp: string;
      allowed: boolean;
      reason: string;
      url: string | null;
      userAgent: string | null;
      geo: GeoIPResult;
    }): Promise<void>;

    async list(input: {
      siteId?: string;
      from?: string; // ISO
      to?: string;   // ISO
      allowed?: boolean;
      limit: number;
      offset: number;
    }): Promise<{ rows: AccessLog[]; total: number }>;
  }`

Implementation notes:
- Call `anonymizeIP(clientIp)` before insert.
- Insert statement must cast anonymized IP to `inet` safely: `($n)::inet`.
- `list()` should build WHERE conditions from a fixed set of optional filters.

---

## MVP-008 — Register middleware in app.ts

**Files to create/modify:**
- `backend/src/app.ts`

**Depends on:** MVP-001, MVP-002, MVP-007, MVP-010

**Done when:**
- Admin routes are registered:
  - sites CRUD
  - access logs query
- Site resolution + access control hooks are registered in correct order.
- After an access decision is computed, the decision is logged via `AccessLogService.logDecision(...)`.
- Hooks do **not** block `/health` and `/api/admin/*`.

**Key implementation details:**

### 1) Route registration
Add registrations:
- `app.register(sitesRoutes, { prefix: '/api/admin' })`
- `app.register(accessLogsRoutes, { prefix: '/api/admin' })`

### 2) Request decorations (TypeScript module augmentation)
Create a shared declaration file or place module augmentation in `app.ts` (acceptable for Phase 1):
- Extend `FastifyRequest` with:
  - `site?: Site | null`
  - `accessDecision?: { allowed: boolean; reason: string; clientIp: string; geo: GeoIPResult }`

### 3) Site resolution hook
Add an `onRequest` hook that:
- Skips when `request.url` starts with `/api/admin` or equals `/health`.
- Resolves hostname:
  - Prefer `request.hostname` (Fastify handles proxy headers correctly when `trustProxy` is configured).
  - Normalize by stripping port (defensive).
- Loads Site via `SiteService.getSiteByHostname(hostname)`.
- Assigns `request.site`.

### 4) Access control + logging hook ordering
- Site resolution must run **before** ip access control.
- After access control decision is computed, call `AccessLogService.logDecision(...)` using `request.accessDecision`.

---

## MVP-008A — Protected route to demonstrate allow/deny behavior

**Files to create/modify:**
- `backend/src/routes/protected.ts`
- `backend/src/app.ts`

**Depends on:** MVP-008

**Done when:**
- A non-admin route exists: `GET /api/protected/ping`.
- When allowed, it returns `200` with JSON: `{ "status": "ok", "site": "<slug>" }`.
- When blocked by IP/country/VPN logic, it returns `403`.

**Key implementation details:**
- Route must run through the site resolution + IP access control hooks (so it should not be registered under `/api/admin`).
- Keep payload minimal and stable; the route is primarily for manual verification of Phase 1 SC-1.2 / SC-1.3.

---

## MVP-009 — Integration tests for IP access control

**Files to create/modify:**
- `backend/src/middleware/__tests__/ipAccessControl.test.ts`
- (may reuse) `backend/src/test/db.ts`

**Depends on:** MVP-008A

**Done when:**
- Tests cover allow/deny outcomes for:
  - denylist hit
  - allowlist miss
  - country-based deny (denylist hit and/or allowlist miss)
  - VPN/proxy deny
  - access_mode disabled allows
- Tests verify that access logs record the exact reason strings:
  - country denies use `reason = "country_blocked"`
  - VPN/proxy denies use `reason = "vpn_proxy_detected"`
- Tests use Fastify `inject()` with `buildApp()` and call `app.close()`.

**Key implementation details:**

Test harness:
- Set `process.env.TRUST_PROXY` explicitly per test scenario.
- Create a Fastify app via `buildApp()`.
- Use the real `GET /api/protected/ping` route (MVP-008A) to exercise the full pipeline.
- Ensure site resolution + middleware + logging are active.

Inject patterns:
- Set hostname via header: `host: 'example.com'`.
- Set client IP using inject’s `remoteAddress` when possible.
- When `trustProxy` is enabled, also include `x-forwarded-for` to validate correct selection.

Assertions:
- For deny cases, assert `403`.
- Query the DB (or `AccessLogService.list`) after the request and assert the last row’s `reason` matches the expected string.

MaxMind in tests:
- Mock `GeoIPService.getInstance()` / `lookup()` to return deterministic `GeoIPResult` (do not require MMDB files in CI tests).

---

## MVP-012 — Log query API

**Files to create/modify:**
- `backend/src/routes/accessLogs.ts`

**Done when:**
- `GET /api/admin/access-logs` returns filtered/paginated logs.
- Fastify JSON schema validates query params.

**Key implementation details:**

Export:
- `export async function accessLogsRoutes(app: FastifyInstance) { ... }`

Endpoint:
- `GET /access-logs`

Query params (all optional unless noted):
- `siteId?: string (uuid)`
- `from?: string (ISO timestamp)`
- `to?: string (ISO timestamp)`
- `allowed?: 'true'|'false'` (parse to boolean)
- `limit?: number` (default 50, max 200)
- `offset?: number` (default 0)

Response:
- `{ total: number; rows: AccessLog[] }`

---

## MVP-013 — Log retention job placeholder

**Files to create/modify:**
- `backend/src/jobs/logRetention.ts`

**Done when:**
- File exists with a clearly documented placeholder job function.
- No-op by default; does not crash startup.

**Key implementation details:**

Export either:
- `export async function runLogRetention(): Promise<void>`

Or a registration helper:
- `export function registerLogRetentionJob(): void`

Document intended future behavior:
- Drop old partitions by month.
- Vacuum/analyze.
- Configurable retention days.

---

## MVP-014 — Admin UI layout

**Files to create/modify:**
- `frontend/src/components/Layout.tsx`

**Done when:**
- Layout renders a top nav and a left sidebar with links:
  - Sites
  - Access Logs
- Uses Tailwind and provides an `<Outlet />` for nested routes.

**Key implementation details:**
- Use `NavLink` from `react-router-dom` for active styling.
- Keep layout responsive (sidebar collapses on small screens is optional).

---

## MVP-015 — Site List page

**Files to create/modify:**
- `frontend/src/pages/SiteList.tsx`

**Done when:**
- Page lists sites from `GET /api/admin/sites`.
- Provides a “New Site” button and link to edit existing sites.
- Provides a **Delete** button per site row that:
  - shows a confirmation dialog
  - calls `DELETE /api/admin/sites/:id`
  - invalidates the `['sites']` query so the list refreshes

**Key implementation details:**
- Use React Query v5:
  - `useQuery({ queryKey: ['sites'], queryFn: api.listSites })`
- Display: name, slug, hostname, enabled, accessMode.

---

## MVP-016 — Site Editor page

**Files to create/modify:**
- `frontend/src/pages/SiteEditor.tsx`

**Done when:**
- Page supports:
  - create new site
  - edit existing site
- Validates IP/CIDR lists client-side (best-effort) and shows inline errors.

**Key implementation details:**
- Route param: `:id` for editing; a separate path `/sites/new` for create.
- Use React Query:
  - `useQuery({ queryKey: ['sites', id], queryFn: ... })` for load
  - `useMutation({ mutationFn: api.createSite, onSuccess: invalidate ['sites'] })`
  - `useMutation({ mutationFn: api.updateSite, onSuccess: invalidate ['sites', id] and ['sites'] })`

---

## MVP-017 — IP list validation utility

**Files to create/modify:**
- `frontend/src/utils/validateIP.ts`

**Done when:**
- Utility validates a textarea input containing newline/comma-separated IPs/CIDRs.
- Returns structured errors without throwing.

**Key implementation details:**

Export:
- `export function validateIpList(text: string): { values: string[]; errors: string[] }`

Validation rules (frontend = best-effort; backend is authoritative):
- Accept IPv4 `A.B.C.D` (0–255), optional `/mask` (0–32).
- Accept IPv6 containing `:` with optional `/mask` (0–128) (basic structural check; do not attempt full RFC correctness without a library).
- Trim, drop empty, de-duplicate.

---

## MVP-018 — API client setup

**Files to create/modify:**
- `frontend/src/lib/api.ts`

**Done when:**
- Axios instance is configured for `/api`.
- Typed functions exist for all admin endpoints used by the UI.
- No access token is stored in localStorage.

**Key implementation details:**
- Create axios instance with:
  - `baseURL: '/api'`
  - `withCredentials: true` (future-proof for cookie auth)
- Export typed functions:
  - `listSites()`
  - `getSite(id)`
  - `createSite(payload)`
  - `updateSite(id, patch)`
  - `deleteSite(id)`
  - `listAccessLogs(params)`

Types can mirror backend response envelopes.

---

## MVP-019 — Access Logs page

**Files to create/modify:**
- `frontend/src/pages/AccessLogs.tsx`

**Done when:**
- Page displays access logs with:
  - filters (siteId, allowed)
  - pagination (limit/offset)
- Data is fetched via React Query v5.

**Key implementation details:**
- Use query key composition:
  - `['accessLogs', { siteId, allowed, limit, offset }]`
- Keep UI resilient when `ipCountry/ipCity` are null.

---

## MVP-020 — Log detail modal

**Files to create/modify:**
- `frontend/src/components/LogDetailModal.tsx`

**Done when:**
- Modal opens from AccessLogs table rows.
- Displays full row details (including reason, anonymized IP, Geo fields).

**Key implementation details:**
- Controlled component:
  - `open: boolean`
  - `log: AccessLog | null`
  - `onClose(): void`

---

## MVP-021 — Update App.tsx routing

**Files to create/modify:**
- `frontend/src/App.tsx`

**Done when:**
- Routes are wired with Layout + pages:
  - `/sites` → SiteList
  - `/sites/new` → SiteEditor (create)
  - `/sites/:id` → SiteEditor (edit)
  - `/access-logs` → AccessLogs
- Home route redirects to `/sites`.

**Key implementation details:**
- Use nested routes with `<Layout />` as the parent route element.
- Keep QueryClientProvider at the top level (already present).

---

## Verification (Phase 1)

Backend:
- Run migrations against dev DB.
- Confirm CRUD:
  - create/list/update/delete sites.
- Confirm access decision path:
  - Call `GET /api/protected/ping` with different host + IP scenarios and confirm `200` when allowed and `403` when blocked.
- Confirm logging:
  - Accessing `/api/protected/ping` creates an access_logs row with anonymized IP and correct `reason` strings (including `country_blocked` and `vpn_proxy_detected`).

Tests / CI:
- `backend`: `npm run test:coverage` passes and enforces >= 80% thresholds.
- Frontend:
  - `npm run lint` passes.
  - UI loads and can create/edit sites and view logs.
