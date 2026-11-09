import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, FolderKanban, Plus, Search } from 'lucide-react';
import { differenceInCalendarDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Card, Skeleton } from '@/components/ui/card';
import { AvatarStack } from '@/components/ui/avatar';
import { EmptyState, PageHeader, Pagination, StatusBadge } from '@/components/shared/common';
import { ProjectFormDialog } from '@/features/projects/ProjectFormDialog';
import { getPage } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermissions } from '@/stores/auth';
import type { Project } from '@/lib/types';

function DeadlineLabel({ deadline, done }: { deadline?: string; done: boolean }) {
  if (!deadline) return <span className="text-muted-foreground">No deadline</span>;
  const days = differenceInCalendarDays(new Date(deadline), new Date());
  const urgent = !done && days <= 7;
  return (
    <span className={cn('flex items-center gap-1', urgent ? (days < 0 ? 'text-destructive' : 'text-warning') : 'text-muted-foreground')}>
      <CalendarDays className="h-3.5 w-3.5" />
      {formatDate(deadline)}
      {!done && days >= 0 && days <= 7 && ` · ${days === 0 ? 'today' : `${days}d left`}`}
      {!done && days < 0 && ' · overdue'}
    </span>
  );
}

export default function ProjectsPage() {
  const { isStaff, role } = usePermissions();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounce(search);

  const query = { page, limit: 9, search: debounced || undefined, status: status || undefined, sort: 'deadline', order: 'asc' };
  const { data, isLoading } = useQuery({
    queryKey: qk.projects(query),
    queryFn: () => getPage<Project>('/projects', query),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title="Projects"
        description={role === 'member' ? 'Projects you are assigned to.' : 'All client work in delivery.'}
        actions={
          isStaff && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New project
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search projects..."
            className="pl-9"
            aria-label="Search projects"
          />
        </div>
        <NativeSelect
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-40"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="on-hold">On hold</option>
          <option value="completed">Completed</option>
        </NativeSelect>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title={debounced || status ? 'No projects match' : 'No projects yet'}
            description={isStaff ? 'Create a project for one of your clients.' : 'You will see projects here once you are added to one.'}
            action={
              isStaff && !debounced && !status ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> New project
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((p) => {
              const pct = p.taskCount ? Math.round(((p.doneCount ?? 0) / p.taskCount) * 100) : 0;
              return (
                <Link key={p._id} to={`/projects/${p._id}`} className="group">
                  <Card className="flex h-full flex-col p-5 transition-all group-hover:border-primary/40 group-hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold group-hover:text-primary">{p.title}</h3>
                        <p className="truncate text-sm text-muted-foreground">{p.client?.company || p.client?.name}</p>
                      </div>
                      <StatusBadge value={p.status} />
                    </div>
                    <div className="mt-5">
                      <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                        <span>
                          {p.doneCount}/{p.taskCount} tasks
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-5 text-xs">
                      <DeadlineLabel deadline={p.deadline} done={p.status === 'completed'} />
                      <AvatarStack users={p.members} />
                    </div>
                    <p className="mt-3 border-t pt-3 text-sm font-medium tabular-nums">{formatMoney(p.budget)}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
          {(data.meta.totalPages ?? 1) > 1 && (
            <Card className="mt-4">
              <Pagination page={page} totalPages={data.meta.totalPages ?? 1} total={data.meta.total ?? 0} onChange={setPage} />
            </Card>
          )}
        </>
      )}

      <ProjectFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
