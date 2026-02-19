# Phase 3 Research: Multi-Site Routing & RBAC

## Summary
Phase 3’s core risk is **inadvertently weakening security** while adding authentication/authorization and multi-tenant routing.

The “multi-site” part is deceptively simple (map `hostname → site`), but it becomes security-critical once admins, roles, refresh tokens, and per-site API keys exist:
- **Host resolution must be trustworthy** behind proxies and must not allow host-header confusion.
- **Authorization must be centralized, deny-by-default, and checked on every request** (not only in the UI).
- **Refresh token handling must anticipate theft/replay** (rotation + revocation strategy), and cookie-based auth needs **CSRF defenses**.
- Existing Phase 2 constraint must remain true: **avoid double-logging** (especially for `ip_and_geo` flows where “allowed” must not be logged before GPS verification completes).

This research focuses on implementable patterns using the repo’s existing stack:
- Backend: Fastify v4, `@fastify/jwt`, `@fastify/cookie`, `@fastify/helmet`, `bcrypt`, Postgres
- Frontend: React + Axios (cookie-to-header CSRF is a straightforward fit)

Repo version anchors (from `backend/package.json` / `frontend/package.json`):
- Backend: `fastify@^4.28.0`, `@fastify/jwt@^8.0.1`, `@fastify/cookie@^9.3.1`, `@fastify/helmet@^11.1.1`, `bcrypt@^5.1.1`

## Standard Stack (Phase 3)

| Need | Recommended solution | Repo version | Confidence | Source |
|---|---|---:|---|---|
| JWT signing/verifying | `@fastify/jwt` (`reply.jwtSign`, `request.jwtVerify`) | `@fastify/jwt@^8.0.1` | HIGH | https://github.com/fastify/fastify-jwt |
| Cookie parsing + secure options | `@fastify/cookie` (`setCookie`, `httpOnly`, `secure`, `sameSite`, key rotation) | `@fastify/cookie@^9.3.1` | HIGH | https://github.com/fastify/fastify-cookie |
| CSRF protections (if cookies used for auth) | Cookie-to-header pattern or signed double-submit | n/a | HIGH | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html |
| Cookie hardening guidance | Host-only cookies, narrow `Path`, Secure/HttpOnly/SameSite | n/a | HIGH | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html |
| Bearer token transport guidance | `Authorization: Bearer <token>`; avoid URL query tokens | n/a | HIGH | https://www.rfc-editor.org/rfc/rfc6750 |
| Refresh tokens + rotation guidance | Rotate refresh tokens; bind refresh token to client identity; TLS-only | n/a | HIGH | https://www.rfc-editor.org/rfc/rfc6749#section-10.4 and https://www.rfc-editor.org/rfc/rfc6819#section-5.2.2.3 |
| Password/API key hashing | `bcrypt` | `bcrypt@^5.1.1` | HIGH | https://www.npmjs.com/package/bcrypt |
| Security headers baseline | `@fastify/helmet` (CSP configurable) | `@fastify/helmet@^11.1.1` | HIGH | https://github.com/fastify/fastify-helmet |
| Authorization/RBAC principles | Least privilege, deny-by-default, validate each request | n/a | HIGH | https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html |

---

## 1) Multi-site routing by hostname (backend)

### 1.1 What the repo does today
- `backend/src/app.ts` applies site resolution only for `/api/protected/*` routes:
  - uses `request.hostname` and `siteService.findByHostname(hostname)`
  - sets `request.site`
  - allows requests through if no site is found (explicitly “for dev/testing”)

This is fine for early dev, but becomes dangerous once Phase 3 adds:
- authenticated admin endpoints
- per-site API keys
- meaningful cross-site boundaries

### 1.2 Trust boundaries: proxy headers + hostname
Fastify derives `request.hostname` from the incoming request and (when proxy trust is enabled) from forwarded headers.

Phase 1 already documented the critical rule:
- **Configure proxy trust once (Fastify `trustProxy`), then rely on `request.ip` / `request.hostname`.**
  - Fastify `trustProxy` docs: https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Server.md#trustproxy
  - Request properties: https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Request.md

Implementation implications for Phase 3:
- In production behind any reverse proxy / load balancer, `TRUST_PROXY=true` is not enough for nuanced topologies.
  - Prefer CIDR / hop-count trust as supported by Fastify (rather than blindly trusting all forwarded headers).
- **Canonicalize the hostname** before DB lookup:
  - lowercase
  - strip port (some clients/proxies send `Host: example.com:443`)
- **Unknown hostnames should not “fall through” and be implicitly allowed.**
  - For protected routes, return a 404/403 when no site is resolved.
  - For admin APIs, operate by explicit siteId + RBAC, not by hostname.

### 1.3 Data modeling options for hostnames
Current schema uses `sites.hostname UNIQUE NULL`.

If Phase 3 needs multiple hostnames per site (common in multi-tenant setups), add a new table:
- `site_hostnames(site_id, hostname)` with a unique index on hostname
- keep `sites.hostname` as “primary hostname” only if desired

This table-based approach makes:
- hostname canonicalization easier
- hostnames rotatable without touching the main site row

### 1.4 Caching strategy (LRU + Redis)
README claims “multi-layer caching (LRU + Redis)” but current code does not implement Redis caching for host resolution.

Recommended Phase 3 approach:
- LRU in-process cache keyed by normalized hostname → `{siteId, accessMode, enabled, ...}` with small TTL
- Redis as shared cache keyed by hostname → same payload with TTL
- Invalidation strategy:
  - on site update / hostname change, delete the redis key(s)
  - also bump a per-site “cache version” number if you want stronger invalidation semantics

Pitfalls:
- caching “not found” too aggressively can create confusing propagation during onboarding
- if you cache RBAC membership, ensure it is short-lived or explicitly invalidated on role changes

---

## 2) Admin authentication (JWT access + refresh) + session design

### 2.1 Recommended token split for SPA
A practical SPA-friendly pattern (balanced against XSS/CSRF realities):
- **Access token**: short-lived JWT (e.g., 5–15 minutes), sent via `Authorization: Bearer ...` header
  - RFC 6750 recommends the `Authorization` header method and warns about URL transport: https://www.rfc-editor.org/rfc/rfc6750#section-2.1 and https://www.rfc-editor.org/rfc/rfc6750#section-2.3
- **Refresh token**: long-lived opaque token stored in a Secure/HttpOnly cookie
  - rotate refresh token on each use
  - revoke on replay

Why this split:
- Sending access tokens via Authorization header reduces CSRF exposure because browsers do not attach Authorization headers automatically.
- Keeping refresh tokens in HttpOnly cookies reduces XSS exfiltration risk, but still requires CSRF defenses on refresh endpoints.

### 2.2 Refresh token rotation + replay response
OAuth 2.0’s Security Considerations describe refresh-token rotation as a way to detect compromise:
- RFC 6749 explicitly describes rotation and retaining invalidated refresh tokens to detect breaches: https://www.rfc-editor.org/rfc/rfc6749#section-10.4
- RFC 6819 discusses refresh token rotation as a countermeasure: https://www.rfc-editor.org/rfc/rfc6819#section-5.2.2.3

Implementation guidance (server-side):
- Model refresh tokens as **server-side sessions**:
  - store only a hash of the refresh token (bcrypt or a fast hash + secret; see “Open questions”)
  - include: `user_id`, `issued_at`, `expires_at`, `last_used_at`, `rotated_from`, `revoked_at`, `ip`, `ua`
- On refresh request:
  1) validate refresh cookie + CSRF (if applicable)
  2) look up session record
  3) if token is revoked/unknown → deny
  4) if token is known but already rotated → treat as replay → revoke the whole session family
  5) issue new access token, new refresh token; persist rotation

Response hardening:
- Ensure token responses are not cached. RFC 6749 token examples include `Cache-Control: no-store` and `Pragma: no-cache`: https://www.rfc-editor.org/rfc/rfc6749#section-5.1

### 2.3 Cookie hardening checklist
From OWASP Session Management:
- Use TLS for the entire session.
- Set cookies with Secure, HttpOnly, SameSite.
- Prefer host-only cookies by not setting `Domain` and keeping scope narrow.
  - Session cookie attributes guidance: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

From OWASP CSRF:
- Be careful with `Domain=` cookies because all subdomains will share them (defense-in-depth warning).
- Consider `__Host-` cookie prefix properties (Secure + path=/ + no Domain).
  - CSRF cheat sheet section on cookie prefixes: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

Repo alignment:
- `@fastify/cookie` exposes the relevant attributes (`httpOnly`, `secure`, `sameSite`, `path`, etc.) and documents security considerations and `__Host-` prefix advice: https://github.com/fastify/fastify-cookie

### 2.4 CSRF strategy (when using cookies)
If any authenticated endpoint relies on cookies being attached automatically by the browser (most commonly refresh/logout endpoints), add CSRF protections:

OWASP CSRF Cheat Sheet recommendations relevant to this repo:
- Add CSRF tokens to state-changing requests and validate on backend.
- For SPA/AJAX flows, cookie-to-header pattern is common.
- For stateless patterns, signed double-submit is recommended.
  Source: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

Pragmatic Phase 3 recommendation:
- Use **cookie-to-header** for admin APIs:
  - server sets readable CSRF cookie (not HttpOnly)
  - frontend reads it and sends `X-CSRF-Token` header on unsafe methods
  - server validates header value matches cookie value

Defense-in-depth:
- Validate `Origin` and/or `Referer` for unsafe methods where feasible.
- Set `SameSite=Lax` or `Strict` for refresh cookie depending on whether cross-site embedding is needed.

---

## 3) Authorization & RBAC model

### 3.1 Principles to keep the implementation honest
OWASP’s Authorization Cheat Sheet highlights key requirements:
- **Enforce least privileges**
- **Deny by default**
- **Validate permissions on every request**
  Source: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

Operational interpretation for this repo:
- Do not rely on frontend route guards for security.
- Centralize authorization in Fastify hooks (`onRequest`/`preHandler`) for admin routes.
- Add tests that prove authorization is enforced (missing a single check is a real vulnerability).

### 3.2 Recommended data model (RBAC with site membership)
Phase 3 needs classic “global role + per-site role” boundaries.

Typical tables:
- `admin_users`
- `admin_sessions` (refresh token sessions)
- `site_memberships (site_id, user_id, role)`

Roles:
- `super_admin`: can create/delete sites, manage users, view all logs
- `site_admin`: can edit settings for sites they administer and view logs
- `viewer`: read-only access to assigned sites

Implementation detail:
- Prefer explicit “capabilities” checks in code rather than scattering role strings throughout handlers.

### 3.3 Enforcing RBAC in Fastify
With `@fastify/jwt`, you can:
- register jwt plugin with a secret
- authenticate requests using `request.jwtVerify()`
- attach a typed `request.user` (or a custom decorator name)

`@fastify/jwt` supports:
- cookie-based token extraction (with `@fastify/cookie`)
- `onlyCookie` mode useful for refresh-token endpoints
  Source: https://github.com/fastify/fastify-jwt

Recommended routing split:
- `/api/admin/auth/*`: login/refresh/logout + CSRF bootstrap
- `/api/admin/*`: all admin APIs guarded by `jwtVerify()` and RBAC

---

## 4) Per-site API keys (bcrypt + scoped keys)

### 4.1 Why API keys are needed
Phase 3 mentions “per-site API keys” (and Phase 4 will add workers). Keys are useful for:
- server-to-server access (e.g., worker callbacks)
- controlled automation without admin JWT sessions

### 4.2 Key format and storage pattern
Avoid storing raw keys in the database.

Recommended key format:
- `key_id` (public identifier, short, stored in DB)
- `key_secret` (long random secret, shown once)

Store:
- `key_id`
- `bcrypt_hash(key_secret)`
- key metadata: `site_id`, `created_at`, `revoked_at`, `scopes`

Lookup pattern:
- Client sends something like: `Authorization: Bearer <key_id>.<key_secret>` or `X-API-Key: <key_id>.<key_secret>`.
- Server splits, selects the row by `key_id`, then uses `bcrypt.compare()`.

This keeps request-time cost bounded (one bcrypt compare per request) rather than scanning all keys.

---

## 5) Frontend auth + refresh flow

The Phase 3 frontend should:
- treat access token expiry as normal (short-lived by design)
- on 401 from admin APIs:
  - call refresh endpoint
  - retry the original request
  - if refresh fails, redirect to login

If using cookie-to-header CSRF:
- implement an Axios interceptor that reads the CSRF cookie and adds `X-CSRF-Token` for unsafe methods.
  - OWASP CSRF cheat sheet provides an axios-based example and describes the cookie-to-header pattern for SPAs: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

---

## 6) Preserve Phase 2 logging semantics (avoid double-logging)

Phase 2 identified the key gotcha:
- `ip_and_geo` must not log “allowed” before GPS verification completes.

Repo status today:
- `ipAccessControl()` already defers allowed logging for `ip_and_geo`.
- `/api/protected/verify-location` currently logs a final allow/deny decision, but it accepts `siteId` from the request body.

Phase 3 recommendation:
- In multi-site mode, avoid trusting a client-provided `siteId` for protected checks.
  - Prefer resolving the site from `request.hostname` and using `request.site.id`.
  - Or, at minimum, assert that body `siteId` matches the resolved site.

This aligns with OWASP guidance to avoid authorization bypass via user-controlled lookup IDs (IDOR class of issues):
- OWASP Authorization cheat sheet “Ensure lookup IDs are not accessible even when guessed or cannot be tampered with”: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

---

## Don’t hand-roll

| Feature | Use instead | Why |
|---|---|---|
| JWT verification boilerplate | `@fastify/jwt` | Provides consistent `jwtSign/jwtVerify`, cookie extraction modes, and integration hooks | 
| Cookie parsing/signing | `@fastify/cookie` | Centralized cookie security options + key rotation support | 
| CSRF “just rely on SameSite” | OWASP-recommended CSRF tokens (cookie-to-header or signed double-submit) | SameSite is defense-in-depth, not a universal CSRF solution | 
| Authorization checks in individual handlers only | Central hooks + shared policy helpers | OWASP: validate permissions on every request; missing one check breaks the model | 

---

## Common pitfalls (Phase 3)
1. **Continuing to allow requests when `request.site` can’t be resolved** (today’s dev shortcut) — becomes a cross-site boundary bug once auth and keys exist.
2. **Relying on UI-only RBAC** — OWASP stresses server-side validation on every request.
3. **Storing bearer tokens in places that leak** — avoid query params; use Authorization header (RFC 6750).
4. **Cookie scoping mistakes** — setting `Domain=` too broadly can share cookies across subdomains (OWASP CSRF + session guidance).
5. **Refresh endpoint without replay semantics** — rotation without replay detection can lock users out or fail to detect theft.

---

## Open questions
- **Refresh token hashing**: bcrypt is acceptable but can be expensive at high scale. Consider:
  - bcrypt for API keys and user passwords (slow by design)
  - for refresh tokens, a fast keyed hash (e.g., HMAC-SHA256) may be sufficient if tokens are high entropy and the DB is protected. (Needs a decision.)
- **CSRF mechanism choice**: cookie-to-header (simple) vs signed double-submit (more “stateless”). If you add `@fastify/csrf`, validate compatibility and maintenance.
- **Hostname model**: single hostname per site vs multiple hostnames table.
- **Where to enforce site resolution**: only protected routes vs also front-end routing/proxy behavior.

---

## Sources

| Topic | Source | Confidence |
|---|---|---|
| Fastify JWT options (`cookie`, `onlyCookie`) and examples | https://github.com/fastify/fastify-jwt | HIGH |
| Fastify cookie security options + `__Host-` prefix note | https://github.com/fastify/fastify-cookie | HIGH |
| OWASP CSRF patterns (cookie-to-header, signed double-submit) | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html | HIGH |
| OWASP session cookie hardening (Secure/HttpOnly/SameSite, Domain/Path scoping, no-store) | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html | HIGH |
| OWASP authorization fundamentals (least privilege, deny-by-default, validate every request, IDOR notes) | https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html | HIGH |
| OAuth 2.0 refresh token confidentiality + rotation | https://www.rfc-editor.org/rfc/rfc6749#section-10.4 | HIGH |
| OAuth 2.0 security considerations for refresh token rotation | https://www.rfc-editor.org/rfc/rfc6819#section-5.2.2.3 | HIGH |
| Bearer token transport recommendations | https://www.rfc-editor.org/rfc/rfc6750 | HIGH |
| Fastify trust proxy behavior (request hostname) | https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Server.md#trustproxy and https://raw.githubusercontent.com/fastify/fastify/v4.28.0/docs/Reference/Request.md | HIGH |
