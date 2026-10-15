# Quarter-end funder report

A working slice built for Philantrix's Platform Expansion project on Riipen. It takes one quarter of sample engagement records from a made-up youth mentorship org, checks the data for gaps, and turns the same records into reports for two different funders. Every number on a report opens to its formula and the rows behind it.

Built by Abdallah Safi. Not made or endorsed by Philantrix. All data is sample data.

## What it does

The walkthrough at `/` explains the idea in a page. The demo at `/demo` is a three-step "quarter close":

1. **Records.** 584 sample engagement records for Jul 1 to Sep 30, 2026, filterable by group and activity type.
2. **Check.** The data gaps check. It finds 7 things a person would otherwise hunt for: 3 scheduled sessions with no attendance logged, 2 participants with no activity in 30+ days and no exit date, 1 goal with no due date and 1 duplicate record. The first five take a one-click answer, and the screen shows the number each answer moves. Nothing blocks the report; unanswered findings print as data notes.
3. **Report.** A US Letter page for one of two example funder templates, for the quarter or one month. Flip the template and the same engine output is selected differently. Click any number for the staff view: the definition, the arithmetic (with the unrounded value), and the rows it was counted from, absences included. Figures an answer changed get a brief highlight. Download PDF prints the page; Download Excel writes five sheets.

Privacy rules that hold in every funder output (page, PDF, Excel): no participant names, counts of 1 to 4 people show as "<5", and when only one cell of a breakdown is hidden, the next smallest is hidden too so it can't be worked out from the total. The staff view shows true counts and names, and says so.

## Run it

Node 20.9 or later.

```
npm install
npm run dev          # http://localhost:5102
npm test             # engine, golden figures, privacy, SQL view on PGlite
npm run typecheck
npm run build        # checks the AI summary first, then writes the static site to out/
npm run preview      # serves out/ on http://localhost:5102
```

Database tests (needs Docker and the Supabase CLI):

```
npx supabase db start
npx supabase test db
```

## Deploy

`next.config.ts` sets `output: 'export'`, so the build is a static site with no server, no environment variables and no network calls at runtime. On Vercel, import the repo with the Next.js preset and the defaults work. Any static host can serve `out/`.

## How it's built

| Path | What it holds |
|---|---|
| `lib/metrics.ts` | The metrics registry. Each number is an activity type, a way to count it, a denominator, a period and a plain-words definition. The report and the trace panel read their wording from here. |
| `lib/engine.ts` | Counting: seats offered from the roster, duplicates dropped, goals and forecasts. Keeps the rows it counted for the trace panel. |
| `lib/findings.ts` | The data gaps check and how each answer changes the records the engine counts. |
| `lib/privacy.ts` | Suppression rules. |
| `lib/templates.ts` | The two funder templates, as data. |
| `lib/report.ts` | The funder-safe report model the page, PDF and Excel render from. No names in it. |
| `lib/trace.ts` | The staff view behind each number. |
| `lib/excel.ts` | The Excel export (SheetJS, loaded only on click). |
| `lib/format.ts` | The one formatter: half-up rounding, thousands separators, dates. |
| `supabase/migrations/` | A schema proposal, the `program_rollup` view that does the same roll-up in SQL, and org-scoped row-level security. Every guessed table and column says so in a comment. |
| `supabase/tests/database/` | pgTAP tests for row-level security. |
| `tests/` | Vitest: the awkward cases, the golden match against `data/figures.json`, privacy, Excel, and the SQL view run on PGlite and compared with the engine. |
| `scripts/check-narrative.mjs` | Fails the build if the AI summary has a digit, a number word, a comparison word or an unknown slot. |

## Data: what's real and what's sample

- **Sample.** The organization (Kestrel Lane Youth Mentorship), its 40 participants, 3 groups, 584 engagement records and 4 Tracked Goals. `data/generate.mjs` made them with a fixed seed, and every generated row carries `mock: true`. The name was checked against the CRA charity list and a web search (`data/name-check.json`).
- **Sample.** The two funder templates. They're examples to correct, not real funders' forms.
- **AI-drafted.** The summary paragraph on each report. Claude drafted the words once, offline, with slots like `{participants_served}` where numbers go. The report engine fills every slot, and `scripts/check-narrative.mjs` rejects a draft with any number in it. Prompt: `data/prompts/narrative.md`.
- **Real.** The vocabulary and data shapes (Workstreams, Groups, Participants, Engagements, Tracked Goals, Attendances, Assignment Submissions, Duration / Units), read from the product screenshots on philantrix.com. No images were copied.
- **Real.** First names come from Ontario's open baby-name lists.

Every source, its URL and the date it was read are in `data/SOURCES.md`.

`data/compute-reference.mjs` is a second, separate implementation of the metric definitions. It writes `data/figures.json`, and `tests/golden.test.ts` checks the app against it for both templates, all four periods, and both answer states. Never edit `figures.json` by hand.

## Walkthrough screenshots

The images in `public/walkthrough/` are screenshots of this build: the Check screen after one answer, the Foundation template, the attendance rate trace, and page 1 of the printed PDF.
