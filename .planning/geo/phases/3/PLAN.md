## Phase 3 Success Criteria

```
SC-3.1 — POST /api/auth/login: bcrypt verify, JWT access (15min, {userId,role}), HttpOnly SameSite=Strict refresh cookie (7d), {accessToken, user} response; invalid creds → 401
SC-3.2 — POST /api/auth/refresh: reads cookie, DB lookup (not expired, not revoked), rotates (revoke old, insert new), returns new accessToken; invalid → 401
SC-3.3 — POST /api/auth/logout: revokes refresh token in DB, clears cookie; always 204
SC-3.4 — All /api/admin/** routes require valid JWT Authorization: Bearer header; missing/expired → 401
SC-3.5 — viewer role: GET only; attempting POST/PATCH/DELETE → 403. admin role: full access
SC-3.6 — Request to /api/protected/** resolves site from Host header; unknown hostname → 404; X-Site-Slug header as dev fallback when host is localhost/127.0.0.1
SC-3.7 — Migrations 003_create_users.sql and 004_create_refresh_tokens.sql exist with correct schema
SC-3.8 — Vitest coverage ≥80% all metrics; tests for AuthService, authenticate, requireRole, hostname routing
SC-3.9 — Frontend: /login page, RequireAuth wrapper, Axios 401 auto-refresh interceptor, logout clears state
SC-3.10 — backend/scripts/seed-admin.ts creates admin user from ADMIN_EMAIL + ADMIN_PASSWORD env vars
```

## Global Implementation Rules

1. Refresh token stored as **bcrypt hash** in DB — never store raw token value
2. Cookie flags: HttpOnly, SameSite=Strict, Secure (production), Path=/api/auth
3. Token rotation on every /api/auth/refresh — old token revoked immediately
4. JWT_SECRET loaded from `process.env.JWT_SECRET` — never hardcoded
5. Access token NOT stored in localStorage — stored in module-level variable in `frontend/src/lib/auth.ts`
6. All SQL uses parameterized queries ($1, $2...) — no string interpolation
7. `GET /api/auth/me` endpoint must exist — returns `{id, email, role}` from JWT; used by frontend useAuth hook

## Tasks

### AUTH-001 — Create users migration
- **File:** `backend/migrations/003_create_users.sql`
- **Dependencies:** none
- **Action:** Create `users` table: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `email TEXT NOT NULL UNIQUE`, `password_hash TEXT NOT NULL`, `role TEXT NOT NULL CHECK (role IN ('admin','viewer')) DEFAULT 'viewer'`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`; add updated_at trigger (same pattern as sites table in 001)
- **Done when:** File exists, SQL is valid, updated_at trigger present

### AUTH-002 — Create refresh_tokens migration
- **File:** `backend/migrations/004_create_refresh_tokens.sql`
- **Dependencies:** AUTH-001 (users table must exist first)
- **Action:** Create `refresh_tokens` table: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `token_hash TEXT NOT NULL`, `expires_at TIMESTAMPTZ NOT NULL`, `revoked BOOLEAN NOT NULL DEFAULT false`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`; create index on `(user_id, revoked)`
- **Done when:** File exists, FK to users, index present

### AUTH-003 — Create User model
- **File:** `backend/src/models/User.ts`
- **Dependencies:** none
- **Action:** Define `UserRole = 'admin' | 'viewer'` type, `User` interface (id, email, role, created_at, updated_at), Zod `LoginSchema = z.object({email: z.string().email(), password: z.string().min(8)})`, exported types `LoginInput`
- **Done when:** Types and schemas exported, no `password_hash` in `User` type (never expose hash)

### AUTH-004 — Create AuthService
- **File:** `backend/src/services/AuthService.ts`
- **Dependencies:** AUTH-003, AUTH-001, AUTH-002
- **Action:** 
  - `login(email, password)`: query users by email, bcrypt.compare password, throw 401-equivalent error if invalid; generate access JWT (`fastify.jwt.sign` — need to accept fastify instance or use jsonwebtoken directly), generate refresh token UUID, store bcrypt hash in refresh_tokens table with 7-day expiry; return `{accessToken, user:{id,email,role}}`
  - `refresh(rawToken)`: find non-revoked, non-expired row matching bcrypt hash; revoke it; generate new access + refresh tokens; return `{accessToken, refreshToken}`
  - `logout(rawToken)`: find and revoke matching token; no-op if not found (idempotent)
  - `getMe(userId)`: query users by id, return `{id, email, role}`
  - Use `jsonwebtoken` package directly (avoid circular fastify dependency): `jwt.sign({userId, role}, process.env.JWT_SECRET!, {expiresIn: '15m'})`
  - **Security:** bcrypt hash refresh token before storing; compare with bcrypt.compare on lookup
- **Done when:** All 4 methods implemented, bcrypt used for refresh token storage, JWT_SECRET from env

### AUTH-005 — Create authenticate middleware
- **File:** `backend/src/middleware/authenticate.ts`
- **Dependencies:** AUTH-003
- **Action:** Fastify preHandler that: reads `Authorization` header, validates format `Bearer <token>`, calls `jwt.verify(token, process.env.JWT_SECRET!)`, attaches decoded payload as `request.user = {userId, role}`; missing header → 401; invalid/expired token → 401. Augment `FastifyRequest` with `user?: {userId: string; role: UserRole}` via TypeScript module augmentation
- **Done when:** Middleware exported, FastifyRequest augmented, 401 on missing/invalid/expired

### AUTH-006 — Create requireRole middleware
- **File:** `backend/src/middleware/requireRole.ts`
- **Dependencies:** AUTH-005 (request.user must be set)
- **Action:** Factory `requireRole(role: UserRole): FastifyPreHandlerHookHandler` — checks `request.user?.role`; if no user → 403; if role is 'viewer' and required is 'admin' → 403; allows admin to access viewer routes
- **Done when:** Factory exported, viewer→admin route returns 403, admin→viewer route passes

### AUTH-007 — Create auth routes
- **File:** `backend/src/routes/auth.ts`
- **Dependencies:** AUTH-004, AUTH-005
- **Action:** 
  - `POST /api/auth/login`: Zod validate body with LoginSchema; call AuthService.login; set cookie `refreshToken` HttpOnly SameSite=Strict Secure(prod-only via `process.env.NODE_ENV==='production'`) Path=/api/auth maxAge=7d; return `{accessToken, user}`
  - `POST /api/auth/refresh`: read `request.cookies.refreshToken`; call AuthService.refresh; set new cookie; return `{accessToken}`
  - `POST /api/auth/logout`: read cookie; call AuthService.logout; clear cookie (`reply.clearCookie`); return 204
  - `GET /api/auth/me`: authenticate preHandler; call AuthService.getMe(request.user.userId); return `{id, email, role}`
- **Done when:** All 4 endpoints implemented, cookie attributes correct, 204 on logout

### AUTH-008 — Protect admin routes
- **File:** `backend/src/routes/sites.ts`
- **Dependencies:** AUTH-005, AUTH-006
- **Action:** Add `authenticate` to all route preHandlers. Add `requireRole('admin')` to POST, PATCH, DELETE routes only. GET routes: `authenticate` only (viewer can read). Read the existing file first to ensure preHandler arrays are extended, not replaced
- **Done when:** All routes have authenticate; write routes have requireRole('admin'); GET routes allow viewer

### AUTH-009 — Protect access logs routes
- **File:** `backend/src/routes/accessLogs.ts`
- **Dependencies:** AUTH-005
- **Action:** Add `authenticate` preHandler to GET route
- **Done when:** Route requires valid JWT

### AUTH-010 — Update app.ts
- **File:** `backend/src/app.ts`
- **Dependencies:** AUTH-007, AUTH-008, AUTH-009
- **Action:** Register `@fastify/jwt` with `secret: process.env.JWT_SECRET`; register `@fastify/cookie`; register `authRoutes`. Read existing file first.
- **Done when:** Both plugins registered, authRoutes registered

### AUTH-011 — Update hostname routing
- **File:** `backend/src/app.ts`
- **Dependencies:** AUTH-010
- **Action:** In the preHandler that resolves `request.site` for `/api/protected/**` paths: after trying `siteService.findByHostname(request.hostname)`, if not found AND hostname is `localhost` or `127.0.0.1`, check `request.headers['x-site-slug']` and try `siteService.findBySlug(slug)`. If still not found → reply.status(404).send({error:'Site not found'}). Read existing app.ts before editing.
- **Done when:** Unknown hostname → 404; X-Site-Slug fallback works for localhost

### AUTH-012 — Create seed-admin script
- **File:** `backend/scripts/seed-admin.ts`
- **Dependencies:** AUTH-001
- **Action:** Connect to DB pool, check if user with `process.env.ADMIN_EMAIL` exists, if not hash `process.env.ADMIN_PASSWORD` with bcrypt (12 rounds) and insert with role='admin'; log result; exit. Must be runnable with `npx ts-node scripts/seed-admin.ts`
- **Done when:** Script exists, uses env vars, bcrypt 12 rounds, idempotent (no duplicate on re-run)

### AUTH-013 — AuthService tests
- **File:** `backend/src/services/__tests__/AuthService.test.ts`
- **Dependencies:** AUTH-004
- **Action:** Mock pg pool and bcrypt. Tests:
  1. login success: mock user found, bcrypt.compare→true, returns {accessToken, user}
  2. login wrong password: bcrypt.compare→false, throws error
  3. login unknown email: rows empty, throws error
  4. refresh valid token: finds un-revoked row, bcrypt match, revokes old, returns new tokens
  5. refresh revoked token: row has revoked=true, throws
  6. refresh expired token: expires_at in past, throws
  7. logout: finds token, marks revoked=true
  8. getMe: returns user without password_hash
- **Done when:** 8+ tests, mocks pool and bcrypt, covers all 4 service methods

### AUTH-014 — authenticate middleware tests
- **File:** `backend/src/middleware/__tests__/authenticate.test.ts`
- **Dependencies:** AUTH-005
- **Action:** Mock jsonwebtoken. Tests:
  1. valid Bearer token → request.user set, next called
  2. missing Authorization header → 401
  3. malformed header (no Bearer prefix) → 401
  4. expired token (jwt.verify throws TokenExpiredError) → 401
  5. invalid signature → 401
- **Done when:** 5+ tests covering all paths

### AUTH-015 — requireRole tests
- **File:** `backend/src/middleware/__tests__/requireRole.test.ts`
- **Dependencies:** AUTH-006
- **Action:** Tests:
  1. admin accessing admin-required route → passes (next called)
  2. viewer accessing admin-required route → 403
  3. admin accessing viewer-required route → passes  
  4. no request.user → 403
- **Done when:** 4+ tests

### AUTH-016 — Hostname routing tests
- **File:** `backend/src/app.test.ts` or new test file
- **Dependencies:** AUTH-011
- **Action:** Using Fastify inject(): 
  1. request with known Host header → site resolved (mock siteService)
  2. request with unknown Host → 404
  3. request with host=localhost + X-Site-Slug header → site resolved via slug
  4. request with host=localhost + no X-Site-Slug → 404
- **Done when:** 4+ tests, uses Fastify injection

### AUTH-017 — Update package.json deps
- **File:** `backend/package.json`
- **Dependencies:** none (do first or parallel)
- **Action:** Add to dependencies: `@fastify/jwt`, `@fastify/cookie`, `bcryptjs`, `jsonwebtoken`. Add to devDependencies: `@types/bcryptjs`, `@types/jsonwebtoken`. Read existing package.json first to get current version pattern. Use latest stable versions.
- **Done when:** All 6 packages listed in package.json

---

### Frontend Tasks

### UI-001 — Auth module
- **File:** `frontend/src/lib/auth.ts`
- **Dependencies:** none
- **Action:** Module-level `let accessToken: string | null = null`. Export `setAccessToken(t)`, `getAccessToken()`, `clearAccessToken()`. Create authenticated axios instance with request interceptor that adds `Authorization: Bearer ${getAccessToken()}` header. Add response interceptor: on 401 error, attempt `POST /api/auth/refresh` (using a separate axios instance without the interceptor to avoid loops), if success call setAccessToken with new token and retry original request; if refresh fails, clearAccessToken and redirect to /login.
- **Done when:** Module exports 3 token functions, interceptor auto-refreshes on 401, no circular retry loop

### UI-002 — Login page
- **File:** `frontend/src/pages/LoginPage.tsx`
- **Dependencies:** UI-001
- **Action:** Form with email + password inputs, submit calls `POST /api/auth/login` via plain axios (no auth header needed), on success: `setAccessToken(data.accessToken)` + `queryClient.invalidateQueries({queryKey:['me']})` + `navigate('/sites')`; on 401: show "Invalid email or password" error message
- **Done when:** Form renders, calls login endpoint, stores token, redirects, shows error on 401

### UI-003 — RequireAuth component
- **File:** `frontend/src/components/RequireAuth.tsx`
- **Dependencies:** UI-001, UI-004
- **Action:** Component that checks `getAccessToken()` — if null → `<Navigate to="/login" replace />`; otherwise renders children. Wrap in useEffect that also attempts a token refresh on mount (`POST /api/auth/refresh`) to restore session after page reload.
- **Done when:** Unauthenticated users redirect to /login; page-reload restores session if refresh cookie exists

### UI-004 — useAuth hook
- **File:** `frontend/src/hooks/useAuth.ts`
- **Dependencies:** UI-001
- **Action:** `useQuery({queryKey:['me'], queryFn: () => authApi.get('/auth/me').then(r=>r.data)})` where `authApi` is the auth axios instance from lib/auth.ts. Export `useLogout` mutation: `useMutation({mutationFn: () => axios.post('/api/auth/logout'), onSuccess: () => { clearAccessToken(); queryClient.clear(); navigate('/login') }})`
- **Done when:** Hook returns `{data: user, isLoading}`, useLogout triggers logout flow

### UI-005 — Update Layout (user display + logout)
- **File:** `frontend/src/components/Layout.tsx`
- **Dependencies:** UI-004
- **Action:** Read existing Layout.tsx. In the navbar: add `const {data: user} = useAuth()` and show `{user?.email}` and a Logout button that calls `logout.mutate()`. Wrap in QueryClientProvider context (already exists in App.tsx).
- **Done when:** User email visible in nav, logout button calls logout mutation

### UI-006 — Update App.tsx with auth routing
- **File:** `frontend/src/App.tsx`
- **Dependencies:** UI-002, UI-003
- **Action:** Read existing App.tsx. Add `/login` route → `<LoginPage />` (no Layout wrapper needed, or minimal). Wrap all existing protected routes (`/sites`, `/sites/new`, `/sites/:id/edit`, `/sites/:siteId/logs`, `/protected/:siteId`) with `<RequireAuth>`. Import `LoginPage` and `RequireAuth`.
- **Done when:** /login accessible without auth; all /sites routes redirect to /login when no token

## Verification

After implementation, verify against SC-3.1 through SC-3.10. Run all existing tests + new tests. Coverage must remain ≥80%.