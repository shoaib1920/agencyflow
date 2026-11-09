import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { refreshAccessToken } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import type { Role } from '@/lib/types';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ClientsPage = lazy(() => import('@/pages/ClientsPage'));
const LeadsPage = lazy(() => import('@/pages/LeadsPage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('@/pages/ProjectDetailPage'));
const TeamPage = lazy(() => import('@/pages/TeamPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

/** Guards a route tree: requires a session and (optionally) one of the given roles. */
function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status !== 'ready') return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

function GuestOnly() {
  const { user, status } = useAuth();
  if (status !== 'ready') return <FullScreenLoader />;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  const status = useAuth((s) => s.status);

  // Restore the session on first load using the httpOnly refresh cookie
  useEffect(() => {
    if (status === 'idle') {
      useAuth.getState().setStatus('loading');
      void refreshAccessToken();
    }
  }, [status]);

  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route element={<RequireAuth roles={['admin']} />}>
              <Route path="team" element={<TeamPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
