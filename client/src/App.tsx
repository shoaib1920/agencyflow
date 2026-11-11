import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { refreshAccessToken } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { PortalLayout } from '@/components/layout/PortalLayout';
import type { Role } from '@/lib/types';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const AcceptInvitePage = lazy(() => import('@/pages/AcceptInvitePage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ClientsPage = lazy(() => import('@/pages/ClientsPage'));
const LeadsPage = lazy(() => import('@/pages/LeadsPage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('@/pages/ProjectDetailPage'));
const InvoicesPage = lazy(() => import('@/pages/InvoicesPage'));
const TrashPage = lazy(() => import('@/pages/TrashPage'));
const TeamPage = lazy(() => import('@/pages/TeamPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const PortalHomePage = lazy(() => import('@/pages/portal/PortalHomePage'));
const PortalProjectPage = lazy(() => import('@/pages/portal/PortalProjectPage'));

const TEAM: Role[] = ['admin', 'manager', 'member'];
const STAFF: Role[] = ['admin', 'manager'];

const homeFor = (role?: Role) => (role === 'client' ? '/portal' : '/');

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
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}

function GuestOnly() {
  const { user, status } = useAuth();
  if (status !== 'ready') return <FullScreenLoader />;
  return user ? <Navigate to={homeFor(user.role)} replace /> : <Outlet />;
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
        <Route path="/accept-invite" element={<AcceptInvitePage />} />

        {/* Client portal: external users only */}
        <Route element={<RequireAuth roles={['client']} />}>
          <Route path="portal" element={<PortalLayout />}>
            <Route index element={<PortalHomePage />} />
            <Route path="projects/:id" element={<PortalProjectPage />} />
          </Route>
        </Route>

        {/* Agency workspace: team only */}
        <Route element={<RequireAuth roles={TEAM} />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route element={<RequireAuth roles={STAFF} />}>
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="trash" element={<TrashPage />} />
            </Route>
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
