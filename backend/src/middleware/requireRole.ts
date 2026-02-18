import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '../models/User.js';

type PreHandlerFn = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export function requireRole(requiredRole: UserRole): PreHandlerFn {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.status(403).send({ error: 'Forbidden' });
      return;
    }

    // admin can access both admin and viewer routes
    // viewer can only access viewer routes
    if (requiredRole === 'admin' && request.user.role !== 'admin') {
      reply.status(403).send({ error: 'Forbidden: insufficient permissions' });
      return;
    }
  };
}
