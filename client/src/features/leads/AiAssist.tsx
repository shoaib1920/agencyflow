import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, ListChecks, Mail, Sparkles, Text } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, errorMessage, get } from '@/lib/api';
import type { ApiResponse } from '@/lib/types';

type Action = 'summary' | 'email' | 'next_steps';
const ACTIONS: { id: Action; label: string; icon: typeof Text }[] = [
  { id: 'summary', label: 'Summarize', icon: Text },
  { id: 'email', label: 'Draft follow-up email', icon: Mail },
  { id: 'next_steps', label: 'Suggest next steps', icon: ListChecks },
];

/** Claude-powered helper inside the lead dialog. The API key stays on the server. */
export function AiAssist({ leadId }: { leadId: string }) {
  const [result, setResult] = useState<{ action: Action; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { data: status } = useQuery({ queryKey: ['ai-status'], queryFn: () => get<{ enabled: boolean }>('/ai/status'), staleTime: Infinity });

  const run = useMutation({
    mutationFn: async (action: Action) =>
      (await api.post<ApiResponse<{ action: Action; text: string }>>(`/leads/${leadId}/ai`, { action })).data.data,
    onSuccess: (data) => {
      setResult(data);
      setCopied(false);
    },
    onError: (err) => toast.error(errorMessage(err, 'AI request failed')),
  });

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
  };

  return (
    <div className="rounded-lg border border-primary/25 bg-accent/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" /> AI assist
        <span className="text-xs font-normal text-muted-foreground">by Claude</span>
      </div>
      {status && !status.enabled ? (
        <p className="text-xs text-muted-foreground">
          Not configured. Add an <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> to the server environment to enable summaries and email drafts.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map(({ id, label, icon: Icon }) => (
              <Button key={id} type="button" size="sm" variant="outline" loading={run.isPending && run.variables === id} disabled={run.isPending} onClick={() => run.mutate(id)}>
                {!(run.isPending && run.variables === id) && <Icon />} {label}
              </Button>
            ))}
          </div>
          {result && (
            <div className="relative mt-3 rounded-md border bg-card p-3">
              <button type="button" onClick={() => void copy()} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-secondary" aria-label="Copy">
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <p className="whitespace-pre-wrap pr-6 text-sm leading-relaxed">{result.text}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">AI-generated. Check it before sending.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
