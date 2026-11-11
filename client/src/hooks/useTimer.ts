import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, get } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import type { ApiResponse, RunningTimer } from '@/lib/types';

export const TIMER_KEY = ['timer'] as const;

/** The signed-in user's running timer plus start/stop actions, shared by the top bar and task rows. */
export function useTimer() {
  const qc = useQueryClient();
  const role = useAuth((s) => s.user?.role);
  const { data: running } = useQuery({
    queryKey: TIMER_KEY,
    queryFn: () => get<RunningTimer | null>('/time/running'),
    enabled: !!role && role !== 'client',
    refetchOnWindowFocus: true,
  });

  const refresh = (projectId?: string) => {
    void qc.invalidateQueries({ queryKey: TIMER_KEY });
    if (projectId) void qc.invalidateQueries({ queryKey: ['project-time', projectId] });
  };

  const start = useMutation({
    mutationFn: ({ projectId, taskId }: { projectId: string; taskId: string }) =>
      api.post<ApiResponse<RunningTimer>>(`/projects/${projectId}/timer/start`, { task: taskId }),
    onSuccess: (res, v) => {
      qc.setQueryData(TIMER_KEY, res.data.data);
      if (running) refresh(running.project._id);
      refresh(v.projectId);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const stop = useMutation({
    mutationFn: () => api.post<ApiResponse<{ minutes: number } | null>>('/time/stop'),
    onSuccess: (res) => {
      const projectId = running?.project._id;
      qc.setQueryData(TIMER_KEY, null);
      refresh(projectId);
      toast.success(res.data.message ?? 'Timer stopped');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return { running: running ?? null, start, stop };
}

/** Ticking "1:05:09" label for a running timer. */
export function useElapsed(startedAt?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return '';
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
}
