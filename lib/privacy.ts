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
 * Hides small cells in a breakdown whose total is shown. If exactly one cell is
 * hidden, the next smallest visible cell is hidden too, or the small one could
 * be worked out by subtraction. A tie goes to the first cell in display order.
 */
export function suppressBreakdown(cells: { key: string; value: number }[]): { cells: BreakdownCell[]; footnote: string | null } {
  const out: BreakdownCell[] = cells.map((c) => ({
    key: c.key,
    value: c.value,
    display: isSmall(c.value) ? '<5' : commas(c.value),
    hidden: isSmall(c.value) ? 'small' : null,
  }));
  let footnote: string | null = null;
  if (out.filter((c) => c.hidden).length === 1) {
    let next: BreakdownCell | null = null;
    for (const c of out) if (!c.hidden && (next === null || c.value < next.value)) next = c;
    if (next) {
      next.hidden = 'secondary';
      next.display = 'hidden';
      footnote = SECONDARY_FOOTNOTE;
    }
  }
  return { cells: out, footnote };
}
