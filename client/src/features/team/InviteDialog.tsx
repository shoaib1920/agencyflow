import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, MailCheck, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import type { ApiResponse, Role } from '@/lib/types';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  name: z.string().optional(),
  title: z.string().optional(),
  role: z.enum(['admin', 'manager', 'member', 'client']),
});
type Values = z.infer<typeof schema>;

interface InviteResult {
  inviteUrl: string;
  emailed: boolean;
  invite: { email: string };
}

/** Team invite (admin) or, with `client` set, a client-portal invite for that company. */
export function InviteDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client?: { _id: string; name: string; email?: string };
}) {
  const qc = useQueryClient();
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);
  const isPortal = !!client;
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      setResult(null);
      setCopied(false);
      reset({ email: client?.email ?? '', name: client?.name ?? '', title: '', role: isPortal ? 'client' : 'member' });
    }
  }, [open, client, isPortal, reset]);

  const invite = useMutation({
    mutationFn: async (v: Values) =>
      (await api.post<ApiResponse<InviteResult>>('/invites', { ...v, role: v.role as Role, client: client?._id })).data,
    onSuccess: (res) => {
      setResult(res.data);
      void qc.invalidateQueries({ queryKey: ['invites'] });
      toast.success(res.message ?? 'Invite created');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.inviteUrl);
    setCopied(true);
    toast.success('Invite link copied');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isPortal ? `Invite ${client.name} to the client portal` : 'Invite a team member'}</DialogTitle>
          <DialogDescription>
            {isPortal
              ? 'They will see their projects, files and invoices, and can message your team. Budgets and internal notes stay hidden.'
              : 'They get a one-time link (valid 7 days) to set their own password.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-success/10 p-3 text-sm">
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p>
                {result.emailed
                  ? `We emailed the invite to ${result.invite.email}. You can also share the link directly:`
                  : `Email isn't configured on the server, so share this link with ${result.invite.email} yourself:`}
              </p>
            </div>
            <div className="flex gap-2">
              <Input readOnly value={result.inviteUrl} onFocus={(e) => e.target.select()} aria-label="Invite link" />
              <Button variant="outline" onClick={() => void copy()}>{copied ? <Check /> : <Copy />} Copy</Button>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <form id="invite-form" onSubmit={handleSubmit((v) => invite.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
              <Field label="Email" error={errors.email?.message} className="sm:col-span-2">
                <Input type="email" aria-invalid={!!errors.email} {...register('email')} />
              </Field>
              <Field label="Name (optional)">
                <Input {...register('name')} />
              </Field>
              {isPortal ? (
                <Field label="Job title (optional)">
                  <Input placeholder="Marketing lead" {...register('title')} />
                </Field>
              ) : (
                <Field label="Role">
                  <NativeSelect {...register('role')}>
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </NativeSelect>
                </Field>
              )}
            </form>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" form="invite-form" loading={invite.isPending}><Link2 /> Create invite</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
