# Quarter-end funder reports

A working slice built for Philantrix's Platform Expansion project on Riipen. One quarter of sample records from a made-up youth mentorship org goes into three real funders' published reporting forms. An agent read each form and mapped every field to the records; code counts every number live in the browser; a privacy guard runs last. Every number opens to the rows behind it.

Built by Abdallah Safi. Not made or endorsed by Philantrix or by any funder shown. The organization and its records are sample data.

## What's on the page

The app opens at `/` (`/demo/` serves the same app for older links). Across the top, the pipeline: the funder's form goes through the agent, the records go through the gap check and the counts, and both meet at the fill and privacy guard step before the report. Each step opens its inspector on the left (`#form`, `#agent`, `#records`, `#check`, `#count`, `#guard`); the report sits on the right.

- **Funder tabs.** Three real forms, mapped by the agent: the Municipality of Grey Highlands community grant final report (Ontario, 8 pages), the OJJDP Juvenile Mentoring performance measures grid (US Department of Justice, 15 pages), and the Geist Foundation final report cover sheet (Hawaii Community Foundation). Grey Highlands opens first: its first questions are a one-click choice and a paragraph the agent drafted with every number filled from the records, and answering a missed session moves numbers on it. Two hand-built example templates sit after them.
- **Agent run.** The recorded run for the chosen form: one lane per worker, every model call, tool call, code check and review on one clock. Click any mark for its inputs, tool calls with their real output, and the verdict. Replay plays it back in about 10 seconds (the form read faster than the workers, both speeds shown), and the report fills in as each worker finished; click the time axis to replay from there, or step through it mark by mark.
- **Side by side.** Two funders' reports from the same records at once. An answer or an edit moves both.
- **Report.** The funder's own questions in their order, each answered one of five ways: a number counted from the records, a percent worked out from two fields, a paragraph drafted by the agent with every number filled by code, a question for staff (answer it in place, in one click where the form prints its options; numbers you type feed the percents that need them, and belong to the period you typed them for), or "not in records" with what the program would have to start tracking. "Why" on any field shows the agent's reason and the review call's verdict.
- **Gap check.** 7 gaps the records hide: 3 scheduled sessions with no attendance logged, 2 participants idle 30+ days with no exit date, a goal with no due date, a duplicate. Five take a one-click answer, and the panel lists every number the answer moved on the report on screen.
- **Records.** The quarter as an attendance register: one row per participant, one column per day. Click a seat to tick or untick it, or clear a whole session; click a gap to answer it there. On a touch screen, a tap picks the session and lists its people with large toggles. Every number rebuilds. Undo and Reset are always there.
- **Count.** The 13 metrics for the period, each with its definition, opening to its rows.
- **Privacy guard.** Move the cutoff from 2 to 10 and watch counts hide; the OJJDP grid and the examples show it best, since the Grey Highlands quarter has no count small enough to hide. It lists what it changed on the report, numbers inside the agent's drafted paragraphs included. Its time is the fill and the guard together, since the guard runs over the whole filled page.
- **Sources.** Click any number: its definition, the arithmetic, the rows (staff view, with names), and the register lit up where those rows sit.

Every step shows its time, measured in your browser on each rebuild. The agent's times are the recorded ones.

## The agent

`agent/run.mjs`, run locally with the Claude CLI (`claude-opus-5-5`, effort medium). The site never calls a model and holds no keys; it replays the saved runs in `data/agent-runs/`, recorded on Oct 16, 2026.

1. **Read the form.** One model call lists every question and field from the form's text (`agent/forms/`, extracted from the public PDF). Code checks that each quote is on the form, word for word, ignoring the punctuation PDF extraction loses. A failed check sends the list back once with the problems.
2. **Map, in parallel.** The questions are split into batches of about 12 fields, and 5 workers map them. Each worker calls tools on an MCP server (`agent/tools-server.mjs`) backed by the same engine as the page: `list_metrics`, `describe_records`, `get_metric`, `count_by_age`. No tool returns a name.
3. **Check in code.** `scripts/form-rules.mjs`: the metric exists and fits the unit the form wants, an age range is one the records hold, a formula uses two fields of the same question that have numbers, and a draft passes the word rules (`scripts/narrative-rules.mjs`: no digits, number words, trend words or names outside the slots). Failures go back to the worker once; what still fails goes to staff.
4. **Review.** A separate review call (the same model, with its own prompt and no memory of the mapping) checks every mapping against the form's wording and the metric's definition. Rejected fields are remapped once and reviewed again; a second rejection goes to staff.
5. **Assemble.** The mapping is saved with the whole log: every call's timing, tokens and tool calls, every check and verdict.

`npm run agent:run` reruns all three forms (`node agent/run.mjs <form-id>` for one). Prompts are in `agent/prompts/`. `tests/forms.test.ts` re-runs every check on the saved runs, confirms each one read the form text in the repo, and checks no name or small count reaches any filled form.

## Run it

Node 20.9 or later.

```
npm install
npm run dev          # http://localhost:5102
npm test             # engine, golden figures, privacy, agent runs, SQL view and row-level security on PGlite
npm run typecheck
npm run build        # checks the AI summaries first, then writes the static site to out/
npm run preview      # serves out/ on http://localhost:5102
```

`npm test` runs the pgTAP suite in `supabase/tests/database/` on PGlite. To run it on a real Supabase stack: `npx supabase db start`, then `npx supabase test db`.

## Deploy

`next.config.ts` sets `output: 'export'`: a static site with no server, no environment variables and no network calls at runtime. On Vercel, import the repo with the Next.js preset.

## How it's built

| Path | What it holds |
|---|---|
| `lib/metrics.ts` | The metrics registry: records read, how they're counted, the denominator, the definition. |
| `lib/engine.ts` | Counting: seats from the roster, duplicates dropped, goals and forecasts. Keeps the rows it counted. |
| `lib/findings.ts` | The gap check and how each answer changes what the engine counts. |
| `lib/forms.ts` | Fills an agent-mapped form from the engine, then the privacy guard over the whole page. Types for the recorded runs. |
| `lib/choices.ts` | The options each choice question prints on its form, checked word for word against the form text. |
| `lib/privacy.ts` | The cutoff rule and how age ranges are combined. |
| `lib/report.ts`, `lib/templates.ts` | The two hand-built example templates. |
| `lib/trace.ts`, `lib/sources.ts`, `lib/register.ts`, `lib/edits.ts` | The staff view behind a number, where its rows sit on the register, the register, and edits to it. |
| `components/workspace/` | The page. `model.ts` rebuilds everything and times each stage. |
| `agent/` | The agent: forms, prompts, the tool server, the run script. |
| `scripts/` | The checks the agent and the build share. |
| `supabase/` | A schema proposal, the `program_rollup` view that does the same roll-up in SQL, and org-scoped row-level security. Guessed tables and columns say so. |
| `tests/` | Vitest, including a separate reference implementation (`data/compute-reference.mjs`) the engine must match for every period and answer state. |

## Data: real and sample

- **Real.** The three funders' forms, as published (URLs and retrieval dates in `agent/forms/forms.json`). The vocabulary and data shapes, read from Philantrix's product screenshots. First names from Ontario's open baby-name lists.
- **Sample.** The organization, its 40 participants, 3 groups, 584 engagement records, 90 check-ins and 4 Tracked Goals (`data/generate.mjs`, fixed seed). The two example templates.
- **Recorded AI.** The agent runs (`data/agent-runs/`) and the example templates' summaries (`data/narratives.json`). In both, the model wrote no numbers: code fills every one.

Sources and the choices behind each definition are in `data/SOURCES.md`.

## Privacy

No participant names reach funder copy, the PDF or Excel, and the agent's tools never return one. People counts of 1 to 4 (or below whatever cutoff is set) show as "<5", including counts staff type (the guard reads the form's label to tell people from months or programs). A share of people isn't shown when the people it counts, or the people it leaves out, are 1 to 4: 12 of 13 still enrolled would say 1 left. On a filled form the guard runs over the whole page at once. Two people counts it knows are nested (a metric declared inside another, a share's top and bottom, two counts on the same question) can't sit 1 to 4 apart, so the smaller is held back: 40 enrolled beside 38 matched would say 2 weren't. A count that repeats a hidden one is held back, a percent staff type is checked against the counts on its question, and anything worked out from a hidden number is hidden too. Counts on different questions that the guard doesn't know are related aren't compared. An age range small in any month is reported together with the next range in every period, so nothing can be worked out by comparing periods; `tests/privacy.test.ts` checks that by brute force. The staff view shows true counts and names, and says so.
