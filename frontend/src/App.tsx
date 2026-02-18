import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { SiteList } from './pages/SiteList';
import { SiteEditor } from './pages/SiteEditor';
import { AccessLogs } from './pages/AccessLogs';
import { ProtectedPage } from './pages/ProtectedPage';
import { GdprAdmin } from './pages/GdprAdmin';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/sites" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/sites"
            element={
              <RequireAuth>
                <Layout>
                  <SiteList />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/sites/new"
            element={
              <RequireAuth>
                <Layout>
                  <SiteEditor />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/sites/:id/edit"
            element={
              <RequireAuth>
                <Layout>
                  <SiteEditor />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/sites/:siteId/logs"
            element={
              <RequireAuth>
                <Layout>
                  <AccessLogs />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/protected/:siteId"
            element={
              <RequireAuth>
                <Layout>
                  <ProtectedPage />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/gdpr"
            element={
              <RequireAuth>
                <Layout>
                  <GdprAdmin />
                </Layout>
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
