import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export interface ScreenshotJobPayload {
  accessLogId: string;
  accessLogTimestamp: string; // ISO 8601 — needed for partition pruning in the UPDATE
  siteId: string;
  siteSlug: string;
  attemptedUrl: string;
  hostname: string;
}
export const SCREENSHOT_QUEUE_NAME = 'screenshot';

let screenshotQueue: Queue<ScreenshotJobPayload> | null = null;

function getQueue(): Queue<ScreenshotJobPayload> {
  if (!screenshotQueue) {
    const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    screenshotQueue = new Queue<ScreenshotJobPayload>(SCREENSHOT_QUEUE_NAME, {
      connection: redis,
    });
  }
  return screenshotQueue;
}

export async function enqueueScreenshotJob(payload: ScreenshotJobPayload): Promise<void> {
  await getQueue().add('capture', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
}
