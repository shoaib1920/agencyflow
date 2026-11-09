import type { Lead, LeadStage } from '@/lib/types';

export const STAGES: { id: LeadStage; label: string; dot: string }[] = [
  { id: 'new', label: 'New', dot: 'bg-slate-400' },
  { id: 'contacted', label: 'Contacted', dot: 'bg-sky-500' },
  { id: 'proposal', label: 'Proposal Sent', dot: 'bg-violet-500' },
  { id: 'negotiation', label: 'Negotiation', dot: 'bg-amber-500' },
  { id: 'won', label: 'Won', dot: 'bg-emerald-500' },
  { id: 'lost', label: 'Lost', dot: 'bg-rose-500' },
];

export type Board = Record<LeadStage, Lead[]>;

export function groupByStage(leads: Lead[]): Board {
  const board = Object.fromEntries(STAGES.map((s) => [s.id, [] as Lead[]])) as Board;
  for (const lead of leads) board[lead.stage]?.push(lead);
  for (const s of STAGES) board[s.id].sort((a, b) => a.position - b.position);
  return board;
}

/**
 * Fractional positioning: a dropped card gets the midpoint between its new
 * neighbours, so only the moved lead is written, never the whole column.
 */
export function positionAt(column: Lead[], index: number): number {
  const before = column[index - 1]?.position;
  const after = column[index + 1]?.position;
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1000;
  if (after !== undefined) return after - 1000;
  return 1000;
}
