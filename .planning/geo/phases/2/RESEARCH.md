# Phase 2 Research: GPS Geofencing

## Summary
Phase 2 adds **GPS-based** access control to complement the IP-based checks built in Phase 1.

Key implementation conclusions:
- For point-in-polygon on **GEOGRAPHY(POLYGON,4326)**, prefer **`ST_Covers(polygon_geog, point_geog)`** (boundary-inclusive) over `ST_Within` (geometry-only and boundary-exclusive behavior for points/lines on polygon boundaries). PostGIS documents `ST_Covers` geography support and explicitly recommends `ST_Covers`/`ST_CoveredBy` over `ST_Contains`/`ST_Within` due to boundary quirks.  
  Source: https://postgis.net/docs/ST_Covers.html and https://postgis.net/docs/ST_CoveredBy.html and https://postgis.net/docs/ST_Within.html
- Use **SRID 4326 / WGS84 lon/lat** for GPS coordinates (already matches `geofence_polygon geography(POLYGON,4326)` from Phase 0). PostGIS geography defaults to SRID 4326 when omitted.  
  Source: https://postgis.net/docs/using_postgis_dbmanagement.html#PostGIS_Geography
- Use `ST_DWithin(geography, geography, meters)` when you want a tolerance in **meters** (e.g., incorporate client-reported `accuracy`).  
  Source: https://postgis.net/docs/ST_DWithin.html
- Frontend geolocation must run in a **secure context** (HTTPS), but browsers treat `http://localhost` as secure in most cases; plan for production headers / reverse proxy configuration.  
  Source: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- Leaflet + Leaflet.draw are easiest to integrate in this repo using **raw Leaflet in a React `useEffect`** (because Phase 2 requires CDN-loading Leaflet/Leaflet.draw; `react-leaflet` expects npm-module imports and is awkward with globals).

## Standard Stack (Phase 2)

| Need | Recommended solution | Version | Confidence | Source |
|---|---|---:|---|---|
| Map rendering | Leaflet via CDN | 1.9.4 | HIGH | https://leafletjs.com/download.html |
| Polygon drawing/editing | Leaflet.draw via CDN | 1.0.4 | HIGH | https://cdnjs.com/libraries/leaflet.draw and https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html |
| Browser GPS | `navigator.geolocation.getCurrentPosition()` | n/a | HIGH | https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition |
| Spatial predicates | PostGIS `ST_Covers` + `ST_DWithin` | n/a | HIGH | https://postgis.net/docs/ST_Covers.html and https://postgis.net/docs/ST_DWithin.html |
| GeoJSON import/export | PostGIS `ST_GeomFromGeoJSON` + `ST_AsGeoJSON` | n/a | HIGH | https://postgis.net/docs/ST_GeomFromGeoJSON.html and https://postgis.net/docs/ST_AsGeoJSON.html |

---

## 1) PostGIS spatial query patterns (exact SQL)

### 1.1 Constructing a geography point from (lat, lng)
PostGIS geography is lon/lat (X/Y). For geodetic coordinates, **X is longitude and Y is latitude**.

Use either of these patterns:

- **EWKT cast** (compact):
  - `('SRID=4326;POINT(' || $1 || ' ' || $2 || ')')::geography`
- **Constructor** (recommended for parameter safety and clarity):
  - `ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography`

Where parameters are **($1 = lng, $2 = lat)**.

Sources:
- `ST_MakePoint`: https://postgis.net/docs/ST_MakePoint.html (notes: X=lon, Y=lat)
- `ST_SetSRID`: https://postgis.net/docs/ST_SetSRID.html
- Geography overview / SRID 4326 default: https://postgis.net/docs/using_postgis_dbmanagement.html#PostGIS_Geography

### 1.2 Strict “inside polygon” check (boundary-inclusive)
Given `sites.geofence_polygon geography(POLYGON,4326)`, prefer `ST_Covers`:

```sql
SELECT
  ST_Covers(s.geofence_polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS allowed
FROM sites s
WHERE s.id = $3;
```

- $1 = lng
- $2 = lat
- $3 = site_id

Why `ST_Covers` vs `ST_Within`?
- `ST_Within` is defined for **geometry** (and for points/lines on polygon boundaries it can return false because it requires interior intersection). PostGIS notes this “boundary quirk” and points to `ST_CoveredBy` for more inclusive semantics.  
  Source: https://postgis.net/docs/ST_Within.html
- `ST_Covers` supports **geography** (geog polygon + geog point) and explicitly states it does **not** have the “boundary not contained” quirk of `ST_Contains`.  
  Source: https://postgis.net/docs/ST_Covers.html

### 1.3 “Inside polygon OR within accuracy meters” (GPS accuracy tolerance)
If you want to treat a coordinate as allowed when it’s *inside* OR within the reported horizontal accuracy distance to the polygon boundary, you can use `ST_DWithin` (meters):

```sql
SELECT
  CASE
    WHEN s.geofence_polygon IS NULL THEN false
    WHEN ST_Covers(s.geofence_polygon, $point_geog) THEN true
    WHEN ST_DWithin(s.geofence_polygon, $point_geog, $accuracy_m) THEN true
    ELSE false
  END AS allowed
FROM sites s
WHERE s.id = $site_id;
```

In a parameterized query, you’d build `$point_geog` as `ST_SetSRID(ST_MakePoint($1,$2),4326)::geography` and pass `$accuracy_m` as a number.

Note: `ST_DWithin(geography, geography, distance_meters)` exists and uses meters; it also has a `use_spheroid` boolean defaulting to `true`.

Source: https://postgis.net/docs/ST_DWithin.html

### 1.4 Storing polygon from GeoJSON into `geofence_polygon`
PostGIS parses GeoJSON into a **geometry** using `ST_GeomFromGeoJSON`, then you can set SRID (or rely on the default) and cast to geography:

```sql
UPDATE sites
SET
  geofence_type = 'polygon',
  geofence_polygon = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography,
  updated_at = now()
WHERE id = $2
RETURNING id;
```

- $1 should be the **GeoJSON geometry fragment**, typically `{"type":"Polygon","coordinates":[...]}`.
- GeoJSON polygon coordinate order is `[longitude, latitude]` per RFC 7946; Leaflet’s `toGeoJSON()` will produce correct order.

Sources:
- `ST_GeomFromGeoJSON` synopsis/behavior: https://postgis.net/docs/ST_GeomFromGeoJSON.html
- `ST_AsGeoJSON` is RFC 7946 aligned (with CRS caveats): https://postgis.net/docs/ST_AsGeoJSON.html

### 1.5 Returning polygon as GeoJSON to frontend

```sql
SELECT
  ST_AsGeoJSON(geofence_polygon, 6, 0) AS geofence_polygon_geojson
FROM sites
WHERE id = $1;
```

Notes:
- `ST_AsGeoJSON(geography geog, integer maxdecimaldigits=9, integer options=0)` exists.
- `maxdecimaldigits=6` is often enough for display (warning: reducing decimals can create invalid output for some shapes; PostGIS suggests `ST_ReducePrecision` if needed).

Source: https://postgis.net/docs/ST_AsGeoJSON.html

---

## 2) Leaflet + Leaflet.draw (CDN + React integration)

### 2.1 CDN URLs (Leaflet 1.9.4)
Leaflet’s official download page provides a ready-to-paste snippet including SRI hashes:

- CSS: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`
- JS:  `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`

Source: https://leafletjs.com/download.html

Alternative CDNs (same version):
- CSS: `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css`
- JS:  `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js`

Source: https://cdnjs.com/libraries/leaflet

### 2.2 CDN URLs (Leaflet.draw 1.0.4)
cdnjs provides:
- CSS: `https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css`
- JS:  `https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js`

Source: https://cdnjs.com/libraries/leaflet.draw

### 2.3 React integration recommendation
Because Phase 2 explicitly prefers **CDN** for Leaflet and Leaflet.draw, the simplest integration is:
- Load Leaflet + Leaflet.draw scripts/styles in `frontend/index.html` (so `window.L` exists)
- Build a `PolygonEditor` React component that:
  - creates a map in `useEffect`
  - manages a `L.FeatureGroup()` that holds the editable polygon
  - listens to draw events to capture GeoJSON

Why not `react-leaflet`?
- `react-leaflet` is great when Leaflet is imported from npm and bundled; mixing it with global-CDN Leaflet is doable but adds complexity and TypeScript friction.

### 2.4 Leaflet.draw “polygon editor” wiring essentials
Leaflet.draw documentation highlights a key requirement:
- You must provide an editable `featureGroup` for the edit toolbar.

Minimal control initialization pattern:
- Create `const drawnItems = new L.FeatureGroup(); map.addLayer(drawnItems);`
- Add control: `new L.Control.Draw({ edit: { featureGroup: drawnItems } })`

Source: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html

Capturing output:
- On `draw:created`, add the new layer to `drawnItems`.
- On `draw:edited`, iterate layers and export updated geometry.

Leaflet.draw event examples:
- `map.on(L.Draw.Event.CREATED, (e) => { ... })`
- `map.on('draw:edited', (e) => { ... })`

Source: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html

Loading an existing polygon for editing:
- If you have saved GeoJSON (geometry or feature), you can load it with `L.geoJSON(geojson)` and add the resulting layer(s) into your editable FeatureGroup.
- Ensure you load only a single polygon (enforce one polygon per site).

Gotcha: Leaflet.css references images (marker icons etc.) that must be accessible relative to the CSS URL; using CDN-hosted CSS (unpkg/cdnjs) generally keeps the images reachable. Leaflet’s download docs explicitly mention the `images/` directory requirement when self-hosting.

Source: https://leafletjs.com/download.html

---

## 3) Browser Geolocation API patterns

### 3.1 Promise wrapper around `getCurrentPosition`
MDN documents `getCurrentPosition(success, error, options)` and its option fields:
- `enableHighAccuracy` (default false)
- `timeout` (default Infinity)
- `maximumAge` (default 0)

Source: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition

Recommendation:
- Wrap callback style into a Promise for React code.
- Use options like:
  - `enableHighAccuracy: true`
  - `timeout: 10_000` (or 5_000)
  - `maximumAge: 0`

### 3.2 Error handling (permission denied, unavailable, timeout)
`GeolocationPositionError.code` values:
- 1: `PERMISSION_DENIED`
- 2: `POSITION_UNAVAILABLE`
- 3: `TIMEOUT`

MDN notes `message` is primarily for debugging and should not be shown directly to users.

Source: https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPositionError

### 3.3 Secure-context requirement
Geolocation is available only in **secure contexts**, and can be blocked by a Permissions-Policy header.

Source: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API

### 3.4 Accuracy threshold UX
Client coordinates include `coords.accuracy` (meters). If `accuracy > 500m`, consider warning the user and letting them retry (or treat as denied in strict geo_only mode).

(Note: the 500m threshold is a product decision; the API provides the numeric accuracy value, but does not define “good/bad”.)

---

## 4) Backend endpoint design: `POST /api/protected/verify-location`

### 4.1 Request/response contract
Suggested body:
```ts
{ lat: number; lng: number; accuracy: number }
```

Avoid taking `siteId` from the client if you can:
- Phase 1 resolves `request.site` from `request.hostname` for `/api/protected/*`.
- Accepting `siteId` risks cross-site probing unless it’s validated against the resolved site.

### 4.2 Validation rules (server-side)
Validate (Zod):
- `lat` in [-90, 90]
- `lng` in [-180, 180]
- `accuracy` positive (or >= 0) and capped (e.g., <= 100_000 meters)

### 4.3 Access-mode integration (important with current Phase 1 wiring)
Current backend behavior (Phase 1):
- `buildApp()` applies `ipAccessControl()` in a `preHandler` hook for **all** `/api/protected/*` routes.
- `ipAccessControl()` logs **allowed** requests immediately after IP checks.

Implication for Phase 2:
- If `ip_and_geo` must enforce GPS, you likely need to avoid logging “allowed” until GPS passes.
- Options (design-level):
  1) Refactor so IP check returns a decision object (no logging), and `verify-location` performs the combined decision and logs once.
  2) Special-case `/api/protected/verify-location` to skip the Phase 1 `preHandler` enforcement, and do both IP and GPS checks inside the route.

This is a gotcha to flag early; otherwise you’ll log “allowed” even if GPS later fails.

### 4.4 SQL for verification endpoint (parameterized)
Assuming you have the resolved site id and a point:

```sql
SELECT
  s.access_mode,
  s.geofence_polygon IS NOT NULL AS has_polygon,
  ST_Covers(s.geofence_polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS inside,
  ST_DWithin(s.geofence_polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3) AS within_accuracy
FROM sites s
WHERE s.id = $4;
```

Then apply app logic:
- `ip_only`: skip GPS and return allowed (from the IP pipeline)
- `geo_only`: require polygon, then allow if `inside` OR (optionally) `within_accuracy`
- `ip_and_geo`: require both IP allow and GPS allow

### 4.5 Access log population
When GPS verification happens, log with:
- `gps_lat`, `gps_lng`, `gps_accuracy`
- plus IP-derived fields if available (depending on how you restructure logging)

The DB columns already exist and the current `AccessLogService.log()` supports them.

---

## 5) Testing patterns (Vitest) for GPS geofencing

### 5.1 Mocking PostGIS calls
The repo already mocks the pg pool module in tests:

```ts
vi.mock('../../db/pool.js', () => ({ default: { query: vi.fn() } }));
```

Source (repo): `backend/src/services/__tests__/SiteService.test.ts`.

Recommended approach for GPS tests:
- Unit test a small `GeoFenceService.verifyPoint(siteId, lat, lng, accuracy)` (or route handler) that calls `pool.query()`.
- Mock `pool.query` return values to simulate:
  - polygon exists + inside = true
  - polygon exists + inside = false
  - polygon null
- Assert:
  - SQL is parameterized ($1…)
  - parameter order uses (lng, lat) consistently

### 5.2 Route-level tests (Fastify inject)
Follow Phase 1 patterns (Fastify `inject`) to test:
- `POST /api/protected/verify-location` returns 200 and `{allowed:true}` for inside polygon
- returns 403/200 with `{allowed:false, reason:'geo_outside'}` (depending on chosen API)

Mock dependencies:
- mock `siteService.findByHostname()` to return a site with `access_mode` = geo_only / ip_and_geo
- mock IP middleware where needed (or avoid it by moving GPS verify outside the global preHandler)

### 5.3 Test cases checklist
Minimum recommended scenarios:
1. **geo_only** + polygon set + point inside → allowed
2. **geo_only** + polygon set + point outside → denied
3. **geo_only** + polygon missing → denied (or allowed, but pick one and document; from a security stance, “deny” is safer)
4. **ip_and_geo** + IP denied → denied without querying PostGIS (optional optimization)
5. **ip_and_geo** + IP allowed + point outside → denied
6. invalid lat/lng ranges → 400
7. accuracy extremely large → 400 (or clamp)

---

## 6) Security and limitations

### 6.1 GPS spoofing
Client-provided GPS coordinates can be spoofed (developer tools, mocked location providers, compromised devices). This must be documented as a limitation: GPS geofencing provides *friction*, not strong security.

Mitigations (conceptual):
- Combine IP + GPS (`ip_and_geo`) for higher assurance
- Use short-lived session challenges + rate limiting to reduce brute forcing

### 6.2 Input validation
Server must validate:
- coordinate ranges
- accuracy is numeric and reasonable

### 6.3 Secure context + headers
Geolocation may be blocked by:
- non-secure context
- Permissions-Policy headers

Source: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API

---

## Gotchas / reminders
- PostGIS point constructor order is **(lng, lat)**; do not swap.  
  Source: https://postgis.net/docs/ST_MakePoint.html
- `ST_Within` excludes boundary-only cases for points/lines; use `ST_Covers`/`ST_CoveredBy` to include boundary.  
  Sources: https://postgis.net/docs/ST_Within.html and https://postgis.net/docs/ST_Covers.html and https://postgis.net/docs/ST_CoveredBy.html
- GeoJSON must be in SRID 4326 and uses `[lon,lat]`; `ST_AsGeoJSON` notes WGS84 requirement and will output CRS info when not 4326 depending on options.  
  Source: https://postgis.net/docs/ST_AsGeoJSON.html
- Leaflet.draw edit toolbar **requires** the `featureGroup` option.  
  Source: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html
