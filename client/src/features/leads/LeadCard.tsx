import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Building2, CheckCircle2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { cn, formatMoney } from '@/lib/utils';
import type { Lead } from '@/lib/types';

export function LeadCardView({ lead, overlay, onClick }: { lead: Lead; overlay?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group cursor-grab select-none rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:border-primary/40 hover:shadow-md active:cursor-grabbing',
        overlay && 'rotate-2 cursor-grabbing shadow-xl ring-2 ring-primary/40',
      )}
    >
      <p className="line-clamp-2 text-sm font-medium leading-snug">{lead.title}</p>
      <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
        <Building2 className="h-3 w-3 shrink-0" />
        {lead.company || lead.contactName}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-semibold tabular-nums">{formatMoney(lead.value)}</span>
        <div className="flex items-center gap-1.5">
          {lead.stage === 'won' && lead.client && (
            <CheckCircle2 className="h-4 w-4 text-success" aria-label="Converted to client" />
          )}
          {lead.owner && <UserAvatar name={lead.owner.name} color={lead.owner.avatarColor} className="h-6 w-6 text-[10px]" />}
        </div>
      </div>
    </div>
  );
}

export function SortableLeadCard({ lead, onOpen }: { lead: Lead; onOpen: (l: Lead) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead._id,
    data: { stage: lead.stage },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
    >
      <LeadCardView lead={lead} onClick={() => onOpen(lead)} />
    </div>
  );
}
