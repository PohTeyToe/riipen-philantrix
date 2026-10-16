// The checks the agent's work has to pass before anything reaches a report.
// Plain JavaScript with no file access, so the agent run (agent/run.mjs) and
// the tests run the same code on the same output.

import { checkAnswer } from './narrative-rules.mjs';

export const ANSWER_TYPES = ['metric', 'formula', 'draft', 'ask', 'missing'];
export const WANTS = ['count', 'percent', 'hours', 'money', 'text', 'choice', 'date'];
export const FORMULA_OPS = ['percent', 'difference', 'sum'];

/** Letters and digits only, lower case: PDF text breaks lines and drops hyphens ("16-18" can extract as "1618"). */
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * Where a quote sits in the form's text. 'exact' when its letters and digits
 * appear in one run. 'spread' when its words appear in order within a short
 * span, for table cells whose lines the PDF interleaves with the next column.
 * Null when it isn't there.
 */
export function findQuote(quote, source) {
  const q = squash(quote);
  if (!q) return null;
  if (squash(source).includes(q)) return 'exact';
  const qw = words(quote);
  const sw = words(source);
  const limit = Math.ceil(qw.length * 2.5) + 4;
  for (let i = 0; i < sw.length; i++) {
    if (sw[i] !== qw[0]) continue;
    let j = i;
    let k = 0;
    while (j < sw.length && k < qw.length && j - i <= limit) {
      if (sw[j] === qw[k]) k++;
      j++;
    }
    if (k === qw.length) return 'spread';
  }
  return null;
}

const MIN_QUOTE_WORDS = 3;

function quoteProblems(id, quote, source) {
  if (words(quote ?? '').length < MIN_QUOTE_WORDS) return [`${id}: quote "${quote}" is too short to find on the form; quote at least ${MIN_QUOTE_WORDS} words`];
  return findQuote(quote, source) ? [] : [`${id}: quote not found on the form: "${quote}"`];
}

/** Problems with the list of questions read off a form. Empty means it passes. */
export function checkExtraction(result, source) {
  const errs = [];
  const ids = new Set();
  if (!Array.isArray(result?.items) || result.items.length === 0) return ['no questions listed'];
  for (const item of result.items) {
    if (ids.has(item.id)) errs.push(`${item.id}: id used twice`);
    ids.add(item.id);
    errs.push(...quoteProblems(item.id, item.quote, source));
    if (!item.fields?.length) errs.push(`${item.id}: no fields`);
    for (const f of item.fields ?? []) {
      if (ids.has(f.id)) errs.push(`${f.id}: id used twice`);
      ids.add(f.id);
      if (!WANTS.includes(f.wants)) errs.push(`${f.id}: unknown kind of answer "${f.wants}"`);
      errs.push(...quoteProblems(f.id, f.quote, source));
    }
  }
  return errs;
}

const NUMERIC = ['metric', 'formula'];
/** A field staff answer with a number can feed a formula: the engine works it out once they do. */
const STAFF_NUMBER = ['count', 'hours', 'money'];
const hasNumber = (sib, ctx) => NUMERIC.includes(sib.answer) || (sib.answer === 'ask' && STAFF_NUMBER.includes(ctx.wantsOf(sib.field_id)));
const KINDS_FOR = {
  count: ['people', 'count'],
  percent: ['percent'],
  hours: ['hours'],
};

/**
 * Problems with one field's answer. ctx: the field as read off the form, its
 * sibling fields' answers (for formulas), the metric registry, the age ranges
 * the records hold, and first names that must never appear.
 */
export function checkField(answer, field, ctx) {
  const errs = [];
  const id = field.id;
  if (!ANSWER_TYPES.includes(answer.answer)) return [`${id}: unknown answer type "${answer.answer}"`];
  if (!answer.reason?.trim()) errs.push(`${id}: no reason given`);
  switch (answer.answer) {
    case 'metric': {
      const m = ctx.metrics.find((x) => x.id === answer.metric);
      if (!m) {
        errs.push(`${id}: no metric "${answer.metric}"`);
        break;
      }
      const ok = KINDS_FOR[field.wants];
      if (!ok) errs.push(`${id}: the form wants ${field.wants}, which a metric can't give`);
      else if (!ok.includes(m.kind)) errs.push(`${id}: the form wants ${field.wants}, and ${m.id} is a ${m.kind} figure`);
      if (answer.age_range != null) {
        if (!ctx.ageRanges.includes(answer.age_range)) errs.push(`${id}: the records hold no age range "${answer.age_range}" (they hold ${ctx.ageRanges.join(', ')})`);
        if (m.id !== 'participants_served') errs.push(`${id}: only participants_served splits by age range`);
      }
      break;
    }
    case 'formula': {
      const f = answer.formula;
      if (!f || !FORMULA_OPS.includes(f.op)) {
        errs.push(`${id}: formula needs an op of ${FORMULA_OPS.join(', ')}`);
        break;
      }
      if (!Array.isArray(f.of) || f.of.length !== 2) errs.push(`${id}: a formula takes exactly two fields`);
      for (const ref of f.of ?? []) {
        const sib = ctx.siblings.find((s) => s.field_id === ref);
        if (!sib) errs.push(`${id}: formula uses ${ref}, which isn't a field of this question`);
        else if (!hasNumber(sib, ctx)) errs.push(`${id}: formula uses ${ref}, which has no number (${sib.answer})`);
        if (ref === id) errs.push(`${id}: formula uses itself`);
      }
      if (f.op === 'percent' && field.wants !== 'percent') errs.push(`${id}: a percent formula on a field that wants ${field.wants}`);
      if (f.op !== 'percent' && field.wants === 'percent') errs.push(`${id}: the form wants a percent, so the op is percent`);
      break;
    }
    case 'draft': {
      if (!answer.text?.trim()) {
        errs.push(`${id}: draft has no text`);
        break;
      }
      if (field.wants !== 'text') errs.push(`${id}: a written answer on a field that wants ${field.wants}`);
      if (answer.ask != null && !answer.ask.trim()) errs.push(`${id}: empty question for staff`);
      for (const e of checkAnswer(answer.text, { slots: ['period', ...ctx.metrics.map((m) => m.id)], firstNames: ctx.firstNames })) errs.push(`${id}: ${e}`);
      break;
    }
    case 'ask':
      // The agent writes the question; a field it sent to staff after failing checks or review uses the form's own words.
      if (!answer.ask?.trim() && !answer.to_staff) errs.push(`${id}: ask has no question for staff`);
      break;
    case 'missing':
      if (!answer.missing?.trim()) errs.push(`${id}: missing doesn't say what the records lack`);
      break;
  }
  return errs;
}

/** Every field's problems for one question. */
export function checkItem(item, answers, ctx) {
  const errs = [];
  for (const field of item.fields) {
    const a = answers.find((x) => x.field_id === field.id);
    if (!a) {
      errs.push(`${field.id}: no answer`);
      continue;
    }
    const wantsOf = (fid) => item.fields.find((f) => f.id === fid)?.wants;
    errs.push(...checkField(a, field, { ...ctx, wantsOf, siblings: answers.filter((x) => item.fields.some((f) => f.id === x.field_id)) }));
  }
  for (const a of answers) if (!item.fields.some((f) => f.id === a.field_id)) errs.push(`${a.field_id}: not a field of ${item.id}`);
  return errs;
}

/**
 * Where a quote sits in the form's text, as [start, end) character offsets,
 * found the same way findQuote finds it. Null when it isn't there. For a
 * quote spread across interleaved table cells, the span runs from its first
 * word to its last.
 */
export function locateQuote(quote, source) {
  const q = squash(quote);
  if (!q) return null;
  // Map each kept character of the squashed source back to its offset.
  const at = [];
  let flat = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i].toLowerCase();
    if (/[a-z0-9]/.test(c)) {
      flat += c;
      at.push(i);
    }
  }
  const hit = flat.indexOf(q);
  if (hit !== -1) return [at[hit], at[hit + q.length - 1] + 1];
  const qw = words(quote);
  const re = /[a-z0-9]+/gi;
  const sw = [];
  for (let m; (m = re.exec(source)); ) sw.push({ w: m[0].toLowerCase(), s: m.index, e: m.index + m[0].length });
  const limit = Math.ceil(qw.length * 2.5) + 4;
  for (let i = 0; i < sw.length; i++) {
    if (sw[i].w !== qw[0]) continue;
    let j = i;
    let k = 0;
    while (j < sw.length && k < qw.length && j - i <= limit) {
      if (sw[j].w === qw[k]) k++;
      j++;
    }
    if (k === qw.length) return [sw[i].s, sw[j - 1].e];
  }
  return null;
}
