import { useAuth } from '../contexts/AuthContext';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export default function AuthGuard() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Allow unrestricted access to the share page based on matching path
  if (location.pathname.startsWith('/share/')) {
    return <Outlet />;
  }

  if (!user && location.pathname !== '/login') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
