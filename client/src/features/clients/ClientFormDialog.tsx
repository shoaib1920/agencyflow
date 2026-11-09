import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import type { Client } from '@/lib/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  company: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().optional(),
  country: z.string().trim().optional(),
  status: z.enum(['active', 'paused', 'closed']),
  notes: z.string().optional(),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: '', company: '', email: '', phone: '', country: '', status: 'active', notes: '' };

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client?: Client | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!client;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) {
      reset(
        client
          ? {
              name: client.name,
              company: client.company ?? '',
              email: client.email,
              phone: client.phone ?? '',
              country: client.country ?? '',
              status: client.status,
              notes: client.notes ?? '',
            }
          : EMPTY,
      );
    }
  }, [open, client, reset]);

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      isEdit ? api.patch(`/clients/${client._id}`, values) : api.post('/clients', values),
    onSuccess: () => {
      toast.success(isEdit ? 'Client updated' : 'Client created');
      void qc.invalidateQueries({ queryKey: ['clients'] });
      if (client) void qc.invalidateQueries({ queryKey: ['client', client._id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit client' : 'New client'}</DialogTitle>
          <DialogDescription>Contact details and account status.</DialogDescription>
        </DialogHeader>
        <form id="client-form" onSubmit={handleSubmit((v) => mutation.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Contact name" error={errors.name?.message}>
            <Input aria-invalid={!!errors.name} {...register('name')} />
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
          <Field label="Country">
            <Input {...register('country')} />
          </Field>
          <Field label="Status">
            <NativeSelect {...register('status')}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="closed">Closed</option>
            </NativeSelect>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={3} {...register('notes')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="client-form" loading={mutation.isPending}>
            {isEdit ? 'Save changes' : 'Create client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
