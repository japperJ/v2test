import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../db/pool.js', () => ({
  default: {
    query: vi.fn(),
  },
}));

import pool from '../../db/pool.js';
import { runLogRetentionOnce } from '../logRetention.js';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

// Freeze "now" so retention cutoff calculations are deterministic.
const NOW = new Date('2026-02-18T10:00:00Z');

describe('runLogRetentionOnce()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops a partition whose TO date is well before the retention cutoff', async () => {
    // With 90-day default retention, cutoff ≈ 2025-11-19.
    // A partition with TO = 2025-07-01 is safely before the cutoff.
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            relname: 'access_logs_2025_06',
            partbound: "FOR VALUES FROM ('2025-06-01 00:00:00+00') TO ('2025-07-01 00:00:00+00')",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // DROP TABLE

    const { dropped } = await runLogRetentionOnce();

    expect(dropped).toEqual(['access_logs_2025_06']);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    const [dropSql] = mockPool.query.mock.calls[1];
    expect(dropSql).toContain('DROP TABLE IF EXISTS access_logs_2025_06');
  });

  it('does not drop a partition whose TO date is in the future', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          relname: 'access_logs_2026_03',
          partbound: "FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00')",
        },
      ],
    });

    const { dropped } = await runLogRetentionOnce();

    expect(dropped).toEqual([]);
    // Only the catalog query — no DROP query
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('drops a partition whose TO date equals the cutoff (boundary: <= cutoff)', async () => {
    // cutoff = NOW - 90 days = 2025-11-19T10:00:00Z
    const cutoff = new Date(NOW);
    cutoff.setDate(cutoff.getDate() - 90);
    const toStr = cutoff.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '+00');

    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            relname: 'access_logs_2025_11',
            partbound: `FOR VALUES FROM ('2025-11-01 00:00:00+00') TO ('${toStr}')`,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const { dropped } = await runLogRetentionOnce();

    expect(dropped).toEqual(['access_logs_2025_11']);
  });

  it('skips partitions with unrecognized names (allowlist enforcement)', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          relname: 'access_logs_backup',
          partbound: "FOR VALUES FROM ('2020-01-01') TO ('2021-01-01')",
        },
      ],
    });

    const { dropped } = await runLogRetentionOnce();

    expect(dropped).toEqual([]);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('skips a partition if its partition bound cannot be parsed', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          relname: 'access_logs_2025_06',
          partbound: 'MALFORMED BOUND EXPRESSION',
        },
      ],
    });

    const { dropped } = await runLogRetentionOnce();
    expect(dropped).toEqual([]);
  });

  it('returns empty dropped array when no partitions exist', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const { dropped } = await runLogRetentionOnce();

    expect(dropped).toEqual([]);
  });

  it('drops multiple old partitions and skips current/future ones in a single run', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            relname: 'access_logs_2025_01',
            partbound: "FOR VALUES FROM ('2025-01-01 00:00:00+00') TO ('2025-02-01 00:00:00+00')",
          },
          {
            relname: 'access_logs_2025_02',
            partbound: "FOR VALUES FROM ('2025-02-01 00:00:00+00') TO ('2025-03-01 00:00:00+00')",
          },
          {
            relname: 'access_logs_2026_02',
            partbound: "FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00')",
          },
        ],
      })
      .mockResolvedValue({ rows: [] }); // DROP calls

    const { dropped } = await runLogRetentionOnce();

    expect(dropped).toContain('access_logs_2025_01');
    expect(dropped).toContain('access_logs_2025_02');
    expect(dropped).not.toContain('access_logs_2026_02');
  });
});

