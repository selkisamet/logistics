import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import type { UserRole } from '@lojistik/shared';

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { token, user } = useAuthStore();

  if (!token) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
