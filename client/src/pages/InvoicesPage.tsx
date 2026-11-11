import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CircleDollarSign, Clock, FileText, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Skeleton } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState, PageHeader, Pagination, StatusBadge } from '@/components/shared/common';
import { InvoiceEditor } from '@/features/invoices/InvoiceEditor';
import { InvoiceDrawer, invoiceMoney } from '@/features/invoices/InvoiceDrawer';
import { get, getPage } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { cn, formatDate } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import type { DashboardData, Invoice } from '@/lib/types';

const TABS = [
  { id: '', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'sent', label: 'Outstanding' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
  { id: 'void', label: 'Void' },
];

export default function InvoicesPage() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);
  const status = params.get('status') ?? '';
  const openId = params.get('open');

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  const query = { page, limit: 12, status: status || undefined, search: debounced || undefined, sort: 'issueDate', order: 'desc' };
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', query],
    queryFn: () => getPage<Invoice>('/invoices', query),
    placeholderData: keepPreviousData,
  });
  const { data: dash } = useQuery({ queryKey: qk.dashboard, queryFn: () => get<DashboardData>('/dashboard') });
  const money = dash?.money;

  const cards = [
    { label: 'Paid', icon: CircleDollarSign, bucket: money?.paid, tone: 'text-success', tab: 'paid' },
    { label: 'Outstanding', icon: Clock, bucket: money?.outstanding, tone: 'text-primary', tab: 'sent' },
    { label: 'Overdue', icon: AlertTriangle, bucket: money?.overdue, tone: 'text-destructive', tab: 'overdue' },
    { label: 'Drafts', icon: FileText, bucket: money?.draft, tone: 'text-muted-foreground', tab: 'draft' },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Bill clients, send PDFs by email and track what's been paid."
        actions={<Button onClick={() => setCreating(true)}><Plus /> New invoice</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, icon: Icon, bucket, tone, tab }) => (
          <button key={label} onClick={() => { set({ status: tab }); setPage(1); }} className="text-left">
            <Card className={cn('p-4 transition-colors hover:border-primary/40', status === tab && 'border-primary/60')}>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                {label}
                <Icon className={cn('h-4 w-4', tone)} />
              </div>
              {bucket ? (
                <>
                  <p className="mt-1.5 text-xl font-semibold tabular-nums">{invoiceMoney(bucket.total)}</p>
                  <p className="text-xs text-muted-foreground">{bucket.count} invoice{bucket.count === 1 ? '' : 's'}</p>
                </>
              ) : (
                <Skeleton className="mt-2 h-9" />
              )}
            </Card>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => { set({ status: t.id || null }); setPage(1); }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  status === t.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative lg:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Invoice number…" className="pl-9" aria-label="Search invoices" />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={FileText}
            title={status || debounced ? 'No invoices match' : 'No invoices yet'}
            description="Create one here, or from a won lead or a client's page."
            action={!status && !debounced ? <Button onClick={() => setCreating(true)}><Plus /> New invoice</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Invoice</TH>
                  <TH className="hidden md:table-cell">Client</TH>
                  <TH className="hidden sm:table-cell">Issued</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((inv) => (
                  <TR key={inv._id} className="cursor-pointer" onClick={() => set({ open: inv._id })}>
                    <TD className="font-medium">{inv.number}</TD>
                    <TD className="hidden md:table-cell">{inv.client.company || inv.client.name}</TD>
                    <TD className="hidden text-muted-foreground sm:table-cell">{formatDate(inv.issueDate)}</TD>
                    <TD className={cn(inv.displayStatus === 'overdue' && 'font-medium text-destructive')}>{formatDate(inv.dueDate)}</TD>
                    <TD className="text-right font-medium tabular-nums">{invoiceMoney(inv.total, inv.currency)}</TD>
                    <TD><StatusBadge value={inv.displayStatus} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={data.meta.totalPages ?? 1} total={data.meta.total ?? 0} onChange={setPage} />
          </>
        )}
      </Card>

      <InvoiceEditor open={creating} onOpenChange={setCreating} onSaved={(inv) => set({ open: inv._id })} />
      <InvoiceDrawer invoiceId={openId} onClose={() => set({ open: null })} />
    </div>
  );
}
