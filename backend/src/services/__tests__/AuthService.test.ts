import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

vi.mock('jsonwebtoken', () => ({
  sign: vi.fn().mockReturnValue('mock-access-token'),
}));

vi.mock('../../db/pool.js', () => ({
  default: {
    query: vi.fn(),
  },
}));

import * as bcrypt from 'bcryptjs';
import pool from '../../db/pool.js';
import { AuthService } from '../AuthService.js';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };
const mockBcrypt = bcrypt as { compare: ReturnType<typeof vi.fn>; hash: ReturnType<typeof vi.fn> };

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  password_hash: 'hashed-password',
  role: 'admin' as const,
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  describe('login', () => {
    it('returns accessToken and user on valid credentials', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockUser] })  // SELECT user
        .mockResolvedValueOnce({ rows: [] });          // INSERT refresh_token
      mockBcrypt.compare.mockResolvedValueOnce(true);
      mockBcrypt.hash.mockResolvedValueOnce('hashed-refresh-token');

      const result = await service.login('test@example.com', 'password123');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('admin');
      expect(result.user.id).toBe('user-uuid-1');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('throws on wrong password', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });
      mockBcrypt.compare.mockResolvedValueOnce(false);

      await expect(service.login('test@example.com', 'wrongpassword')).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('throws on unknown email', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.login('unknown@example.com', 'password123')).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('uses parameterized query for email lookup', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.login('test@example.com', 'password').catch(() => {});

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('$1');
      expect(params[0]).toBe('test@example.com');
    });
  });

  describe('refresh', () => {
    const mockTokenRow = {
      id: 'token-id-1',
      user_id: 'user-uuid-1',
      token_hash: 'hashed-refresh-token',
    };

    it('returns new tokens on valid refresh token', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockTokenRow] }) // SELECT non-revoked tokens
        .mockResolvedValueOnce({ rows: [] })              // UPDATE SET revoked
        .mockResolvedValueOnce({ rows: [mockUser] })      // SELECT user
        .mockResolvedValueOnce({ rows: [] });             // INSERT new refresh_token
      mockBcrypt.compare.mockResolvedValueOnce(true);
      mockBcrypt.hash.mockResolvedValueOnce('new-hashed-token');

      const result = await service.refresh('raw-refresh-token');

      expect(result.accessToken).toBe('mock-access-token');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('throws when no non-revoked tokens exist (revoked token)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No rows

      await expect(service.refresh('revoked-token')).rejects.toThrow('Invalid refresh token');
    });

    it('throws when bcrypt compare returns false (token not matched)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTokenRow] });
      mockBcrypt.compare.mockResolvedValueOnce(false);

      await expect(service.refresh('wrong-raw-token')).rejects.toThrow('Invalid refresh token');
    });

    it('revokes old token before issuing new one', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockTokenRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });
      mockBcrypt.compare.mockResolvedValueOnce(true);
      mockBcrypt.hash.mockResolvedValueOnce('new-hashed');

      await service.refresh('raw-token');

      const [updateSql, updateParams] = mockPool.query.mock.calls[1];
      expect(updateSql).toContain('UPDATE refresh_tokens SET revoked = true');
      expect(updateParams[0]).toBe('token-id-1');
    });
  });

  describe('logout', () => {
    it('revokes the matching token and returns user_id', async () => {
      const tokenRow = { id: 'token-id-1', user_id: 'user-uuid-1', token_hash: 'hashed-token' };
      mockPool.query
        .mockResolvedValueOnce({ rows: [tokenRow] }) // SELECT non-revoked tokens
        .mockResolvedValueOnce({ rows: [] });        // UPDATE SET revoked
      mockBcrypt.compare.mockResolvedValueOnce(true);

      const userId = await service.logout('raw-token');

      expect(userId).toBe('user-uuid-1');
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      const [updateSql, updateParams] = mockPool.query.mock.calls[1];
      expect(updateSql).toContain('UPDATE refresh_tokens SET revoked = true');
      expect(updateParams[0]).toBe('token-id-1');
    });

    it('is idempotent when token not found — returns null', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const userId = await service.logout('unknown-token');

      expect(userId).toBeNull();
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMe', () => {
    it('returns user without password_hash', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const user = await service.getMe('user-uuid-1');

      expect(user.id).toBe('user-uuid-1');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('admin');
      expect('password_hash' in user).toBe(false);
    });

    it('throws 404 when user not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.getMe('non-existent-id')).rejects.toThrow('User not found');
    });
  });
});
