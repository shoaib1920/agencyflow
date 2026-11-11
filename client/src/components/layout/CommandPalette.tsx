import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  CheckSquare, CornerDownLeft, FileText, FolderKanban, KanbanSquare, LayoutDashboard, Loader2, Search, Settings, Trash2, UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { get } from '@/lib/api';
import { cn, formatMoneyCompact } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermissions } from '@/stores/auth';
import type { SearchResults } from '@/lib/types';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  to: string;
}

/** Global Ctrl+K / Cmd+K palette: jump to pages, or search clients, leads, projects, tasks and invoices. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { isStaff } = usePermissions();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounce(q.trim(), 200);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => get<SearchResults>('/search', { q: debounced }),
    enabled: open && debounced.length >= 2,
    staleTime: 10_000,
  });

  const pages: Item[] = useMemo(
    () => [
      { id: 'p-dash', group: 'Go to', label: 'Dashboard', icon: LayoutDashboard, to: '/' },
      { id: 'p-clients', group: 'Go to', label: 'Clients', icon: UsersRound, to: '/clients' },
      { id: 'p-leads', group: 'Go to', label: 'Leads', icon: KanbanSquare, to: '/leads' },
      { id: 'p-projects', group: 'Go to', label: 'Projects', icon: FolderKanban, to: '/projects' },
      ...(isStaff
        ? [
            { id: 'p-invoices', group: 'Go to', label: 'Invoices', icon: FileText, to: '/invoices' },
            { id: 'p-trash', group: 'Go to', label: 'Trash', icon: Trash2, to: '/trash' },
          ]
        : []),
      { id: 'p-settings', group: 'Go to', label: 'Settings', icon: Settings, to: '/settings' },
    ],
    [isStaff],
  );

  const items: Item[] = useMemo(() => {
    if (debounced.length < 2) return pages.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()));
    if (!data) return [];
    return [
      ...data.clients.map((c) => ({ id: `c${c._id}`, group: 'Clients', label: c.name, hint: c.company, icon: UsersRound, to: `/clients?open=${c._id}` })),
      ...data.leads.map((l) => ({ id: `l${l._id}`, group: 'Leads', label: l.title, hint: `${l.company ?? ''} · ${formatMoneyCompact(l.value)} · ${l.stage}`, icon: KanbanSquare, to: '/leads' })),
      ...data.projects.map((p) => ({ id: `p${p._id}`, group: 'Projects', label: p.title, hint: p.client?.company || p.client?.name, icon: FolderKanban, to: `/projects/${p._id}` })),
      ...data.tasks.map((t) => ({ id: `t${t._id}`, group: 'Tasks', label: t.title, hint: t.project?.title, icon: CheckSquare, to: `/projects/${t.project?._id}` })),
      ...data.invoices.map((i) => ({ id: `i${i._id}`, group: 'Invoices', label: i.number, hint: `${i.client?.name ?? ''} · ${i.status}`, icon: FileText, to: `/invoices?open=${i._id}` })),
    ];
  }, [debounced, data, pages, q]);

  useEffect(() => setActive(0), [items.length]);

  const go = (item?: Item) => {
    if (!item) return;
    onOpenChange(false);
    navigate(item.to);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
  };

  let lastGroup = '';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b px-4">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Search className="h-4 w-4 text-muted-foreground" />}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search clients, leads, projects, tasks, invoices…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search"
              role="combobox"
              aria-expanded
              aria-controls="palette-results"
            />
            <kbd className="rounded border bg-muted px-1.5 text-[10px] text-muted-foreground">ESC</kbd>
          </div>
          <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2 scrollbar-thin">
            {items.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                {debounced.length >= 2 && !isFetching ? `No results for "${debounced}"` : 'Type at least 2 characters to search'}
              </li>
            ) : (
              items.map((item, i) => {
                const header = item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    {header && <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{header}</p>}
                    <button
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(item)}
                      className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm', i === active && 'bg-accent text-accent-foreground')}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-70" />
                      <span className="truncate font-medium">{item.label}</span>
                      {item.hint && <span className="truncate text-xs text-muted-foreground">{item.hint}</span>}
                      {i === active && <CornerDownLeft className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
