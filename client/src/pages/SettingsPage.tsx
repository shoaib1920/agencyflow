import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { PageHeader, StatusBadge } from '@/components/shared/common';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { useUI, type Theme } from '@/stores/ui';
import type { ApiResponse, User } from '@/lib/types';
import { passwordRule } from './RegisterPage';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

const profileSchema = z.object({ name: z.string().trim().min(2, 'Enter your name'), title: z.string().optional(), avatarColor: z.string() });
const passwordSchema = z
  .object({ currentPassword: z.string().min(1, 'Required'), newPassword: passwordRule, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export default function SettingsPage() {
  const user = useAuth((s) => s.user)!;
  const { theme, setTheme } = useUI();

  const emailPref = useMutation({
    mutationFn: (on: boolean) => api.patch<ApiResponse<User>>('/auth/me', { emailNotifications: on }),
    onSuccess: ({ data }) => {
      useAuth.getState().setUser(data.data);
      toast.success(data.data.emailNotifications ? 'Email notifications on' : 'Email notifications off');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const profile = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, title: user.title ?? '', avatarColor: user.avatarColor ?? COLORS[0] },
  });
  const pw = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });
  const color = profile.watch('avatarColor');

  const saveProfile = useMutation({
    mutationFn: (v: z.infer<typeof profileSchema>) => api.patch<ApiResponse<User>>('/auth/me', v),
    onSuccess: ({ data }) => {
      useAuth.getState().setUser(data.data);
      toast.success('Profile saved');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const changePw = useMutation({
    mutationFn: ({ confirm: _c, ...v }: z.infer<typeof passwordSchema>) => api.patch('/auth/me/password', v),
    onSuccess: () => {
      toast.success('Password changed. Other devices were signed out.');
      pw.reset({ currentPassword: '', newPassword: '', confirm: '' });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Your profile, security and preferences." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How you appear to the rest of the team.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={profile.handleSubmit((v) => saveProfile.mutate(v))} className="space-y-4" noValidate>
              <div className="flex items-center gap-4">
                <UserAvatar name={profile.watch('name')} color={color} className="h-14 w-14 text-base" />
                <div>
                  <p className="font-medium">{user.email}</p>
                  <StatusBadge value={user.role} className="mt-1" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" error={profile.formState.errors.name?.message}>
                  <Input {...profile.register('name')} />
                </Field>
                <Field label="Job title">
                  <Input {...profile.register('title')} />
                </Field>
              </div>
              <Field label="Avatar colour">
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => profile.setValue('avatarColor', c, { shouldDirty: true })}
                      className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition', color === c && 'ring-2 ring-foreground')}
                      style={{ backgroundColor: c }}
                      aria-label={`Use colour ${c}`}
                    />
                  ))}
                </div>
              </Field>
              <Button type="submit" loading={saveProfile.isPending}>
                Save profile
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {themes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors',
                    theme === value ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-secondary',
                  )}
                  aria-pressed={theme === value}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>In-app notifications are always on. Choose whether important ones are also emailed to you.</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <span>
                <span className="block text-sm font-medium">Email me</span>
                <span className="text-xs text-muted-foreground">Mentions, due-date reminders and client messages.</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[hsl(var(--primary))]"
                checked={user.emailNotifications !== false}
                disabled={emailPref.isPending}
                onChange={(e) => emailPref.mutate(e.target.checked)}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Changing it signs you out on every other device.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={pw.handleSubmit((v) => changePw.mutate(v))} className="grid gap-4 sm:grid-cols-3" noValidate>
              <Field label="Current" error={pw.formState.errors.currentPassword?.message}>
                <Input type="password" autoComplete="current-password" {...pw.register('currentPassword')} />
              </Field>
              <Field label="New" error={pw.formState.errors.newPassword?.message}>
                <Input type="password" autoComplete="new-password" {...pw.register('newPassword')} />
              </Field>
              <Field label="Confirm" error={pw.formState.errors.confirm?.message}>
                <Input type="password" autoComplete="new-password" {...pw.register('confirm')} />
              </Field>
              <div className="sm:col-span-3">
                <Button type="submit" variant="outline" loading={changePw.isPending}>
                  Change password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
