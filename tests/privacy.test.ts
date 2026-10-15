// The age breakdown's privacy rule, tested the way a reader would attack it:
// someone who knows the rule, sees every period they can switch between, and
// tries to pin a group of 1 to 4 people to an exact number.
//
// The model: each age band's people came in month 1 only, month 2 only, or
// both, and the quarter is everyone. Every such dataset in a small range is
// rendered the way funder copy would show it across all three periods. Datasets
// that render the same are the ones the reader can't tell apart. If all of
// them agree that some band had, say, 3 people in some period, that's a leak.

import { describe, expect, it } from 'vitest';
import { applyAnswers, detectFindings } from '../lib/findings';
import { PERIODS, sample } from '../lib/data';
import { bandLabel, combineBands, isSmall, peopleForFunder } from '../lib/privacy';
import { computePeriod } from '../lib/report';

/** What a reader sees across every period, as one string. `views[period][band]` are true counts. */
type Render = (keys: string[], views: number[][]) => string;

const combined: Render = (keys, views) => {
  const groups = combineBands(keys, views);
  const sum = (row: number[], g: string[]) => g.reduce((s, k) => s + row[keys.indexOf(k)], 0);
  return `${groups.map(bandLabel).join(',')}|${views.map((row) => [...groups.map((g) => peopleForFunder(sum(row, g))), peopleForFunder(row.reduce((a, b) => a + b, 0))].join(',')).join('|')}`;
};

// A rule that leaks by design: each period on its own, small cells as "<5", total shown.
const perPeriod: Render = (_keys, views) => views.map((row) => [...row.map(peopleForFunder), row.reduce((a, b) => a + b, 0)].join(',')).join('|');

/**
 * Every (period, band) a reader can pin to exactly 1 to 4 people, with one
 * dataset that shows it. Datasets go up to `max` people per band and pattern,
 * but only those up to `inner` are reported: near the cap, the cap itself
 * rules out look-alikes a real reader couldn't rule out. A wider search only
 * adds look-alikes, so a real leak inside `inner` is still found.
 */
function leaks(render: Render, bands: number, max: number, inner = max): string[] {
  const keys = Array.from({ length: bands }, (_, i) => `${10 * i}-${10 * i + 9}`);
  const per = (max + 1) ** 3;
  const classes = new Map<string, { values: number[]; same: boolean[]; example: number[][]; inside: boolean }>();
  for (let code = 0; code < per ** bands; code++) {
    const views = [new Array(bands).fill(0), new Array(bands).fill(0), new Array(bands).fill(0)];
    let c = code;
    let maxPattern = 0;
    for (let b = 0; b < bands; b++) {
      let t = c % per;
      c = Math.floor(c / per);
      const only1 = t % (max + 1); t = Math.floor(t / (max + 1));
      const only2 = t % (max + 1);
      const both = Math.floor(t / (max + 1));
      maxPattern = Math.max(maxPattern, only1, only2, both);
      views[0][b] = only1 + both;
      views[1][b] = only2 + both;
      views[2][b] = only1 + only2 + both;
    }
    const flat = views.flat();
    const key = render(keys, views);
    const seen = classes.get(key);
    if (!seen) classes.set(key, { values: flat, same: flat.map(() => true), example: [], inside: false });
    const cls = classes.get(key)!;
    if (seen) flat.forEach((v, i) => { if (cls.values[i] !== v) cls.same[i] = false; });
    if (!cls.inside && maxPattern <= inner) Object.assign(cls, { inside: true, example: views });
  }
  const out: string[] = [];
  for (const { values, same, example, inside } of classes.values()) {
    if (!inside) continue;
    values.forEach((v, i) => {
      if (same[i] && isSmall(v)) out.push(`${['month 1', 'month 2', 'quarter'][Math.floor(i / bands)]}, band ${i % bands} is ${v}: ${JSON.stringify(example)}`);
    });
  }
  return out;
}

describe('combining age bands', () => {
  const keys = ['10-12', '13-15', '16-18', '19-24'];
  it('combines a small band with the next one, and the last with the one before', () => {
    expect(combineBands(keys, [[4, 5, 5, 5]])).toEqual([['10-12', '13-15'], ['16-18'], ['19-24']]);
    expect(combineBands(keys, [[11, 14, 12, 3]])).toEqual([['10-12'], ['13-15'], ['16-18', '19-24']]);
  });
  it('keeps combining while the combined band is still small', () => {
    expect(combineBands(['a', 'b', 'c'], [[1, 1, 6]])).toEqual([['a', 'b', 'c']]);
    expect(combineBands(['a', 'b'], [[4, 4]])).toEqual([['a', 'b']]);
  });
  it('uses the same bands in every period, so a band small in one month is combined in all of them', () => {
    expect(combineBands(keys, [[11, 14, 12, 6], [8, 12, 11, 2]])).toEqual([['10-12'], ['13-15'], ['16-18', '19-24']]);
  });
  it('leaves a 0 as it is, since a 0 identifies nobody', () => {
    expect(combineBands(keys, [[11, 0, 12, 9]])).toEqual([['10-12'], ['13-15'], ['16-18'], ['19-24']]);
  });
  it('labels a combined band by its ends', () => {
    expect(bandLabel(['16-18', '19-24'])).toBe('16-24');
    expect(bandLabel(['13-15'])).toBe('13-15');
  });
});

describe('a reader who knows the rule and compares periods', () => {
  // The rule in git before this one hid extra cells instead. This search pins
  // 3,309 small groups under it across periods, and 3 within a single period.
  it('can pin a small group under a rule that checks each period on its own, so this search can find a leak', () => {
    expect(leaks(perPeriod, 2, 3, 2).length).toBeGreaterThan(0);
  });
  it('can never pin a band of 1 to 4 people: 3 bands, 0 to 2 people per band in each attendance pattern', () => {
    expect(leaks(combined, 3, 3, 2)).toEqual([]);
  });
  it('can never pin a band of 1 to 4 people: 4 bands, 0 or 1 person per band in each attendance pattern', () => {
    expect(leaks(combined, 4, 2, 1)).toEqual([]);
  }, 30_000);
});

describe('on the sample', () => {
  const findings = detectFindings(sample);
  const st = applyAnswers(sample, findings, {});
  it('19-24 has 3 people in July, September and the quarter, so 16-18 and 19-24 show as 16-24 in every period', () => {
    for (const p of PERIODS) {
      const b = computePeriod(sample, st, findings, p).ageBreakdown;
      expect(b.cells.map((c) => c.key), p.id).toEqual(['10-12', '13-15', '16-24']);
      expect(b.cells.every((c) => !isSmall(c.value)), p.id).toBe(true);
    }
  });
});
