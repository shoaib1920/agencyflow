import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Building2, FolderKanban, Globe, Mail, Pencil, Phone, Trash2 } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog, StatusBadge } from '@/components/shared/common';
import { api, errorMessage, get } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { formatDate, formatMoney } from '@/lib/utils';
import { usePermissions } from '@/stores/auth';
import type { Client } from '@/lib/types';
import { ClientFormDialog } from './ClientFormDialog';

export function ClientDrawer({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { isAdmin, isStaff } = usePermissions();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: client, isLoading } = useQuery({
    queryKey: qk.client(clientId ?? ''),
    queryFn: () => get<Client>(`/clients/${clientId}`),
    enabled: !!clientId,
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/clients/${clientId}`),
    onSuccess: () => {
      toast.success('Client deleted');
      void qc.invalidateQueries({ queryKey: ['clients'] });
      setConfirmDelete(false);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = client
    ? [
        { icon: Mail, label: 'Email', value: <a className="text-primary hover:underline" href={`mailto:${client.email}`}>{client.email}</a> },
        { icon: Phone, label: 'Phone', value: client.phone || '—' },
        { icon: Building2, label: 'Company', value: client.company || '—' },
        { icon: Globe, label: 'Country', value: client.country || '—' },
      ]
    : [];

  return (
    <>
      <Sheet open={!!clientId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent aria-describedby={undefined} className="overflow-y-auto p-0">
          {isLoading || !client ? (
            <div className="space-y-4 p-6">
              <DialogPrimitive.Title className="sr-only">Loading client</DialogPrimitive.Title>
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            <>
              <div className="border-b p-6 pr-12">
                <DialogPrimitive.Title className="text-xl font-semibold">{client.name}</DialogPrimitive.Title>
                <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                  {client.company && <span>{client.company}</span>}
                  <StatusBadge value={client.status} />
                </div>
                {isStaff && (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      <Pencil /> Edit
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                        <Trash2 /> Delete
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-6 p-6">
                <dl className="grid gap-4 sm:grid-cols-2">
                  {rows.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex gap-3">
                      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="truncate text-sm">{value}</dd>
                      </div>
                    </div>
                  ))}
                </dl>

                {client.notes && (
                  <section>
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</h3>
                    <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-sm">{client.notes}</p>
                  </section>
                )}

                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Projects ({client.projects?.length ?? 0})
                  </h3>
                  {client.projects?.length ? (
                    <ul className="divide-y rounded-md border">
                      {client.projects.map((p) => (
                        <li key={p._id}>
                          <Link
                            to={`/projects/${p._id}`}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/50"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="truncate font-medium">{p.title}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                              {formatMoney(p.budget)}
                              <StatusBadge value={p.status} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No projects yet.</p>
                  )}
                </section>

                <p className="text-xs text-muted-foreground">
                  Client since {formatDate(client.createdAt)}
                  {client.sourceLead && ' · converted from a won lead'}
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ClientFormDialog open={editing} onOpenChange={setEditing} client={client} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete client?"
        description={`${client?.name ?? 'This client'} will be permanently removed. Clients with projects can't be deleted.`}
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </>
  );
}
