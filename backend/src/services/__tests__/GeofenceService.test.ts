import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeofenceService } from '../GeofenceService.js';

vi.mock('../../db/pool.js', () => ({
  default: {
    query: vi.fn(),
  },
}));

import pool from '../../db/pool.js';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

describe('GeofenceService', () => {
  let service: GeofenceService;

  beforeEach(() => {
    service = new GeofenceService();
    vi.clearAllMocks();
  });

  it('returns hasFence:false when site has no polygon', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ has_fence: false }] });

    const result = await service.isPointInFence('site-uuid', 40.7128, -74.006);

    expect(result).toEqual({ inside: false, hasFence: false });
    expect(mockPool.query).toHaveBeenCalledOnce();
  });

  it('returns inside:true when point is inside the fence', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ has_fence: true }] })
      .mockResolvedValueOnce({ rows: [{ inside: true }] });

    const result = await service.isPointInFence('site-uuid', 40.7128, -74.006);

    expect(result).toEqual({ inside: true, hasFence: true });
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it('returns inside:false when point is outside the fence', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ has_fence: true }] })
      .mockResolvedValueOnce({ rows: [{ inside: false }] });

    const result = await service.isPointInFence('site-uuid', 55.0, 25.0);

    expect(result).toEqual({ inside: false, hasFence: true });
  });

  it('passes (longitude, latitude) order — lng is $2 and lat is $3', async () => {
    const lat = 40.7128;
    const lng = -74.006;

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ has_fence: true }] })
      .mockResolvedValueOnce({ rows: [{ inside: true }] });

    await service.isPointInFence('site-uuid', lat, lng);

    const [, params] = mockPool.query.mock.calls[1];
    // ST_MakePoint($2, $3) => $2 = lng, $3 = lat
    expect(params[1]).toBe(lng);
    expect(params[2]).toBe(lat);
  });

  it('returns inside:false when rows are empty for ST_Covers query', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ has_fence: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.isPointInFence('site-uuid', 0, 0);

    expect(result).toEqual({ inside: false, hasFence: true });
  });
});
