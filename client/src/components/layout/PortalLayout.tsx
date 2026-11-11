import { Suspense } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, LogOut, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { Logo } from './Sidebar';
import { NotificationBell } from './NotificationBell';

/** A deliberately simple shell for client-portal users: no internal navigation at all. */
export function PortalLayout() {
  const user = useAuth((s) => s.user);
  const { theme, setTheme } = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  useSocket();

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      useAuth.getState().clear();
      qc.clear();
      navigate('/login');
    }
  };
  const dark = document.documentElement.classList.contains('dark');

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link to="/portal"><Logo /></Link>
          <span className="hidden rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground sm:inline">Client portal</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(dark || theme === 'dark' ? 'light' : 'dark')}>
              {dark ? <Sun /> : <Moon />}
            </Button>
            <NotificationBell />
            <div className="ml-2 hidden text-right text-xs leading-tight sm:block">
              <p className="font-medium">{user?.name}</p>
              <p className="text-muted-foreground">{user?.client?.company || user?.client?.name}</p>
            </div>
            <UserAvatar name={user?.name} color={user?.avatarColor} className="ml-2" />
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void logout()}><LogOut /></Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <ErrorBoundary inline key={location.pathname}>
          <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
