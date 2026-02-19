import { z } from 'zod';

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export const SiteSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  hostname: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
  access_mode: z.enum(['disabled', 'ip_only', 'geo_only', 'ip_and_geo']).default('disabled'),
  ip_allowlist: z.array(z.string()).nullable().optional(),
  ip_denylist: z.array(z.string()).nullable().optional(),
  country_allowlist: z.array(z.string().length(2)).nullable().optional(),
  country_denylist: z.array(z.string().length(2)).nullable().optional(),
  block_vpn_proxy: z.boolean().default(true),
  geofence_type: z.enum(['polygon', 'radius']).nullable().optional(),
  geofence_polygon: z.any().nullable().optional(),
  geofence_center: z.unknown().nullable().optional(),
  geofence_radius_km: z.number().nullable().optional(),
  enabled: z.boolean().default(true),
  request_count: z.number().default(0),
  created_at: z.string().or(z.date()).optional(),
  updated_at: z.string().or(z.date()).optional(),
});

export const CreateSiteSchema = SiteSchema.pick({
  slug: true,
  name: true,
}).extend({
  hostname: z.string().regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/).nullable().optional(),
  access_mode: z.enum(['disabled', 'ip_only', 'geo_only', 'ip_and_geo']).default('disabled'),
  ip_allowlist: z.array(z.string()).nullable().optional(),
  ip_denylist: z.array(z.string()).nullable().optional(),
  country_allowlist: z.array(z.string().length(2).toUpperCase()).nullable().optional(),
  country_denylist: z.array(z.string().length(2).toUpperCase()).nullable().optional(),
  block_vpn_proxy: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export const UpdateSiteSchema = CreateSiteSchema.partial().extend({
  geofence_polygon: z.any().nullable().optional(),
});

export type Site = z.infer<typeof SiteSchema>;
export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;
export type UpdateSiteInput = z.infer<typeof UpdateSiteSchema>;
