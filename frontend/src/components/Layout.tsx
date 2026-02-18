import { Link, useLocation } from 'react-router-dom';
import { useAuth, useLogout } from '../hooks/useAuth';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { data: user } = useAuth();
  const logout = useLogout();

  const isActive = (path: string) =>
    location.pathname.startsWith(path)
      ? 'bg-blue-700 text-white'
      : 'text-blue-100 hover:bg-blue-600';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top navbar */}
      <nav className="bg-blue-800 text-white px-6 py-3 flex items-center gap-4 shadow">
        <Link to="/" className="font-bold text-lg tracking-tight">
          GeoFence Admin
        </Link>
        <div className="ml-auto flex items-center gap-4">
          {user && <span className="text-blue-200 text-sm">{user.email}</span>}
          <button
            onClick={() => logout.mutate()}
            className="text-blue-100 hover:text-white text-sm underline"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-56 bg-blue-900 text-white flex flex-col py-4 gap-1">
          <Link
            to="/sites"
            className={`mx-2 px-3 py-2 rounded text-sm font-medium transition-colors ${isActive('/sites')}`}
          >
            🌐 Sites
          </Link>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
