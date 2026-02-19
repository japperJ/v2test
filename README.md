# GeoFence — Geo-Fenced Multi-Site Webserver

A production-ready webserver with IP and GPS-based access control, supporting multiple sites with independent configurations.

## Features

- **IP Access Control**: Allowlist/denylist, country filtering, VPN/proxy detection
- **GPS Geofencing**: PostGIS polygon/radius geofencing with browser GPS
- **Multi-Site**: Hostname-based site routing with multi-layer caching (LRU + Redis)
- **RBAC**: Super admin, site admin, viewer roles
- **Audit Logs**: Access logs with async screenshot capture
- **GDPR Compliant**: Consent, data retention, export, and deletion

## Tech Stack

| Component | Technology |
|---|---|
| Backend API | Fastify + TypeScript (Node.js 22) |
| Frontend | React + TypeScript + Vite + Tailwind |
| Database | PostgreSQL 16 + PostGIS |
| Cache | Redis 7 |
| Job Queue | BullMQ |
| Storage | MinIO / AWS S3 |
| Screenshots | Playwright |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 22.x LTS
- MaxMind GeoIP databases (see `backend/data/maxmind/README.md`)

### Development Setup

1. **Clone and setup:**
   ```bash
   git clone <repo>
   cd geofence
   cp backend/.env.example backend/.env
   # Edit backend/.env with your settings
   ```

2. **Download MaxMind databases:**
   See `backend/data/maxmind/README.md`

3. **Start services:**
   ```bash
   cd infrastructure
   docker compose up -d postgres redis minio
   ```

4. **Install dependencies and run migrations:**
   ```bash
   cd backend
   npm install
   npm run migrate
   ```

5. **Start backend:**
   ```bash
   npm run dev
   # API available at http://localhost:3000
   # Health check: http://localhost:3000/health
   ```

6. **Start frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   # UI available at http://localhost:5173
   ```

## Project Structure

```
├── backend/           Fastify API server
├── frontend/          React + Vite admin UI
├── workers/           BullMQ screenshot worker
├── infrastructure/    Docker Compose, Kubernetes manifests
└── .planning/         Project planning and roadmap
```

## Documentation

- [Deployment Guide](.planning/DEPLOYMENT.md) *(Phase 5)*
- [API Documentation](http://localhost:3000/api/docs) *(after starting backend)*
- [Runbook](.planning/RUNBOOK.md) *(Phase 5)*

## Implementation Roadmap

See [Implementation Roadmap](.planning/geo/ROADMAP.md) for the full 6-phase plan.

## License

MIT
