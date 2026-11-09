import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { useAuth } from '@/stores/auth';
import type { ApiResponse, Notification } from '@/lib/types';

/**
 * One socket per signed-in session. The server puts it in `user:<id>`, so
 * `notification:new` only arrives for the right person. `leads:changed` is a
 * board-wide broadcast that simply invalidates the leads query.
 */
export function useSocket() {
  const token = useAuth((s) => s.accessToken);
  const userId = useAuth((s) => s.user?._id);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token || !userId) return;
    const socket: Socket = io(API_URL || undefined, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('notification:new', (n: Notification) => {
      qc.setQueryData<ApiResponse<Notification[]>>(qk.notifications, (prev) =>
        prev
          ? {
              ...prev,
              data: [n, ...prev.data].slice(0, 20),
              meta: { ...prev.meta, unread: (prev.meta?.unread ?? 0) + 1 },
            }
          : prev,
      );
      void qc.invalidateQueries({ queryKey: qk.notifications });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      if (n.type === 'task_assigned') {
        void qc.invalidateQueries({ queryKey: ['projects'] });
        void qc.invalidateQueries({ queryKey: ['tasks'] });
      }
      toast(n.title, { description: n.body });
    });

    socket.on('leads:changed', () => {
      void qc.invalidateQueries({ queryKey: qk.leads });
    });

    return () => {
      socket.disconnect();
    };
    // Reconnect only when the user changes; a rotated token is still valid for the live socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
