import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/card';
import { api, errorMessage, get } from '@/lib/api';
import { formatMinutes } from '@/lib/download';
import { cn, timeAgo } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import type { ProjectTime, Task } from '@/lib/types';

interface LogValues {
  task: string;
  hours: number;
  minutes: number;
  note: string;
}

/** Hours logged vs estimate, per-person breakdown, recent entries and a quick "log time" form. */
export function TimePanel({ projectId, tasks }: { projectId: string; tasks: Task[] }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const key = ['project-time', projectId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => get<ProjectTime>(`/projects/${projectId}/time`) });
  const { register, handleSubmit, reset } = useForm<LogValues>({ defaultValues: { task: '', hours: 1, minutes: 0, note: '' } });

  const log = useMutation({
    mutationFn: (v: LogValues) =>
      api.post(`/projects/${projectId}/time`, { task: v.task, minutes: Number(v.hours) * 60 + Number(v.minutes), note: v.note }),
    onSuccess: () => {
      toast.success('Time logged');
      reset({ task: '', hours: 1, minutes: 0, note: '' });
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/time/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading || !data) return <Skeleton className="h-48" />;

  const hours = data.totalMinutes / 60;
  const pct = data.estimatedHours ? Math.min(100, Math.round((hours / data.estimatedHours) * 100)) : null;
  const max = Math.max(1, ...data.byUser.map((u) => u.minutes));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-semibold tabular-nums">{formatMinutes(data.totalMinutes)}</p>
          <p className="text-sm text-muted-foreground">{data.estimatedHours ? `of ${data.estimatedHours}h estimated` : 'No estimate set'}</p>
        </div>
        {pct !== null && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full', hours > (data.estimatedHours ?? 0) ? 'bg-destructive' : pct > 85 ? 'bg-warning' : 'bg-primary')} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {data.byUser.length > 0 && (
        <ul className="space-y-2.5">
          {data.byUser.map((u) => (
            <li key={u._id} className="flex items-center gap-3 text-sm">
              <UserAvatar name={u.name} color={u.avatarColor} className="h-6 w-6 text-[9px]" />
              <span className="w-28 truncate">{u.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${(u.minutes / max) * 100}%` }} />
              </div>
              <span className="w-16 text-right tabular-nums text-muted-foreground">{formatMinutes(u.minutes)}</span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit((v) => (v.task ? log.mutate(v) : toast.error('Pick a task')))} className="space-y-2 rounded-lg border p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Log time</p>
        <NativeSelect {...register('task')} aria-label="Task">
          <option value="">Choose a task…</option>
          {tasks.map((t) => <option key={t._id} value={t._id}>{t.title}</option>)}
        </NativeSelect>
        <div className="flex gap-2">
          <Input type="number" min={0} max={24} aria-label="Hours" {...register('hours')} className="w-20" />
          <span className="self-center text-sm text-muted-foreground">h</span>
          <Input type="number" min={0} max={59} step={5} aria-label="Minutes" {...register('minutes')} className="w-20" />
          <span className="self-center text-sm text-muted-foreground">m</span>
        </div>
        <Input placeholder="What did you work on? (optional)" {...register('note')} />
        <Button type="submit" size="sm" className="w-full" loading={log.isPending}><Plus /> Add entry</Button>
      </form>

      {data.recent.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent</p>
          <ul className="space-y-2">
            {data.recent.map((e) => (
              <li key={e._id} className="group flex items-start gap-2 text-sm">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate"><b className="font-medium">{formatMinutes(e.minutes)}</b> · {e.task?.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.user?.name} · {timeAgo(e.endedAt)}{e.note ? ` · ${e.note}` : ''}</p>
                </div>
                {(e.user?._id === me?._id || me?.role === 'admin' || me?.role === 'manager') && (
                  <button onClick={() => remove.mutate(e._id)} className="opacity-0 group-hover:opacity-100" aria-label="Delete entry">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
