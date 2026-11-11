import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, FolderKanban, KanbanSquare, RotateCcw, Trash2, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ConfirmDialog, EmptyState, PageHeader } from '@/components/shared/common';
import { api, errorMessage, get } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/utils';
import { usePermissions } from '@/stores/auth';
import type { TrashItem } from '@/lib/types';

const ICONS = { client: UsersRound, lead: KanbanSquare, project: FolderKanban, invoice: FileText };

export default function TrashPage() {
  const qc = useQueryClient();
  const { isAdmin } = usePermissions();
  const [purging, setPurging] = useState<TrashItem | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['trash'], queryFn: () => get<TrashItem[]>('/trash') });

  const refresh = () => {
    for (const key of ['trash', 'clients', 'leads', 'projects', 'invoices', 'dashboard']) void qc.invalidateQueries({ queryKey: [key] });
  };
  const restore = useMutation({
    mutationFn: (i: TrashItem) => api.post(`/trash/${i.type}/${i._id}/restore`),
    onSuccess: (_r, i) => {
      toast.success(`${i.name} restored`);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const purge = useMutation({
    mutationFn: (i: TrashItem) => api.delete(`/trash/${i.type}/${i._id}`),
    onSuccess: () => {
      toast.success('Deleted permanently');
      setPurging(null);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader title="Trash" description="Deleted clients, leads, projects and invoices are kept for 30 days, then removed automatically." />
      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : !data?.length ? (
          <EmptyState icon={Trash2} title="Trash is empty" description="Anything you delete shows up here, so mistakes are easy to undo." />
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Item</TH>
                <TH className="hidden sm:table-cell">Deleted</TH>
                <TH className="hidden md:table-cell">Removed for good</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((item) => {
                const Icon = ICONS[item.type];
                return (
                  <TR key={`${item.type}-${item._id}`}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-muted p-2"><Icon className="h-4 w-4 text-muted-foreground" /></div>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs capitalize text-muted-foreground">{item.type}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden text-muted-foreground sm:table-cell">{timeAgo(item.deletedAt)}{item.deletedBy && ` by ${item.deletedBy}`}</TD>
                    <TD className="hidden text-muted-foreground md:table-cell">{formatDate(item.purgeAt)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => restore.mutate(item)} loading={restore.isPending && restore.variables?._id === item._id}>
                          <RotateCcw /> Restore
                        </Button>
                        {isAdmin && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setPurging(item)}><Trash2 /> Delete forever</Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <ConfirmDialog
        open={!!purging}
        onOpenChange={(o) => !o && setPurging(null)}
        title={`Delete "${purging?.name}" forever?`}
        description={purging?.type === 'project' ? 'The project, its tasks, comments, time entries and files are removed permanently. This cannot be undone.' : 'This cannot be undone.'}
        confirmLabel="Delete forever"
        loading={purge.isPending}
        onConfirm={() => purging && purge.mutate(purging)}
      />
    </div>
  );
}
