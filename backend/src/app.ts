import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { healthRoutes } from './routes/health.js';
import { siteRoutes } from './routes/sites.js';
import { accessLogRoutes } from './routes/accessLogs.js';
import { protectedRoutes } from './routes/protected.js';
import { geoRoutes } from './routes/geo.js';
import { authRoutes } from './routes/auth.js';
import { geoIPService } from './services/GeoIPService.js';
import { siteService } from './services/SiteService.js';
import { ipAccessControl } from './middleware/ipAccessControl.js';
import { Site } from './models/Site.js';

declare module 'fastify' {
  interface FastifyRequest {
    site?: Site;
  }
}

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  // Security plugins
  app.register(helmet, {
    contentSecurityPolicy: false,
  });

  app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  // JWT plugin
  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
  });

  // Cookie plugin
  app.register(fastifyCookie);

  // Initialize GeoIP service on startup
  app.addHook('onReady', async () => {
    await geoIPService.initialize();
  });

  // Site resolution + IP access control for /api/protected/* routes
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith('/api/protected/')) return;

    const hostname = request.hostname;
    let site: Site | null = null;

    // Try to resolve site by hostname
    if (hostname) {
      site = await siteService.findByHostname(hostname);
    }

    // Dev fallback: if host is localhost/127.0.0.1, try X-Site-Slug header
    if (!site && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      const slug = request.headers['x-site-slug'];
      if (typeof slug === 'string') {
        site = await siteService.findBySlug(slug);
      }
    }

    // Unknown hostname → 404
    if (!site) {
      return reply.status(404).send({ error: 'Site not found' });
    }

    request.site = site;
    await ipAccessControl(request, reply);
  });

  // Routes
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(siteRoutes);
  app.register(accessLogRoutes);
  app.register(protectedRoutes);
  app.register(geoRoutes);

  return app;
}
