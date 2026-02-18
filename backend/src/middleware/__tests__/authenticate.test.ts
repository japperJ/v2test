import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('jsonwebtoken', () => ({
  verify: vi.fn(),
}));

import * as jwt from 'jsonwebtoken';
import { authenticate } from '../authenticate.js';
import { FastifyRequest, FastifyReply } from 'fastify';

const mockJwt = jwt as { verify: ReturnType<typeof vi.fn> };

function makeRequest(authHeader?: string): FastifyRequest {
  return {
    headers: {
      authorization: authHeader,
    },
  } as unknown as FastifyRequest;
}

function makeReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
}

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  it('sets request.user and does not send a response on valid bearer token', async () => {
    const decoded = { userId: 'user-1', role: 'admin' };
    mockJwt.verify.mockReturnValue(decoded);

    const request = makeRequest('Bearer valid-token') as FastifyRequest & {
      user?: { userId: string; role: string };
    };
    const reply = makeReply();

    await authenticate(request, reply as unknown as FastifyReply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(request.user).toEqual({ userId: 'user-1', role: 'admin' });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const request = makeRequest(undefined);
    const reply = makeReply();

    await authenticate(request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Missing authorization header' });
  });

  it('returns 401 when Authorization header has no Bearer prefix', async () => {
    const request = makeRequest('Basic dXNlcjpwYXNz');
    const reply = makeReply();

    await authenticate(request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid authorization format' });
  });

  it('returns 401 on expired token (TokenExpiredError)', async () => {
    const error = new Error('jwt expired');
    error.name = 'TokenExpiredError';
    mockJwt.verify.mockImplementation(() => {
      throw error;
    });

    const request = makeRequest('Bearer expired-token');
    const reply = makeReply();

    await authenticate(request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  it('returns 401 on invalid signature (JsonWebTokenError)', async () => {
    const error = new Error('invalid signature');
    error.name = 'JsonWebTokenError';
    mockJwt.verify.mockImplementation(() => {
      throw error;
    });

    const request = makeRequest('Bearer tampered-token');
    const reply = makeReply();

    await authenticate(request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });
});
