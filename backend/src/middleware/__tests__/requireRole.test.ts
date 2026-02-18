import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../requireRole.js';
import { FastifyRequest, FastifyReply } from 'fastify';

function makeRequest(user?: { userId: string; role: 'admin' | 'viewer' }): FastifyRequest {
  return { user } as unknown as FastifyRequest;
}

function makeReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

describe('requireRole middleware', () => {
  it('allows admin to access admin-required route', async () => {
    const request = makeRequest({ userId: 'user-1', role: 'admin' });
    const reply = makeReply();
    const handler = requireRole('admin');

    await handler(request, reply as unknown as FastifyReply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('blocks viewer from accessing admin-required route with 403', async () => {
    const request = makeRequest({ userId: 'user-2', role: 'viewer' });
    const reply = makeReply();
    const handler = requireRole('admin');

    await handler(request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden: insufficient permissions' });
  });

  it('allows admin to access viewer-required route', async () => {
    const request = makeRequest({ userId: 'user-1', role: 'admin' });
    const reply = makeReply();
    const handler = requireRole('viewer');

    await handler(request, reply as unknown as FastifyReply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns 403 when request.user is not set', async () => {
    const request = makeRequest(undefined);
    const reply = makeReply();
    const handler = requireRole('admin');

    await handler(request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden' });
  });
});
