import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, Bell, BellOff, CheckCheck, ClipboardList, Clock, KanbanSquare, MessageSquare, Receipt, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { cn, timeAgo } from '@/lib/utils';
import type { ApiResponse, Notification } from '@/lib/types';

const ICONS: Record<Notification['type'], typeof Bell> = {
  task_assigned: ClipboardList,
  lead_stage: KanbanSquare,
  lead_won: Trophy,
  mention: AtSign,
  comment: MessageSquare,
  reminder: Clock,
  invoice: Receipt,
  system: Bell,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Keep the whole envelope so we can read meta.unread
  const { data, isLoading } = useQuery({
    queryKey: qk.notifications,
    queryFn: async () => (await api.get<ApiResponse<Notification[]>>('/notifications')).data,
  });
  const items = data?.data ?? [];
  const unread = data?.meta?.unread ?? 0;

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });

  const openItem = (n: Notification) => {
    if (!n.read) markOne.mutate(n._id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${unread} unread)`}>
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              onClick={() => markAll.mutate()}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
              <BellOff className="h-5 w-5" />
              You're all caught up
            </div>
          ) : (
            items.map((n) => {
              const Icon = ICONS[n.type];
              return (
                <button
                  key={n._id}
                  onClick={() => openItem(n)}
                  className={cn(
                    'flex w-full gap-3 border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-secondary/60',
                    !n.read && 'bg-accent/40',
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      n.type === 'lead_won' ? 'bg-success/15 text-success' : 'bg-accent text-accent-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
