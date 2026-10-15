// Builds data/names-common.json from Ontario's open baby-name lists.
// Usage: node data/derive-names.mjs <female.csv> <male.csv> [--exclude Name1,Name2]
// Source CSVs (Open Government Licence - Ontario):
//   https://data.ontario.ca/dataset/ontario-top-baby-names-female
//   https://data.ontario.ca/dataset/ontario-top-baby-names-male
// Only first names are used. Participants are aged 10 to 24 in 2026, so the
// counts are summed over birth years 2002 to 2016.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIRST_YEAR = 2002;
const LAST_YEAR = 2016;
const PER_LIST = 60;

// Placeholder names seen in public product screenshots on philantrix.com.
const EXCLUDED_PUBLIC = ['Alice', 'Bob', 'Charlie'];

// --exclude a,b,c adds the first names of real people connected to the
// company. That list stays out of this public repo; only its size is recorded.
const args = process.argv.slice(2);
const exIdx = args.indexOf('--exclude');
const EXCLUDED_PRIVATE = exIdx >= 0 ? args.splice(exIdx, 2)[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
const EXCLUDED = [...EXCLUDED_PUBLIC, ...EXCLUDED_PRIVATE];

const [femalePath, malePath] = args;
if (!femalePath || !malePath) {
  console.error('Usage: node data/derive-names.mjs <female.csv> <male.csv> [--exclude Name1,Name2]');
  process.exit(1);
}

function titleCase(name) {
  return name.toLowerCase().replace(/(^|[-' ])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}

function topNames(path) {
  const text = readFileSync(path, 'utf8'); // the header line (with its BOM) is skipped below
  const totals = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [year, rawName, freq] = line.split(',');
    const y = Number(year);
    if (y < FIRST_YEAR || y > LAST_YEAR) continue;
    const name = titleCase(rawName.trim());
    if (!/^[A-Za-z]+$/.test(name)) continue; // plain single-word names only
    if (EXCLUDED.includes(name)) continue;
    totals.set(name, (totals.get(name) ?? 0) + Number(freq));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, PER_LIST)
    .map(([name]) => name);
}

const out = {
  description: 'Common first names for generated sample participants. Ranked by total Ontario births 2002 to 2016.',
  sources: [
    'https://data.ontario.ca/dataset/ontario-top-baby-names-female',
    'https://data.ontario.ca/dataset/ontario-top-baby-names-male',
  ],
  licence: 'Open Government Licence - Ontario, https://www.ontario.ca/page/open-government-licence-ontario',
  retrieved: '2026-10-15',
  birth_years: [FIRST_YEAR, LAST_YEAR],
  excluded: EXCLUDED_PUBLIC,
  excluded_private_count: EXCLUDED_PRIVATE.length,
  excluded_private_note: 'Also excluded: first names of real people connected to the company, kept out of this repo.',
  female: topNames(femalePath),
  male: topNames(malePath),
};

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'names-common.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`names-common.json: ${out.female.length} female, ${out.male.length} male`);
