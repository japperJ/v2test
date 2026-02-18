import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export interface Site {
  id: string;
  slug: string;
  hostname: string | null;
  name: string;
  access_mode: 'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo';
  ip_allowlist: string[] | null;
  ip_denylist: string[] | null;
  country_allowlist: string[] | null;
  country_denylist: string[] | null;
  block_vpn_proxy: boolean;
  geofence_polygon: { type: 'Polygon'; coordinates: number[][][] } | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccessLog {
  id: string;
  site_id: string;
  timestamp: string;
  ip_address: string;
  user_agent: string | null;
  url: string | null;
  allowed: boolean;
  reason: string | null;
  ip_country: string | null;
  ip_city: string | null;
  ip_lat: number | null;
  ip_lng: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  screenshot_url: string | null;
}

export interface PaginatedLogs {
  logs: AccessLog[];
  total: number;
}

export const sitesApi = {
  list: () => api.get<Site[]>('/admin/sites').then((r) => r.data),
  get: (id: string) => api.get<Site>(`/admin/sites/${id}`).then((r) => r.data),
  create: (data: Partial<Site>) => api.post<Site>('/admin/sites', data).then((r) => r.data),
  update: (id: string, data: Partial<Site>) =>
    api.patch<Site>(`/admin/sites/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/admin/sites/${id}`),
};

export const logsApi = {
  list: (siteId: string, params: { allowed?: boolean; limit?: number; offset?: number } = {}) =>
    api
      .get<PaginatedLogs>(`/admin/sites/${siteId}/access-logs`, { params })
      .then((r) => r.data),
};

export const gdprApi = {
  // Returns a Blob for download — responseType blob preserves binary/text fidelity for both JSON and CSV.
  exportData: (data: { anonymizedIp: string; format?: 'json' | 'csv'; siteId?: string }) =>
    api
      .post('/admin/gdpr/export', data, { responseType: 'blob' })
      .then((r) => r.data as Blob),

  purge: (data: { anonymizedIp: string; siteId?: string }) =>
    api
      .delete<{ deleted: number }>('/admin/gdpr/purge', { data })
      .then((r) => r.data),
};

export const artifactsApi = {
  // Fetches a short-lived presigned URL (5 min) for a screenshot stored in MinIO/S3.
  getScreenshotUrl: (logId: string, timestamp: string) =>
    api
      .get<{ url: string }>(`/admin/access-logs/${logId}/screenshot-url`, {
        params: { timestamp },
      })
      .then((r) => r.data),
};

