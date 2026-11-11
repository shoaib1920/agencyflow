import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { groupByStage, positionAt } from '@/features/leads/stages';
import { previewTotals } from '@/features/invoices/InvoiceEditor';
import { formatMinutes } from '@/lib/download';
import { errorMessage } from '@/lib/api';
import type { Lead } from '@/lib/types';

const lead = (id: string, stage: Lead['stage'], position: number) => ({ _id: id, stage, position }) as Lead;

describe('Kanban fractional positions', () => {
  it('drops between neighbours at the midpoint', () => {
    const col = [lead('a', 'new', 1000), lead('moved', 'new', 0), lead('b', 'new', 2000)];
    expect(positionAt(col, 1)).toBe(1500);
  });
  it('appends after the last card and prepends before the first', () => {
    expect(positionAt([lead('a', 'new', 1000), lead('m', 'new', 0)], 1)).toBe(2000);
    expect(positionAt([lead('m', 'new', 0), lead('a', 'new', 1000)], 0)).toBe(0);
    expect(positionAt([lead('m', 'new', 0)], 0)).toBe(1000);
  });
  it('groups leads into sorted stage columns', () => {
    const board = groupByStage([lead('b', 'won', 2000), lead('a', 'won', 1000), lead('c', 'new', 5)]);
    expect(board.won.map((l) => l._id)).toEqual(['a', 'b']);
    expect(board.new).toHaveLength(1);
    expect(board.lost).toEqual([]);
  });
});

describe('Invoice preview totals', () => {
  it('matches the server rounding rules', () => {
    expect(previewTotals([{ quantity: 2, unitPrice: 500 }, { quantity: 1, unitPrice: 1999.99 }], 10, 100)).toEqual({
      subtotal: 2999.99,
      discount: 100,
      tax: 290,
      total: 3189.99,
    });
  });
  it('never lets the discount exceed the subtotal', () => {
    expect(previewTotals([{ quantity: 1, unitPrice: 50 }], 0, 80).total).toBe(0);
  });
});

describe('formatting helpers', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(135)).toBe('2h 15m');
  });

  it('turns API error envelopes into readable messages', () => {
    const err = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { success: false, message: 'Validation failed', meta: { errors: { email: ['Invalid email'] } } },
    });
    expect(errorMessage(err)).toBe('email: Invalid email');
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });
});
