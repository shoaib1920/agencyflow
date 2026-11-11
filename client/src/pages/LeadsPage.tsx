import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/common';
import { LeadCardView, SortableLeadCard } from '@/features/leads/LeadCard';
import { LeadFormDialog } from '@/features/leads/LeadFormDialog';
import { CsvMenu } from '@/features/csv/CsvMenu';
import { usePermissions } from '@/stores/auth';
import { groupByStage, positionAt, STAGES, type Board } from '@/features/leads/stages';
import { api, errorMessage, get } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { cn, formatMoneyCompact } from '@/lib/utils';
import type { ApiResponse, Client, Lead, LeadStage } from '@/lib/types';

function findStage(board: Board, id: string): LeadStage | undefined {
  if (STAGES.some((s) => s.id === id)) return id as LeadStage;
  return STAGES.find((s) => board[s.id].some((l) => l._id === id))?.id;
}

function Column({
  stage,
  leads,
  onOpen,
  onAdd,
}: {
  stage: (typeof STAGES)[number];
  leads: Lead[];
  onOpen: (l: Lead) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = leads.reduce((n, l) => n + l.value, 0);
  return (
    <div className="flex w-[280px] shrink-0 flex-col rounded-xl bg-muted/50 lg:w-auto lg:min-w-0 lg:flex-1">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', stage.dot)} />
          <h2 className="truncate text-sm font-semibold" title={stage.label}>{stage.label}</h2>
          <span className="rounded-full bg-background px-1.5 text-xs text-muted-foreground">{leads.length}</span>
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{formatMoneyCompact(total)}</span>
      </div>
      <SortableContext items={leads.map((l) => l._id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex min-h-[120px] flex-1 flex-col gap-2 rounded-b-xl p-2 transition-colors',
            isOver && 'bg-accent/60',
          )}
        >
          {leads.map((lead) => (
            <SortableLeadCard key={lead._id} lead={lead} onOpen={onOpen} />
          ))}
          <button
            onClick={onAdd}
            className="flex items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-xs text-muted-foreground opacity-70 transition hover:bg-background hover:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" /> Add lead
          </button>
        </div>
      </SortableContext>
    </div>
  );
}

export default function LeadsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isStaff } = usePermissions();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Lead | null>(null);
  const [creatingIn, setCreatingIn] = useState<LeadStage | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: leads, isLoading } = useQuery({ queryKey: qk.leads, queryFn: () => get<Lead[]>('/leads') });

  // Local board state lets cards move between columns live while dragging;
  // it re-syncs from the server cache whenever we're not mid-drag.
  const [board, setBoard] = useState<Board>(() => groupByStage([]));
  useEffect(() => {
    if (leads && !activeId) setBoard(groupByStage(leads));
  }, [leads, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = useMutation({
    mutationFn: (v: { id: string; stage: LeadStage; position: number; previous?: Lead[] }) =>
      api.patch<ApiResponse<{ lead: Lead; client: Client | null }>>(`/leads/${v.id}/stage`, {
        stage: v.stage,
        position: v.position,
      }),
    onMutate: async () => {
      // Stop in-flight refetches from overwriting the optimistic state
      await qc.cancelQueries({ queryKey: qk.leads });
    },
    onError: (err, v) => {
      if (v.previous) qc.setQueryData(qk.leads, v.previous); // roll back
      toast.error(errorMessage(err, 'Could not move lead'));
    },
    onSuccess: ({ data }) => {
      const client = data.data.client;
      if (client) {
        toast.success(`Deal won! ${client.name} is now a client`, {
          action: { label: 'View client', onClick: () => navigate(`/clients?open=${client._id}`) },
        });
        void qc.invalidateQueries({ queryKey: ['clients'] });
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.leads });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findStage(board, String(active.id));
    const to = findStage(board, String(over.id));
    if (!from || !to || from === to) return;
    setBoard((b) => {
      const moving = b[from].find((l) => l._id === active.id);
      if (!moving) return b;
      const overIndex = b[to].findIndex((l) => l._id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : b[to].length;
      const target = [...b[to]];
      target.splice(insertAt, 0, { ...moving, stage: to });
      return { ...b, [from]: b[from].filter((l) => l._id !== active.id), [to]: target };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const original = leads?.find((l) => l._id === id);
    setActiveId(null);
    if (!over || !original) return;

    const stage = findStage(board, id);
    if (!stage) return;
    let column = board[stage];
    const oldIndex = column.findIndex((l) => l._id === id);
    const overIndex = column.findIndex((l) => l._id === over.id);
    if (overIndex >= 0 && overIndex !== oldIndex) {
      column = arrayMove(column, oldIndex, overIndex);
      setBoard((b) => ({ ...b, [stage]: column }));
    }
    const index = column.findIndex((l) => l._id === id);
    const position = positionAt(column, index);
    if (stage === original.stage && position === original.position) return;
    if (stage === original.stage && index === oldIndex && overIndex < 0) return;

    // Optimistic update, applied synchronously in the same tick as the drop so the
    // board never flashes back to the old column while the request is in flight.
    const previous = qc.getQueryData<Lead[]>(qk.leads);
    qc.setQueryData<Lead[]>(qk.leads, (old) =>
      old?.map((l) => (l._id === id ? { ...l, stage, position } : l)),
    );
    move.mutate({ id, stage, position, previous });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return board;
    return Object.fromEntries(
      STAGES.map((s) => [
        s.id,
        board[s.id].filter((l) => [l.title, l.company, l.contactName].some((v) => v?.toLowerCase().includes(q))),
      ]),
    ) as Board;
  }, [board, search]);

  const activeLead = activeId ? leads?.find((l) => l._id === activeId) : undefined;
  const openValue = STAGES.filter((s) => s.id !== 'won' && s.id !== 'lost').reduce(
    (n, s) => n + board[s.id].reduce((m, l) => m + l.value, 0),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Leads"
        description={`Drag deals between stages. ${formatMoneyCompact(openValue)} in open pipeline.`}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter leads..." className="w-48 pl-9" aria-label="Filter leads" />
            </div>
            {isStaff && <CsvMenu entity="leads" invalidate={qk.leads as unknown as unknown[]} />}
            <Button onClick={() => setCreatingIn('new')}>
              <Plus /> New lead
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {STAGES.map((s) => (
            <Skeleton key={s.id} className="h-96 w-[280px] shrink-0 rounded-xl lg:flex-1" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 scrollbar-thin sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {STAGES.map((stage) => (
              <Column
                key={stage.id}
                stage={stage}
                leads={filtered[stage.id]}
                onOpen={setEditing}
                onAdd={() => setCreatingIn(stage.id)}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
            {activeLead ? <LeadCardView lead={activeLead} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <LeadFormDialog
        open={!!editing || !!creatingIn}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setCreatingIn(null);
          }
        }}
        lead={editing}
        defaultStage={creatingIn ?? 'new'}
      />
    </div>
  );
}
