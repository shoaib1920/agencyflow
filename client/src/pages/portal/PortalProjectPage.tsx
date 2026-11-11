import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Circle, CircleCheck, CircleDot, FileText, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/card';
import { AvatarStack } from '@/components/ui/avatar';
import { EmptyState, StatusBadge } from '@/components/shared/common';
import { CommentThread } from '@/features/comments/CommentThread';
import { API_URL, get } from '@/lib/api';
import { cn, formatBytes, formatDate } from '@/lib/utils';
import type { PortalProject } from '@/lib/types';

const ICON = { todo: Circle, 'in-progress': CircleDot, done: CircleCheck };
const LABEL = { todo: 'Planned', 'in-progress': 'In progress', done: 'Done' };

export default function PortalProjectPage() {
  const { id = '' } = useParams();
  const { data: p, isLoading, error } = useQuery({ queryKey: ['portal-project', id], queryFn: () => get<PortalProject>(`/portal/projects/${id}`) });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-80" /></div>;
  if (error || !p) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Project not found"
        action={<Button asChild variant="outline"><Link to="/portal">Back to portal</Link></Button>}
      />
    );
  }

  const done = p.tasks.filter((t) => t.status === 'done').length;
  const pct = p.tasks.length ? Math.round((done / p.tasks.length) * 100) : 0;
  const href = (url: string) => (url.startsWith('http') ? url : `${API_URL}${url}`);

  return (
    <div>
      <Link to="/portal" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Portal
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
        <StatusBadge value={p.status} />
      </div>
      {p.description && <p className="-mt-3 mb-6 max-w-2xl text-sm text-muted-foreground">{p.description}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Progress</p>
          <p className="text-xl font-semibold">{pct}%</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Target date</p>
          <p className="flex items-center gap-1.5 text-xl font-semibold"><CalendarDays className="h-4 w-4 text-muted-foreground" />{formatDate(p.deadline)}</p>
        </Card>
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-muted-foreground">Your team</p>
            <p className="text-sm font-medium">{p.members.map((m) => m.name.split(' ')[0]).join(', ') || '—'}</p>
          </div>
          <AvatarStack users={p.members} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Milestones</CardTitle><CardDescription>{done} of {p.tasks.length} complete</CardDescription></CardHeader>
            <CardContent>
              <ul className="divide-y rounded-lg border">
                {p.tasks.map((t) => {
                  const Icon = ICON[t.status];
                  return (
                    <li key={t._id} className="flex items-center gap-3 px-3 py-2.5">
                      <Icon className={cn('h-5 w-5 shrink-0', t.status === 'done' ? 'text-success' : t.status === 'in-progress' ? 'text-primary' : 'text-muted-foreground')} />
                      <span className={cn('flex-1 text-sm', t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</span>
                      <span className="text-xs text-muted-foreground">{t.status === 'done' ? `done ${formatDate(t.completedAt)}` : t.dueDate ? `due ${formatDate(t.dueDate)}` : LABEL[t.status]}</span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Messages</CardTitle><CardDescription>Ask questions or share feedback with the team.</CardDescription></CardHeader>
            <CardContent><CommentThread projectId={p._id} /></CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle>Files</CardTitle></CardHeader>
          <CardContent>
            {!p.attachments.length ? (
              <p className="text-sm text-muted-foreground">No files shared yet.</p>
            ) : (
              <ul className="space-y-2">
                {p.attachments.map((f) => (
                  <li key={f._id} className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a href={href(f.url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:text-primary hover:underline">{f.name}</a>
                    <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
