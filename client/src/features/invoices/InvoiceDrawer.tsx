import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, CheckCircle2, Download, Eye, Pencil, Send, Trash2 } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog, StatusBadge } from '@/components/shared/common';
import { api, errorMessage, get } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { qk } from '@/lib/queryClient';
import { formatDate } from '@/lib/utils';
import type { ApiResponse, Invoice } from '@/lib/types';
import { InvoiceEditor } from './InvoiceEditor';

export const invoiceMoney = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

export function InvoiceDrawer({ invoiceId, onClose }: { invoiceId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'void' | 'delete' | null>(null);

  const { data: inv, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => get<Invoice>(`/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['invoices'] });
    void qc.invalidateQueries({ queryKey: ['invoice', invoiceId] });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
  };

  const status = useMutation({
    mutationFn: async (action: 'send' | 'pay' | 'void') =>
      (await api.post<ApiResponse<{ invoice: Invoice; emailed: boolean }>>(`/invoices/${invoiceId}/status`, { action })).data,
    onSuccess: (res) => {
      toast.success(res.message ?? 'Updated');
      setConfirm(null);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/invoices/${invoiceId}`),
    onSuccess: () => {
      toast.success('Invoice moved to trash');
      setConfirm(null);
      refresh();
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const pdf = async (open: boolean) => {
    try {
      await downloadFile(`/invoices/${invoiceId}/pdf`, `${inv?.number ?? 'invoice'}.pdf`, { open });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load the PDF'));
    }
  };

  const m = (n: number) => invoiceMoney(n, inv?.currency);

  return (
    <>
      <Sheet open={!!invoiceId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent aria-describedby={undefined} className="overflow-y-auto p-0 sm:max-w-2xl">
          {isLoading || !inv ? (
            <div className="space-y-4 p-6">
              <DialogPrimitive.Title className="sr-only">Loading invoice</DialogPrimitive.Title>
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-64" />
            </div>
          ) : (
            <>
              <div className="border-b p-6 pr-12">
                <div className="flex items-center gap-3">
                  <DialogPrimitive.Title className="text-xl font-semibold">{inv.number}</DialogPrimitive.Title>
                  <StatusBadge value={inv.displayStatus} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  <Link to={`/clients?open=${inv.client._id}`} className="hover:text-primary">
                    {inv.client.company || inv.client.name}
                  </Link>
                  {inv.project && (
                    <>
                      {' · '}
                      <Link to={`/projects/${inv.project._id}`} className="hover:text-primary">{inv.project.title}</Link>
                    </>
                  )}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {inv.status === 'draft' && (
                    <Button size="sm" loading={status.isPending} onClick={() => status.mutate('send')}>
                      <Send /> Send to client
                    </Button>
                  )}
                  {inv.status === 'sent' && (
                    <Button size="sm" loading={status.isPending} onClick={() => status.mutate('pay')}>
                      <CheckCircle2 /> Mark as paid
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void pdf(true)}><Eye /> View PDF</Button>
                  <Button size="sm" variant="outline" onClick={() => void pdf(false)}><Download /> Download</Button>
                  {(inv.status === 'draft' || inv.status === 'sent') && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
                  )}
                  {inv.status === 'sent' && (
                    <Button size="sm" variant="outline" onClick={() => status.mutate('send')} loading={status.isPending}><Send /> Resend</Button>
                  )}
                  {(inv.status === 'draft' || inv.status === 'sent') && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm('void')}><Ban /> Void</Button>
                  )}
                  {(inv.status === 'draft' || inv.status === 'void') && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm('delete')}><Trash2 /> Delete</Button>
                  )}
                </div>
              </div>

              <div className="space-y-6 p-6">
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  {[
                    ['Issued', formatDate(inv.issueDate)],
                    ['Due', formatDate(inv.dueDate)],
                    ['Sent', formatDate(inv.sentAt)],
                    ['Paid', formatDate(inv.paidAt)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Item</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.map((it, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">{it.description}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m(it.unitPrice)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m(it.quantity * it.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <dl className="space-y-1 border-t bg-muted/30 p-3 text-sm">
                    <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{m(inv.subtotal)}</dd></div>
                    {inv.discount > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">-{m(inv.discount)}</dd></div>}
                    {inv.taxRate > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Tax ({inv.taxRate}%)</dt><dd className="tabular-nums">{m(inv.tax)}</dd></div>}
                    <div className="flex justify-between pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{m(inv.total)}</dd></div>
                  </dl>
                </div>

                {inv.notes && <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-sm">{inv.notes}</p>}
                <p className="text-xs text-muted-foreground">Created by {inv.createdBy?.name ?? 'someone'} on {formatDate(inv.createdAt)}</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <InvoiceEditor open={editing} onOpenChange={setEditing} invoice={inv} />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'void' ? 'Void this invoice?' : 'Delete this invoice?'}
        description={
          confirm === 'void'
            ? 'A voided invoice stays on record but no longer counts as outstanding. This cannot be undone.'
            : 'The invoice moves to the trash and can be restored for 30 days.'
        }
        confirmLabel={confirm === 'void' ? 'Void invoice' : 'Delete'}
        loading={status.isPending || del.isPending}
        onConfirm={() => (confirm === 'void' ? status.mutate('void') : del.mutate())}
      />
    </>
  );
}
