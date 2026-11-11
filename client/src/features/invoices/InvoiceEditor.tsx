import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, errorMessage, getPage } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import type { ApiResponse, Client, Invoice, Project } from '@/lib/types';

const schema = z.object({
  client: z.string().min(1, 'Choose a client'),
  project: z.string().optional(),
  currency: z.string().length(3),
  dueDate: z.string().min(1, 'Pick a due date'),
  taxRate: z.coerce.number().min(0).max(100),
  discount: z.coerce.number().min(0),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Required'),
        quantity: z.coerce.number().min(0),
        unitPrice: z.coerce.number().min(0),
      }),
    )
    .min(1, 'Add at least one line'),
});
type Values = z.infer<typeof schema>;

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Same rounding as the server, so the preview matches what will be saved. */
export function previewTotals(items: { quantity: number; unitPrice: number }[], taxRate: number, discount: number) {
  const r = (n: number) => Math.round(n * 100) / 100;
  const subtotal = r(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0));
  const d = Math.min(r(Number(discount) || 0), subtotal);
  const tax = r(((subtotal - d) * (Number(taxRate) || 0)) / 100);
  return { subtotal, discount: d, tax, total: r(subtotal - d + tax) };
}

export function InvoiceEditor({
  open,
  onOpenChange,
  invoice,
  defaultClient,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice?: Invoice | null;
  defaultClient?: string;
  onSaved?: (inv: Invoice) => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!invoice;
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const clientId = useWatch({ control, name: 'client' });
  const watched = useWatch({ control, name: ['items', 'taxRate', 'discount', 'currency'] });

  const { data: clients } = useQuery({
    queryKey: qk.clients({ picker: true }),
    queryFn: () => getPage<Client>('/clients', { limit: 100, sort: 'name', order: 'asc' }),
    enabled: open,
  });
  const { data: projects } = useQuery({
    queryKey: qk.projects({ client: clientId, picker: true }),
    queryFn: () => getPage<Project>('/projects', { client: clientId, limit: 50 }),
    enabled: open && !!clientId,
  });

  useEffect(() => {
    if (!open) return;
    reset({
      client: invoice?.client._id ?? defaultClient ?? '',
      project: invoice?.project?._id ?? '',
      currency: invoice?.currency ?? 'USD',
      dueDate: invoice ? invoice.dueDate.slice(0, 10) : inDays(14),
      taxRate: invoice?.taxRate ?? 0,
      discount: invoice?.discount ?? 0,
      notes: invoice?.notes ?? 'Payment due within 14 days. Thank you for your business!',
      items: invoice?.items.length ? invoice.items : [{ description: '', quantity: 1, unitPrice: 0 }],
    });
  }, [open, invoice, defaultClient, reset]);

  const [items, taxRate, discount, currency] = watched;
  const totals = useMemo(() => previewTotals(items ?? [], taxRate ?? 0, discount ?? 0), [items, taxRate, discount]);
  const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency?.length === 3 ? currency : 'USD' }).format(n);

  const save = useMutation({
    mutationFn: async ({ project, ...v }: Values) => {
      const body = { ...v, project: project || null };
      const res = isEdit
        ? await api.patch<ApiResponse<Invoice>>(`/invoices/${invoice._id}`, body)
        : await api.post<ApiResponse<Invoice>>('/invoices', body);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res.message ?? 'Saved');
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      void qc.invalidateQueries({ queryKey: ['invoice'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      onOpenChange(false);
      onSaved?.(res.data);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${invoice.number}` : 'New invoice'}</DialogTitle>
          <DialogDescription>Totals are recalculated on the server when you save.</DialogDescription>
        </DialogHeader>
        <form id="invoice-form" onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Client" error={errors.client?.message} className="sm:col-span-2">
              <NativeSelect key={clients?.items.length ?? 0} aria-invalid={!!errors.client} {...register('client')}>
                <option value="">Select a client…</option>
                {clients?.items.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.company ? `${c.company} (${c.name})` : c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Project (optional)" className="sm:col-span-2">
              <NativeSelect key={`${clientId}-${projects?.items.length ?? 0}`} {...register('project')} disabled={!clientId}>
                <option value="">No project</option>
                {projects?.items.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Due date" error={errors.dueDate?.message}>
              <Input type="date" {...register('dueDate')} />
            </Field>
            <Field label="Currency">
              <NativeSelect {...register('currency')}>
                {['USD', 'EUR', 'GBP', 'PKR', 'AED', 'INR', 'CAD', 'AUD'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Tax %">
              <Input type="number" min={0} max={100} step="0.5" {...register('taxRate')} />
            </Field>
            <Field label="Discount">
              <Input type="number" min={0} step="10" {...register('discount')} />
            </Field>
          </div>

          <div>
            <div className="mb-2 hidden grid-cols-[1fr_80px_120px_110px_36px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            <div className="space-y-2">
              {fields.map((f, i) => {
                const row = items?.[i];
                const amount = (Number(row?.quantity) || 0) * (Number(row?.unitPrice) || 0);
                return (
                  <div key={f.id} className="grid grid-cols-[1fr_80px_36px] gap-2 rounded-md border p-2 sm:grid-cols-[1fr_80px_120px_110px_36px] sm:border-0 sm:p-0">
                    <Input placeholder="e.g. Homepage design" aria-label="Description" aria-invalid={!!errors.items?.[i]?.description} className="col-span-3 sm:col-span-1" {...register(`items.${i}.description`)} />
                    <Input type="number" min={0} step="0.5" aria-label="Quantity" className="text-right" {...register(`items.${i}.quantity`)} />
                    <Input type="number" min={0} step="1" aria-label="Unit price" className="text-right" {...register(`items.${i}.unitPrice`)} />
                    <span className="hidden items-center justify-end text-sm tabular-nums sm:flex">{money(amount)}</span>
                    <Button type="button" variant="ghost" size="icon" disabled={fields.length === 1} onClick={() => remove(i)} aria-label="Remove line">
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
            {errors.items?.message && <p className="mt-1 text-xs text-destructive">{errors.items.message}</p>}
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => append({ description: '', quantity: 1, unitPrice: 0 })}>
              <Plus /> Add line
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
            <Field label="Notes (shown on the invoice)">
              <Textarea rows={3} {...register('notes')} />
            </Field>
            <dl className="space-y-1.5 self-end rounded-lg bg-muted/60 p-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{money(totals.subtotal)}</dd></div>
              {totals.discount > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">-{money(totals.discount)}</dd></div>}
              {Number(taxRate) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Tax ({taxRate}%)</dt><dd className="tabular-nums">{money(totals.tax)}</dd></div>}
              <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(totals.total)}</dd></div>
            </dl>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="invoice-form" loading={save.isPending}>{isEdit ? 'Save changes' : 'Create draft'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
