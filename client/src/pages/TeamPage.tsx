import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Mail, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/card';
import { Field, Input, NativeSelect } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, PageHeader, StatusBadge } from '@/components/shared/common';
import { InviteDialog } from '@/features/team/InviteDialog';
import { api, errorMessage, get } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import type { Invite, Role, User } from '@/lib/types';
import { passwordRule } from './RegisterPage';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  email: z.string().email('Enter a valid email'),
  password: passwordRule,
  role: z.enum(['admin', 'manager', 'member']),
  title: z.string().optional(),
});
type Values = z.infer<typeof schema>;

/** Fallback when email isn't set up: create the account directly with a temporary password. */
function AddWithPasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { role: 'member' } });
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
          <DialogTitle>Add with a temporary password</DialogTitle>
          <DialogDescription>They can change it from Settings after signing in. Prefer email invites when possible.</DialogDescription>
        </DialogHeader>
        <form id="add-form" onSubmit={handleSubmit((v) => create.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Full name" error={errors.name?.message}><Input aria-invalid={!!errors.name} {...register('name')} /></Field>
          <Field label="Job title"><Input placeholder="Designer" {...register('title')} /></Field>
          <Field label="Email" error={errors.email?.message} className="sm:col-span-2"><Input type="email" aria-invalid={!!errors.email} {...register('email')} /></Field>
          <Field label="Temporary password" error={errors.password?.message}><Input type="text" autoComplete="off" aria-invalid={!!errors.password} {...register('password')} /></Field>
          <Field label="Role">
            <NativeSelect {...register('role')}>
              <option value="member">Member</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </NativeSelect>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="add-form" loading={create.isPending}>Add member</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPage() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [inviting, setInviting] = useState(false);
  const [adding, setAdding] = useState(false);
  const { data: users, isLoading } = useQuery({ queryKey: ['users', 'all'], queryFn: () => get<User[]>('/users', { all: true }) });
  const { data: invites = [] } = useQuery({ queryKey: ['invites'], queryFn: () => get<Invite[]>('/invites') });

  const team = users?.filter((u) => u.role !== 'client') ?? [];
  const portalUsers = users?.filter((u) => u.role === 'client') ?? [];

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: Role; isActive?: boolean }) => api.patch(`/users/${id}`, body),
    onSuccess: () => {
      toast.success('Updated');
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/invites/${id}`),
    onSuccess: () => {
      toast.success('Invite revoked');
      void qc.invalidateQueries({ queryKey: ['invites'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Manage who has access and what they can do."
        actions={
          <>
            <Button variant="outline" onClick={() => setAdding(true)}><KeyRound /> Add with password</Button>
            <Button onClick={() => setInviting(true)}><UserPlus /> Invite by email</Button>
          </>
        }
      />

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !team.length ? (
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
              {team.map((u) => {
                const self = u._id === me?._id;
                return (
                  <TR key={u._id} className={u.isActive ? '' : 'opacity-60'}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={u.name} color={u.avatarColor} />
                        <div className="min-w-0">
                          <p className="font-medium">{u.name} {self && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                          <p className="text-xs text-muted-foreground">{u.title ? `${u.title} · ` : ''}{u.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden text-muted-foreground md:table-cell">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</TD>
                    <TD>
                      {self ? (
                        <StatusBadge value={u.role} />
                      ) : (
                        <NativeSelect value={u.role} onChange={(e) => update.mutate({ id: u._id, role: e.target.value as Role })} className="h-8 w-32" aria-label={`Role for ${u.name}`}>
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

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
            <CardDescription>Links expire after 7 days. Revoke one to invalidate its link immediately.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border">
              {invites.map((i) => (
                <li key={i._id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{i.name ? `${i.name} · ` : ''}{i.email}</span>
                  <StatusBadge value={i.role} />
                  <span className="hidden text-xs text-muted-foreground sm:inline">expires {formatDate(i.expiresAt)}</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => revoke.mutate(i._id)} aria-label={`Revoke invite for ${i.email}`}><X /></Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Client portal users</CardTitle>
          <CardDescription>Invite clients from their page in Clients (Portal access). They only see their own projects and invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          {!portalUsers.length ? (
            <p className="text-sm text-muted-foreground">No portal users yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {portalUsers.map((u) => (
                <li key={u._id} className={`flex items-center gap-3 px-3 py-2.5 text-sm ${u.isActive ? '' : 'opacity-60'}`}>
                  <UserAvatar name={u.name} color={u.avatarColor} className="h-7 w-7 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email} · {u.client?.company || u.client?.name}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => update.mutate({ id: u._id, isActive: !u.isActive })}>
                    {u.isActive ? 'Revoke access' : 'Restore access'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">What each role can do</h2>
        <div className="mt-3 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <p><b className="text-foreground">Admin</b> · everything, including team management, deleting clients and emptying the trash.</p>
          <p><b className="text-foreground">Manager</b> · clients, projects and invoices; invites clients to the portal.</p>
          <p><b className="text-foreground">Member</b> · works leads, tasks and time; sees only projects they're on.</p>
          <p><b className="text-foreground">Client</b> · portal only: their projects, files, invoices and messages.</p>
        </div>
      </Card>

      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <AddWithPasswordDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
