import axios from 'axios';

// Access token stored in module scope — NOT in localStorage
let accessToken: string | null = null;

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
}

// Plain axios for auth endpoints that must not include a bearer token (avoids infinite retry)
const plainAxios = axios.create({ baseURL: '/api' });

// Authenticated axios instance — adds Authorization header and auto-refreshes on 401
export const authApi = axios.create({ baseURL: '/api' });

authApi.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

authApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as typeof error.config & { _retried?: boolean };
    if (error.response?.status === 401 && !originalRequest._retried) {
      originalRequest._retried = true;
      try {
        const { data } = await plainAxios.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return authApi(originalRequest);
      } catch {
        clearAccessToken();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
