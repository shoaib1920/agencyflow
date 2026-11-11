import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserAvatar } from '@/components/ui/avatar';
import { api, errorMessage, get, getPage } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import type { Client, Project, User } from '@/lib/types';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  client: z.string().min(1, 'Choose a client'),
  budget: z.coerce.number().min(0),
  deadline: z.string().optional(),
  status: z.enum(['planning', 'active', 'on-hold', 'completed']),
  description: z.string().optional(),
  members: z.array(z.string()),
  estimatedHours: z.coerce.number().min(0).optional(),
});
type Values = z.infer<typeof schema>;

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project?: Project | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!project;
  const { data: clients } = useQuery({
    queryKey: qk.clients({ picker: true }),
    queryFn: () => getPage<Client>('/clients', { limit: 100, sort: 'name', order: 'asc' }),
    enabled: open,
  });
  const { data: users = [] } = useQuery({ queryKey: qk.users, queryFn: () => get<User[]>('/users'), enabled: open });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      title: project?.title ?? '',
      client: project?.client._id ?? '',
      budget: project?.budget ?? 0,
      deadline: project?.deadline ? project.deadline.slice(0, 10) : '',
      status: project?.status ?? 'planning',
      description: project?.description ?? '',
      members: project?.members.map((m) => m._id) ?? [],
      estimatedHours: project?.estimatedHours ?? undefined,
    });
  }, [open, project, reset]);

  const save = useMutation({
    mutationFn: ({ deadline, ...v }: Values) => {
      const body = { ...v, deadline: deadline || null };
      return isEdit ? api.patch(`/projects/${project._id}`, body) : api.post('/projects', body);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Project updated' : 'Project created');
      void qc.invalidateQueries({ queryKey: ['projects'] });
      if (project) {
        void qc.invalidateQueries({ queryKey: qk.project(project._id) });
        void qc.invalidateQueries({ queryKey: qk.projectActivity(project._id) });
      }
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription>Projects belong to a client and are visible to their members.</DialogDescription>
        </DialogHeader>
        <form id="project-form" onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Title" error={errors.title?.message} className="sm:col-span-2">
            <Input aria-invalid={!!errors.title} {...register('title')} />
          </Field>
          <Field label="Client" error={errors.client?.message}>
            <NativeSelect key={clients?.items.length ?? 0} aria-invalid={!!errors.client} {...register('client')}>
              <option value="">Select a client…</option>
              {clients?.items.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.company ? `${c.company} (${c.name})` : c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status">
            <NativeSelect {...register('status')}>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="on-hold">On hold</option>
              <option value="completed">Completed</option>
            </NativeSelect>
          </Field>
          <Field label="Budget (USD)">
            <Input type="number" min={0} step={500} {...register('budget')} />
          </Field>
          <Field label="Deadline">
            <Input type="date" {...register('deadline')} />
          </Field>
          <Field label="Estimated hours (for time tracking)">
            <Input type="number" min={0} step={5} placeholder="e.g. 120" {...register('estimatedHours')} />
          </Field>
          <Field label="Team members" className="sm:col-span-2">
            <Controller
              control={control}
              name="members"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {users.map((u) => {
                    const on = field.value?.includes(u._id);
                    return (
                      <button
                        type="button"
                        key={u._id}
                        onClick={() =>
                          field.onChange(on ? field.value.filter((id) => id !== u._id) : [...(field.value ?? []), u._id])
                        }
                        className={cn(
                          'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors',
                          on ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-secondary',
                        )}
                        aria-pressed={on}
                      >
                        <UserAvatar name={u.name} color={u.avatarColor} className="h-6 w-6 text-[10px] ring-0" />
                        {u.name}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea rows={3} {...register('description')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={save.isPending}>
            {isEdit ? 'Save changes' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
