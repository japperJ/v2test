// Run with: npx tsx scripts/seed-admin.ts
import bcrypt from 'bcryptjs';
import pool from '../src/db/pool.js';

const BCRYPT_ROUNDS = 12;

async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Error: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required');
    process.exit(1);
  }

  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

  if (rows.length > 0) {
    console.log(`Admin user ${email} already exists — skipping`);
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
    [email, passwordHash, 'admin']
  );

  console.log(`Admin user ${email} created successfully`);
  await pool.end();
}

seedAdmin().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
