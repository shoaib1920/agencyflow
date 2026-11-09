import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { Field, Input, NativeSelect } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, PageHeader, StatusBadge } from '@/components/shared/common';
import { api, errorMessage, get } from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import type { Role, User } from '@/lib/types';
import { passwordRule } from './RegisterPage';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  email: z.string().email('Enter a valid email'),
  password: passwordRule,
  role: z.enum(['admin', 'manager', 'member']),
  title: z.string().optional(),
});
type Values = z.infer<typeof schema>;

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { role: 'member' } });

  const create = useMutation({
    mutationFn: (v: Values) => api.post('/users', v),
    onSuccess: () => {
      toast.success('Team member added. Share their temporary password with them.');
      void qc.invalidateQueries({ queryKey: ['users'] });
      reset({ name: '', email: '', password: '', role: 'member', title: '' });
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
          <DialogDescription>They can change the temporary password from Settings after signing in.</DialogDescription>
        </DialogHeader>
        <form id="invite-form" onSubmit={handleSubmit((v) => create.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Full name" error={errors.name?.message}>
            <Input aria-invalid={!!errors.name} {...register('name')} />
          </Field>
          <Field label="Job title">
            <Input placeholder="Designer" {...register('title')} />
          </Field>
          <Field label="Email" error={errors.email?.message} className="sm:col-span-2">
            <Input type="email" aria-invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label="Temporary password" error={errors.password?.message}>
            <Input type="text" autoComplete="off" aria-invalid={!!errors.password} {...register('password')} />
          </Field>
          <Field label="Role">
            <NativeSelect {...register('role')}>
              <option value="member">Member</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </NativeSelect>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" loading={create.isPending}>
            Add member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPage() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [inviting, setInviting] = useState(false);
  const { data: users, isLoading } = useQuery({ queryKey: ['users', 'all'], queryFn: () => get<User[]>('/users', { all: true }) });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: Role; isActive?: boolean }) => api.patch(`/users/${id}`, body),
    onSuccess: () => {
      toast.success('Team member updated');
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader
        title="Team"
        description="Manage who has access and what they can do."
        actions={
          <Button onClick={() => setInviting(true)}>
            <Plus /> Add member
          </Button>
        }
      />
      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !users?.length ? (
          <EmptyState icon={Users} title="No team members" />
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Member</TH>
                <TH className="hidden md:table-cell">Last sign-in</TH>
                <TH>Role</TH>
                <TH className="text-right">Access</TH>
              </TR>
            </THead>
            <TBody>
              {users.map((u) => {
                const self = u._id === me?._id;
                return (
                  <TR key={u._id} className={u.isActive ? '' : 'opacity-60'}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={u.name} color={u.avatarColor} />
                        <div className="min-w-0">
                          <p className="font-medium">
                            {u.name} {self && <span className="text-xs text-muted-foreground">(you)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{u.title ? `${u.title} · ` : ''}{u.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden text-muted-foreground md:table-cell">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</TD>
                    <TD>
                      {self ? (
                        <StatusBadge value={u.role} />
                      ) : (
                        <NativeSelect
                          value={u.role}
                          onChange={(e) => update.mutate({ id: u._id, role: e.target.value as Role })}
                          className="h-8 w-32"
                          aria-label={`Role for ${u.name}`}
                        >
                          <option value="member">Member</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </NativeSelect>
                      )}
                    </TD>
                    <TD className="text-right">
                      {!self && (
                        <Button size="sm" variant="outline" onClick={() => update.mutate({ id: u._id, isActive: !u.isActive })}>
                          {u.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold">What each role can do</h2>
        <div className="mt-3 grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
          <p><b className="text-foreground">Admin</b> · everything, including team management and deleting clients.</p>
          <p><b className="text-foreground">Manager</b> · create and edit clients and projects, delete leads and tasks.</p>
          <p><b className="text-foreground">Member</b> · work leads and tasks; sees only projects they're on.</p>
        </div>
      </Card>

      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </div>
  );
}
