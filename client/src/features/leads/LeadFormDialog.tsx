import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/common';
import { api, errorMessage, get } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { usePermissions } from '@/stores/auth';
import type { Lead, LeadStage, User } from '@/lib/types';
import { STAGES } from './stages';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  contactName: z.string().trim().min(1, 'Contact name is required'),
  company: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().optional(),
  country: z.string().trim().optional(),
  value: z.coerce.number().min(0, 'Must be positive'),
  stage: z.enum(['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost']),
  source: z.string().trim().optional(),
  owner: z.string().optional(),
  notes: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function LeadFormDialog({
  open,
  onOpenChange,
  lead,
  defaultStage = 'new',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead?: Lead | null;
  defaultStage?: LeadStage;
}) {
  const qc = useQueryClient();
  const { isStaff } = usePermissions();
  const [confirm, setConfirm] = useState(false);
  const isEdit = !!lead;
  const { data: users = [] } = useQuery({ queryKey: qk.users, queryFn: () => get<User[]>('/users'), enabled: open });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      title: lead?.title ?? '',
      contactName: lead?.contactName ?? '',
      company: lead?.company ?? '',
      email: lead?.email ?? '',
      phone: lead?.phone ?? '',
      country: lead?.country ?? '',
      value: lead?.value ?? 0,
      stage: lead?.stage ?? defaultStage,
      source: lead?.source ?? '',
      owner: lead?.owner?._id ?? '',
      notes: lead?.notes ?? '',
    });
  }, [open, lead, defaultStage, reset]);

  const save = useMutation({
    mutationFn: ({ owner, ...values }: Values) => {
      const body = { ...values, ...(owner ? { owner } : {}) };
      return isEdit ? api.patch(`/leads/${lead._id}`, body) : api.post('/leads', body);
    },
    onSuccess: (_res, values) => {
      toast.success(
        values.stage === 'won' && lead?.stage !== 'won'
          ? 'Lead won and converted into a client'
          : isEdit
            ? 'Lead updated'
            : 'Lead created',
      );
      void qc.invalidateQueries({ queryKey: qk.leads });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      if (values.stage === 'won') void qc.invalidateQueries({ queryKey: ['clients'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/leads/${lead?._id}`),
    onSuccess: () => {
      toast.success('Lead deleted');
      void qc.invalidateQueries({ queryKey: qk.leads });
      setConfirm(false);
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit lead' : 'New lead'}</DialogTitle>
            <DialogDescription>
              {isEdit && lead.client ? 'This lead has been converted into a client.' : 'Moving a lead to Won creates a client automatically.'}
            </DialogDescription>
          </DialogHeader>
          <form id="lead-form" onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Deal title" error={errors.title?.message} className="sm:col-span-2">
              <Input aria-invalid={!!errors.title} placeholder="e.g. E-commerce rebuild" {...register('title')} />
            </Field>
            <Field label="Contact name" error={errors.contactName?.message}>
              <Input aria-invalid={!!errors.contactName} {...register('contactName')} />
            </Field>
            <Field label="Company">
              <Input {...register('company')} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" aria-invalid={!!errors.email} {...register('email')} />
            </Field>
            <Field label="Phone">
              <Input {...register('phone')} />
            </Field>
            <Field label="Deal value (USD)" error={errors.value?.message}>
              <Input type="number" min={0} step={100} {...register('value')} />
            </Field>
            <Field label="Stage">
              <NativeSelect {...register('stage')}>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Owner">
              <NativeSelect {...register('owner')}>
                <option value="">Me</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Source">
              <Input placeholder="Referral, LinkedIn..." {...register('source')} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea rows={3} {...register('notes')} />
            </Field>
          </form>
          <DialogFooter className="sm:justify-between">
            <div>
              {isEdit && isStaff && (
                <Button variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}>
                  <Trash2 /> Delete
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" form="lead-form" loading={save.isPending}>
                {isEdit ? 'Save changes' : 'Create lead'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete lead?"
        description="This lead will be permanently removed from the pipeline."
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </>
  );
}
