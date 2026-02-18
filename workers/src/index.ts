import { startScreenshotWorker } from './screenshotWorker.js';

// Top-level handlers: log unexpected errors and keep the process alive.
// The orchestrator (Docker / supervisord) handles restarts if the process
// exits — we prefer controlled shutdown over silent crashes.
process.on('uncaughtException', (err) => {
  console.error('[worker] Uncaught exception:', err);
  // Allow the process to continue; BullMQ workers are resilient.
});

process.on('unhandledRejection', (reason) => {
  console.error('[worker] Unhandled rejection:', reason);
});

console.info('[worker] Starting screenshot worker...');

const worker = startScreenshotWorker();

async function shutdown() {
  console.info('[worker] Graceful shutdown initiated...');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

