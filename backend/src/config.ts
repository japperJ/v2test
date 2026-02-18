/**
 * Centralised environment configuration for the backend.
 *
 * Call `validateEnv()` in server.ts before `buildApp()` to fail fast on startup
 * when required environment variables are missing.
 *
 * The `config` object reads from process.env at module import time and is
 * intentionally non-throwing — validation is the responsibility of validateEnv().
 */

export interface BackendConfig {
  // Required
  DATABASE_URL: string;
  JWT_SECRET: string;
  REDIS_URL: string;
  AWS_ENDPOINT_URL: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  S3_BUCKET_NAME: string;
  // Optional with defaults
  PORT: number;
  NODE_ENV: string;
  CORS_ORIGIN: string;
  LOG_RETENTION_DAYS: number;
  MINIO_PUBLIC_ORIGIN: string;
  AWS_REGION: string;
}

const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'REDIS_URL',
  'AWS_ENDPOINT_URL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'S3_BUCKET_NAME',
] as const;

/**
 * Validates that all required environment variables are present.
 * Throws an Error with a descriptive message listing all missing keys.
 * Call this before buildApp() / app.listen() to get a clear startup error.
 */
export function validateEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = REQUIRED_VARS.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}\n` +
        `Refer to backend/.env.example for required configuration.`
    );
  }
}

export const config: BackendConfig = {
  // Required vars — validated by validateEnv() in server.ts before startup
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET: process.env.JWT_SECRET!,
  REDIS_URL: process.env.REDIS_URL!,
  AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL!,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID!,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY!,
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME!,
  // Optional with defaults
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  LOG_RETENTION_DAYS: parseInt(process.env.LOG_RETENTION_DAYS || '90', 10),
  MINIO_PUBLIC_ORIGIN: process.env.MINIO_PUBLIC_ORIGIN || '',
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
};
