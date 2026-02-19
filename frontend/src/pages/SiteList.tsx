import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sitesApi, Site } from '../lib/api';

export function SiteList() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);

  const { data: sites, isLoading, error } = useQuery({
    queryKey: ['sites'],
    queryFn: sitesApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sitesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500">Loading sites...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
        Error loading sites
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
        <Link
          to="/sites/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          + New Site
        </Link>
      </div>

      {!sites || sites.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No sites yet</p>
          <p className="text-sm">Create your first site to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hostname</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Access Mode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sites.map((site) => (
                <tr key={site.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{site.name}</div>
                    <div className="text-xs text-gray-500">{site.slug}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {site.hostname ?? <span className="text-gray-400 italic">not set</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <AccessModeBadge mode={site.access_mode} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                      site.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {site.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/protected/${site.id}`}
                        className="text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50"
                        title="Test GPS Access"
                      >
                        Test
                      </Link>
                      <Link
                        to={`/sites/${site.id}/logs`}
                        className="text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                        title="View Logs"
                      >
                        Logs
                      </Link>
                      <Link
                        to={`/sites/${site.id}/edit`}
                        className="text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(site)}
                        className="text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Site</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will also
              delete all access logs for this site. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccessModeBadge({ mode }: { mode: Site['access_mode'] }) {
  const styles: Record<Site['access_mode'], string> = {
    disabled: 'bg-gray-100 text-gray-600',
    ip_only: 'bg-blue-100 text-blue-700',
    geo_only: 'bg-green-100 text-green-700',
    ip_and_geo: 'bg-purple-100 text-purple-700',
  };
  const labels: Record<Site['access_mode'], string> = {
    disabled: 'Disabled',
    ip_only: 'IP Only',
    geo_only: 'Geo Only',
    ip_and_geo: 'IP + Geo',
  };
  return (
    <span className={`px-2 py-1 text-xs rounded-full font-medium ${styles[mode]}`}>
      {labels[mode]}
    </span>
  );
}
