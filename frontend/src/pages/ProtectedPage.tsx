import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { sitesApi } from '../lib/api';
import { useGeolocation } from '../hooks/useGeolocation';
import axios from 'axios';

export function ProtectedPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const geo = useGeolocation();
  const [gpsResult, setGpsResult] = useState<{ allowed: boolean; reason?: string } | null>(null);
  const [gpsChecked, setGpsChecked] = useState(false);

  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => sitesApi.get(siteId!),
    enabled: !!siteId,
  });

  const verifyMutation = useMutation({
    mutationFn: (coords: { lat: number; lng: number; accuracy: number }) =>
      axios.post('/api/protected/verify-location', {
        ...coords,
        siteId,
      }).then((r) => r.data as { allowed: boolean; reason?: string }),
    onSuccess: (data) => {
      setGpsResult(data);
      setGpsChecked(true);
    },
    onError: () => {
      setGpsResult({ allowed: false, reason: 'verification_error' });
      setGpsChecked(true);
    },
  });

  // Trigger GPS check when coordinates become available
  useEffect(() => {
    if (geo.lat !== null && geo.lng !== null && geo.accuracy !== null && !gpsChecked) {
      verifyMutation.mutate({ lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy });
    }
  }, [geo.lat, geo.lng, geo.accuracy, gpsChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsGps = site?.access_mode === 'geo_only' || site?.access_mode === 'ip_and_geo';

  if (siteLoading) {
    return <div className="p-8 text-gray-500">Loading site...</div>;
  }

  if (!site) {
    return <div className="p-8 text-red-600">Site not found</div>;
  }

  // Sites that don't need GPS
  if (!needsGps) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center p-8">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{site.name}</h1>
        <p className="text-gray-600">Access granted (GPS not required for this site's access mode).</p>
      </div>
    );
  }

  // GPS not requested yet
  if (!geo.loading && geo.lat === null && !gpsChecked) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center p-8">
        <div className="text-4xl mb-4">📍</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{site.name}</h1>
        <p className="text-gray-600 mb-6">
          This site requires location verification. Click below to share your location.
        </p>
        <button
          onClick={geo.request}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium"
        >
          Share My Location
        </button>
        {geo.error && (
          <p className="mt-4 text-red-600 text-sm">{geo.error}</p>
        )}
      </div>
    );
  }

  // Loading GPS or verifying
  if (geo.loading || verifyMutation.isPending) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center p-8">
        <div className="text-4xl mb-4 animate-pulse">📡</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verifying Location...</h1>
        <p className="text-gray-500">Please wait while we check your location.</p>
      </div>
    );
  }

  // GPS error
  if (geo.error) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center p-8">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Location Error</h1>
        <p className="text-red-600 mb-4">{geo.error}</p>
        <button onClick={geo.request} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Try Again
        </button>
      </div>
    );
  }

  // Result
  if (gpsResult) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center p-8">
        {gpsResult.allowed ? (
          <>
            <div className="text-4xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-green-700 mb-2">Location Verified</h1>
            <p className="text-gray-600">
              You are within the allowed area for <strong>{site.name}</strong>.
            </p>
            {geo.accuracy && geo.accuracy > 500 && (
              <p className="mt-3 text-yellow-600 text-sm">
                ⚠️ Your GPS accuracy is {Math.round(geo.accuracy)}m, which may cause incorrect results.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="text-4xl mb-4">🚫</div>
            <h1 className="text-2xl font-bold text-red-700 mb-2">Access Denied</h1>
            <p className="text-gray-600">
              Your location is outside the allowed area for <strong>{site.name}</strong>.
            </p>
            <button
              onClick={() => { setGpsChecked(false); setGpsResult(null); geo.request(); }}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              Try again
            </button>
          </>
        )}
      </div>
    );
  }

  return null;
}
