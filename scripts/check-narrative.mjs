// Rejects an AI-drafted summary that has a digit, a number word, a comparison
// or a judgment outside the slots the engine fills, or a slot the template
// doesn't have. Run by CI and before every build. The word rules live in
// scripts/narrative-rules.mjs, which the page's live guard also runs; this
// file adds the check that every slot renders for every period and answer
// state in data/figures.json.
// Usage: node scripts/check-narrative.mjs            (checks data/narratives.json)
//        node scripts/check-narrative.mjs <template-id> <text-file>   (checks one draft)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { checkText, render } from './narrative-rules.mjs';

export { render };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));

export function loadContext() {
  return {
    figures: readJson('data/figures.json'),
    participants: readJson('data/participants.json'),
  };
}

// Returns a list of problems. Empty means the draft passes.
export function checkNarrative(templateId, text, ctx = loadContext()) {
  const template = ctx.figures.templates.find((t) => t.id === templateId);
  if (!template) return [`unknown template ${templateId}`];
  const firstNames = [...new Set(ctx.participants.map((p) => p.display_name.split(' ')[0]))];
  const errs = checkText(text, { slots: Object.keys(template.slots), firstNames });

  const bySlot = ctx.figures.narrative_slots[templateId];
  for (const [period, states] of Object.entries(bySlot)) {
    for (const [state, values] of Object.entries(states)) {
      const out = render(text, values);
      if (/[{}]/.test(out)) errs.push(`leftover brace when rendered for ${period}, ${state}`);
    }
  }
  return errs;
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
