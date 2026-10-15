// Privacy rules for funder output (report page, PDF, Excel). Rates and hours
// are not suppressed. The staff view shows true counts and says why the
// funder copy differs.

import { commas } from './format';

/** 1 to 4 people could identify someone, so funder copy shows "<5". 0 shows as 0. */
export const isSmall = (n: number): boolean => n >= 1 && n <= 4;

export const peopleForFunder = (n: number): string => (isSmall(n) ? '<5' : commas(n));

export const COMBINED_FOOTNOTE = 'Age ranges are combined where one would show 1 to 4 people in this quarter or any month of it.';

/**
 * The bands a breakdown shows in funder copy, decided once from its counts in
 * every period a reader can switch between (counts[period][band]), so each
 * period shows the same bands. While any band has 1 to 4 people in any of
 * those periods, it's combined with the next band (the last one with the band
 * before it). Nothing is hidden, so there's no hidden cell to work out from a
 * total or by comparing periods: each band shows its count, and a small group
 * only ever shows as part of a bigger one. If one band is all that's left and
 * it's still small, it shows "<5" like any count.
 */
export function combineBands(keys: string[], counts: number[][]): string[][] {
  let groups = keys.map((_, i) => [i]);
  const small = (g: number[]) => counts.some((row) => isSmall(g.reduce((s, i) => s + row[i], 0)));
  while (groups.length > 1) {
    const at = groups.findIndex(small);
    if (at === -1) break;
    const lo = at === groups.length - 1 ? at - 1 : at;
    groups = [...groups.slice(0, lo), [...groups[lo], ...groups[lo + 1]], ...groups.slice(lo + 2)];
  }
  return groups.map((g) => g.map((i) => keys[i]));
}

/** "16-18" and "19-24" combine as "16-24". */
export const bandLabel = (keys: string[]): string => (keys.length === 1 ? keys[0] : `${keys[0].split('-')[0]}-${keys[keys.length - 1].split('-').pop()}`);
