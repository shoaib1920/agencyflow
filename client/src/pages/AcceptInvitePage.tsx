import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api, errorMessage, get } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import type { ApiResponse, Role, User } from '@/lib/types';
import { AuthLayout } from './AuthLayout';
import { passwordRule } from './RegisterPage';

const schema = z
  .object({ name: z.string().trim().min(2, 'Enter your name'), password: passwordRule, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type Values = z.infer<typeof schema>;

interface Preview {
  email: string;
  name: string;
  role: Role;
  clientName: string | null;
  invitedBy: string | null;
}

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { data: invite, isLoading, error } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => get<Preview>('/auth/invite', { token }),
    enabled: token.length > 20,
    retry: false,
  });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    values: { name: invite?.name ?? '', password: '', confirm: '' },
  });

  const onSubmit = async ({ name, password }: Values) => {
    try {
      const { data } = await api.post<ApiResponse<{ user: User; accessToken: string }>>('/auth/accept-invite', { token, name, password });
      useAuth.getState().setSession(data.data.user, data.data.accessToken);
      toast.success(`Welcome, ${name.split(' ')[0]}!`);
      navigate(data.data.user.role === 'client' ? '/portal' : '/', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not accept the invite'));
    }
  };

  if (!token || error) {
    return (
      <AuthLayout title="Invite not valid" subtitle="This link is invalid, expired, or has already been used.">
        <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          Ask the person who invited you to send a new invite.
        </div>
        <Button asChild variant="outline" className="mt-6 w-full"><Link to="/login">Go to sign in</Link></Button>
      </AuthLayout>
    );
  }
  if (isLoading || !invite) {
    return (
      <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
    );
  }

  const isPortal = invite.role === 'client';
  return (
    <AuthLayout
      title={isPortal ? 'Set up your client portal' : 'Join your team'}
      subtitle={
        isPortal
          ? `${invite.invitedBy ?? 'Your agency'} invited you to follow ${invite.clientName ?? 'your'} projects and invoices.`
          : `${invite.invitedBy ?? 'An admin'} invited you to join AgencyFlow as ${invite.role}.`
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email">
          <Input value={invite.email} disabled />
        </Field>
        <Field label="Your name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Choose a password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Accept invite</Button>
      </form>
    </AuthLayout>
  );
}
