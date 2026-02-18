import { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pool from '../db/pool.js';

const REDIS_TIMEOUT_MS = 3000;

// Pings Redis and returns false on any connection/timeout error.
// Marked with c8 ignore because it requires a live Redis instance — tested
// end-to-end, not in unit-test runs.
/* c8 ignore start */
async function pingRedis(redisUrl: string): Promise<boolean> {
  const client = new Redis(redisUrl, {
    connectTimeout: REDIS_TIMEOUT_MS,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  try {
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}
/* c8 ignore stop */

export async function healthRoutes(app: FastifyInstance) {
  // Handler tests live infrastructure (real Postgres + Redis round-trips).
  // Covered by integration/E2E tests; excluded from unit-test coverage.
  /* c8 ignore start */
  app.get('/health', async (_request, reply) => {
    let postgres: 'ok' | 'error' = 'ok';
    let redis: 'ok' | 'error' = 'ok';

    // Check PostgreSQL
    try {
      await pool.query('SELECT 1');
    } catch {
      postgres = 'error';
    }

    // Check Redis with a real PING
    const redisOk = await pingRedis(process.env.REDIS_URL || 'redis://localhost:6379');
    if (!redisOk) redis = 'error';

    const healthy = postgres === 'ok' && redis === 'ok';
    const status = healthy ? 'healthy' : 'degraded';

    return reply.status(healthy ? 200 : 503).send({ postgres, redis, status });
  });
  /* c8 ignore stop */
}
