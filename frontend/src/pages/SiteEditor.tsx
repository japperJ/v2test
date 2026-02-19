import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sitesApi, Site } from '../lib/api';
import { GeofenceMap } from '../components/GeofenceMap';

type AccessMode = Site['access_mode'];

interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export function SiteEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id || id === 'new';

  const { data: existing, isLoading } = useQuery({
    queryKey: ['site', id],
    queryFn: () => sitesApi.get(id!),
    enabled: !isNew && !!id,
  });

  const [form, setForm] = useState({
    slug: '',
    name: '',
    hostname: '',
    access_mode: 'disabled' as AccessMode,
    ip_allowlist: '',
    ip_denylist: '',
    country_allowlist: '',
    country_denylist: '',
    block_vpn_proxy: true,
    geofence_polygon: null as GeoJSONPolygon | null,
    enabled: true,
  });

  const [ipErrors, setIpErrors] = useState<{ allowlist?: string; denylist?: string }>({});
  const [slugError, setSlugError] = useState<string | undefined>();
  const [apiErrors, setApiErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (existing) {
      setForm({
        slug: existing.slug,
        name: existing.name,
        hostname: existing.hostname ?? '',
        access_mode: existing.access_mode,
        ip_allowlist: (existing.ip_allowlist ?? []).join('\n'),
        ip_denylist: (existing.ip_denylist ?? []).join('\n'),
        country_allowlist: (existing.country_allowlist ?? []).join(', '),
        country_denylist: (existing.country_denylist ?? []).join(', '),
        block_vpn_proxy: existing.block_vpn_proxy,
        geofence_polygon: existing.geofence_polygon as GeoJSONPolygon | null,
        enabled: existing.enabled,
      });
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Site>) =>
      isNew ? sitesApi.create(data) : sitesApi.update(id!, data),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['site', id] });
      navigate(`/sites/${saved.id}/edit`);
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { details?: { fieldErrors?: Record<string, string[]> } } } }).response?.data;
      if (data?.details?.fieldErrors) {
        setApiErrors(data.details.fieldErrors);
      }
    },
  });

  function parseIPList(text: string): string[] {
    return text
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function parseCountryList(text: string): string[] {
    return text
      .split(/[\n,]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }

  function validateIPList(list: string[]): string | undefined {
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    const ipv6 = /^[0-9a-fA-F:]+?(\/\d{1,3})?$/;
    for (const entry of list) {
      if (!ipv4.test(entry) && !ipv6.test(entry)) {
        return `Invalid IP or CIDR: "${entry}"`;
      }
    }
  }

  function normalizeSlug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[\s.]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const allowlist = parseIPList(form.ip_allowlist);
    const denylist = parseIPList(form.ip_denylist);

    const allowErr = validateIPList(allowlist);
    const denyErr = validateIPList(denylist);
    if (allowErr || denyErr) {
      setIpErrors({ allowlist: allowErr, denylist: denyErr });
      return;
    }
    setIpErrors({});

    if (!/^[a-z0-9-]+$/.test(form.slug)) {
      setSlugError('Slug must contain only lowercase letters, numbers, and hyphens');
      return;
    }
    setSlugError(undefined);
    setApiErrors({});

    saveMutation.mutate({
      slug: form.slug,
      name: form.name,
      hostname: form.hostname || null,
      access_mode: form.access_mode,
      ip_allowlist: allowlist.length > 0 ? allowlist : null,
      ip_denylist: denylist.length > 0 ? denylist : null,
      country_allowlist: parseCountryList(form.country_allowlist).length > 0
        ? parseCountryList(form.country_allowlist)
        : null,
      country_denylist: parseCountryList(form.country_denylist).length > 0
        ? parseCountryList(form.country_denylist)
        : null,
      block_vpn_proxy: form.block_vpn_proxy,
      enabled: form.enabled,
      ...(isNew ? {} : { geofence_polygon: form.geofence_polygon }),
    });
  }

  if (!isNew && isLoading) {
    return <div className="text-gray-500 py-10">Loading...</div>;
  }

  const showIPSection = ['ip_only', 'ip_and_geo'].includes(form.access_mode);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/sites" className="text-blue-600 hover:underline text-sm">
          ← Sites
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isNew ? 'New Site' : 'Edit Site'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow divide-y divide-gray-100">
        {/* Basic Info */}
        <div className="p-6 space-y-4">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Basic Info</h2>
          <FieldRow label="Name" required>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="My Site"
            />
          </FieldRow>
          <FieldRow label="Slug" required>
            <input
              className={`input ${slugError || apiErrors.slug ? 'border-red-400' : ''}`}
              value={form.slug}
              onChange={(e) => {
                const normalized = normalizeSlug(e.target.value);
                setForm({ ...form, slug: normalized });
                setSlugError(undefined);
                setApiErrors((prev) => ({ ...prev, slug: [] }));
              }}
              required
              placeholder="my-site"
            />
            {(slugError || apiErrors.slug?.[0]) ? (
              <p className="text-red-600 text-xs mt-1">{slugError ?? apiErrors.slug?.[0]}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, hyphens only (auto-normalized)</p>
            )}
          </FieldRow>
          <FieldRow label="Hostname">
            <input
              className="input"
              value={form.hostname}
              onChange={(e) => setForm({ ...form, hostname: e.target.value })}
              placeholder="example.com"
            />
          </FieldRow>
          <FieldRow label="Access Mode">
            <select
              className="input"
              value={form.access_mode}
              onChange={(e) => setForm({ ...form, access_mode: e.target.value as AccessMode })}
            >
              <option value="disabled">Disabled (block all)</option>
              <option value="ip_only">IP Only</option>
              <option value="geo_only">Geo Only (GPS)</option>
              <option value="ip_and_geo">IP + Geo (both required)</option>
            </select>
          </FieldRow>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="enabled"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="enabled" className="text-sm text-gray-700">Site enabled</label>
          </div>
        </div>

        {/* IP Settings */}
        {showIPSection && (
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">IP Settings</h2>
            <FieldRow label="IP Allowlist">
              <textarea
                className={`input font-mono text-xs ${ipErrors.allowlist ? 'border-red-400' : ''}`}
                rows={4}
                value={form.ip_allowlist}
                onChange={(e) => setForm({ ...form, ip_allowlist: e.target.value })}
                placeholder={"192.168.1.0/24\n10.0.0.1"}
              />
              {ipErrors.allowlist && (
                <p className="text-red-600 text-xs mt-1">{ipErrors.allowlist}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">One IP or CIDR per line. If set, only these IPs are allowed.</p>
            </FieldRow>
            <FieldRow label="IP Denylist">
              <textarea
                className={`input font-mono text-xs ${ipErrors.denylist ? 'border-red-400' : ''}`}
                rows={4}
                value={form.ip_denylist}
                onChange={(e) => setForm({ ...form, ip_denylist: e.target.value })}
                placeholder={"1.2.3.4\n5.6.7.0/24"}
              />
              {ipErrors.denylist && (
                <p className="text-red-600 text-xs mt-1">{ipErrors.denylist}</p>
              )}
            </FieldRow>
            <FieldRow label="Country Allowlist">
              <input
                className="input"
                value={form.country_allowlist}
                onChange={(e) => setForm({ ...form, country_allowlist: e.target.value })}
                placeholder="US, GB, CA"
              />
              <p className="text-xs text-gray-500 mt-1">ISO 3166-1 alpha-2 codes, comma-separated. If set, only these countries allowed.</p>
            </FieldRow>
            <FieldRow label="Country Denylist">
              <input
                className="input"
                value={form.country_denylist}
                onChange={(e) => setForm({ ...form, country_denylist: e.target.value })}
                placeholder="RU, CN, KP"
              />
            </FieldRow>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="block_vpn"
                checked={form.block_vpn_proxy}
                onChange={(e) => setForm({ ...form, block_vpn_proxy: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="block_vpn" className="text-sm text-gray-700">Block VPN/Proxy/Tor connections</label>
            </div>
          </div>
        )}

        {/* Geofence Settings */}
        {(form.access_mode === 'geo_only' || form.access_mode === 'ip_and_geo') && (
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Geofence Polygon</h2>
            <p className="text-sm text-gray-500">
              Draw the allowed geographic boundary. Visitors must be within this area to access the site.
              Leave empty to allow access from anywhere (GPS check passes by default).
            </p>
            <GeofenceMap
              initialPolygon={form.geofence_polygon}
              onPolygonChange={(polygon) => setForm((f) => ({ ...f, geofence_polygon: polygon }))}
            />
            {form.geofence_polygon && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, geofence_polygon: null }))}
                className="text-sm text-red-500 hover:text-red-700"
              >
                Clear geofence
              </button>
            )}
          </div>
        )}

        {/* Save */}
        <div className="p-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Site'}
          </button>
          <Link to="/sites" className="text-gray-500 hover:text-gray-700 px-4 py-2">
            Cancel
          </Link>
          {saveMutation.isError && (
            <p className="text-red-600 text-sm">
              {Object.keys(apiErrors).length > 0
                ? `Validation error: ${Object.entries(apiErrors)
                    .filter(([, errs]) => errs.length > 0)
                    .map(([field, errs]) => `${field}: ${errs[0]}`)
                    .join(', ')}`
                : 'Failed to save. Please try again.'}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

function FieldRow({ label, required, children }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
