import { buildApp } from './app.js';
import { validateEnv } from './config.js';
import { startLogRetentionJob } from './jobs/logRetention.js';

// Fail fast if required environment variables are missing — before any I/O.
validateEnv();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = buildApp();

startLogRetentionJob();

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Server listening on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
