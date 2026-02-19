import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { logsApi, AccessLog } from '../lib/api';
import { LogDetailModal } from '../components/LogDetailModal';

const PAGE_SIZE = 50;

export function AccessLogs() {
  const { siteId } = useParams<{ siteId: string }>();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'allowed' | 'blocked'>('all');
  const [selectedLog, setSelectedLog] = useState<AccessLog | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['logs', siteId, filter, page],
    queryFn: () =>
      logsApi.list(siteId!, {
        allowed: filter === 'all' ? undefined : filter === 'allowed',
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    enabled: !!siteId,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/sites" className="text-blue-600 hover:underline text-sm">
          ← Sites
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Access Logs</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(['all', 'allowed', 'blocked'] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(0); }}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        {data && (
          <span className="ml-auto text-sm text-gray-500 self-center">
            {data.total.toLocaleString()} total
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading logs...</div>
        ) : !data?.logs.length ? (
          <div className="p-8 text-center text-gray-500">No logs found</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-800">{log.ip_address}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{log.ip_country ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-semibold ${
                      log.allowed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {log.allowed ? 'Allowed' : 'Blocked'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{log.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 border rounded text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 border rounded text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            Next →
          </button>
        </div>
      )}

      <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
