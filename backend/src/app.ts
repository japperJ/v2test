import Fastify, { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';
import { healthRoutes } from './routes/health.js';
import { siteRoutes } from './routes/sites.js';
import { accessLogRoutes } from './routes/accessLogs.js';
import { protectedRoutes } from './routes/protected.js';
import { geoRoutes } from './routes/geo.js';
import { authRoutes } from './routes/auth.js';
import { gdprRoutes } from './routes/gdpr.js';
import { artifactRoutes } from './routes/artifacts.js';
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
  const isTest = process.env.NODE_ENV === 'test';

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  // --- Wave 5: OpenAPI / Swagger (must be registered before routes) ---
  app.register(swagger, {
    openapi: {
      info: { title: 'Geo-Fenced Webserver API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    },
  });

  app.register(swaggerUi, { routePrefix: '/documentation' });

  // --- Wave 6: Security plugins ---
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'unpkg.com', 'cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'unpkg.com', 'cdn.jsdelivr.net'],
        imgSrc: [
          "'self'",
          'data:',
          '*.tile.openstreetmap.org',
          ...(process.env.MINIO_PUBLIC_ORIGIN ? [process.env.MINIO_PUBLIC_ORIGIN] : []),
        ],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
  });

  app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  // --- JWT plugin ---
  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
  });

  // --- Cookie plugin ---
  app.register(fastifyCookie);

  // --- Wave 4: Normalised error + 404 handlers ---
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error(error);
    }
    return reply.status(statusCode).send({
      error: error.name || 'Error',
      message:
        statusCode === 500 && process.env.NODE_ENV === 'production'
          ? 'Internal Server Error'
          : error.message,
      statusCode,
    });
  });

  app.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(404).send({
      error: 'NotFound',
      message: `Route ${_request.url} not found`,
      statusCode: 404,
    });
  });

  // --- Wave 3: Redis-backed rate limiting (skipped in test mode) ---
  let redisClient: Redis | undefined;
  if (!isTest) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
  }

  // --- Initialize GeoIP service on startup ---
  app.addHook('onReady', async () => {
    await geoIPService.initialize();
  });

  // --- Site resolution + IP access control for /api/protected/* routes ---
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

  // --- Health route (no rate limit) ---
  app.register(healthRoutes);

  // --- Auth routes: 10 req / 15 min per IP ---
  app.register(async (scope) => {
    if (!isTest && redisClient) {
      await scope.register(rateLimit, {
        global: true,
        max: 10,
        timeWindow: '15 minutes',
        redis: redisClient,
        keyGenerator: (req: FastifyRequest) =>
          req.ip ?? (req.socket?.remoteAddress ?? 'unknown'),
        errorResponseBuilder: (_req, context) => ({
          error: 'TooManyRequests',
          message: `Rate limit exceeded. Try again in ${context.after}`,
          statusCode: 429,
        }),
      });
    }
    scope.register(authRoutes);
  });

  // --- Admin routes: 100 req / 15 min per IP ---
  app.register(async (scope) => {
    if (!isTest && redisClient) {
      await scope.register(rateLimit, {
        global: true,
        max: 100,
        timeWindow: '15 minutes',
        redis: redisClient,
        keyGenerator: (req: FastifyRequest) =>
          req.ip ?? (req.socket?.remoteAddress ?? 'unknown'),
        errorResponseBuilder: (_req, context) => ({
          error: 'TooManyRequests',
          message: `Rate limit exceeded. Try again in ${context.after}`,
          statusCode: 429,
        }),
      });
    }
    scope.register(siteRoutes);
    scope.register(accessLogRoutes);
    scope.register(gdprRoutes);
    scope.register(artifactRoutes);
  });

  // --- Protected routes: 30 req / 1 min per IP ---
  app.register(async (scope) => {
    if (!isTest && redisClient) {
      await scope.register(rateLimit, {
        global: true,
        max: 30,
        timeWindow: '1 minute',
        redis: redisClient,
        keyGenerator: (req: FastifyRequest) =>
          req.ip ?? (req.socket?.remoteAddress ?? 'unknown'),
        errorResponseBuilder: (_req, context) => ({
          error: 'TooManyRequests',
          message: `Rate limit exceeded. Try again in ${context.after}`,
          statusCode: 429,
        }),
      });
    }
    scope.register(protectedRoutes);
    scope.register(geoRoutes);
  });

  return app;
}
