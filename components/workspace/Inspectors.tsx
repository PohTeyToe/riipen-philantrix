'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { periodById, sample, type Period } from '@/lib/data';
import { seatKey, setSeats, toggleSeat } from '@/lib/edits';
import { needsAnswer, type AnswerId, type Finding, type FindingKind } from '@/lib/findings';
import { fmtDay, fmtShortDate } from '@/lib/format';
import type { FormRun, GuardAction } from '@/lib/forms';
import { METRICS, type MetricId } from '@/lib/metrics';
import { MAX_SMALL_BELOW, MIN_SMALL_BELOW } from '@/lib/privacy';
import type { TraceRef } from '@/lib/report';
import { sourcesFor } from '@/lib/sources';
import { explain } from '@/lib/trace';
import { locateQuote } from '@/scripts/form-rules.mjs';
import { CheckIcon, ShieldIcon, UndoIcon } from '../icons';
import type { Build } from './model';
import { Register, type Spot } from './Register';
import { T } from './Traceable';
import type { Workspace } from './useWorkspace';

const groupName = (id: string) => sample.groups.find((g) => g.id === id)?.name ?? id;
const personName = (id: string) => sample.participants.find((p) => p.id === id)?.display_name ?? id;
const fmtIso = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const fmtMs = (ms: number) => (Number.isNaN(ms) ? '… ms' : ms < 0.1 ? '<0.1 ms' : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`);

export function PanelHead({ title, meta, children }: { title: string; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
        {meta && <p className="num mt-0.5 text-[12.5px] text-muted">{meta}</p>}
      </div>
      {children}
    </div>
  );
}

/** What the last change moved, and how long the rebuild took. */
export function ReceiptLine({ ws }: { ws: Workspace }) {
  const r = ws.receipt;
  if (!r) return null;
  return (
    <div key={r.id} className="fade-in rounded-lg border border-line bg-canvas px-3 py-2 text-[12.5px]" role="status">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{r.label}</span>
        <span className="num text-muted">rebuilt in {fmtMs(r.ms)}</span>
      </p>
      {r.changes.length === 0 ? (
        <p className="mt-0.5 text-muted">No number on this report moved.</p>
      ) : (
        <ul className="num mt-1 space-y-0.5">
          {r.changes.slice(0, 5).map((c) => (
            <li key={c.key} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">{c.label}</span>
              <span className="shrink-0 whitespace-nowrap">
                <s className="text-muted decoration-faint">{c.before}</s>
                <span aria-hidden className="px-1 text-faint">→</span>
                <span className="sr-only"> now </span>
                <b className="rounded bg-mah-tint px-1 font-semibold text-mah">{c.after}</b>
              </span>
            </li>
          ))}
          {r.changes.length > 5 && <li className="text-muted">and {r.changes.length - 5} more</li>}
        </ul>
      )}
    </div>
  );
}

function UndoBar({ ws }: { ws: Workspace }) {
  if (!ws.canUndo && !ws.changed) return null;
  return (
    <div className="flex gap-1">
      <button type="button" className="btn btn-quiet !min-h-7 !px-2 text-[12.5px]" onClick={ws.undo} disabled={!ws.canUndo}>
        <UndoIcon className="size-3.5" /> Undo
      </button>
      <button type="button" className="btn btn-ghost !min-h-7 !px-2 text-[12.5px]" onClick={ws.reset} disabled={!ws.changed}>
        Reset
      </button>
    </div>
  );
}

// ---------- Records ----------

export function RecordsView({ ws, range }: { ws: Workspace; range: { start: string; end: string } }) {
  const b = ws.b;
  const [selected, setSelected] = useState<{ groupId: string; date: string } | null>(null);
  const edited = Object.keys(ws.snap.edits).length;
  return (
    <div className="space-y-3">
      <PanelHead title="Records" meta={`${b.ds.engagements.length.toLocaleString('en-US')} engagement records · ${sample.participants.length} participants · ${sample.groups.length} groups${edited ? ` · ${edited} edited` : ''}`}>
        <UndoBar ws={ws} />
      </PanelHead>
      <p className="text-[12.5px] text-muted">Click a square to mark attended or absent.</p>
      <Register
        model={b.register}
        range={range}
        sources={null}
        spot={null}
        selected={selected}
        onSelect={(groupId, date) => setSelected({ groupId, date })}
        onToggle={(key, label) => ws.commit({ ...ws.snap, edits: toggleSeat(sample, ws.snap.edits, key) }, label)}
      />
      {selected && <SessionTools ws={ws} sel={selected} />}
      <RegisterLegend />
      <ReceiptLine ws={ws} />
    </div>
  );
}

/** Tick or clear a whole session at once. Clearing one makes it a gap the check asks about. */
function SessionTools({ ws, sel }: { ws: Workspace; sel: { groupId: string; date: string } }) {
  const g = ws.b.register.groups.find((x) => x.id === sel.groupId);
  const s = g?.sessions.find((x) => x.date === sel.date);
  if (!g || !s || s.status !== 'logged') return null;
  const keys = g.rows.filter((r) => r.cells.some((c) => c.date === sel.date)).map((r) => seatKey(r.participantId, g.id, sel.date));
  const name = `${g.name} ${fmtDay(sel.date)}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-1.5 text-[12.5px]">
      <span className="num">
        <b className="font-semibold">{name}</b> · {s.attended} of {s.enrolled} attended
      </span>
      <span className="flex gap-1">
        <button type="button" className="btn btn-quiet !min-h-7 !px-2 text-[12px]" onClick={() => ws.commit({ ...ws.snap, edits: setSeats(sample, ws.snap.edits, keys, true) }, `${name}: everyone ticked`)}>
          Tick all
        </button>
        <button type="button" className="btn btn-quiet !min-h-7 !px-2 text-[12px]" onClick={() => ws.commit({ ...ws.snap, edits: setSeats(sample, ws.snap.edits, keys, false) }, `${name}: cleared`)}>
          Clear session
        </button>
      </span>
    </div>
  );
}

function RegisterLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-1.5 rounded-[1px] bg-mah" /> attended
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-1.5 rounded-[1px] bg-absent" /> absent
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-1.5 rounded-[1px] border border-orange bg-orange-tint" /> nothing logged
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="relative h-2 w-1.5 rounded-[1px] bg-mah">
          <span className="absolute left-[1.5px] top-[2.5px] size-[3px] rounded-full bg-surface" />
        </span>
        edited
      </li>
    </ul>
  );
}

// ---------- Gap check ----------

const KINDS: { kind: FindingKind; title: string }[] = [
  { kind: 'session_not_logged', title: 'No attendance logged' },
  { kind: 'inactive_participant', title: 'No activity in 30+ days' },
  { kind: 'goal_no_due_date', title: 'Goal with no due date' },
  { kind: 'duplicate_record', title: 'Logged twice' },
];

export function CheckView({ ws, ms }: { ws: Workspace; ms: number }) {
  const { findings } = ws.b;
  const answers = ws.snap.answers;
  const open = findings.filter((f) => needsAnswer(f) && !answers[f.id]).length;
  const answer = (f: Finding, a: AnswerId, label: string) => {
    const next = { ...answers };
    if (answers[f.id] === a) delete next[f.id];
    else next[f.id] = a;
    ws.commit({ ...ws.snap, answers: next }, answers[f.id] === a ? `${headline(f)}: answer cleared` : `${headline(f)}: ${label}`);
  };
  return (
    <div className="space-y-3">
      <PanelHead title="Gap check" meta={`${findings.length} found in ${fmtMs(ms)} · ${open ? `${open} need an answer` : 'all answered'}`}>
        <UndoBar ws={ws} />
      </PanelHead>
      <p className="text-[12.5px] text-muted">Until answered, only logged records count.</p>
      <ReceiptLine ws={ws} />
      {KINDS.map(({ kind, title }) => {
        const list = findings.filter((f) => f.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind} aria-label={title}>
            <h3 className="eyebrow">
              {title} <span className="num text-faint">{list.length}</span>
            </h3>
            <ul className="mt-1.5 divide-y divide-line rounded-lg border border-line bg-surface">
              {list.map((f) => {
                const chosen = answers[f.id];
                return (
                  <li key={f.id} className="px-3 py-2.5">
                    <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                      {needsAnswer(f) ? (
                        chosen ? (
                          <CheckIcon className="size-3.5 text-green-ink" />
                        ) : (
                          <span aria-hidden className="grid size-3.5 place-items-center">
                            <span className="size-2 rounded-full bg-orange" />
                          </span>
                        )
                      ) : (
                        <span aria-hidden className="size-3.5" />
                      )}
                      <span className="num">{headline(f)}</span>
                      <span className="sr-only">{needsAnswer(f) ? (chosen ? ', answered' : ', needs an answer') : ''}</span>
                    </p>
                    <p className="num mt-0.5 pl-[22px] text-[12.5px] text-muted">{detail(f)}</p>
                    {needsAnswer(f) && (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-[22px]" role="group" aria-label={f.kind === 'session_not_logged' ? 'Did this session run?' : 'Still enrolled?'}>
                        {f.answers.map((a) => (
                          <button key={a.id} type="button" className="answer" aria-pressed={chosen === a.id} onClick={() => answer(f, a.id, a.label)}>
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function headline(f: Finding): string {
  switch (f.kind) {
    case 'session_not_logged': return `${groupName(f.groupId)}, ${fmtDay(f.date)}`;
    case 'inactive_participant': return `${personName(f.participantId)}, ${groupName(f.groupId)}`;
    case 'goal_no_due_date': return sample.goals.find((g) => g.id === f.goalId)?.name ?? f.goalId;
    case 'duplicate_record': return `${personName(f.participantId)}, ${fmtDay(f.date)}`;
  }
}

function detail(f: Finding): string {
  switch (f.kind) {
    case 'session_not_logged': return `Scheduled ${sample.groups.find((g) => g.id === f.groupId)?.schedule_label}.`;
    case 'inactive_participant': return `Last activity ${fmtDay(f.lastActivity)}, ${f.daysInactive} days before ${fmtShortDate(sample.asOf)}. No exit date.`;
    case 'goal_no_due_date': return 'Shows progress without a forecast. No answer needed.';
    case 'duplicate_record': return `${groupName(f.groupId)}. Counted once. No answer needed.`;
  }
}

// ---------- Count ----------

export function CountView({ ws, ms, period }: { ws: Workspace; ms: number; period: Period }) {
  const metrics = ws.b.figures.metrics;
  return (
    <div className="space-y-3">
      <PanelHead title="Count" meta={`${Object.keys(METRICS).length} metrics for ${period.label}, counted in ${fmtMs(ms)}`} />
      <p className="text-[12.5px] text-muted">Click a figure for its rows.</p>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[11.5px] text-muted">
            <th scope="col" className="py-1.5 pr-3 font-semibold">Metric</th>
            <th scope="col" className="py-1.5 text-right font-semibold">Value</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(METRICS) as MetricId[]).map((id) => {
            const m = metrics[id];
            const hidden = m.display !== m.staffDisplay;
            return (
              <tr key={id} className="border-b border-line align-top last:border-b-0">
                <td className="py-2 pr-3">
                  <p className="font-semibold">{METRICS[id].label}</p>
                  <p className="text-[12px] leading-snug text-muted">{METRICS[id].definition}</p>
                </td>
                <td className="num whitespace-nowrap py-2 text-right">
                  <T r={{ kind: 'metric', metric: id }} className="text-[15px] font-semibold">
                    {m.value === null ? m.display : m.staffDisplay}
                  </T>
                  {hidden && <p className="text-[11.5px] text-mah">funder sees {m.display}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Privacy guard ----------

export function GuardView({ ws, actions, ms }: { ws: Workspace; actions: GuardAction[]; ms: number }) {
  const below = ws.snap.smallBelow;
  return (
    <div className="space-y-3">
      <PanelHead title="Privacy guard" meta={`Ran in ${fmtMs(ms)}`}>
        <UndoBar ws={ws} />
      </PanelHead>
      <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
        <label htmlFor="cutoff" className="flex items-baseline justify-between text-[13px] font-semibold">
          <span>Hide counts under</span>
          <span className="num text-[18px] text-mah">{below}</span>
        </label>
        <input
          id="cutoff"
          type="range"
          min={MIN_SMALL_BELOW}
          max={MAX_SMALL_BELOW}
          value={below}
          onChange={(e) => ws.commit({ ...ws.snap, smallBelow: Number(e.target.value) }, `Cutoff set to ${e.target.value}`)}
          className="mt-1 w-full accent-[var(--color-mah)]"
        />
        <p className="num flex justify-between text-[11px] text-faint">
          <span>{MIN_SMALL_BELOW}</span>
          <span>{MAX_SMALL_BELOW}</span>
        </p>
      </div>
      <ReceiptLine ws={ws} />
      <ul className="space-y-1.5 text-[13px]">
        <li className="flex gap-2">
          <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-green-ink" />
          <span>No names in funder copy. The agent&apos;s tools never return one.</span>
        </li>
        {actions.length === 0 && (
          <li className="flex gap-2 text-muted">
            <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-green-ink" />
            <span>Nothing on this report needed hiding.</span>
          </li>
        )}
        {[...new Set(actions.map((a) => a.why))].map((why) => (
          <li key={why} className="flex gap-2">
            <ShieldIcon className="mt-0.5 size-3.5 shrink-0 text-mah" />
            <span>
              <span className="text-muted">{why}</span>
              <span className="mt-0.5 block space-y-0.5">
                {actions
                  .filter((a) => a.why === why)
                  .map((a) => (
                    <span key={a.fieldId} className="num block">
                      {a.label}: <b className="font-semibold">{a.shows}</b>
                    </span>
                  ))}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Sources of one number ----------

export function SourcesView({ ws, traceRef, periodId, onBack }: { ws: Workspace; traceRef: TraceRef; periodId: Period['id']; onBack: () => void }) {
  const b = ws.b;
  const view = useMemo(() => explain(b.ds, b.findings, ws.snap.answers, periodId, traceRef, ws.snap.smallBelow), [b, ws.snap, periodId, traceRef]);
  const sources = useMemo(() => sourcesFor(b.ds, b.st, periodId, traceRef), [b, periodId, traceRef]);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [all, setAll] = useState(false);
  const period = periodById(periodId);
  const rows = all ? view.rows : view.rows.slice(0, 12);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{view.scope}</p>
          <h2 className="mt-0.5 text-[16px] font-semibold leading-tight">{view.title}</h2>
        </div>
        <button type="button" onClick={onBack} className="btn btn-ghost !min-h-7 shrink-0 !px-2 text-[12.5px] max-[71.99rem]:hidden">
          Close
        </button>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="num text-[30px] font-semibold leading-none tracking-[-0.02em]">{view.value}</p>
        {view.funderShows && (
          <p className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-mah">
            <ShieldIcon className="size-3.5" /> Funder copy shows {view.funderShows}
          </p>
        )}
      </div>
      <div className="space-y-0.5">
        {view.arithmetic.map((a) => (
          <p key={a} className="num text-[13px] leading-snug">{a}</p>
        ))}
      </div>
      <details className="text-[12.5px] leading-snug text-muted">
        <summary className="cursor-pointer font-semibold text-ink">How it&apos;s counted</summary>
        <p className="mt-1">{view.formula}</p>
      </details>
      <Register model={b.register} range={{ start: period.start, end: period.end }} sources={sources} spot={spot} selected={null} onSelect={() => {}} onToggle={() => {}} />
      <p className="num text-[12px] text-muted">
        Staff view, names shown. {view.rowsCaption}
      </p>
      {view.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="num w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-sunken text-left text-[11.5px] text-muted">
                {view.columns.map((c, i) => (
                  <th key={c} scope="col" className={`whitespace-nowrap px-2.5 py-1.5 font-semibold ${view.numeric.includes(i) ? 'text-right' : ''}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={`border-t border-line ${r.tone === 'absent' || r.tone === 'left' ? 'text-muted' : ''} ${r.tone === 'duplicate' ? 'italic text-muted' : ''}`}
                  onMouseEnter={() => r.at && setSpot({ seats: r.at.seat ? [r.at.seat] : [], people: r.at.participantId ? [r.at.participantId] : [], sessions: r.at.session ? [r.at.session] : [] })}
                  onMouseLeave={() => setSpot(null)}
                >
                  {r.cells.map((c, j) => (
                    <td key={j} className={`whitespace-nowrap px-2.5 py-1 ${view.numeric.includes(j) ? 'text-right' : ''}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view.rows.length > 12 && !all && (
        <button type="button" className="btn btn-quiet" onClick={() => setAll(true)}>
          Show all {view.rows.length.toLocaleString('en-US')} rows
        </button>
      )}
    </div>
  );
}

// ---------- The funder's form, as the agent read it ----------

export function FormSourceView({ run, onPick }: { run: FormRun; onPick: (itemId: string) => void }) {
  const text = run.form_text;
  const pre = useRef<HTMLPreElement>(null);
  // Open at the first question the agent read, not the form's preamble.
  useEffect(() => {
    const first = pre.current?.querySelector('button');
    if (pre.current && first) pre.current.scrollTop = Math.max(0, first.offsetTop - pre.current.offsetTop - 24);
  }, [run]);
  const marks = useMemo(() => {
    const out: { s: number; e: number; id: string; spread: boolean }[] = [];
    for (const item of run.items) {
      const at = locateQuote(item.quote, text);
      if (at) out.push({ s: at[0], e: at[1], id: item.id, spread: item.quote_match === 'spread' });
    }
    return out.sort((a, b) => a.s - b.s).filter((m, i, all) => i === 0 || m.s >= all[i - 1].e);
  }, [run, text]);
  const exact = run.items.filter((i) => i.quote_match === 'exact').length;
  const pieces: React.ReactNode[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.s > at) pieces.push(text.slice(at, m.s));
    pieces.push(
      <button key={m.id} type="button" onClick={() => onPick(m.id)} className={`rounded-[3px] px-0.5 text-left text-ink ${m.spread ? 'bg-orange-tint ring-1 ring-orange-line' : 'bg-mah-tint ring-1 ring-mah-soft'} hover:bg-mah-soft`}>
        {text.slice(m.s, m.e)}
      </button>,
    );
    at = m.e;
  }
  pieces.push(text.slice(at));
  return (
    <div className="space-y-3">
      <PanelHead title="The funder's form" meta={`${run.form.pages} ${run.form.pages === 1 ? 'page' : 'pages'} · retrieved ${fmtIso(run.form.retrieved)} · text as the agent read it`}>
        <a href={run.form.url} target="_blank" rel="noreferrer" className="btn btn-quiet !min-h-7 !px-2 text-[12.5px]">
          Original PDF
        </a>
      </PanelHead>
      <p className="text-[12.5px] text-muted">
        <span className="rounded-[3px] bg-mah-tint px-1 ring-1 ring-mah-soft">Highlighted</span>: {run.items.length} questions the agent quoted, {exact === run.items.length ? 'all' : exact} found word for word{run.items.length - exact ? `, ${run.items.length - exact} across table columns` : ''}.
      </p>
      <pre ref={pre} className="relative max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface px-3.5 py-3 font-sans text-[12px] leading-[1.55] text-muted">{pieces}</pre>
    </div>
  );
}
