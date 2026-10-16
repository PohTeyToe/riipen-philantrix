// Privacy rules for funder output (report page, PDF, Excel). Rates and hours
// are not suppressed. The staff view shows true counts and says why the
// funder copy differs.
//
// The cutoff is a setting: counts from 1 up to one below it could identify
// someone, so funder copy shows "<cutoff". 5 is the default. 0 shows as 0,
// since it identifies nobody.

import { commas } from './format';

export const DEFAULT_SMALL_BELOW = 5;
export const MIN_SMALL_BELOW = 2;
export const MAX_SMALL_BELOW = 10;

export const isSmall = (n: number, below = DEFAULT_SMALL_BELOW): boolean => n >= 1 && n < below;

export const peopleForFunder = (n: number, below = DEFAULT_SMALL_BELOW): string => (isSmall(n, below) ? `<${below}` : commas(n));

/** "1 to 4 people" for a cutoff of 5. */
export const smallRange = (below = DEFAULT_SMALL_BELOW): string => (below <= 2 ? '1 person' : `1 to ${below - 1} people`);

export const combinedFootnote = (below = DEFAULT_SMALL_BELOW): string =>
  `Age ranges are combined where one would show ${smallRange(below)} in this quarter or any month of it.`;

export const COMBINED_FOOTNOTE = combinedFootnote();

/**
 * The bands a breakdown shows in funder copy, decided once from its counts in
 * every period a reader can switch between (counts[period][band]), so each
 * period shows the same bands. While any band is small in any of those
 * periods, it's combined with the next band (the last one with the band
 * before it). Nothing is hidden, so there's no hidden cell to work out from a
 * total or by comparing periods: each band shows its count, and a small group
 * only ever shows as part of a bigger one. If one band is all that's left and
 * it's still small, it shows "<cutoff" like any count.
 */
export function combineBands(keys: string[], counts: number[][], below = DEFAULT_SMALL_BELOW): string[][] {
  let groups = keys.map((_, i) => [i]);
  const small = (g: number[]) => counts.some((row) => isSmall(g.reduce((s, i) => s + row[i], 0), below));
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
