---
phase: 3
plan: 1
status: complete
tasks_completed: 22/22
commits:
  - b2f4074  # feat: add users and refresh_tokens migrations (003, 004)
  - 7a42daf  # feat: add User model and AuthService with bcrypt refresh tokens
  - b1a9aec  # feat: add authenticate and requireRole middleware
  - a165169  # feat: add auth routes, protect admin routes, add JWT/cookie plugins, X-Site-Slug fallback
  - cc8b941  # test: add AuthService, authenticate, requireRole, hostname routing tests; update geo test for 404 behavior
  - 9a12e40  # feat: add frontend auth flow
files_modified:
  - backend/migrations/003_create_users.sql (created)
  - backend/migrations/004_create_refresh_tokens.sql (created)
  - backend/src/models/User.ts (created)
  - backend/src/services/AuthService.ts (created)
  - backend/src/middleware/authenticate.ts (created)
  - backend/src/middleware/requireRole.ts (created)
  - backend/src/routes/auth.ts (created)
  - backend/src/app.ts (modified)
  - backend/src/routes/sites.ts (modified)
  - backend/src/routes/accessLogs.ts (modified)
  - backend/src/services/SiteService.ts (modified — added findBySlug)
  - backend/scripts/seed-admin.ts (created)
  - backend/src/services/__tests__/AuthService.test.ts (created)
  - backend/src/middleware/__tests__/authenticate.test.ts (created)
  - backend/src/middleware/__tests__/requireRole.test.ts (created)
  - backend/src/app.test.ts (created)
  - backend/src/routes/__tests__/geo.verifyLocation.test.ts (modified)
  - backend/package.json (modified — added bcryptjs, jsonwebtoken, @types)
  - backend/vitest.config.ts (modified — added JWT_SECRET env)
  - frontend/src/lib/auth.ts (created)
  - frontend/src/pages/LoginPage.tsx (created)
  - frontend/src/components/RequireAuth.tsx (created)
  - frontend/src/hooks/useAuth.ts (created)
  - frontend/src/components/Layout.tsx (modified)
  - frontend/src/App.tsx (modified)
deviations:
  - SiteService.findBySlug added (not listed as a separate task but required by AUTH-011)
  - geo.verifyLocation.test.ts updated to return geo_only site from findByHostname mock (required by AUTH-011 404 behavior change)
decisions:
  - Used bcryptjs (pure JS) rather than bcrypt (native addon) for refresh token hashing per PLAN spec
  - AuthService uses jsonwebtoken directly instead of fastify.jwt to avoid circular plugin dependency
  - @fastify/jwt still registered in app.ts as required; authentication uses jsonwebtoken directly
  - Refresh token lookup scans non-revoked/non-expired rows using bcrypt.compare (O(N) but correct per spec)
  - geo_only access_mode used in geo test mock site to let ipAccessControl pass through
  - process.env.JWT_SECRET set in vitest.config.ts env block so all test files get it automatically
---

# Phase 3, Plan 1 Summary

## What Was Done

Implemented complete JWT-based authentication and RBAC for the geo-fenced multi-site webserver.

### Backend
- **Migrations 003 + 004**: Created `users` table (id, email, password_hash, role, timestamps) and `refresh_tokens` table (id, user_id FK, token_hash, expires_at, revoked) with proper indexes.
- **User model**: `UserRole` type, `User` interface (no password_hash), `LoginSchema` with Zod validation.
- **AuthService**: `login` (bcrypt.compare, JWT access token 15m, refresh token as bcrypt hash stored in DB), `refresh` (token rotation — revoke old, insert new), `logout` (idempotent revocation), `getMe` (returns `{id,email,role}`).
- **authenticate middleware**: Reads `Authorization: Bearer`, calls `jwt.verify`, attaches `request.user`. TypeScript declaration merging for `FastifyRequest.user`.
- **requireRole middleware**: Factory returning a preHandler that checks `request.user.role`. admin passes all; viewer blocked from admin-required routes (403).
- **auth routes**: POST /api/auth/login, POST /api/auth/refresh, POST /api/auth/logout, GET /api/auth/me — cookies are HttpOnly, SameSite=Strict, Secure(prod), Path=/api/auth, maxAge=7d.
- **app.ts**: Registered @fastify/jwt and @fastify/cookie; registered authRoutes; updated preHandler to return 404 for unknown hostnames; added X-Site-Slug localhost fallback via new `SiteService.findBySlug`.
- **sites.ts**: authenticate on all routes; requireRole('admin') on POST/PATCH/DELETE; viewer allowed on GETs.
- **accessLogs.ts**: authenticate on GET route.
- **seed-admin.ts**: Idempotent admin user creation from ADMIN_EMAIL + ADMIN_PASSWORD env vars; bcrypt 12 rounds.

### Frontend
- **lib/auth.ts**: Module-level access token storage (NOT localStorage); authenticated axios instance with request interceptor; 401 response interceptor auto-refreshes and retries original request.
- **LoginPage.tsx**: Email/password form, calls POST /api/auth/login, stores token, navigates to /sites; shows error on 401.
- **RequireAuth.tsx**: Wraps protected routes; attempts silent token refresh on mount for page-reload session restore.
- **useAuth.ts**: `useAuth()` query hook (GET /api/auth/me via authApi); `useLogout()` mutation that clears token + query cache.
- **Layout.tsx**: Shows authenticated user email and Logout button in navbar.
- **App.tsx**: Added /login route (no auth wrapper); wrapped all /sites/** and /protected/** routes with RequireAuth.

## Deviations

1. **SiteService.findBySlug added**: Required by AUTH-011 (X-Site-Slug fallback) but not listed as a separate task. Added minimal method using existing SITE_COLUMNS pattern.
2. **geo.verifyLocation.test.ts updated**: The new 404 hostname behavior (AUTH-011) would have broken the existing geo tests. Updated the SiteService mock to return a `geo_only` site from `findByHostname`, allowing `ipAccessControl` to pass through harmlessly while preserving all 7 existing test assertions.
3. **process.env.JWT_SECRET in vitest.config.ts**: Added `env: { JWT_SECRET: '...' }` to vitest.config.ts so all test files get a valid JWT_SECRET without per-file setup. Eliminates boilerplate across test files.

## Verification

### Test Results
- **Test Files**: 12 passed (12)
- **Tests**: 86 passed (86) — up from 59 (27 new tests added)
- **Duration**: ~2s

### Coverage Metrics (all ≥ 80% threshold)
| Metric     | Result |
|------------|--------|
| Statements | 83.75% ✅ |
| Branches   | 88.62% ✅ |
| Functions  | 89.47% ✅ |
| Lines      | 83.75% ✅ |

### New Tests Added
- AuthService.test.ts: 12 tests (login, refresh, logout, getMe — all paths)
- authenticate.test.ts: 5 tests (valid token, missing header, bad format, expired, invalid sig)
- requireRole.test.ts: 4 tests (admin→admin, viewer→admin blocked, admin→viewer, no user)
- app.test.ts: 4 tests (known host → 200, unknown host → 404, localhost+slug → 200, localhost no-slug → 404)

### Success Criteria Verification
- SC-3.1 ✅ POST /api/auth/login: bcrypt verify, JWT 15m, HttpOnly cookie 7d, {accessToken, user}; 401 on invalid
- SC-3.2 ✅ POST /api/auth/refresh: reads cookie, rotates token, returns new accessToken; 401 on invalid
- SC-3.3 ✅ POST /api/auth/logout: revokes token, clears cookie, returns 204
- SC-3.4 ✅ All /api/admin/** routes require valid JWT; missing/expired → 401
- SC-3.5 ✅ viewer: GET only; POST/PATCH/DELETE → 403. admin: full access
- SC-3.6 ✅ Unknown hostname → 404; X-Site-Slug fallback for localhost/127.0.0.1
- SC-3.7 ✅ Migrations 003 and 004 created with correct schema
- SC-3.8 ✅ Coverage ≥80% all metrics; 86 tests passing
- SC-3.9 ✅ /login page, RequireAuth wrapper, Axios 401 auto-refresh, logout clears state
- SC-3.10 ✅ seed-admin.ts: ADMIN_EMAIL + ADMIN_PASSWORD env vars, bcrypt 12 rounds, idempotent
