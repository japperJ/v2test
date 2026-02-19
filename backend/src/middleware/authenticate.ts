import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { UserRole } from '../models/User.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { userId: string; role: UserRole };
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    reply.status(401).send({ error: 'Missing authorization header' });
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Invalid authorization format' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: UserRole };
    request.user = { userId: decoded.userId, role: decoded.role };
  } catch {
    reply.status(401).send({ error: 'Invalid or expired token' });
  }
}
