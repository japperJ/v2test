import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import pool from '../db/pool.js';
import { UserRole } from '../models/User.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const REFRESH_TOKEN_BCRYPT_ROUNDS = 10;

function signAccessToken(userId: string, role: UserRole): string {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export class AuthService {
  async login(
    email: string,
    password: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; role: UserRole };
  }> {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      [email]
    );

    if (rows.length === 0) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    const accessToken = signAccessToken(user.id, user.role);
    const rawToken = randomUUID();
    const tokenHash = await bcrypt.hash(rawToken, REFRESH_TOKEN_BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    return {
      accessToken,
      refreshToken: rawToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async refresh(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { rows } = await pool.query(
      'SELECT id, user_id, token_hash FROM refresh_tokens WHERE revoked = false AND expires_at > now()',
      []
    );

    let matchedRow: { id: string; user_id: string; token_hash: string } | null = null;
    for (const row of rows) {
      if (await bcrypt.compare(rawToken, row.token_hash)) {
        matchedRow = row;
        break;
      }
    }

    if (!matchedRow) {
      throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
    }

    await pool.query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [matchedRow.id]);

    const { rows: userRows } = await pool.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [matchedRow.user_id]
    );

    if (userRows.length === 0) {
      throw Object.assign(new Error('User not found'), { statusCode: 401 });
    }

    const user = userRows[0];
    const accessToken = signAccessToken(user.id, user.role);
    const newRawToken = randomUUID();
    const newTokenHash = await bcrypt.hash(newRawToken, REFRESH_TOKEN_BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, newTokenHash, expiresAt]
    );

    return { accessToken, refreshToken: newRawToken };
  }

  // Returns the user_id that was logged out, or null if the token was not found.
  // Callers can use this for audit logging without an extra DB round-trip.
  async logout(rawToken: string): Promise<string | null> {
    const { rows } = await pool.query(
      'SELECT id, user_id, token_hash FROM refresh_tokens WHERE revoked = false',
      []
    );

    for (const row of rows) {
      if (await bcrypt.compare(rawToken, row.token_hash)) {
        await pool.query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [row.id]);
        return row.user_id;
      }
    }
    // Idempotent — no-op if token not found
    return null;
  }

  async getMe(userId: string): Promise<{ id: string; email: string; role: UserRole }> {
    const { rows } = await pool.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 });
    }

    return { id: rows[0].id, email: rows[0].email, role: rows[0].role };
  }
}

export const authService = new AuthService();
