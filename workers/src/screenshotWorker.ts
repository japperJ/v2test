import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { chromium } from 'playwright';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from './s3Client.js';
import { pool } from './db/pool.js';
import { ScreenshotJobPayload } from './types.js';

const SCREENSHOT_QUEUE_NAME = 'screenshot';
const BUCKET = process.env.S3_BUCKET_NAME ?? '';

async function processScreenshotJob(job: Job<ScreenshotJobPayload>): Promise<void> {
  const { accessLogId, accessLogTimestamp, siteId, attemptedUrl } = job.data;

  let browser = null;
  let page = null;

  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();

    await page.goto(attemptedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const screenshotBuffer = await page.screenshot({ fullPage: false });

    const ts = new Date(accessLogTimestamp);
    const year = ts.getFullYear();
    const month = String(ts.getMonth() + 1).padStart(2, '0');
    const objectKey = `screenshots/${siteId}/${year}/${month}/${accessLogId}.png`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: objectKey,
        Body: screenshotBuffer,
        ContentType: 'image/png',
      })
    );

    // UPDATE uses both id AND timestamp — required for partition pruning
    // on the range-partitioned access_logs table.
    await pool.query(
      'UPDATE access_logs SET screenshot_url = $1 WHERE id = $2 AND timestamp = $3',
      [objectKey, accessLogId, accessLogTimestamp]
    );

    console.info(`[screenshotWorker] Job ${job.id}: stored ${objectKey}`);
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

export function startScreenshotWorker(): Worker<ScreenshotJobPayload> {
  const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<ScreenshotJobPayload>(
    SCREENSHOT_QUEUE_NAME,
    async (job) => {
      // Each job is wrapped in its own try/catch so a Playwright failure
      // does not crash the worker process — BullMQ will handle retries.
      try {
        await processScreenshotJob(job);
      } catch (err) {
        console.error(`[screenshotWorker] Job ${job.id} failed:`, err);
        throw err; // re-throw so BullMQ records the failure and retries
      }
    },
    {
      connection: redis,
      concurrency: 2,
    }
  );

  worker.on('completed', (job) => {
    console.info(`[screenshotWorker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[screenshotWorker] Job ${job?.id} permanently failed after retries:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[screenshotWorker] Worker error:', err);
  });

  return worker;
}
