import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lock, MessageSquare, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/common';
import { api, errorMessage, get } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import type { Comment, UserRef } from '@/lib/types';

/** Renders "@Name" tokens for people who were actually mentioned as highlighted chips. */
function CommentBody({ comment }: { comment: Comment }) {
  const names = comment.mentions.map((m) => m.name).sort((a, b) => b.length - a.length);
  if (!names.length) return <p className="whitespace-pre-wrap text-sm">{comment.body}</p>;
  const rx = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
  return (
    <p className="whitespace-pre-wrap text-sm">
      {comment.body.split(rx).map((part, i) =>
        part.startsWith('@') && names.includes(part.slice(1)) ? (
          <span key={i} className="rounded bg-accent px-1 font-medium text-accent-foreground">{part}</span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

/**
 * Project or task discussion. Typing "@" opens a picker of mentionable people; picked
 * people are sent as ids (the server re-checks they're allowed) and get notified.
 */
export function CommentThread({
  projectId,
  taskId,
  people = [],
  allowInternal = false,
  compact = false,
}: {
  projectId: string;
  taskId?: string;
  people?: UserRef[];
  allowInternal?: boolean;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const key = ['comments', projectId, taskId ?? 'project'];
  const [body, setBody] = useState('');
  const [mentioned, setMentioned] = useState<UserRef[]>([]);
  const [internal, setInternal] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const { data: comments, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => get<Comment[]>(`/projects/${projectId}/comments`, taskId ? { task: taskId } : undefined),
  });

  const matches = useMemo(
    () => (query === null ? [] : people.filter((p) => p._id !== me?._id && p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)),
    [query, people, me],
  );

  const post = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/comments`, {
        body,
        task: taskId ?? null,
        // only keep mentions whose @Name is still in the text
        mentions: mentioned.filter((m) => body.includes(`@${m.name}`)).map((m) => m._id),
        internal,
      }),
    onSuccess: () => {
      setBody('');
      setMentioned([]);
      setInternal(false);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['comment-counts', projectId] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/comments/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const onChange = (value: string, caret: number) => {
    setBody(value);
    const before = value.slice(0, caret);
    const m = /(?:^|\s)@([\w ]{0,20})$/.exec(before);
    setQuery(m ? m[1]! : null);
    setHighlight(0);
  };

  const pick = (person: UserRef) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@([\w ]{0,20})$/, `@${person.name} `);
    const next = before + body.slice(caret);
    setBody(next);
    setMentioned((list) => (list.some((p) => p._id === person._id) ? list : [...list, person]));
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (matches.length && query !== null) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[highlight]!); return; }
      if (e.key === 'Escape') { setQuery(null); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && body.trim()) post.mutate();
  };

  return (
    <div className="space-y-4">
      <div className={cn('space-y-4', !compact && 'max-h-[420px] overflow-y-auto pr-1 scrollbar-thin')}>
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : !comments?.length ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" /> No messages yet. Start the conversation.
          </p>
        ) : (
          comments.map((c) => {
            const mine = c.author._id === me?._id;
            const canDelete = mine || me?.role === 'admin' || me?.role === 'manager';
            return (
              <div key={c._id} className="group flex gap-3">
                <UserAvatar name={c.author.name} color={c.author.avatarColor} className="h-7 w-7 text-[10px]" />
                <div className={cn('min-w-0 flex-1 rounded-lg px-3 py-2', c.internal ? 'border border-dashed border-warning/50 bg-warning/5' : 'bg-muted/60')}>
                  <div className="mb-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold">{c.author.name}</span>
                    {c.author.role === 'client' && <StatusBadge value="client" className="py-0" />}
                    {c.internal && (
                      <span className="flex items-center gap-1 text-warning"><Lock className="h-3 w-3" /> Internal</span>
                    )}
                    <span className="text-muted-foreground">{timeAgo(c.createdAt)}</span>
                    {canDelete && (
                      <button onClick={() => remove.mutate(c._id)} className="ml-auto opacity-0 transition group-hover:opacity-100" aria-label="Delete comment">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                  <CommentBody comment={c} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="relative">
        {query !== null && matches.length > 0 && (
          <ul className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-md border bg-popover p-1 shadow-lg" role="listbox">
            {matches.map((p, i) => (
              <li key={p._id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                  className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm', i === highlight && 'bg-secondary')}
                >
                  <UserAvatar name={p.name} color={p.avatarColor} className="h-5 w-5 text-[9px] ring-0" />
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <Textarea
          ref={ref}
          rows={compact ? 2 : 3}
          value={body}
          onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
          onKeyDown={onKeyDown}
          placeholder={people.length ? 'Write a message… type @ to mention someone (Ctrl+Enter to send)' : 'Write a message… (Ctrl+Enter to send)'}
          aria-label="New message"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          {allowInternal ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-[hsl(var(--primary))]" />
              <Lock className="h-3 w-3" /> Internal note (hidden from the client)
            </label>
          ) : (
            <span />
          )}
          <Button size="sm" disabled={!body.trim()} loading={post.isPending} onClick={() => post.mutate()}>
            <Send /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}
