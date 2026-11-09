import { History } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/card';
import { timeAgo } from '@/lib/utils';
import type { Activity } from '@/lib/types';

const STAGE_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  proposal: 'Proposal Sent',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

function describe(a: Activity) {
  if (a.entityType === 'lead' && a.action === 'moved' && a.meta?.to) {
    return (
      <>
        moved <b className="font-medium text-foreground">{a.entityName}</b> to{' '}
        <b className="font-medium text-foreground">{STAGE_LABEL[a.meta.to] ?? a.meta.to}</b>
      </>
    );
  }
  if (a.entityType === 'user' && a.meta?.to) {
    return (
      <>
        {a.action} <b className="font-medium text-foreground">{a.entityName}</b> to {String(a.meta.to)}
      </>
    );
  }
  const noun = a.action.includes('task') || a.action.includes('client') || a.action === 'uploaded' ? '' : ` ${a.entityType}`;
  return (
    <>
      {a.action}
      {noun} <b className="font-medium text-foreground">{a.entityName}</b>
    </>
  );
}

export function ActivityTimeline({ items, loading }: { items?: Activity[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-9 flex-1" />
          </div>
        ))}
      </div>
    );
  }
  if (!items?.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
        <History className="h-5 w-5" /> No activity yet
      </div>
    );
  }
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
      {items.map((a) => (
        <li key={a._id} className="relative flex gap-3">
          <UserAvatar name={a.actor?.name} color={a.actor?.avatarColor} className="h-7 w-7 text-[10px]" />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{a.actor?.name ?? 'Someone'}</span> {describe(a)}
            </p>
            <p className="text-xs text-muted-foreground/80">{timeAgo(a.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
