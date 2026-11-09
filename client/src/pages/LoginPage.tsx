import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import type { ApiResponse, User } from '@/lib/types';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type Values = z.infer<typeof schema>;

const DEMO = [
  { label: 'Admin', email: 'admin@agencyflow.dev', password: 'Admin@123' },
  { label: 'Manager', email: 'manager@agencyflow.dev', password: 'Manager@123' },
  { label: 'Member', email: 'sam@agencyflow.dev', password: 'Member@123' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    try {
      const { data } = await api.post<ApiResponse<{ user: User; accessToken: string }>>('/auth/login', values);
      useAuth.getState().setSession(data.data.user, data.data.accessToken);
      toast.success(`Welcome back, ${data.data.user.name.split(' ')[0]}`);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not sign in'));
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Sign in to your agency workspace.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <div className="mt-6 rounded-lg border border-dashed p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Demo accounts (after running the seed)</p>
        <div className="flex flex-wrap gap-2">
          {DEMO.map((d) => (
            <Button
              key={d.label}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setValue('email', d.email);
                setValue('password', d.password);
              }}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
