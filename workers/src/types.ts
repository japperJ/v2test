export interface ScreenshotJobPayload {
  accessLogId: string;
  accessLogTimestamp: string; // ISO 8601 string — needed for partition pruning in UPDATE
  siteId: string;
  siteSlug: string;
  attemptedUrl: string;
  hostname: string;
}
