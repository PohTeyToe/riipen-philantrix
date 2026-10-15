// Fails if an AI-drafted summary could put a number on the report that the
// engine didn't compute. Run by CI and before every build.
// Usage: node scripts/check-narrative.mjs            (checks data/narratives.json)
//        node scripts/check-narrative.mjs <template-id> <text-file>   (checks one draft)
// Spec: BRIEF.md, "AI narrative".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'hundreds', 'thousand', 'thousands', 'million', 'dozen', 'dozens',
  'half', 'twice', 'thrice', 'double', 'triple', 'single',
  'first', 'second', 'third', 'fourth', 'fifth', 'percent', 'per cent',
];

// Comparisons and trends. The brief's list, plus close forms.
const COMPARISON_WORDS = [
  'increase', 'increased', 'increases', 'increasing', 'rose', 'rise', 'rises', 'rising', 'risen',
  'grew', 'grow', 'grows', 'growing', 'growth', 'fell', 'fall', 'falls', 'falling', 'fallen',
  'drop', 'dropped', 'drops', 'dropping', 'decline', 'declined', 'declines', 'declining',
  'decrease', 'decreased', 'decreases', 'decreasing', 'improve', 'improved', 'improves', 'improving', 'improvement',
  'worsen', 'worsened', 'than', 'higher', 'highest', 'lower', 'lowest', 'record', 'best', 'worst',
  'compared', 'comparison', 'versus', 'vs', 'exceed', 'exceeded', 'exceeds', 'surpass', 'surpassed',
  'trend', 'trends', 'trending', 'up from', 'down from', 'ahead', 'behind', 'above', 'below',
  'short of', 'on track', 'off track', 'gain', 'gained', 'jump', 'jumped', 'climb', 'climbed', 'boost', 'boosted',
];

// The same words render for every period and both answer states, so a
// judgment, hedge or fixed time word can be true for one and false for another.
const STALE_WORDS = [
  'strong', 'solid', 'impressive', 'excellent', 'remarkable', 'significant', 'significantly', 'healthy',
  'robust', 'successful', 'successfully', 'substantial', 'notable', 'notably', 'encouraging', 'promising',
  'concerning', 'disappointing', 'only', 'just', 'nearly', 'almost', 'approximately', 'roughly',
  'most', 'majority', 'minority',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'quarter', 'quarterly', 'summer', 'autumn',
];

const wordRe = (w) => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i');

export function loadContext() {
  return {
    figures: readJson('data/figures.json'),
    participants: readJson('data/participants.json'),
  };
}

// Returns a list of problems. Empty means the draft passes.
export function checkNarrative(templateId, text, ctx = loadContext()) {
  const errs = [];
  const template = ctx.figures.templates.find((t) => t.id === templateId);
  if (!template) return [`unknown template ${templateId}`];
  const known = Object.keys(template.slots);

  const slots = [...text.matchAll(/\{([a-z0-9_]+)\}/g)].map((m) => m[1]);
  for (const s of slots) if (!known.includes(s)) errs.push(`unknown slot {${s}}`);
  if (slots.length === 0) errs.push('no slots used');

  const prose = text.replace(/\{[a-z0-9_]+\}/g, ' ');
  if (/[{}]/.test(prose)) errs.push('stray brace outside a slot');
  const digits = prose.match(/\d+/g);
  if (digits) errs.push(`digits outside slots: ${digits.join(', ')}`);
  for (const w of NUMBER_WORDS) if (wordRe(w).test(prose)) errs.push(`number word: "${w}"`);
  for (const w of COMPARISON_WORDS) if (wordRe(w).test(prose)) errs.push(`comparison word: "${w}"`);
  for (const w of STALE_WORDS) if (wordRe(w).test(prose)) errs.push(`word that can go stale: "${w}"`);
  if (/[\u2013\u2014]/.test(text)) errs.push('dash used as punctuation');

  const firstNames = [...new Set(ctx.participants.map((p) => p.display_name.split(' ')[0]))];
  for (const n of firstNames) if (new RegExp(`\\b${n}\\b`).test(text)) errs.push(`participant name: ${n}`);

  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 3 || sentences.length > 4) errs.push(`${sentences.length} sentences, want 3 to 4`);

  const bySlot = ctx.figures.narrative_slots[templateId];
  for (const [period, states] of Object.entries(bySlot)) {
    for (const [state, values] of Object.entries(states)) {
      const out = render(text, values);
      if (/[{}]/.test(out)) errs.push(`leftover brace when rendered for ${period}, ${state}`);
    }
  }
  return errs;
}

export function render(text, values) {
  return text.replace(/\{([a-z0-9_]+)\}/g, (m, s) => (s in values ? values[s] : m));
}

function main() {
  const ctx = loadContext();
  const args = process.argv.slice(2);
  let items;
  if (args.length === 2) {
    items = [{ template_id: args[0], text: readFileSync(resolve(args[1]), 'utf8').trim() }];
  } else {
    const n = readJson('data/narratives.json');
    items = n.narratives;
    const missing = ctx.figures.templates.map((t) => t.id).filter((id) => !items.some((x) => x.template_id === id));
    if (missing.length) {
      console.error(`No narrative for: ${missing.join(', ')}`);
      process.exit(1);
    }
  }
  let failed = false;
  for (const it of items) {
    const errs = checkNarrative(it.template_id, it.text, ctx);
    if (errs.length) {
      failed = true;
      console.error(`${it.template_id}: FAIL\n  - ${errs.join('\n  - ')}`);
    } else {
      console.log(`${it.template_id}: ok`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main();
