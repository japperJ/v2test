import cron from 'node-cron';
import pool from '../db/pool.js';

// Partition names must match this pattern — used as an allowlist before
// any identifier is interpolated into a DDL statement.
const PARTITION_PATTERN = /^access_logs_\d{4}_\d{2}$/;

const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 3650;

function parseRetentionDays(): number {
  const raw = process.env.LOG_RETENTION_DAYS;
  if (!raw) return 90;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) return 90;
  return Math.min(Math.max(parsed, MIN_RETENTION_DAYS), MAX_RETENTION_DAYS);
}

export async function runLogRetentionOnce(): Promise<{ dropped: string[] }> {
  const retentionDays = parseRetentionDays();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  // List child partitions of access_logs from the PostgreSQL catalog.
  // We derive partition names from catalogs — no user-controlled input is
  // used as a SQL identifier.
  const { rows: partitions } = await pool.query<{
    relname: string;
    partbound: string;
  }>(
    `SELECT c.relname, pg_get_expr(c.relpartbound, c.oid) AS partbound
     FROM pg_inherits i
     JOIN pg_class p ON p.oid = i.inhparent
     JOIN pg_class c ON c.oid = i.inhrelid
     JOIN pg_namespace n ON n.oid = p.relnamespace
     WHERE p.relname = 'access_logs'
       AND n.nspname = current_schema()`
  );

  const dropped: string[] = [];

  for (const partition of partitions) {
    // Allowlist check: skip anything that doesn't look like our expected pattern.
    if (!PARTITION_PATTERN.test(partition.relname)) {
      console.warn(`[logRetention] Skipping unrecognized partition: ${partition.relname}`);
      continue;
    }

    // Extract the TO date from the partition boundary expression.
    // Format: FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00')
    const toMatch = partition.partbound.match(/TO \('([^']+)'\)/);
    if (!toMatch) {
      console.warn(
        `[logRetention] Could not parse bound for ${partition.relname}: ${partition.partbound}`
      );
      continue;
    }

    const toDate = new Date(toMatch[1]);
    if (isNaN(toDate.getTime())) {
      console.warn(
        `[logRetention] Invalid TO date for ${partition.relname}: ${toMatch[1]}`
      );
      continue;
    }

    // Only drop if the partition's upper bound is before the cutoff date.
    if (toDate <= cutoff) {
      // Safe: partition name validated by pattern allowlist above.
      await pool.query(`DROP TABLE IF EXISTS ${partition.relname}`);
      dropped.push(partition.relname);
      console.info(
        `[logRetention] Dropped ${partition.relname} (TO: ${toDate.toISOString()}, cutoff: ${cutoff.toISOString()})`
      );
    }
  }

  if (dropped.length === 0) {
    console.info(`[logRetention] No partitions to drop (cutoff: ${cutoff.toISOString()})`);
  }

  return { dropped };
}

export function startLogRetentionJob(): void {
  cron.schedule('0 2 * * *', async () => {
    console.info('[logRetention] Starting daily partition retention check');
    try {
      const { dropped } = await runLogRetentionOnce();
      console.info(`[logRetention] Complete: dropped ${dropped.length} partition(s)`);
    } catch (err) {
      console.error('[logRetention] Retention job failed:', err);
    }
  });
  console.info('[logRetention] Retention job scheduled at 02:00 daily');
}

