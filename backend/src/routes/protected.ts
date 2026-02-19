import { FastifyInstance } from 'fastify';
import { Site } from '../models/Site.js';

interface RequestWithSite {
  site?: Site;
}

export async function protectedRoutes(app: FastifyInstance) {
  app.get('/api/protected/ping', async (request, reply) => {
    const site = (request as unknown as RequestWithSite).site;
    return reply.send({ status: 'ok', site: site?.slug ?? 'unknown' });
  });
}
