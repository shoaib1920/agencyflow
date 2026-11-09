import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { usePermissions } from '@/stores/auth';
import type { Project, Task } from '@/lib/types';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  assignee: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  status: z.enum(['todo', 'in-progress', 'done']),
  dueDate: z.string().optional(),
  description: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function TaskDialog({
  open,
  onOpenChange,
  project,
  task,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project: Project;
  task?: Task | null;
}) {
  const qc = useQueryClient();
  const { isStaff } = usePermissions();
  const isEdit = !!task;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      title: task?.title ?? '',
      assignee: task?.assignee?._id ?? '',
      priority: task?.priority ?? 'medium',
      status: task?.status ?? 'todo',
      dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : '',
      description: task?.description ?? '',
    });
  }, [open, task, reset]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.tasks(project._id) });
    void qc.invalidateQueries({ queryKey: qk.projectActivity(project._id) });
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
  };

  const save = useMutation({
    mutationFn: ({ assignee, dueDate, ...v }: Values) => {
      const body = { ...v, assignee: assignee || null, dueDate: dueDate || null };
      const base = `/projects/${project._id}/tasks`;
      return isEdit ? api.patch(`${base}/${task._id}`, body) : api.post(base, body);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Task updated' : 'Task created');
      invalidate();
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/projects/${project._id}/tasks/${task?._id}`),
    onSuccess: () => {
      toast.success('Task deleted');
      invalidate();
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>Assignees get a live notification.</DialogDescription>
        </DialogHeader>
        <form id="task-form" onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Title" error={errors.title?.message} className="sm:col-span-2">
            <Input aria-invalid={!!errors.title} {...register('title')} />
          </Field>
          <Field label="Assignee">
            <NativeSelect {...register('assignee')}>
              <option value="">Unassigned</option>
              {project.members.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Due date">
            <Input type="date" {...register('dueDate')} />
          </Field>
          <Field label="Priority">
            <NativeSelect {...register('priority')}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </NativeSelect>
          </Field>
          <Field label="Status">
            <NativeSelect {...register('status')}>
              <option value="todo">To do</option>
              <option value="in-progress">In progress</option>
              <option value="done">Done</option>
            </NativeSelect>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea rows={3} {...register('description')} />
          </Field>
        </form>
        <DialogFooter className="sm:justify-between">
          <div>
            {isEdit && isStaff && (
              <Button variant="ghost" className="text-destructive" loading={del.isPending} onClick={() => del.mutate()}>
                <Trash2 /> Delete
              </Button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="task-form" loading={save.isPending}>
              {isEdit ? 'Save' : 'Create task'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
