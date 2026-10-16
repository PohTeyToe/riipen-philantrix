// The word rules for an AI-drafted summary, with no file access, so the build
// check (scripts/check-narrative.mjs) and the page's live guard run the same
// code. It checks words, not meaning: a person still reads each draft to
// confirm every slot is described with the right unit.
// The rules are also in the drafting prompt, data/prompts/narrative.md.

export const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'hundreds', 'thousand', 'thousands', 'million', 'millions', 'billion', 'billions', 'trillion',
  'dozen', 'dozens', 'couple', 'pair', 'handful',
  'half', 'twice', 'thrice', 'double', 'triple', 'single',
  'first', 'second', 'third', 'fourth', 'fifth', 'percent', 'per cent',
  // Quantities without a figure are still a claim the engine didn't make.
  'several', 'many', 'few', 'numerous', 'multiple', 'countless', 'all', 'none', 'nobody', 'no one', 'every', 'everyone', 'entire', 'whole',
];

// Comparisons and trends. The brief's list, plus close forms.
export const COMPARISON_WORDS = [
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
export const STALE_WORDS = [
  'strong', 'solid', 'impressive', 'excellent', 'remarkable', 'significant', 'significantly', 'healthy',
  'robust', 'successful', 'successfully', 'substantial', 'notable', 'notably', 'encouraging', 'promising',
  'concerning', 'disappointing', 'only', 'just', 'nearly', 'almost', 'approximately', 'roughly',
  'most', 'majority', 'minority',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'quarter', 'quarterly', 'summer', 'autumn',
];

const wordRe = (w) => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i');

/** The word rules every drafted text shares: no number, trend, judgment, name or dash outside the slots. */
function wordProblems(text, known, firstNames) {
  const errs = [];
  const slots = [...text.matchAll(/\{([a-z0-9_]+)\}/g)].map((m) => m[1]);
  for (const s of slots) if (!known.includes(s)) errs.push(`unknown slot {${s}}`);
  if (slots.length === 0) errs.push('no slots used');
  // Each figure once: a slot used twice says the same number twice.
  for (const s of new Set(slots)) if (slots.filter((x) => x === s).length > 1) errs.push(`slot {${s}} used more than once`);

  const prose = text.replace(/\{[a-z0-9_]+\}/g, ' ');
  if (/[{}]/.test(prose)) errs.push('stray brace outside a slot');
  const digits = prose.match(/\d+/g);
  if (digits) errs.push(`digits outside slots: ${digits.join(', ')}`);
  for (const w of NUMBER_WORDS) if (wordRe(w).test(prose)) errs.push(`number word: "${w}"`);
  for (const w of COMPARISON_WORDS) if (wordRe(w).test(prose)) errs.push(`comparison word: "${w}"`);
  for (const w of STALE_WORDS) if (wordRe(w).test(prose)) errs.push(`word that can go stale: "${w}"`);
  if (/[–—]/.test(text)) errs.push('dash used as punctuation');

  for (const n of firstNames) if (new RegExp(`\\b${n}\\b`).test(text)) errs.push(`participant name: ${n}`);
  return { errs, slots };
}

const sentenceCount = (text) => text.trim().split(/(?<=[.!?])\s+/).filter(Boolean).length;

/**
 * Problems with a summary draft, given the template's slot names and the
 * participants' first names. Empty means it passes.
 */
export function checkText(text, { slots: known, firstNames }) {
  const { errs, slots } = wordProblems(text, known, firstNames);
  // A goal the summary mentions has its status and due date said too, so it can't skip a goal that's behind.
  for (const k of known.filter((x) => x.endsWith('_status') || x.endsWith('_due'))) {
    const goal = k.slice(0, k.lastIndexOf('_'));
    if (slots.some((x) => x.startsWith(`${goal}_`)) && !slots.includes(k)) errs.push(`mentions ${goal} without its slot {${k}}`);
  }
  const n = sentenceCount(text);
  if (n < 3 || n > 4) errs.push(`${n} sentences, want 3 to 4`);
  return errs;
}

/** Problems with the agent's drafted answer to one question on a funder's form: the same word rules, 1 to 4 sentences. */
export function checkAnswer(text, { slots: known, firstNames }) {
  const { errs } = wordProblems(text, known, firstNames);
  const n = sentenceCount(text);
  if (n < 1 || n > 4) errs.push(`${n} sentences, want 1 to 4`);
  return errs;
}

export function render(text, values) {
  return text.replace(/\{([a-z0-9_]+)\}/g, (m, s) => (s in values ? values[s] : m));
}
