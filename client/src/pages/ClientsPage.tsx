import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Card, Skeleton } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState, PageHeader, Pagination, StatusBadge } from '@/components/shared/common';
import { ClientFormDialog } from '@/features/clients/ClientFormDialog';
import { ClientDrawer } from '@/features/clients/ClientDrawer';
import { CsvMenu } from '@/features/csv/CsvMenu';
import { getPage } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { formatDate } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermissions } from '@/stores/auth';
import type { Client } from '@/lib/types';

type SortKey = 'name' | 'company' | 'country' | 'status' | 'createdAt';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Client' },
  { key: 'company', label: 'Company', className: 'hidden md:table-cell' },
  { key: 'country', label: 'Country', className: 'hidden lg:table-cell' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Added', className: 'hidden sm:table-cell' },
];

export default function ClientsPage() {
  const [params, setParams] = useSearchParams();
  const { isStaff } = usePermissions();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [creating, setCreating] = useState(false);
  const debounced = useDebounce(search);

  const page = Number(params.get('page') ?? 1);
  const status = params.get('status') ?? '';
  const sort = (params.get('sort') as SortKey | null) ?? 'createdAt';
  const order = (params.get('order') as 'asc' | 'desc' | null) ?? 'desc';
  const openId = params.get('open');

  // Keep URL as the source of truth so filters survive reloads and are shareable
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('search') ?? '') !== debounced) update({ search: debounced || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Topbar search navigates here with ?search=; keep the input in sync
  useEffect(() => {
    setSearch(params.get('search') ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('search')]);

  const query = { page, limit: 10, search: debounced || undefined, status: status || undefined, sort, order };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: qk.clients(query),
    queryFn: () => getPage<Client>('/clients', query),
    placeholderData: keepPreviousData,
  });

  const toggleSort = (key: SortKey) => {
    const nextOrder = sort === key && order === 'asc' ? 'desc' : 'asc';
    update({ sort: key, order: nextOrder, page: null });
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Everyone you're working with, past and present."
        actions={
          isStaff && (
            <>
              <CsvMenu entity="clients" invalidate={['clients']} />
              <Button onClick={() => setCreating(true)}>
                <Plus /> New client
              </Button>
            </>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, company, email..."
              className="pl-9"
              aria-label="Search clients"
            />
          </div>
          <NativeSelect
            value={status}
            onChange={(e) => update({ status: e.target.value || null, page: null })}
            className="sm:w-40"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </NativeSelect>
          {isFetching && !isLoading && <span className="text-xs text-muted-foreground">Updating…</span>}
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={UsersRound}
            title={debounced || status ? 'No clients match your filters' : 'No clients yet'}
            description={debounced || status ? 'Try a different search or status.' : 'Add your first client or win a lead to get started.'}
            action={
              isStaff && !debounced && !status ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> New client
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  {COLUMNS.map((c) => (
                    <TH key={c.key} className={c.className}>
                      <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                        {c.label}
                        {sort === c.key ? (
                          order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {data.items.map((c) => (
                  <TR key={c._id} className="cursor-pointer" onClick={() => update({ open: c._id })}>
                    <TD>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </TD>
                    <TD className="hidden md:table-cell">{c.company || '—'}</TD>
                    <TD className="hidden lg:table-cell">{c.country || '—'}</TD>
                    <TD>
                      <StatusBadge value={c.status} />
                    </TD>
                    <TD className="hidden text-muted-foreground sm:table-cell">{formatDate(c.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={page}
              totalPages={data.meta.totalPages ?? 1}
              total={data.meta.total ?? 0}
              onChange={(p) => update({ page: String(p) })}
            />
          </>
        )}
      </Card>

      <ClientFormDialog open={creating} onOpenChange={setCreating} />
      <ClientDrawer clientId={openId} onClose={() => update({ open: null })} />
    </div>
  );
}
