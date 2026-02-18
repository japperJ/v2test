import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { getAccessToken, setAccessToken } from '../lib/auth';

interface RequireAuthProps {
  children: React.ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  // If we already have a token, no need to attempt refresh
  const [checking, setChecking] = useState(!getAccessToken());

  useEffect(() => {
    if (getAccessToken()) return;

    // Attempt silent token refresh to restore session after page reload
    axios
      .post<{ accessToken: string }>('/api/auth/refresh')
      .then(({ data }) => {
        setAccessToken(data.accessToken);
      })
      .catch(() => {
        // Refresh failed — user will be redirected to /login
      })
      .finally(() => {
        setChecking(false);
      });
  }, []);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        Loading...
      </div>
    );
  }

  if (!getAccessToken()) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
