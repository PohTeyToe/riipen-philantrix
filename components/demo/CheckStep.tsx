'use client';

import { useMemo, useState } from 'react';
import { ATTENDANCES, PERIODS, sample } from '@/lib/data';
import { needsAnswer, unansweredCount, type AnswerId, type Answers, type Finding, type FindingKind } from '@/lib/findings';
import { commas, fmtDate, fmtDay, fmtShortDate } from '@/lib/format';
import { changedFigures } from '@/lib/report';
import { TEMPLATES, templateById } from '@/lib/templates';
import { CheckIcon, ForwardIcon } from '../icons';

const KINDS: { kind: FindingKind; title: string; why: string }[] = [
  {
    kind: 'session_not_logged',
    title: 'Sessions on the schedule with no attendance logged',
    why: "The logger saves a row for each person ticked, so a session nobody logged leaves no rows at all. Only the group's schedule shows it's missing.",
  },
  {
    kind: 'inactive_participant',
    title: 'Participants with no activity in 30+ days and no exit date',
    why: 'They still count as enrolled, which holds up retention, until someone says they left.',
  },
  { kind: 'goal_no_due_date', title: 'Goals with no due date', why: 'No question to answer. A report that shows the goal says why it has no forecast.' },
  { kind: 'duplicate_record', title: 'Duplicate records', why: 'No question to answer. The engine counts the record once. If the copies disagree, the one with fewer hours counts.' },
];

const q3 = PERIODS[0];
const groupName = (id: string) => sample.groups.find((g) => g.id === id)?.name ?? id;
const personName = (id: string) => sample.participants.find((p) => p.id === id)?.display_name ?? id;

export function CheckStep({
  findings,
  answers,
  onAnswer,
  onNext,
}: {
  findings: Finding[];
  answers: Answers;
  onAnswer: (findingId: string, a: AnswerId | null) => void;
  onNext: () => void;
}) {
  const answerable = findings.filter(needsAnswer).length;
  const left = unansweredCount(findings, answers);
  const status =
    left === answerable ? `${answerable} need a one-click answer.` : left > 0 ? `${left} of ${answerable} still ${left === 1 ? 'needs' : 'need'} a one-click answer.` : `All ${answerable} that needed an answer have one.`;

  return (
    <div className="mx-auto max-w-[920px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="max-w-[60ch]">
          <h1 className="font-serif text-[26px] font-semibold leading-tight tracking-[-0.01em]">Check</h1>
          <p className="mt-1 text-[15px]">
            {findings.length} findings for {fmtShortDate(q3.start)} to {fmtDate(q3.end)}. {status}
          </p>
          <p className="text-[13.5px] text-muted">Nothing here blocks the report. Until a finding is answered, the report counts only what was logged, and the funder never sees the finding.</p>
        </div>
        <button type="button" onClick={onNext} className="btn btn-primary">
          Build report <ForwardIcon />
        </button>
      </div>

      <div className="mt-8 space-y-10">
        {KINDS.map(({ kind, title, why }) => {
          const list = findings.filter((f) => f.kind === kind);
          if (!list.length) return null;
          return (
            <section key={kind} aria-labelledby={`k-${kind}`}>
              <h2 id={`k-${kind}`} className="text-[16px] font-semibold">
                {title} <span className="num font-normal text-muted">({list.length})</span>
              </h2>
              <p className="mt-0.5 max-w-[68ch] text-[13.5px] text-muted">{why}</p>
              <ul className="mt-3 divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-paper">
                {list.map((f) => (
                  <FindingRow key={f.id} f={f} findings={findings} answers={answers} onAnswer={onAnswer} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mt-10 flex justify-end">
        <button type="button" onClick={onNext} className="btn btn-primary">
          Build report <ForwardIcon />
        </button>
      </div>
    </div>
  );
}

function FindingRow({ f, findings, answers, onAnswer }: { f: Finding; findings: Finding[]; answers: Answers; onAnswer: (id: string, a: AnswerId | null) => void }) {
  const [open, setOpen] = useState(false);
  const chosen = answers[f.id];
  const open_ = needsAnswer(f) && !chosen;
  const rows = useMemo(() => findingRows(f), [f]);

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
            {needsAnswer(f) &&
              (open_ ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-amber-ink">
                  <span aria-hidden className="size-2 rounded-full bg-amber" />
                  Needs an answer
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-accent">
                  <CheckIcon className="size-3.5" />
                  Answered
                </span>
              ))}
            <span className="num">{headline(f)}</span>
          </p>
          <p className="mt-0.5 text-[14px] text-muted">{detail(f)}</p>
          {chosen && <Effect f={f} findings={findings} answers={answers} />}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-1 inline-flex min-h-6 items-center text-[13.5px] font-semibold text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
          >
            {open ? 'Hide rows' : rows.rows.length === 1 ? 'Show the row' : `Show the ${rows.rows.length} rows`}
          </button>
        </div>

        {needsAnswer(f) && (
          <div className="shrink-0 md:pt-0.5">
            <div className="seg seg-wrap seg-fit w-full md:w-auto" role="group" aria-label={f.kind === 'session_not_logged' ? 'Did this session run?' : 'Is this participant still enrolled?'}>
              {f.answers.map((a) => (
                <button key={a.id} type="button" aria-pressed={chosen === a.id} onClick={() => onAnswer(f.id, chosen === a.id ? null : a.id)}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {open && (
        <div className="fade-in mt-3 overflow-x-auto rounded-md border border-rule">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-desk/60 text-left text-[12px] text-muted">
                {rows.columns.map((c, i) => (
                  <th key={c} scope="col" className={`px-3 py-1.5 font-semibold ${rows.numeric.includes(i) ? 'text-right' : ''}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.rows.map((r, i) => (
                <tr key={i} className={`border-t border-rule ${r.flag ? 'bg-amber-tint/70' : ''}`}>
                  {r.cells.map((c, j) => (
                    <td key={j} className={`num px-3 py-1.5 ${rows.numeric.includes(j) ? 'text-right' : ''} ${r.flag && j === r.cells.length - 1 ? 'font-semibold text-amber-ink' : ''}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

/**
 * Every number an answer moves, on either template, right where the answer
 * was given. Each answer is measured on its own, against no answers, so its
 * line stays put when other answers go in.
 */
function Effect({ f, findings, answers }: { f: Finding; findings: Finding[]; answers: Answers }) {
  const chosen = answers[f.id];
  const changes = useMemo(() => changedFigures(sample, findings, {}, { [f.id]: chosen }, q3.id), [f.id, findings, chosen]);
  const adds = chosen === 'ran_not_recorded' || chosen === 'left_program';
  if (!changes.length) return <p className="fade-in mt-1.5 text-[13.5px] text-muted">No figure changes.</p>;
  return (
    <div className="fade-in mt-1.5 text-[13.5px]">
      <p className="text-muted">On its own, this answer changes the {q3.short} report{adds ? ' and adds a data note saying why' : ''}:</p>
      <ul className="num mt-0.5 space-y-0.5">
        {changes.map((c) => (
          <li key={c.key}>
            <span className="text-muted">
              {c.label}
              {c.templates.length < TEMPLATES.length && ` (${c.templates.map((t) => templateById(t).short).join(', ')})`}:
            </span>{' '}
            <span className="text-muted line-through decoration-faint">{c.before}</span> <span aria-hidden>→</span>
            <span className="sr-only">changes to</span> <span className="rounded-sm bg-amber-tint px-1 font-semibold">{c.after}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function headline(f: Finding): string {
  switch (f.kind) {
    case 'session_not_logged': return `${groupName(f.groupId)}, ${fmtDay(f.date)}`;
    case 'inactive_participant': return `${personName(f.participantId)}, ${groupName(f.groupId)}`;
    case 'goal_no_due_date': return sample.goals.find((g) => g.id === f.goalId)?.name ?? f.goalId;
    case 'duplicate_record': return `${personName(f.participantId)}, ${groupName(f.groupId)}, ${fmtDay(f.date)}`;
  }
}

function detail(f: Finding): string {
  switch (f.kind) {
    case 'session_not_logged': return `On the schedule (${sample.groups.find((g) => g.id === f.groupId)?.schedule_label}). No attendance logged.`;
    case 'inactive_participant': return `Last activity ${fmtDay(f.lastActivity)}, ${f.daysInactive} days before ${fmtShortDate(sample.asOf)}. No exit date.`;
    case 'goal_no_due_date': return 'Progress shows without a forecast.';
    case 'duplicate_record': return 'Logged twice for the same session. The record counts once.';
  }
}

interface MiniRows {
  columns: string[];
  numeric: number[];
  rows: { cells: string[]; flag?: boolean }[];
}

function findingRows(f: Finding): MiniRows {
  if (f.kind === 'session_not_logged') {
    const g = sample.groups.find((x) => x.id === f.groupId)!;
    const i = g.scheduled_dates.indexOf(f.date);
    const dates = g.scheduled_dates.slice(Math.max(0, i - 2), i + 3);
    const count = (d: string) => new Set(sample.engagements.filter((e) => e.group_id === g.id && e.date === d && e.activity_type === ATTENDANCES).map((e) => e.participant_id)).size;
    return {
      columns: ['Scheduled', 'Group', 'Attendances records'],
      numeric: [2],
      rows: dates.map((d) => (d === f.date ? { cells: [fmtDay(d), g.name, 'None'], flag: true } : { cells: [fmtDay(d), g.name, String(count(d))] })),
    };
  }
  if (f.kind === 'inactive_participant') {
    const recs = sample.engagements.filter((e) => e.participant_id === f.participantId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    return {
      columns: ['Date', 'Participant', 'Activity type', 'Units'],
      numeric: [3],
      rows: [
        { cells: [`${fmtShortDate(f.lastActivity)} to ${fmtShortDate(sample.asOf)}`, personName(f.participantId), 'Nothing logged', ''], flag: true },
        ...recs.map((e) => ({ cells: [fmtDay(e.date), personName(e.participant_id), e.activity_type, String(e.units)] })),
      ],
    };
  }
  if (f.kind === 'goal_no_due_date') {
    const g = sample.goals.find((x) => x.id === f.goalId)!;
    return {
      columns: ['Tracked Goal', 'Target', 'Starts', 'Due date'],
      numeric: [],
      rows: [{ cells: [g.name, g.metric === 'attendance_rate' ? `${Math.round(g.target * 100)}%` : commas(g.target), fmtDate(g.start_date), 'None'], flag: true }],
    };
  }
  // The counted copy first: fewest hours, then the lower id (lib/engine.ts).
  const recs = sample.engagements.filter((e) => f.recordIds.includes(e.id)).sort((a, b) => a.units - b.units || a.id.localeCompare(b.id));
  return {
    columns: ['Record', 'Date', 'Participant', 'Activity type', 'Counted'],
    numeric: [],
    rows: recs.map((e, i) => ({ cells: [e.id, fmtDay(e.date), personName(e.participant_id), e.activity_type, i === 0 ? 'Yes' : 'No, duplicate'], flag: i > 0 })),
  };
}
