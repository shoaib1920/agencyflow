import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { CalendarDays, MessageSquare } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/shared/common';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { cn, formatDate } from '@/lib/utils';
import { formatMinutes } from '@/lib/download';
import type { Task, TaskStatus } from '@/lib/types';

const COLUMNS: { id: TaskStatus; label: string; dot: string }[] = [
  { id: 'todo', label: 'To do', dot: 'bg-slate-400' },
  { id: 'in-progress', label: 'In progress', dot: 'bg-primary' },
  { id: 'done', label: 'Done', dot: 'bg-emerald-500' },
];
type Board = Record<TaskStatus, Task[]>;

const group = (tasks: Task[]): Board => {
  const b: Board = { todo: [], 'in-progress': [], done: [] };
  for (const t of tasks) b[t.status].push(t);
  for (const c of COLUMNS) b[c.id].sort((x, y) => (x.position ?? 0) - (y.position ?? 0));
  return b;
};

function midpoint(col: Task[], i: number) {
  const before = col[i - 1]?.position;
  const after = col[i + 1]?.position;
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1000;
  if (after !== undefined) return after - 1000;
  return 1000;
}

function Card({ task, minutes, comments, onOpen, overlay }: { task: Task; minutes?: number; comments?: number; onOpen?: () => void; overlay?: boolean }) {
  const overdue = task.status !== 'done' && task.dueDate && new Date(task.dueDate) < new Date();
  return (
    <div
      onClick={onOpen}
      className={cn(
        'cursor-grab select-none rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:border-primary/40 hover:shadow-md active:cursor-grabbing',
        overlay && 'rotate-2 shadow-xl ring-2 ring-primary/40',
      )}
    >
      <p className={cn('text-sm font-medium leading-snug', task.status === 'done' && 'text-muted-foreground line-through')}>{task.title}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <StatusBadge value={task.priority} className="py-0" />
        {task.dueDate && (
          <span className={cn('flex items-center gap-1', overdue && 'text-destructive')}>
            <CalendarDays className="h-3 w-3" /> {formatDate(task.dueDate).replace(/, \d{4}$/, '')}
          </span>
        )}
        {!!comments && <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{comments}</span>}
        {!!minutes && <span>{formatMinutes(minutes)}</span>}
        <span className="ml-auto">
          {task.assignee ? <UserAvatar name={task.assignee.name} color={task.assignee.avatarColor} className="h-6 w-6 text-[9px]" /> : null}
        </span>
      </div>
    </div>
  );
}

function SortableCard(props: { task: Task; minutes?: number; comments?: number; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task._id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'opacity-40')} {...attributes} {...listeners}>
      <Card {...props} />
    </div>
  );
}

function Column({ col, tasks, children }: { col: (typeof COLUMNS)[number]; tasks: Task[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div className="flex min-w-[240px] flex-1 flex-col rounded-xl bg-muted/50">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className={cn('h-2 w-2 rounded-full', col.dot)} />
        <h3 className="text-sm font-semibold">{col.label}</h3>
        <span className="rounded-full bg-background px-1.5 text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn('flex min-h-[140px] flex-1 flex-col gap-2 rounded-b-xl p-2 transition-colors', isOver && 'bg-accent/60')}>
          {children}
        </div>
      </SortableContext>
    </div>
  );
}

/** Drag tasks between To do / In progress / Done with the same optimistic pattern as the leads board. */
export function TaskBoard({
  projectId,
  tasks,
  minutesByTask,
  commentCounts,
  onOpen,
}: {
  projectId: string;
  tasks: Task[];
  minutesByTask: Record<string, number>;
  commentCounts: Record<string, number>;
  onOpen: (t: Task) => void;
}) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board>(() => group(tasks));
  useEffect(() => {
    if (!activeId) setBoard(group(tasks));
  }, [tasks, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = useMutation({
    mutationFn: (v: { id: string; status: TaskStatus; position: number; previous?: Task[] }) =>
      api.patch(`/projects/${projectId}/tasks/${v.id}`, { status: v.status, position: v.position }),
    onError: (err, v) => {
      if (v.previous) qc.setQueryData(qk.tasks(projectId), v.previous);
      toast.error(errorMessage(err, 'Could not move task'));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.tasks(projectId) });
      void qc.invalidateQueries({ queryKey: qk.projectActivity(projectId) });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });

  const find = (b: Board, id: string) => (COLUMNS.find((c) => c.id === id)?.id ?? COLUMNS.find((c) => b[c.id].some((t) => t._id === id))?.id) as TaskStatus | undefined;

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = find(board, String(active.id));
    const to = find(board, String(over.id));
    if (!from || !to || from === to) return;
    setBoard((b) => {
      const moving = b[from].find((t) => t._id === active.id);
      if (!moving) return b;
      const idx = b[to].findIndex((t) => t._id === over.id);
      const target = [...b[to]];
      target.splice(idx >= 0 ? idx : target.length, 0, { ...moving, status: to });
      return { ...b, [from]: b[from].filter((t) => t._id !== active.id), [to]: target };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const original = tasks.find((t) => t._id === id);
    setActiveId(null);
    if (!over || !original) return;
    const status = find(board, id);
    if (!status) return;
    let col = board[status];
    const oldIndex = col.findIndex((t) => t._id === id);
    const overIndex = col.findIndex((t) => t._id === over.id);
    if (overIndex >= 0 && overIndex !== oldIndex) col = arrayMove(col, oldIndex, overIndex);
    setBoard((b) => ({ ...b, [status]: col }));
    const index = col.findIndex((t) => t._id === id);
    const position = midpoint(col, index);
    if (status === original.status && position === original.position) return;

    const previous = qc.getQueryData<Task[]>(qk.tasks(projectId));
    qc.setQueryData<Task[]>(qk.tasks(projectId), (old) => old?.map((t) => (t._id === id ? { ...t, status, position } : t)));
    move.mutate({ id, status, position, previous });
  };

  const active = activeId ? tasks.find((t) => t._id === activeId) : undefined;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active: a }) => setActiveId(String(a.id))}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-thin">
        {COLUMNS.map((c) => (
          <Column key={c.id} col={c} tasks={board[c.id]}>
            {board[c.id].map((t) => (
              <SortableCard key={t._id} task={t} minutes={minutesByTask[t._id]} comments={commentCounts[t._id]} onOpen={() => onOpen(t)} />
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>{active ? <Card task={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
