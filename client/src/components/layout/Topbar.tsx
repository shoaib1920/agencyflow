import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Menu, Monitor, Moon, Pause, Search, Settings, Sun, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/shared/common';
import { useAuth } from '@/stores/auth';
import { useUI, type Theme } from '@/stores/ui';
import { api } from '@/lib/api';
import { NotificationBell } from './NotificationBell';
import { CommandPalette } from './CommandPalette';
import { useElapsed, useTimer } from '@/hooks/useTimer';

/** Running timer chip: visible on every page so you never forget a timer is on. */
function TimerChip() {
  const navigate = useNavigate();
  const { running, stop } = useTimer();
  const elapsed = useElapsed(running?.startedAt);
  if (!running) return null;
  return (
    <div className="hidden items-center gap-1 rounded-full border border-primary/30 bg-accent py-0.5 pl-3 pr-1 text-xs text-accent-foreground md:flex">
      <Timer className="h-3.5 w-3.5 animate-pulse" />
      <button onClick={() => navigate(`/projects/${running.project._id}`)} className="max-w-40 truncate font-medium hover:underline" title={`${running.task.title} · ${running.project.title}`}>
        {running.task.title}
      </button>
      <span className="font-mono tabular-nums">{elapsed}</span>
      <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full" onClick={() => stop.mutate()} aria-label="Stop timer">
        <Pause className="!size-3" />
      </Button>
    </div>
  );
}

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function Topbar() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const { theme, setTheme, setMobileNav } = useUI();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Ctrl+K / Cmd+K opens global search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      useAuth.getState().clear();
      qc.clear();
      navigate('/login');
    }
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu">
        <Menu />
      </Button>

      <button
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 max-w-sm flex-1 items-center gap-2 rounded-md border border-input bg-secondary/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary"
        aria-label="Search (Ctrl+K)"
      >
        <Search className="h-4 w-4" />
        <span className="truncate">Search anything…</span>
        <kbd className="ml-auto hidden rounded border bg-background px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      <div className="ml-auto flex items-center gap-1">
        <TimerChip />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Change theme">
              <ThemeIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
                <Icon /> {label}
                {theme === value && <span className="ml-auto text-primary">•</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="User menu">
              <UserAvatar name={user?.name} color={user?.avatarColor} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="truncate">{user?.name}</div>
              <div className="truncate text-xs font-normal text-muted-foreground">{user?.email}</div>
              {user && <StatusBadge value={user.role} className="mt-1.5" />}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/settings')}>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => void logout()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
