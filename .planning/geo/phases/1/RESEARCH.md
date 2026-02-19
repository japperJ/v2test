# Phase 1 Research: MVP — IP-Based Access Control

## Summary
Phase 1’s core risk is **making the correct allow/deny decision based on the true client IP** in real deployments (Docker, reverse proxies, load balancers) while keeping validation and logging robust.

This research focuses on:
- Fastify’s `trustProxy` + `request.ip`/`request.ips` semantics (to avoid spoofable `X-Forwarded-*` headers)
- IP/CIDR parsing & matching using `ipaddr.js`
- GeoIP + VPN/proxy detection using MaxMind MMDB via `maxmind` (Node)
- Request/response validation strategies, including Zod integration (and version-compatibility constraints)
- Backend testing patterns using `fastify.inject()` and Vitest
- Frontend admin data-fetch patterns using TanStack Query v5

Repo version anchors (from `backend/package.json` / `frontend/package.json`):
- Backend: `fastify@^4.28.0`, `maxmind@^4.3.15`, `ipaddr.js@^2.2.0`, `zod@^3.22.4`, `vitest@^1.3.1`
- Frontend: `@tanstack/react-query@^5.25.0`

## Standard Stack (Phase 1)

| Need | Recommended solution | Repo version | Confidence | Source |
|---|---|---:|---|---|
| GeoIP lookups from MMDB | `maxmind.open()` Reader | `maxmind@^4.3.15` | HIGH | https://github.com/runk/node-maxmind#usage |
| VPN/Proxy flags | MaxMind “Anonymous IP” MMDB (`GeoIP2-Anonymous-IP.mmdb`) | n/a | HIGH | https://dev.maxmind.com/geoip/docs/databases/anonymous-ip/binary/ |
| CIDR parsing + matching | `ipaddr.parseCIDR()` + `addr.match()` + `ipaddr.process()` | `ipaddr.js@^2.2.0` | HIGH | https://raw.githubusercontent.com/whitequark/ipaddr.js/master/README.md |
| Correct client IP behind proxies | Fastify `trustProxy` + `request.ip`/`request.ips` | `fastify@4.28.0` | HIGH | https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Server.md#trustproxy + https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Request.md |
| HTTP schema validation (baseline) | Fastify JSON Schema (Ajv v8) | `fastify@4.28.0` | HIGH | https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Validation-and-Serialization.md |
| Zod-in-Fastify schema integration | `fastify-type-provider-zod` **pinned to <=4.x** for Zod v3 | n/a | HIGH | https://github.com/turkerdev/fastify-type-provider-zod#zod-compatibility |
| Backend route/integration testing | `buildApp()` factory + `app.inject()` + `app.close()` | n/a | HIGH | https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Guides/Testing.md |
| Frontend fetching/cache | TanStack Query v5 object-only signatures | `@tanstack/react-query@^5.25.0` | HIGH | https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5 |

## 1) MaxMind (`maxmind` v4.x) integration / response types / pitfalls

### What the Node library supports
`maxmind` provides:
- Async open: `const lookup = await maxmind.open<T>(filepath, options)`
- Sync reader: `new Reader<T>(buffer)`
- Lookups: `lookup.get(ip)` and `lookup.getWithPrefixLength(ip)`
- Options: in-memory cache (default max 10,000 items) and `watchForUpdates` for reload-on-file-change

Sources: https://github.com/runk/node-maxmind#usage and https://raw.githubusercontent.com/runk/node-maxmind/master/README.md#options

Supported response types include `CityResponse`, `CountryResponse`, `AnonymousIPResponse` (plus others). (Same README section.)

### Field sets are sparse (keys often missing)
MaxMind’s **binary field references** emphasize that records are maps where **keys may be omitted** if undefined/empty; and several boolean keys are **present only when true**.

Implications:
- Treat boolean-ish flags as `!!record?.flagName`, not `record.flagName === true`.
- Don’t assume missing keys mean the same as `false` unless explicitly documented; in practice for these DBs, “present only when true” means missing → false.

Concrete examples:
- City DB top-level keys include: `city`, `continent`, `country`, `location`, `postal`, `registered_country`, `represented_country`, `subdivisions`, `traits` (maps/arrays).
  - `country.iso_code` exists when known.
  - `location.latitude`, `location.longitude`, `location.time_zone` exist when known.
  - `traits.is_anycast` is present only when true.

Sources: https://dev.maxmind.com/geoip/docs/databases/city-and-country/city-binary/

- Country DB top-level keys include: `continent`, `country`, `registered_country`, `represented_country`, `traits`.
  - `traits.is_anycast` present only when true.

Source: https://dev.maxmind.com/geoip/docs/databases/city-and-country/country-binary/

- Anonymous IP DB keys include: `is_anonymous`, `is_anonymous_vpn`, `is_hosting_provider`, `is_public_proxy`, `is_residential_proxy`, `is_tor_exit_node`.
  - Each key is present only when true.

Source: https://dev.maxmind.com/geoip/docs/databases/anonymous-ip/binary/

### Practical integration pattern (what to do in Phase 1)
- Open readers once at process start (or plugin init) and reuse.
- Log and fail gracefully if a DB file is missing; Phase 0 already documents the expected paths in `backend/data/maxmind/README.md`.
- Consider `watchForUpdates` only if you’ll replace MMDB files on disk during runtime.

### Common pitfalls
- **Wrong client IP**: GeoIP is only as good as the IP you feed it; proxy configuration errors cascade into incorrect location and allow/deny decisions.
- **Sparse keys**: don’t crash when `location`, `country`, etc. are missing.
- **IPv4-mapped IPv6**: if your runtime produces `::ffff:1.2.3.4`, normalize before calling GeoIP / CIDR match (see `ipaddr.process()` below).

## 2) `ipaddr.js` v2.x CIDR parsing/matching + IPv4/IPv6 edge cases

### Recommended matching approach
- Parse client address:
  - Use `ipaddr.process(str)` rather than `ipaddr.parse(str)` to automatically convert IPv4-mapped IPv6 addresses into IPv4 objects.
- For CIDRs, use `ipaddr.parseCIDR('1.2.3.0/24')`.
- Match with `addr.match(ipaddr.parseCIDR('...'))`.

Source: https://raw.githubusercontent.com/whitequark/ipaddr.js/master/README.md (Global methods + `process`; and `match(parseCIDR())` examples)

### Edge cases to decide on (Phase 1)
- **Strictness of IPv4 parsing**: `ipaddr.IPv4.isValid()` accepts unusual formats like `0xc0.168.1.1` (POSIX `inet_ntoa` style). If you want to reject those, validate via `ipaddr.IPv4.isValidFourPartDecimal(str)`.
  - This matters mainly for configuration inputs (CIDRs submitted by admins), not for `request.ip` (which should be canonical).

Source: https://raw.githubusercontent.com/whitequark/ipaddr.js/master/README.md (`isValidFourPartDecimal` section)

### Performance notes
- Pre-parse CIDR lists on config load and reuse the parsed `[range, bits]` tuples.
- Avoid parsing CIDR strings on every request.

## 3) Fastify schema validation + Zod integration approaches

### Baseline: Fastify JSON Schema (Ajv v8)
Fastify’s default validation is JSON Schema compiled via Ajv v8; response serialization can be accelerated via `fast-json-stringify` when a response schema is supplied.

Source: https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Validation-and-Serialization.md

### Option A (recommended when you want Zod as the single source of truth): `fastify-type-provider-zod`
`fastify-type-provider-zod` provides:
- `validatorCompiler` / `serializerCompiler` to plug Zod into Fastify’s schema system
- a `ZodTypeProvider` so route handlers get typed `req.query`, `req.body`, etc.

However, **version compatibility matters**:
- `fastify-type-provider-zod <=4.x` supports **Zod v3**
- `fastify-type-provider-zod >=5.x` supports **Zod v4**

This repo is currently on `zod@^3.22.4` (see `backend/package.json`), so you must pin the provider to `<=4.x` if you adopt it in Phase 1.

Source: https://github.com/turkerdev/fastify-type-provider-zod#zod-compatibility

Notes:
- The upstream examples import from `zod/v4`; for this repo today, expect `import { z } from 'zod'`.
- If you use custom validator/serializer compilers, be mindful that Fastify’s `.addSchema` behavior changes when you fully replace the default validator (Fastify docs warn you must add schemas to the underlying validator instance if you customize it).

Source: https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Validation-and-Serialization.md (custom validator note)

### Option B (low-integration, pragmatic): keep Ajv for Fastify + use Zod inside handlers
- Keep Fastify’s JSON Schema validation for request/response contracts.
- Use Zod for “business object” parsing, admin payload parsing, or shared frontend types.

Tradeoff: you maintain two schema systems; upside: fewer moving parts.

### Error handling options
Fastify validation errors surface with:
- `error.validation` and `error.validationContext` (useful for custom error formatting)
- `attachValidation: true` attaches `req.validationError` instead of sending a 400 automatically.

Source: https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Validation-and-Serialization.md

## 4) Fastify IP extraction (`request.ip`, headers) and `trustProxy`

### The only safe rule
Do **not** implement “read `x-forwarded-for` manually” unless you are also reproducing correct proxy-trust logic. In Fastify, you configure trust once and then rely on `request.ip` / `request.ips`.

### `trustProxy` configuration
Fastify `trustProxy` can be:
- `true/false`
- a CIDR string (or comma-separated CIDR string)
- `Array<string>`
- `number` (trust nth hop)
- `(address, hop) => boolean`

Source: https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Server.md#trustproxy

In this repo, `backend/src/app.ts` currently uses `trustProxy: process.env.TRUST_PROXY === 'true'`, which is a good Phase 0 default for development, but may be too limited for production environments that need CIDR lists.

### What you get once `trustProxy` is enabled
- `request.ip`: client IP
- `request.ips`: array parsed from `X-Forwarded-For` **only when `trustProxy` is enabled**
- `request.hostname` and `request.protocol` also derive from `X-Forwarded-*` when proxy trust is enabled

Source: https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Request.md (`ip`/`ips` notes) and https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Server.md#trustproxy

Additional nuance:
- If multiple `x-forwarded-host` or `x-forwarded-proto` headers are present, Fastify uses **only the last one** for hostname/protocol.

Source: https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Server.md#trustproxy

### Operational checklist (Phase 1)
- In prod behind a reverse proxy, set `trustProxy` appropriately; otherwise a client can spoof `X-Forwarded-For`.
- If you have multiple proxy hops (CDN → LB → ingress → app), decide whether you trust all, trust CIDR(s), or trust the nth hop.
- Make the allow/deny decision on the same normalized IP you log.

## 5) Vitest patterns for Fastify testing (`inject()`, app factory, teardown)

Fastify’s docs recommend separating “app” (routes/plugins) from “server” (listen), then using `inject()` for tests.

Key points:
- `inject()` ensures plugins are booted and the app is ready to test.
- Always call `.close()` at teardown to release external resources (DB pools, redis clients, etc.).

Source: https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Guides/Testing.md

Repo alignment:
- The backend already exports an app factory `buildApp()` in `backend/src/app.ts`, which is exactly what you want for injection-based tests.

## 6) TanStack Query v5 patterns (queries/mutations/invalidation/optimistic updates/migration notes)

### v5 migration highlights that matter for this repo
- **Object-only signatures**: `useQuery({ queryKey, queryFn, ... })` etc.
- Renames/removals include:
  - `cacheTime` → `gcTime`
  - `keepPreviousData` removed in favor of `placeholderData: keepPreviousData` (helper)
  - Query callbacks (`onSuccess/onError/onSettled`) removed from queries (mutations still have them)

Source: https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5

### Optimistic update patterns
TanStack Query v5 docs describe two main approaches:

1) **Via UI variables** (simpler): render optimistic UI from `mutation.variables` while `mutation.isPending`.
2) **Via cache** (robust when multiple places depend on updated data): use `onMutate` to cancel queries, snapshot existing cache, `setQueryData` for optimistic state, and rollback in `onError`, then invalidate in `onSettled`.

Source: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates

### Admin UI guidance for Phase 1
For “site allowlist” admin screens:
- Prefer `queryKey` shapes that compose: e.g. `['sites']`, `['sites', siteId]`, `['sites', siteId, 'allowlist']`.
- After mutations that change allow rules, use `invalidateQueries({ queryKey: [...] })` for the affected keys.

## Don’t hand-roll (recommended libraries/features to lean on)

| Feature | Use instead | Why |
|---|---|---|
| `X-Forwarded-For` parsing & proxy trust | Fastify `trustProxy` + `request.ip` | Avoid spoofing + multi-hop edge cases; Fastify already integrates proxy-addr | 
| CIDR parsing / matching | `ipaddr.js` | Correct IPv4/IPv6 + CIDR semantics; handles IPv4-mapped IPv6 normalization via `process()` |
| MMDB parsing | `maxmind` Reader | Fast, typed, supports IPv6; has cache + optional file watch |

## Common pitfalls (Phase 1)
1. **Enabling `trustProxy` blindly** (e.g., always `true`): lets clients spoof `X-Forwarded-For` and bypass geofencing.
2. **Assuming MaxMind booleans are always present**: many flags are “present only when true”; missing keys must be treated as false.
3. **Not normalizing IPv4-mapped IPv6**: can cause CIDR match and GeoIP mismatch.
4. **Validating admin-supplied CIDRs with permissive IPv4 formats**: consider using stricter validation helpers for config inputs.

## Open questions
- **Phase 1 data model**: where and how the per-site allow rules live (DB table vs config JSON vs env). (Research here covers libraries/APIs; data modeling can be decided in the Phase 1 plan.)
- **Proxy topology for production**: which proxies exist and what IP/CIDR list should be trusted. Current env only supports a boolean `TRUST_PROXY`.

## Sources

| Topic | Source | Confidence |
|---|---|---|
| MaxMind Node library API (`open`, `Reader`, `getWithPrefixLength`, options) | https://github.com/runk/node-maxmind + https://raw.githubusercontent.com/runk/node-maxmind/master/README.md | HIGH |
| MaxMind City binary field list | https://dev.maxmind.com/geoip/docs/databases/city-and-country/city-binary/ | HIGH |
| MaxMind Country binary field list | https://dev.maxmind.com/geoip/docs/databases/city-and-country/country-binary/ | HIGH |
| MaxMind Anonymous IP binary field list | https://dev.maxmind.com/geoip/docs/databases/anonymous-ip/binary/ | HIGH |
| Fastify `trustProxy` and request IP semantics | https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Server.md + https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Request.md | HIGH |
| Fastify validation & customization | https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Validation-and-Serialization.md | HIGH |
| Fastify testing patterns (`inject`, `close`) | https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Guides/Testing.md | HIGH |
| ipaddr.js CIDR matching + IPv4-mapped IPv6 normalization | https://raw.githubusercontent.com/whitequark/ipaddr.js/master/README.md | HIGH |
| Zod provider compatibility | https://github.com/turkerdev/fastify-type-provider-zod#zod-compatibility | HIGH |
| TanStack Query v5 migration | https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5 | HIGH |
| TanStack Query optimistic updates | https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates | HIGH |
