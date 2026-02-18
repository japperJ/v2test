import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { gdprApi } from '../lib/api';

export function GdprAdmin() {
  const [ip, setIp] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeCount, setPurgeCount] = useState<number | null>(null);

  const exportMutation = useMutation({
    mutationFn: () => gdprApi.exportData({ anonymizedIp: ip, format }),
    onSuccess: (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gdpr-export-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });

  const purgeMutation = useMutation({
    mutationFn: () => gdprApi.purge({ anonymizedIp: ip }),
    onSuccess: (data: { deleted: number }) => {
      setPurgeCount(data.deleted);
      setShowPurgeConfirm(false);
    },
  });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">GDPR Data Management</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Anonymized IP Address
          </label>
          <input
            type="text"
            value={ip}
            onChange={(e) => {
              setIp(e.target.value);
              setPurgeCount(null);
            }}
            placeholder="e.g. 203.0.113.0"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Export Format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => exportMutation.mutate()}
            disabled={!ip.trim() || exportMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportMutation.isPending ? 'Exporting…' : 'Export Data'}
          </button>
          <button
            onClick={() => setShowPurgeConfirm(true)}
            disabled={!ip.trim() || purgeMutation.isPending}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Purge Data
          </button>
        </div>

        {exportMutation.isError && (
          <p className="text-red-600 text-sm">Export failed. Please try again.</p>
        )}
        {purgeMutation.isError && (
          <p className="text-red-600 text-sm">Purge failed. Please try again.</p>
        )}
        {purgeCount !== null && (
          <p className="text-green-700 text-sm font-medium">
            Purge complete: {purgeCount} record{purgeCount !== 1 ? 's' : ''} deleted.
          </p>
        )}
      </div>

      {showPurgeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="font-semibold text-gray-900">Confirm Data Purge</h2>
            <p className="text-sm text-gray-600">
              This will permanently delete all access logs for IP address{' '}
              <strong className="font-mono">{ip}</strong>. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowPurgeConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => purgeMutation.mutate()}
                disabled={purgeMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm"
              >
                {purgeMutation.isPending ? 'Purging…' : 'Confirm Purge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
