import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, CalendarDays, Circle, CircleCheck, CircleDot, ClipboardList, Clock, DollarSign, KanbanSquare,
  List, MessageSquare, Pause, Pencil, Play, Plus, Receipt, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/card';
import { AvatarStack, UserAvatar } from '@/components/ui/avatar';
import { ConfirmDialog, EmptyState, StatusBadge } from '@/components/shared/common';
import { ActivityTimeline } from '@/components/shared/ActivityTimeline';
import { ProjectFormDialog } from '@/features/projects/ProjectFormDialog';
import { TaskDialog } from '@/features/projects/TaskDialog';
import { FilesPanel } from '@/features/projects/FilesPanel';
import { TaskBoard } from '@/features/projects/TaskBoard';
import { TimePanel } from '@/features/projects/TimePanel';
import { CommentThread } from '@/features/comments/CommentThread';
import { InvoiceEditor } from '@/features/invoices/InvoiceEditor';
import { api, errorMessage, get } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { formatMinutes } from '@/lib/download';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { usePermissions } from '@/stores/auth';
import { useElapsed, useTimer } from '@/hooks/useTimer';
import type { Activity, Project, ProjectTime, Task, TaskStatus } from '@/lib/types';

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: 'in-progress', 'in-progress': 'done', done: 'todo' };
const STATUS_ICON = { todo: Circle, 'in-progress': CircleDot, done: CircleCheck };
const GROUPS: { id: TaskStatus; label: string }[] = [
  { id: 'in-progress', label: 'In progress' },
  { id: 'todo', label: 'To do' },
  { id: 'done', label: 'Done' },
];
type SideTab = 'files' | 'time' | 'activity';

function TimerButton({ projectId, task }: { projectId: string; task: Task }) {
  const { running, start, stop } = useTimer();
  const isMine = running?.task._id === task._id;
  const elapsed = useElapsed(isMine ? running?.startedAt : undefined);
  if (task.status === 'done' && !isMine) return null;
  return isMine ? (
    <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 font-mono text-xs text-primary" onClick={() => stop.mutate()} aria-label="Stop timer">
      <Pause className="!size-3" /> {elapsed}
    </Button>
  ) : (
    <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 transition group-hover:opacity-100 focus:opacity-100" onClick={() => start.mutate({ projectId, taskId: task._id })} aria-label={`Start timer on ${task.title}`} title="Start timer">
      <Play className="!size-3.5" />
    </Button>
  );
}

export default function ProjectDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isStaff } = usePermissions();
  const [editing, setEditing] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task?: Task | null }>({ open: false });
  const [view, setView] = useState<'list' | 'board'>(() => (localStorage.getItem('af-task-view') as 'list' | 'board' | null) ?? 'list');
  const [side, setSide] = useState<SideTab>('files');

  const { data: project, isLoading, error } = useQuery({ queryKey: qk.project(id), queryFn: () => get<Project>(`/projects/${id}`) });
  const enabled = !!project;
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({ queryKey: qk.tasks(id), queryFn: () => get<Task[]>(`/projects/${id}/tasks`), enabled });
  const { data: activity, isLoading: activityLoading } = useQuery({ queryKey: qk.projectActivity(id), queryFn: () => get<Activity[]>(`/projects/${id}/activity`), enabled });
  const { data: time } = useQuery({ queryKey: ['project-time', id], queryFn: () => get<ProjectTime>(`/projects/${id}/time`), enabled });
  const { data: commentCounts = {} } = useQuery({ queryKey: ['comment-counts', id], queryFn: () => get<Record<string, number>>(`/projects/${id}/comment-counts`), enabled });

  const switchView = (v: 'list' | 'board') => {
    setView(v);
    try { localStorage.setItem('af-task-view', v); } catch { /* storage unavailable */ }
  };

  const cycle = useMutation({
    mutationFn: (t: Task) => api.patch(`/projects/${id}/tasks/${t._id}`, { status: NEXT_STATUS[t.status] }),
    onMutate: async (t) => {
      await qc.cancelQueries({ queryKey: qk.tasks(id) });
      const previous = qc.getQueryData<Task[]>(qk.tasks(id));
      qc.setQueryData<Task[]>(qk.tasks(id), (old) => old?.map((x) => (x._id === t._id ? { ...x, status: NEXT_STATUS[t.status] } : x)));
      return { previous };
    },
    onError: (err, _t, ctx) => {
      qc.setQueryData(qk.tasks(id), ctx?.previous);
      toast.error(errorMessage(err));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.tasks(id) });
      void qc.invalidateQueries({ queryKey: qk.projectActivity(id) });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/projects/${id}`),
    onSuccess: () => {
      toast.success('Project moved to trash');
      void qc.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (error || !project) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Project not found"
        description="It may have been deleted, or you're not a member of it."
        action={<Button asChild variant="outline"><Link to="/projects">Back to projects</Link></Button>}
      />
    );
  }

  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const people = project.members;

  return (
    <div>
      <Link to="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{project.title}</h1>
            <StatusBadge value={project.status} />
          </div>
          <Link to={`/clients?open=${project.client._id}`} className="mt-1 inline-block text-sm text-muted-foreground hover:text-primary">
            {project.client.company ? `${project.client.company} · ${project.client.name}` : project.client.name}
          </Link>
          {project.description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{project.description}</p>}
        </div>
        {isStaff && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setInvoicing(true)}><Receipt /> Invoice</Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: DollarSign, label: 'Budget', value: formatMoney(project.budget) },
          { icon: CalendarDays, label: 'Deadline', value: formatDate(project.deadline) },
          { icon: ClipboardList, label: 'Progress', value: `${pct}% · ${done}/${tasks.length} tasks` },
          {
            icon: Clock,
            label: 'Time logged',
            value: time ? `${formatMinutes(time.totalMinutes)}${project.estimatedHours ? ` / ${project.estimatedHours}h` : ''}` : '…',
          },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="flex items-center gap-3 p-4">
            <div className="rounded-md bg-accent p-2 text-accent-foreground"><Icon className="h-4 w-4" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold">{value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* The board needs the full width; in list view files/time/activity sit beside the tasks */}
      <div className={cn('grid gap-6', view === 'list' && 'xl:grid-cols-[1fr_380px]')}>
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div className="flex items-center gap-3">
                <CardTitle>Tasks</CardTitle>
                <AvatarStack users={project.members} max={4} />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border p-0.5" role="group" aria-label="Task view">
                  {([['list', List], ['board', KanbanSquare]] as const).map(([v, Icon]) => (
                    <button
                      key={v}
                      onClick={() => switchView(v)}
                      className={cn('flex items-center gap-1 rounded px-2 py-1 text-xs font-medium capitalize', view === v ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground')}
                      aria-pressed={view === v}
                    >
                      <Icon className="h-3.5 w-3.5" /> {v}
                    </button>
                  ))}
                </div>
                <Button size="sm" onClick={() => setTaskDialog({ open: true, task: null })}><Plus /> Add task</Button>
              </div>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
              ) : tasks.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No tasks yet" description="Break the project into tasks and assign them to the team." />
              ) : view === 'board' ? (
                <TaskBoard projectId={id} tasks={tasks} minutesByTask={time?.byTask ?? {}} commentCounts={commentCounts} onOpen={(t) => setTaskDialog({ open: true, task: t })} />
              ) : (
                <div className="space-y-5">
                  {GROUPS.map((g) => {
                    const list = tasks.filter((t) => t.status === g.id);
                    if (!list.length) return null;
                    return (
                      <section key={g.id}>
                        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label} · {list.length}</h3>
                        <ul className="divide-y rounded-lg border">
                          {list.map((t) => {
                            const Icon = STATUS_ICON[t.status];
                            const overdue = t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date();
                            const minutes = time?.byTask[t._id];
                            return (
                              <li key={t._id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                                <button
                                  onClick={() => cycle.mutate(t)}
                                  aria-label={`Mark as ${NEXT_STATUS[t.status]}`}
                                  title={`Mark as ${NEXT_STATUS[t.status]}`}
                                  className={cn('shrink-0 rounded-full transition-colors', t.status === 'done' ? 'text-success' : t.status === 'in-progress' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
                                >
                                  <Icon className="h-5 w-5" />
                                </button>
                                <button onClick={() => setTaskDialog({ open: true, task: t })} className="min-w-0 flex-1 text-left">
                                  <p className={cn('truncate text-sm font-medium', t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</p>
                                  <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                                    <span className={cn(overdue && 'text-destructive')}>{t.dueDate ? `Due ${formatDate(t.dueDate)}` : 'No due date'}{overdue && ' · overdue'}</span>
                                    {!!minutes && <span>· {formatMinutes(minutes)} logged</span>}
                                    {!!commentCounts[t._id] && <span className="flex items-center gap-0.5">· <MessageSquare className="h-3 w-3" /> {commentCounts[t._id]}</span>}
                                  </p>
                                </button>
                                <TimerButton projectId={id} task={t} />
                                <StatusBadge value={t.priority} className="hidden sm:inline-flex" />
                                {t.assignee ? (
                                  <UserAvatar name={t.assignee.name} color={t.assignee.avatarColor} className="h-7 w-7 text-[10px]" />
                                ) : (
                                  <span className="h-7 w-7 rounded-full border border-dashed" title="Unassigned" />
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Discussion</CardTitle></CardHeader>
            <CardContent>
              <CommentThread projectId={id} people={people} allowInternal />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <div className="flex border-b px-2" role="tablist">
            {(['files', 'time', 'activity'] as SideTab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={side === t}
                onClick={() => setSide(t)}
                className={cn('-mb-px border-b-2 px-3 py-3 text-sm font-medium capitalize transition-colors', side === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
              >
                {t}
              </button>
            ))}
          </div>
          <CardContent className="pt-5">
            {side === 'files' && <FilesPanel projectId={project._id} files={project.attachments ?? []} />}
            {side === 'time' && <TimePanel projectId={project._id} tasks={tasks} />}
            {side === 'activity' && <ActivityTimeline items={activity} loading={activityLoading} />}
          </CardContent>
        </Card>
      </div>

      <ProjectFormDialog open={editing} onOpenChange={setEditing} project={project} />
      <TaskDialog open={taskDialog.open} onOpenChange={(o) => setTaskDialog({ open: o })} project={project} task={taskDialog.task} />
      <InvoiceEditor open={invoicing} onOpenChange={setInvoicing} defaultClient={project.client._id} onSaved={(inv) => navigate(`/invoices?open=${inv._id}`)} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Move project to trash?"
        description="The project and its tasks go to the trash. You can restore them within 30 days."
        confirmLabel="Move to trash"
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}
