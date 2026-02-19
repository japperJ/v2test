---
phase: 2
plan: 1
type: implement
wave: 1
depends_on:
  - ".planning/geo/STATE.md"
  - ".planning/geo/phases/2/RESEARCH.md"
  - ".planning/geo/phases/1/PLAN.md"
autonomous: true
must_haves:
  observable_truths:
    - "POST /api/protected/verify-location validates {lat,lng,accuracy,siteId}, evaluates ST_Covers against the site's geofence polygon, and returns {allowed:boolean, reason?:string}."
    - "GPS enforcement applies only when site.access_mode is geo_only or ip_and_geo; ip_only sites never require GPS verification."
    - "GPS verification writes access_logs rows that include gps_lat/gps_lng/gps_accuracy and a stable allow/deny reason."
    - "Admin UI can draw/edit/clear a site geofence polygon on a Leaflet map and persist it through PATCH /api/admin/sites/:id."
    - "Protected demo page requests geolocation permission when needed and displays allowed/blocked status based on verify-location results."
    - "Backend coverage thresholds remain >= 80% across lines/functions/branches/statements after Phase 2 changes."
  constraints:
    - "All SQL remains parameterized ($1, $2, …); no user input interpolation."
    - "PostGIS point constructor must use (lng, lat) order; SRID 4326."
    - "No-geofence behavior: if geofence_polygon is NULL, GPS check returns allowed by default (hasFence=false)."
    - "Avoid double-logging: ip_and_geo flows must not create a misleading 'allowed' access log entry before GPS verification completes."
    - "Frontend polygon payloads are GeoJSON Polygon geometry objects (RFC 7946) and use [lng,lat] coordinate order."
---

# Phase 2 — GPS Geofencing (Executable Task Plan)

This plan implements Phase 2 GPS geofencing based on `.planning/geo/phases/2/RESEARCH.md`, building on Phase 1.

## Phase 2 Success Criteria (must all pass)

- **SC-2.1** — `POST /api/protected/verify-location` accepts `{lat, lng, accuracy, siteId}`, queries PostGIS `ST_Covers`, returns `{allowed: boolean, reason?: string}`; invalid coords → 400; no geofence set → allowed by default
- **SC-2.2** — GPS check is enforced for `geo_only` and `ip_and_geo` access modes; `ip_only` mode skips GPS entirely
- **SC-2.3** — Access log entries for GPS checks include `gps_lat`, `gps_lng`, `gps_accuracy` fields
- **SC-2.4** — Admin UI polygon editor: site editor page has a Leaflet map where admin can draw/edit/clear a geofence polygon; polygon saved as GeoJSON to backend via `PATCH /api/admin/sites/:id`
- **SC-2.5** — Frontend GPS consent flow: when accessing a `geo_only` or `ip_and_geo` site, the React app prompts for location permission, sends coords to verify-location, and shows an allowed/blocked message
- **SC-2.6** — `PATCH /api/admin/sites/:id` accepts `geofence_polygon` as GeoJSON, stores it via PostGIS `ST_GeomFromGeoJSON`; returns current polygon as GeoJSON via `ST_AsGeoJSON`
- **SC-2.7** — Vitest coverage still ≥80% for all metrics after Phase 2 backend code added
- **SC-2.8** — `GET /api/admin/sites` and `GET /api/admin/sites/:id` return `geofence_polygon` as GeoJSON (null if not set)

## Global implementation rules (apply to all GEO tasks)

1. **SQL safety:** all DB access uses parameterized queries (`$1`, `$2`, …). Never build SQL via string concatenation of user input.
2. **Coordinate correctness:** PostGIS point construction is `(lng, lat)` and SRID is 4326.
3. **Boundary-inclusive containment:** use `ST_Covers(polygon_geog, point_geog)` for the primary predicate.
4. **No-fence default allow:** if `sites.geofence_polygon` is null, treat GPS check as allowed with `hasFence=false`.
5. **Access-mode contract:**
   - `ip_only`: IP checks only; GPS is skipped entirely.
   - `geo_only`: skip IP checks; require (or at minimum consult) GPS verification.
   - `ip_and_geo`: require IP checks AND GPS verification; do not prematurely log “allowed”.
6. **Logging:** GPS verification must write an `access_logs` row with `gps_lat`, `gps_lng`, `gps_accuracy` populated.
7. **Frontend GeoJSON:** store and send **GeoJSON Polygon geometry** (not WKT). Coordinate order must be `[lng, lat]`.
8. **Coverage gate:** all new backend code must be covered such that vitest thresholds remain ≥ 80%.

---

## Backend tasks

### GEO-002 — Update `Site.ts` model for GeoJSON polygons

- **Files:**
  - `backend/src/models/Site.ts`
- **Dependencies:** none
- **Done when:**
  - A `GeoJSONPolygon` TypeScript type exists (geometry-only):
    - `type: 'Polygon'`
    - `coordinates: number[][][]` (RFC 7946 order `[lng,lat]`)
  - `SiteSchema` has `geofence_polygon: GeoJSONPolygon | null` (or Zod equivalent that narrows to Polygon).
  - `UpdateSiteSchema` accepts optional `geofence_polygon` (GeoJSON Polygon or null) so PATCH can set/clear it.
  - Existing model functionality remains compatible with current `access_mode` union (`disabled | ip_only | geo_only | ip_and_geo`).

### GEO-001 — Update `SiteService` to round-trip `geofence_polygon` as GeoJSON

- **Files:**
  - `backend/src/services/SiteService.ts`
- **Dependencies:** GEO-002
- **Done when:**
  - `findById` and `findAll` SELECT `geofence_polygon` using `ST_AsGeoJSON(geofence_polygon)` and alias the output column as `geofence_polygon`.
  - The returned `Site` objects expose `geofence_polygon` as **GeoJSON (null if not set)** in responses for:
    - `GET /api/admin/sites`
    - `GET /api/admin/sites/:id`
  - `update()` handles `geofence_polygon` in the patch payload:
    - If provided as a GeoJSON polygon: stored via `ST_GeomFromGeoJSON($n)::geography` (or `ST_SetSRID(...,4326)::geography` as needed).
    - If provided as `null`: clears the DB column.
  - All SQL remains parameterized and the dynamic update builder only allows known columns.

### GEO-003 — Create `GeofenceService` (PostGIS `ST_Covers`)

- **Files:**
  - `backend/src/services/GeofenceService.ts`
- **Dependencies:** GEO-001 (for consistent DB semantics; can be implemented in parallel but should align)
- **Done when:**
  - `GeofenceService.isPointInFence(siteId, lat, lng)` exists with signature:
    - `Promise<{ inside: boolean; hasFence: boolean }>`
  - It queries `sites.geofence_polygon` for the given `siteId` and:
    - returns `hasFence:false` when polygon is null
    - returns `hasFence:true` and `inside:true/false` based on `ST_Covers`
  - Query uses a safe point constructor using `(lng, lat)`.

### GEO-005 — Update `ipAccessControl.ts` for `geo_only` and `ip_and_geo` behavior

- **Files:**
  - `backend/src/middleware/ipAccessControl.ts`
  - (potentially) `backend/src/app.ts`
- **Dependencies:** none (but must be completed before GEO-008 route tests stabilize)
- **Done when:**
  - For `geo_only`:
    - IP checks are skipped (as today), but the request is still allowed to reach the GPS verification route.
    - No “allowed” access log row is written by the IP middleware for geo_only flows.
  - For `ip_and_geo`:
    - IP checks still run (denylist/allowlist/vpn/country).
    - If IP checks fail: request is denied and logged (current behavior may remain).
    - If IP checks pass: the middleware does **not** finalize the overall decision by logging “allowed” yet (defers to GPS verification route).
  - For `ip_only`:
    - behavior remains: IP checks enforced and “allowed” access is logged.
  - The behavior avoids double-logging or premature “allowed” entries for `ip_and_geo`.

### GEO-004 — Add `POST /api/protected/verify-location` route

- **Files:**
  - `backend/src/routes/geo.ts`
- **Dependencies:** GEO-003, GEO-005
- **Done when:**
  - Route exists: `POST /api/protected/verify-location`.
  - Validates body (Zod) strictly:
    - `lat` in [-90, 90]
    - `lng` in [-180, 180]
    - `accuracy` is a finite number >= 0 (optionally capped)
    - `siteId` is a UUID string
  - Implements SC-2.1 response contract:
    - `200 { allowed: true }` when inside or when no fence exists
    - `200 { allowed: false, reason: 'geo_outside' }` when fence exists and point is outside
    - `400` on invalid inputs
  - Implements SC-2.2 access-mode enforcement using the site’s `access_mode`:
    - `ip_only`: GPS verification returns `{allowed:true, reason:'ip_only_skips_geo'}` (or `{allowed:true}`) and logs a GPS check only if desired (prefer not to log GPS if not performed).
    - `geo_only`: decision based on geofence (or allowed-by-default if no fence)
    - `ip_and_geo`: must consider IP decision + geofence decision; overall allowed only if both pass
  - Implements SC-2.3 logging:
    - Calls `accessLogService.log(...)` with `gpsLat/gpsLng/gpsAccuracy` populated for GPS checks.
    - Uses stable reason strings (document in code/tests) e.g. `geo_ok`, `geo_outside`, `geo_skipped_ip_only`, `geo_site_disabled`, etc.

### GEO-006 — Register geo routes in `app.ts`

- **Files:**
  - `backend/src/app.ts`
- **Dependencies:** GEO-004
- **Done when:**
  - `geo.ts` plugin is registered so the endpoint is available.
  - The `/api/protected/verify-location` request path still runs site resolution (or otherwise reliably obtains the correct Site).
  - Hook ordering does not break existing protected routes or Phase 1 tests.

### GEO-007 — Unit tests for `GeofenceService`

- **Files:**
  - `backend/src/services/__tests__/GeofenceService.test.ts`
- **Dependencies:** GEO-003
- **Done when:**
  - Tests mock `backend/src/db/pool.js` and validate:
    1. polygon exists + inside → `{inside:true, hasFence:true}`
    2. polygon exists + outside → `{inside:false, hasFence:true}`
    3. polygon null → `{inside:false, hasFence:false}` (or inside=false by convention) and caller treats as allowed
  - Tests assert parameter order is `(lng, lat)`.

### GEO-008 — Route tests for `POST /api/protected/verify-location`

- **Files:**
  - `backend/src/routes/__tests__/geo.verifyLocation.test.ts`
- **Dependencies:** GEO-004, GEO-006, GEO-005
- **Done when:**
  - Tests use Fastify `buildApp()` and `inject()`.
  - Coverage includes:
    - inside coords → 200 allowed
    - outside coords → 200 blocked + reason
    - invalid coords → 400
    - no fence → 200 allowed
  - Tests verify `accessLogService.log` is called with:
    - `gpsLat/gpsLng/gpsAccuracy` populated for GPS checks
  - Tests verify `ip_only` sites skip GPS enforcement (SC-2.2).

### GEO-009 — Update `SiteService` tests for GeoJSON polygon field

- **Files:**
  - `backend/src/services/__tests__/SiteService.test.ts`
- **Dependencies:** GEO-001, GEO-002
- **Done when:**
  - Tests cover that `findById`/`findAll` SQL selects `ST_AsGeoJSON(geofence_polygon)` and aliases as `geofence_polygon`.
  - Tests cover that `update()` includes the `geofence_polygon` path:
    - setting polygon uses `ST_GeomFromGeoJSON($n)::geography` (or equivalent)
    - clearing polygon sets to null
  - Existing tests continue to pass.

### GEO-010 — Run coverage check (>= 80%)

- **Files:** none
- **Dependencies:** GEO-007, GEO-008, GEO-009
- **Done when:**
  - `backend` coverage thresholds still meet or exceed 80% for lines/functions/branches/statements.
  - New service and route code are included in coverage scope (aligned with `backend/vitest.config.ts`).

---

## Frontend tasks

### GEO-011 — Leaflet polygon editor component (CDN draw plugin)

- **Files:**
  - `frontend/package.json`
  - `frontend/index.html`
  - `frontend/src/components/GeofenceMap.tsx`
  - (optional) `frontend/src/index.css` (if CSS import approach is used)
- **Dependencies:** none
- **Done when:**
  - Dependencies installed/declared:
    - `leaflet`, `react-leaflet`, `@types/leaflet`
  - Leaflet + Leaflet.draw assets are loaded via CDN in `index.html` (CSS + JS) so the draw toolbar is available.
  - `GeofenceMap` renders a map and supports:
    - draw polygon
    - edit polygon
    - clear polygon
  - Component contract:
    - Accepts `value?: GeoJSONPolygon | null` to render existing polygon
    - Calls `onPolygonChange(geojson | null)` whenever the polygon is created/edited/cleared
  - Single-polygon rule enforced (if user draws a new polygon, previous is replaced).

### GEO-012 — Add geofence editor to Site Editor and persist to backend

- **Files:**
  - `frontend/src/pages/SiteEditor.tsx`
  - `frontend/src/lib/api.ts`
- **Dependencies:** GEO-011, GEO-001
- **Done when:**
  - Site Editor shows the geofence map editor when `access_mode` is `geo_only` or `ip_and_geo` (or always, as long as UX is clear).
  - The form state includes `geofence_polygon: GeoJSONPolygon | null`.
  - PATCH payload includes `geofence_polygon`.
  - Loading an existing site populates the map with the existing polygon (if present).

### GEO-013 — Add `useGeolocation` hook

- **Files:**
  - `frontend/src/hooks/useGeolocation.ts`
- **Dependencies:** none
- **Done when:**
  - Hook provides a Promise-based wrapper around `navigator.geolocation.getCurrentPosition`.
  - Returned shape includes `{ lat, lng, accuracy, error }`.
  - Handles permission denied/unavailable/timeout in a user-friendly way (error codes mapped to readable messages).

### GEO-014 — Create `ProtectedPage` geolocation consent + verify flow

- **Files:**
  - `frontend/src/pages/ProtectedPage.tsx`
  - `frontend/src/lib/api.ts`
- **Dependencies:** GEO-013, GEO-004
- **Done when:**
  - Page is reachable (wired in GEO-015) and accepts a `siteId` route param.
  - Determines the site’s `access_mode` via either:
    - URL param / query param (demo mode), or
    - fetching site details using existing API client (acceptable in Phase 2 because there is no auth yet).
  - If access_mode is `geo_only` or `ip_and_geo`:
    - prompts the user for location permission
    - POSTs `{lat,lng,accuracy,siteId}` to `/api/protected/verify-location`
    - renders allowed/blocked/loading/error states
  - If access_mode is `ip_only`:
    - does not prompt for location
    - renders a message that GPS is not required

### GEO-015 — Update routing and link to ProtectedPage

- **Files:**
  - `frontend/src/App.tsx`
  - `frontend/src/pages/SiteList.tsx`
- **Dependencies:** GEO-014
- **Done when:**
  - App route exists: `/protected/:siteId` → `<ProtectedPage />`.
  - Site list includes a link/button to open the protected page for each site.

---

## Verification (Phase 2)

Backend:
1. Unit tests:
   - `GeofenceService` tests cover inside/outside/no-fence.
   - verify-location route tests cover 200 allowed/blocked/no-fence and 400 invalid input.
2. Manual/API checks:
   - With a site in `geo_only` mode:
     - no polygon set → verify-location returns allowed
     - polygon set → verify-location returns allowed when inside, blocked when outside
   - With `ip_and_geo`:
     - ensure no premature “allowed” access log is written before GPS verifies.
3. Coverage:
   - backend coverage thresholds remain ≥ 80% across all metrics.

Frontend:
1. Site editor:
   - Can draw/edit/clear polygon; saving persists; reloading site shows polygon.
2. Protected flow:
   - For `geo_only` / `ip_and_geo`: prompts for location, calls verify-location, shows allowed/blocked.
   - For `ip_only`: no GPS prompt.
