import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarDays, Circle, CircleCheck, CircleDot, ClipboardList, DollarSign, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/card';
import { AvatarStack, UserAvatar } from '@/components/ui/avatar';
import { ConfirmDialog, EmptyState, StatusBadge } from '@/components/shared/common';
import { ActivityTimeline } from '@/components/shared/ActivityTimeline';
import { ProjectFormDialog } from '@/features/projects/ProjectFormDialog';
import { TaskDialog } from '@/features/projects/TaskDialog';
import { FilesPanel } from '@/features/projects/FilesPanel';
import { api, errorMessage, get } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { usePermissions } from '@/stores/auth';
import type { Activity, Project, Task, TaskStatus } from '@/lib/types';

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: 'in-progress', 'in-progress': 'done', done: 'todo' };
const STATUS_ICON = { todo: Circle, 'in-progress': CircleDot, done: CircleCheck };
const GROUPS: { id: TaskStatus; label: string }[] = [
  { id: 'in-progress', label: 'In progress' },
  { id: 'todo', label: 'To do' },
  { id: 'done', label: 'Done' },
];

export default function ProjectDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isStaff } = usePermissions();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task?: Task | null }>({ open: false });

  const { data: project, isLoading, error } = useQuery({ queryKey: qk.project(id), queryFn: () => get<Project>(`/projects/${id}`) });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: qk.tasks(id),
    queryFn: () => get<Task[]>(`/projects/${id}/tasks`),
    enabled: !!project,
  });
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: qk.projectActivity(id),
    queryFn: () => get<Activity[]>(`/projects/${id}/activity`),
    enabled: !!project,
  });

  // One-click status cycling with an optimistic cache update
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
      toast.success('Project deleted');
      void qc.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
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
        action={
          <Button asChild variant="outline">
            <Link to="/projects">Back to projects</Link>
          </Button>
        }
      />
    );
  }

  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: DollarSign, label: 'Budget', value: formatMoney(project.budget) },
          { icon: CalendarDays, label: 'Deadline', value: formatDate(project.deadline) },
          { icon: ClipboardList, label: 'Progress', value: `${pct}% · ${done}/${tasks.length} tasks` },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="flex items-center gap-3 p-4">
            <div className="rounded-md bg-accent p-2 text-accent-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold">{value}</p>
            </div>
          </Card>
        ))}
        <Card className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs text-muted-foreground">Team</p>
            <p className="text-sm font-semibold">{project.members.length} members</p>
          </div>
          <AvatarStack users={project.members} max={4} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Tasks</CardTitle>
            <Button size="sm" onClick={() => setTaskDialog({ open: true, task: null })}>
              <Plus /> Add task
            </Button>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No tasks yet" description="Break the project into tasks and assign them to the team." />
            ) : (
              <div className="space-y-5">
                {GROUPS.map((g) => {
                  const list = tasks.filter((t) => t.status === g.id);
                  if (!list.length) return null;
                  return (
                    <section key={g.id}>
                      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {g.label} · {list.length}
                      </h3>
                      <ul className="divide-y rounded-lg border">
                        {list.map((t) => {
                          const Icon = STATUS_ICON[t.status];
                          const overdue = t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date();
                          return (
                            <li key={t._id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                              <button
                                onClick={() => cycle.mutate(t)}
                                aria-label={`Mark as ${NEXT_STATUS[t.status]}`}
                                title={`Mark as ${NEXT_STATUS[t.status]}`}
                                className={cn(
                                  'shrink-0 rounded-full transition-colors',
                                  t.status === 'done' ? 'text-success' : t.status === 'in-progress' ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                                )}
                              >
                                <Icon className="h-5 w-5" />
                              </button>
                              <button onClick={() => setTaskDialog({ open: true, task: t })} className="min-w-0 flex-1 text-left">
                                <p className={cn('truncate text-sm font-medium', t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</p>
                                <p className={cn('text-xs text-muted-foreground', overdue && 'text-destructive')}>
                                  {t.dueDate ? `Due ${formatDate(t.dueDate)}` : 'No due date'}
                                  {overdue && ' · overdue'}
                                </p>
                              </button>
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Files</CardTitle>
            </CardHeader>
            <CardContent>
              <FilesPanel projectId={project._id} files={project.attachments ?? []} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline items={activity} loading={activityLoading} />
            </CardContent>
          </Card>
        </div>
      </div>

      <ProjectFormDialog open={editing} onOpenChange={setEditing} project={project} />
      <TaskDialog open={taskDialog.open} onOpenChange={(o) => setTaskDialog({ open: o })} project={project} task={taskDialog.task} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete project?"
        description="The project, its tasks, files and activity will be permanently removed."
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}
