import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, ImageIcon, Paperclip, Trash2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, API_URL, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { cn, formatBytes, timeAgo } from '@/lib/utils';
import type { Attachment } from '@/lib/types';

export function FilesPanel({ projectId, files }: { projectId: string; files: Attachment[] }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.project(projectId) });
    void qc.invalidateQueries({ queryKey: qk.projectActivity(projectId) });
  };

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/projects/${projectId}/files`, form, {
        onUploadProgress: (e) => setProgress(e.total ? Math.round((e.loaded / e.total) * 100) : null),
      });
    },
    onSuccess: () => {
      toast.success('File uploaded');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err, 'Upload failed')),
    onSettled: () => setProgress(null),
  });

  const remove = useMutation({
    mutationFn: (fileId: string) => api.delete(`/projects/${projectId}/files/${fileId}`),
    onSuccess: () => {
      toast.success('File removed');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const pick = (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('Files must be 10 MB or smaller');
    upload.mutate(file);
  };

  const href = (url: string) => (url.startsWith('http') ? url : `${API_URL}${url}`);

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-primary bg-accent/50' : 'border-border',
        )}
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Drop a file here, or</p>
        <Button size="sm" variant="outline" loading={upload.isPending} onClick={() => inputRef.current?.click()}>
          {upload.isPending ? `Uploading${progress !== null ? ` ${progress}%` : ''}` : 'Choose file'}
        </Button>
        <p className="text-xs text-muted-foreground">Images, PDF, Office docs, ZIP · up to 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {files.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
          <Paperclip className="h-4 w-4" /> No files yet
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {files.map((f) => {
            const Icon = f.mimeType.startsWith('image/') ? ImageIcon : FileText;
            return (
              <li key={f._id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="rounded-md bg-muted p-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <a href={href(f.url)} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:text-primary hover:underline">
                    {f.name}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(f.size)} · {f.uploadedBy?.name ?? 'Someone'} · {timeAgo(f.createdAt)}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate(f._id)}
                  aria-label={`Remove ${f.name}`}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
