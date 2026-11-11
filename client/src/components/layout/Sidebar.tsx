import { NavLink } from 'react-router-dom';
import {
  FileText,
  FolderKanban,
  KanbanSquare,
  Trash2,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  UsersRound,
} from 'lucide-react';
import { useUI } from '@/stores/ui';
import { usePermissions } from '@/stores/auth';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clients', label: 'Clients', icon: UsersRound },
  { to: '/leads', label: 'Leads', icon: KanbanSquare },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
];

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
        A
      </div>
      {!collapsed && <span className="text-[15px] font-semibold tracking-tight">AgencyFlow</span>}
    </div>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { toggleSidebar } = useUI();
  const { isAdmin, isStaff } = usePermissions();

  const items = [
    ...NAV,
    ...(isStaff ? [{ to: '/invoices', label: 'Invoices', icon: FileText, end: false }] : []),
    ...(isAdmin ? [{ to: '/team', label: 'Team', icon: Users, end: false }] : []),
    ...(isStaff ? [{ to: '/trash', label: 'Trash', icon: Trash2, end: false }] : []),
    { to: '/settings', label: 'Settings', icon: Settings, end: false },
  ];

  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      <div className={cn('flex h-14 items-center border-b px-4', collapsed && 'justify-center px-0')}>
        <Logo collapsed={collapsed} />
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      <div className="hidden border-t p-3 lg:block">
        <button
          onClick={toggleSidebar}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </div>
  );
}
