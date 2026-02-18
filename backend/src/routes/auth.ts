import { FastifyInstance } from 'fastify';
import '@fastify/cookie';
import { authService } from '../services/AuthService.js';
import { authenticate } from '../middleware/authenticate.js';
import { LoginSchema } from '../models/User.js';

const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const COOKIE_PATH = '/api/auth';

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post('/api/auth/login', async (request, reply) => {
    const result = LoginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Validation error', details: result.error.flatten() });
    }

    try {
      const { accessToken, refreshToken, user } = await authService.login(
        result.data.email,
        result.data.password
      );

      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: COOKIE_PATH,
        maxAge: REFRESH_TOKEN_MAX_AGE,
      });

      return reply.send({ accessToken, user });
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 401) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }
      throw err;
    }
  });

  // POST /api/auth/refresh
  app.post('/api/auth/refresh', async (request, reply) => {
    const rawToken = request.cookies.refreshToken;
    if (!rawToken) {
      return reply.status(401).send({ error: 'No refresh token' });
    }

    try {
      const { accessToken, refreshToken } = await authService.refresh(rawToken);

      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: COOKIE_PATH,
        maxAge: REFRESH_TOKEN_MAX_AGE,
      });

      return reply.send({ accessToken });
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 401) {
        return reply.status(401).send({ error: 'Invalid refresh token' });
      }
      throw err;
    }
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (request, reply) => {
    const rawToken = request.cookies.refreshToken;
    if (rawToken) {
      await authService.logout(rawToken);
    }

    reply.clearCookie('refreshToken', { path: COOKIE_PATH });
    return reply.status(204).send();
  });

  // GET /api/auth/me
  app.get('/api/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await authService.getMe(request.user!.userId);
    return reply.send(user);
  });
}
