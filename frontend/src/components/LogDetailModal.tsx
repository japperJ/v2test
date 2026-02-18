import { useState } from 'react';
import { AccessLog, artifactsApi } from '../lib/api';

interface Props {
  log: AccessLog | null;
  onClose: () => void;
}

export function LogDetailModal({ log, onClose }: Props) {
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);

  if (!log) return null;

  async function handleViewScreenshot() {
    if (!log) return;
    setScreenshotLoading(true);
    setScreenshotError(null);
    try {
      const { url } = await artifactsApi.getScreenshotUrl(log.id, log.timestamp);
      setScreenshotUrl(url);
    } catch {
      setScreenshotError('Failed to load screenshot. It may have expired or been removed.');
    } finally {
      setScreenshotLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-900">Log Entry Details</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <DetailRow label="Timestamp" value={new Date(log.timestamp).toLocaleString()} />
          <DetailRow label="IP Address" value={log.ip_address} />
          <DetailRow
            label="Result"
            value={
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                log.allowed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {log.allowed ? 'Allowed' : 'Blocked'}
              </span>
            }
          />
          {log.reason && <DetailRow label="Reason" value={log.reason} />}
          {log.ip_country && (
            <DetailRow
              label="Location"
              value={[log.ip_city, log.ip_country].filter(Boolean).join(', ')}
            />
          )}
          {log.ip_lat != null && (
            <DetailRow label="IP Coordinates" value={`${log.ip_lat}, ${log.ip_lng}`} />
          )}
          {log.gps_lat != null && (
            <DetailRow label="GPS Coordinates" value={`${log.gps_lat}, ${log.gps_lng} (accuracy: ${log.gps_accuracy}m)`} />
          )}
          {log.url && <DetailRow label="URL" value={log.url} />}
          {log.user_agent && <DetailRow label="User Agent" value={log.user_agent} />}

          {log.screenshot_url && (
            <div className="pt-2 border-t">
              {!screenshotUrl && (
                <button
                  onClick={handleViewScreenshot}
                  disabled={screenshotLoading}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {screenshotLoading ? 'Loading…' : '📸 View Screenshot'}
                </button>
              )}
              {screenshotError && (
                <p className="text-red-600 text-xs mt-1">{screenshotError}</p>
              )}
              {screenshotUrl && (
                <div className="mt-2 space-y-2">
                  <img
                    src={screenshotUrl}
                    alt="Screenshot of blocked access attempt"
                    className="w-full rounded border border-gray-200"
                  />
                  <a
                    href={screenshotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Open in new tab
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-gray-500 w-32 flex-shrink-0">{label}</span>
      <span className="text-gray-800 break-all">{value}</span>
    </div>
  );
}

