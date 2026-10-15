// Suppression rules for counts of people in funder output (report page, PDF,
// Excel). Rates and hours are not suppressed. The staff view shows true counts.

import { commas } from './format';

export const SECONDARY_FOOTNOTE = "Hidden so a small group can't be worked out from the total.";

/** 1 to 4 people can identify someone, so they show as "<5". 0 shows as 0. */
export const isSmall = (n: number): boolean => n >= 1 && n <= 4;

export const peopleForFunder = (n: number): string => (isSmall(n) ? '<5' : commas(n));

export interface BreakdownCell {
  key: string;
  value: number;
  /** What the funder copy shows. */
  display: string;
  hidden: null | 'small' | 'secondary';
}

/**
 * True if a reader who sees the total, the visible cells and the rule could
 * pin down any hidden cell exactly. They know a "<5" cell is 1 to 4 and a
 * "hidden" cell is 5 or more (a 0 is never the one hidden).
 */
function canWorkOut(cells: BreakdownCell[]): boolean {
  const hidden = cells.filter((c) => c.hidden);
  const sum = hidden.reduce((s, c) => s + c.value, 0);
  const lo = (c: BreakdownCell) => (c.hidden === 'small' ? 1 : 5);
  const hi = (c: BreakdownCell) => (c.hidden === 'small' ? 4 : sum);
  return hidden.some((c) => {
    const others = hidden.filter((o) => o !== c);
    const min = Math.max(lo(c), sum - others.reduce((s, o) => s + hi(o), 0));
    const max = Math.min(hi(c), sum - others.reduce((s, o) => s + lo(o), 0));
    return min === max;
  });
}

/**
 * Hides small cells in a breakdown whose total is shown. While any hidden cell
 * could still be worked out by subtraction, the next smallest visible cell
 * that isn't 0 is hidden too; a tie goes to the first cell in display order.
 * If no such cell is left, every cell shows "hidden", so the reader learns
 * nothing but the total.
 */
export function suppressBreakdown(cells: { key: string; value: number }[]): { cells: BreakdownCell[]; footnote: string | null } {
  const out: BreakdownCell[] = cells.map((c) => ({
    key: c.key,
    value: c.value,
    display: isSmall(c.value) ? '<5' : commas(c.value),
    hidden: isSmall(c.value) ? 'small' : null,
  }));
  const total = cells.reduce((s, c) => s + c.value, 0);
  // A total under 5 is itself shown as "<5", so there is nothing to subtract from.
  if (!out.some((c) => c.hidden) || isSmall(total)) return { cells: out, footnote: null };
  while (canWorkOut(out)) {
    let next: BreakdownCell | null = null;
    for (const c of out) if (!c.hidden && c.value > 0 && (next === null || c.value < next.value)) next = c;
    for (const c of next ? [next] : out) {
      if (c.hidden !== 'small') c.hidden = 'secondary';
      c.display = 'hidden';
    }
    if (!next) break;
  }
  return { cells: out, footnote: out.some((c) => c.hidden === 'secondary') ? SECONDARY_FOOTNOTE : null };
}
