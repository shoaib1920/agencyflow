import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CalendarDays, Download, FolderKanban, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/card';
import { EmptyState, StatusBadge } from '@/components/shared/common';
import { invoiceMoney } from '@/features/invoices/InvoiceDrawer';
import { errorMessage, get } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import type { PortalOverview } from '@/lib/types';

export default function PortalHomePage() {
  const user = useAuth((s) => s.user);
  const { data, isLoading } = useQuery({ queryKey: ['portal'], queryFn: () => get<PortalOverview>('/portal') });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      </div>
    );
  }

  const pdf = async (id: string, number: string) => {
    try {
      await downloadFile(`/invoices/${id}/pdf`, `${number}.pdf`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi {user?.name.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything we're working on for {data.client.company || data.client.name}, in one place.
        </p>
      </div>

      {data.overdueCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          You have {data.overdueCount} overdue invoice{data.overdueCount > 1 ? 's' : ''}. Total due: <b>{invoiceMoney(data.amountDue)}</b>.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your projects</h2>
        {!data.projects.length ? (
          <Card><EmptyState icon={FolderKanban} title="No projects yet" description="Projects will appear here as soon as work starts." /></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.projects.map((p) => {
              const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
              return (
                <Link key={p._id} to={`/portal/projects/${p._id}`} className="group">
                  <Card className="h-full p-5 transition-all group-hover:border-primary/40 group-hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold group-hover:text-primary">{p.title}</h3>
                      <StatusBadge value={p.status} />
                    </div>
                    {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                    <div className="mt-5 flex justify-between text-xs text-muted-foreground">
                      <span>{p.doneCount} of {p.taskCount} tasks done</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    {p.deadline && (
                      <p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" /> Target date {formatDate(p.deadline)}
                      </p>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>{data.amountDue > 0 ? `${invoiceMoney(data.amountDue)} currently due` : 'You are all paid up. Thank you!'}</CardDescription>
        </CardHeader>
        <CardContent>
          {!data.invoices.length ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Receipt className="h-4 w-4" /> No invoices yet.</p>
          ) : (
            <ul className="divide-y">
              {data.invoices.map((inv) => (
                <li key={inv._id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{inv.number}</p>
                    <p className="text-xs text-muted-foreground">
                      Issued {formatDate(inv.issueDate)} · {inv.status === 'paid' ? `paid ${formatDate(inv.paidAt)}` : `due ${formatDate(inv.dueDate)}`}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{invoiceMoney(inv.total, inv.currency)}</span>
                  <StatusBadge value={inv.displayStatus} />
                  <Button size="sm" variant="outline" onClick={() => void pdf(inv._id, inv.number)}><Download /> PDF</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
