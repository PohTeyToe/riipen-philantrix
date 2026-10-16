'use client';

import { useState } from 'react';
import type { Period } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { OP_WORD, type FilledField, type FilledForm, type FilledItem } from '@/lib/forms';
import { DownloadIcon, ShieldIcon } from '../icons';
import { printReport } from './print';
import { staffKey } from './model';
import { Changed, T } from './Traceable';

/** How each funder lays out its page, as printed on their PDF. */
const LAYOUT: Record<string, 'grid' | 'questions'> = { 'ojjdp-mentoring': 'grid' };

export interface ReplayState {
  /** Run time the replay has reached, in ms. */
  t: number;
  /** When each question's worker finished with it. */
  doneAt: Map<string, number>;
  /** When the form had been read. */
  readAt: number;
}

interface Props {
  filled: FilledForm;
  period: Period;
  orgName: string;
  replay: ReplayState | null;
  focusItems: string[] | null;
  onHoverItem: (id: string | null) => void;
  onStaff: (key: string, text: string) => void;
  onWhy: (itemId: string, fieldId: string) => void;
}

/** One funder's own form, filled from the records. This element is what prints. */
export function FormReport({ filled, period, orgName, replay, focusItems, onHoverItem, onStaff, onWhy }: Props) {
  const { run, counts } = filled;
  const form = run.form;
  const grid = LAYOUT[form.id] === 'grid';
  const reading = replay !== null && replay.t < replay.readAt;
  const shown = (id: string) => replay === null || (replay.doneAt.get(id) ?? Infinity) <= replay.t;
  const live = filled.items.filter((i) => i.fields.some((f) => f.view.state !== 'missing'));
  const untracked = filled.items.filter((i) => i.fields.every((f) => f.view.state === 'missing'));

  return (
    <article data-report={form.id} className="paper print-flat relative" aria-label={`${form.short} report`}>
      <header className="border-b border-line px-5 pb-4 pt-4 @[34rem]:px-7">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow flex flex-wrap gap-x-1.5 !text-mah">
            <span>Sample data</span>
            <span className="text-faint">·</span>
            <span className="text-muted">{period.label}</span>
          </p>
          <button type="button" className="btn btn-ghost no-print -mr-1.5 !min-h-7 !px-2 text-[12.5px]" onClick={() => printReport(form.id, `${form.short} - ${orgName} - ${period.label}`)} title="Opens the print dialog. Choose Save as PDF.">
            <DownloadIcon className="size-3.5" /> PDF
          </button>
        </div>
        <h2 className="mt-2 font-serif text-[21px] font-semibold leading-tight tracking-[-0.01em]">{form.title}</h2>
        <p className="mt-0.5 text-[13.5px] text-muted">
          {form.funder}.{' '}
          <a href={form.url} className="link whitespace-nowrap" target="_blank" rel="noreferrer">
            Their form, {form.pages} {form.pages === 1 ? 'page' : 'pages'}
          </a>
        </p>
        <p className="num mt-2 text-[12px] text-muted">
          {orgName} · {period.range} · as of {fmtDate(period.end)}
        </p>
        <Tally counts={counts} />
      </header>

      {reading ? (
        <Skeleton />
      ) : (
        <div className={grid ? '' : 'divide-y divide-line'}>
          {grid ? (
            <GridForm items={live} shown={shown} focusItems={focusItems} onHoverItem={onHoverItem} onStaff={(f, t) => onStaff(staffKey(form.id, f), t)} onWhy={onWhy} />
          ) : (
            live.map((item) => (
              <Question key={item.item.id} item={item} shown={shown(item.item.id)} dim={!!focusItems && !focusItems.includes(item.item.id)} onHoverItem={onHoverItem} onStaff={(f, t) => onStaff(staffKey(form.id, f), t)} onWhy={onWhy} />
            ))
          )}
          {untracked.length > 0 && <Untracked items={untracked} shown={shown} />}
        </div>
      )}
    </article>
  );
}

function Tally({ counts }: { counts: FilledForm['counts'] }) {
  const left = counts.forStaff - counts.staffDone;
  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <ul className="num flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" aria-label="Fields">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px] bg-mah" />
          <span className="font-semibold">{counts.fromRecords}</span> from records
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2 rounded-full ${left ? 'bg-orange' : 'bg-green'}`} />
          <span className="font-semibold">{left}</span> need you
          {counts.staffDone > 0 && <span className="text-muted">· {counts.staffDone} answered</span>}
        </li>
        {counts.notTracked > 0 && (
          <li className="flex items-center gap-1.5 text-muted">
            <span aria-hidden className="size-2 rounded-full border border-faint" />
            <span className="font-semibold text-ink">{counts.notTracked}</span> not in records
          </li>
        )}
      </ul>
      <p className="no-print text-[12px] text-muted">Click any underlined number for its rows.</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4 px-5 py-5 @[34rem]:px-7" aria-label="Reading the form">
      {[70, 52, 84, 60].map((w, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 rounded bg-sunken" style={{ width: `${w}%` }} />
          <div className="h-3 w-1/3 rounded bg-sunken/70" />
        </div>
      ))}
    </div>
  );
}

type FieldCb = { onStaff: (fieldId: string, text: string) => void; onWhy: (itemId: string, fieldId: string) => void };

/** A numbered question with its answers, as on the foundation and municipal forms. */
function Question({ item, shown, dim, onHoverItem, onStaff, onWhy }: { item: FilledItem; shown: boolean; dim: boolean; onHoverItem: (id: string | null) => void } & FieldCb) {
  const { item: q, fields } = item;
  const many = fields.length > 1;
  const [live, missing] = split(fields);
  return (
    <section
      className={`avoid-break px-5 py-4 transition-opacity duration-200 @[34rem]:px-7 ${dim ? 'opacity-40' : ''}`}
      onMouseEnter={() => onHoverItem(q.id)}
      onMouseLeave={() => onHoverItem(null)}
      aria-labelledby={`q-${q.id}`}
    >
      <h3 id={`q-${q.id}`} className="flex gap-2.5 text-[14px] font-semibold leading-snug">
        {q.number && <span className="num grid h-[20px] min-w-[20px] shrink-0 place-items-center rounded-[5px] bg-sunken px-1 text-[11.5px]">{q.number}</span>}
        <span>{q.title}</span>
      </h3>
      {!echoes(q.title, q.quote) && <p className="mt-1 max-w-[70ch] text-[12.5px] leading-snug text-muted">{q.quote}</p>}
      <div className={`mt-2.5 ${many ? 'space-y-2.5' : ''}`}>
        {live.map((f) =>
          shown ? (
            <div key={f.field.id} className="fade-in">
              <FieldAnswer f={f} itemId={q.id} label={many ? f.field.label : null} onStaff={onStaff} onWhy={onWhy} />
            </div>
          ) : (
            <div key={f.field.id} className="h-7 w-1/2 animate-pulse rounded-md bg-sunken" />
          ),
        )}
        {shown && missing.length > 0 && <NotTracked fields={missing} />}
      </div>
    </section>
  );
}

/** The form's own words add nothing when they only repeat the title ("Amount received: $"). */
const echoes = (title: string, quote: string) => {
  const t = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  const q = quote.toLowerCase().replace(/[^a-z0-9]/g, '');
  return q.startsWith(t) && q.length - t.length < 12;
};

/** Fields with an answer first; the ones the records hold nothing for fold into one line. */
const split = (fields: FilledField[]): [FilledField[], FilledField[]] => [fields.filter((f) => f.view.state !== 'missing'), fields.filter((f) => f.view.state === 'missing')];

function NotTracked({ fields }: { fields: FilledField[] }) {
  const [open, setOpen] = useState(false);
  const letters = fields.map((f) => letter(f.field.id).replace('.', '')).filter(Boolean);
  const what = [...new Set(fields.map((f) => (f.view.state === 'missing' ? f.view.what : '')))].filter(Boolean);
  return (
    <div className="text-[12.5px] leading-snug text-muted">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 text-left hover:text-ink">
        <span aria-hidden className="size-[7px] shrink-0 rounded-full border border-faint" />
        <span>
          {letters.length ? `${letters.join(', ')}: ` : ''}not in the records{fields.length > 1 && !letters.length ? ` (${fields.length})` : ''}.
        </span>
        <span className="font-semibold text-mah">{open ? 'Hide' : 'What to track'}</span>
      </button>
      {open && (
        <ul className="fade-in mt-1 list-disc space-y-0.5 pl-6">
          {what.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The OJJDP layout: a measures grid, the data items lettered, a column for the values. Narrow, it stacks. */
function GridForm({ items, shown, focusItems, onHoverItem, onStaff, onWhy }: { items: FilledItem[]; shown: (id: string) => boolean; focusItems: string[] | null; onHoverItem: (id: string | null) => void } & FieldCb) {
  return (
    <div className="text-[13px]">
      <div className="hidden grid-cols-[2rem_minmax(0,1fr)_minmax(0,44%)] gap-x-3 border-b border-line bg-sunken/60 px-5 py-1.5 text-[11.5px] font-semibold text-muted @[34rem]:grid @[34rem]:px-7">
        <span>#</span>
        <span>Measure</span>
        <span>Record data here</span>
      </div>
      {items.map((item) => {
        const q = item.item;
        const dim = !!focusItems && !focusItems.includes(q.id);
        const [live, missing] = split(item.fields);
        return (
          <section
            key={q.id}
            id={`q-${q.id}`}
            aria-label={`${q.number ?? ''} ${q.title}`}
            className={`avoid-break border-b border-line px-5 py-3 transition-opacity duration-200 last:border-b-0 @[34rem]:px-7 ${dim ? 'opacity-40' : ''}`}
            onMouseEnter={() => onHoverItem(q.id)}
            onMouseLeave={() => onHoverItem(null)}
          >
            <h3 className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 text-[13.5px] font-semibold leading-snug">
              <span className="num text-[12px] text-muted">{q.number}</span>
              <span>{q.title}</span>
            </h3>
            <div className="mt-1 space-y-1.5">
              {live.map((f) => (
                <div key={f.field.id} className="grid gap-x-3 gap-y-0.5 pl-[2.75rem] @[34rem]:grid-cols-[2rem_minmax(0,1fr)_minmax(0,44%)] @[34rem]:pl-0">
                  <span aria-hidden className="hidden @[34rem]:block" />
                  <p className="text-[12.5px] leading-snug text-muted">
                    <span className="num font-semibold text-ink">{letter(f.field.id)}</span> {f.field.label}
                  </p>
                  {shown(q.id) ? (
                    <div className="fade-in min-w-0">
                      <FieldAnswer f={f} itemId={q.id} label={null} compact onStaff={onStaff} onWhy={onWhy} />
                    </div>
                  ) : (
                    <div className="h-5 w-2/3 animate-pulse rounded-md bg-sunken" />
                  )}
                </div>
              ))}
              {shown(q.id) && missing.length > 0 && (
                <div className="pl-[2.75rem]">
                  <NotTracked fields={missing} />
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const letter = (id: string) => {
  const tail = id.slice(id.indexOf('.') + 1);
  return /^[A-Z]$/.test(tail) ? `${tail}.` : '';
};

/** Questions the records hold nothing for, folded into one list that says what to start tracking. */
function Untracked({ items, shown }: { items: FilledItem[]; shown: (id: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const ready = items.filter((i) => shown(i.item.id));
  if (!ready.length) return null;
  return (
    <section className="border-t border-line px-5 py-3.5 @[34rem]:px-7">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-[13px]">
          <span className="font-semibold">{ready.length} {ready.length === 1 ? 'question' : 'questions'}</span>
          <span className="text-muted"> with nothing in the records ({ready.reduce((n, i) => n + i.fields.length, 0)} fields)</span>
        </span>
        <span className="text-[12.5px] font-semibold text-mah">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ul className="fade-in mt-2.5 space-y-2">
          {ready.map(({ item, fields }) => (
            <li key={item.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 text-[12.5px] leading-snug">
              <span className="num font-semibold text-muted">{item.number ?? ''}</span>
              <span>
                <span className="font-semibold">{item.title}.</span> <span className="text-muted">To track: {[...new Set(fields.map((f) => f.view.state === 'missing' ? f.view.what : ''))].filter(Boolean).join(' ')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FieldAnswer({ f, itemId, label, compact = false, onStaff, onWhy }: { f: FilledField; itemId: string; label: string | null; compact?: boolean } & FieldCb) {
  const { field, view } = f;
  const why = (
    <button type="button" onClick={() => onWhy(itemId, field.id)} className="why no-print text-[11.5px] font-semibold text-faint hover:text-mah" aria-label={`Why the agent answered ${field.label} this way`}>
      Why
    </button>
  );
  const head = label && <p className="text-[12.5px] font-semibold text-muted">{label}</p>;

  if (view.state === 'value') {
    return (
      <div>
        {head}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {view.ref ? (
            <T r={view.ref} changeKey={`field:${field.id}`} className={`num font-semibold tracking-[-0.01em] ${compact ? 'text-[17px]' : 'text-[24px] leading-none'}`} label={`${field.label}: ${view.display}`}>
              {view.display}
            </T>
          ) : (
            <Changed changeKey={`field:${field.id}`} className={`num font-semibold tracking-[-0.01em] ${compact ? 'text-[17px]' : 'text-[24px] leading-none'}`}>
              {view.display}
            </Changed>
          )}
          {view.working && field.formula && (
            <span className="num text-[12px] text-muted">
              ={' '}
              {view.working.map((w, i) => (
                <span key={i}>
                  {i > 0 && ` ${OP_WORD[field.formula!.op]} `}
                  {w.ref ? <T r={w.ref}>{w.display}</T> : w.display}
                </span>
              ))}
            </span>
          )}
          {view.guarded && (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-mah">
              <ShieldIcon className="size-3" /> Small count hidden
            </span>
          )}
          {why}
        </div>
      </div>
    );
  }
  if (view.state === 'withheld') {
    return (
      <div>
        {head}
        <p className="flex flex-wrap items-baseline gap-x-2">
          {view.ref ? (
            <T r={view.ref} changeKey={`field:${field.id}`} className={`num font-semibold ${compact ? 'text-[15px]' : 'text-[17px]'}`}>
              {view.display}
            </T>
          ) : (
            <span className={`num font-semibold text-muted ${compact ? 'text-[15px]' : 'text-[17px]'}`}>{view.display}</span>
          )}
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-mah">
            <ShieldIcon className="size-3" /> Privacy guard
          </span>
          {why}
        </p>
        <p className="mt-0.5 max-w-[60ch] text-[12px] leading-snug text-muted">{view.why}</p>
      </div>
    );
  }
  if (view.state === 'waiting') {
    return (
      <div>
        {head}
        <p className="text-[12.5px] text-muted">
          {field.formula ? `${field.formula.of.map(letter).map((l) => l.replace('.', '')).join(` ${OP_WORD[field.formula.op]} `)}, ` : ''}once you answer {view.needs.length > 1 ? 'both' : 'it'} {why}
        </p>
      </div>
    );
  }
  if (view.state === 'draft') {
    return (
      <div>
        {head}
        <p className="max-w-[66ch] text-[14px] leading-[1.6]">
          {view.parts.map((p, i) =>
            p.ref ? (
              <T key={i} r={p.ref} changeKey={`field:${field.id}:${i}`} inline>
                {p.text}
              </T>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </p>
        <p className="mt-1 flex items-center gap-2 text-[11.5px] text-muted">
          <span className="font-semibold text-mah">Agent draft</span> · numbers from records {why}
        </p>
        {view.ask && <StaffInput question={view.ask} value={view.staff} onChange={(t) => onStaff(field.id, t)} />}
      </div>
    );
  }
  if (view.state === 'ask') {
    return (
      <div>
        {head}
        <StaffInput
          question={view.question}
          value={view.staff}
          numeric={view.numeric}
          compact={compact}
          note={view.handedOver === 'rules' ? "The agent's drafts kept breaking the wording rules, so it handed this one over." : view.handedOver === 'review' ? "The reviewer rejected the agent's answer, so it handed this one over." : null}
          onChange={(t) => onStaff(field.id, t)}
          why={why}
        />
      </div>
    );
  }
  return (
    <div>
      {head}
      <p className="text-[12.5px] leading-snug text-muted">
        <span className="font-semibold text-ink">Not in records.</span> To track: {view.what} {why}
      </p>
    </div>
  );
}

function StaffInput({
  question,
  value,
  onChange,
  why,
  numeric = false,
  compact = false,
  note = null,
}: {
  question: string;
  value: string | null;
  onChange: (t: string) => void;
  why?: React.ReactNode;
  numeric?: boolean;
  compact?: boolean;
  note?: string | null;
}) {
  const [text, setText] = useState(value ?? '');
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  if (value && !editing) {
    return (
      <div className="mt-1.5">
        <p className="whitespace-pre-line text-[14px] leading-[1.55]">{value}</p>
        <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted">
          <span className="font-semibold text-green-ink">Entered by staff</span>
          <button type="button" className="no-print font-semibold text-faint hover:text-mah" onClick={() => setEditing(true)}>
            Edit
          </button>
        </p>
      </div>
    );
  }
  if (!open) {
    return (
      <p className="flex items-start gap-1.5 text-[12.5px] leading-snug">
        <span aria-hidden className="mt-[5px] size-[7px] shrink-0 rounded-full bg-orange" />
        <span className="min-w-0">
          <span className="text-muted">{question}</span>{' '}
          <button type="button" onClick={() => setOpen(true)} className="no-print font-semibold text-orange-ink hover:underline">
            Answer
          </button>
        </span>
      </p>
    );
  }
  return (
    <div className="no-print mt-1.5 rounded-lg border border-orange-line bg-orange-tint px-3 py-2.5">
      <label className="flex items-baseline justify-between gap-2 text-[13px] font-semibold text-orange-ink">
        <span>
          <span className="mr-1.5 inline-block size-[7px] rounded-full bg-orange align-middle" aria-hidden />
          {question}
        </span>
        {why}
      </label>
      {note && <p className="mt-0.5 text-[12px] text-orange-ink/80">{note}</p>}
      <form
        className="mt-2 flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onChange(text);
          setEditing(false);
        }}
      >
        {numeric ? (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="decimal"
            aria-label={question}
            placeholder="Number"
            className="h-8 w-32 rounded-md border border-line-strong bg-surface px-2.5 text-[13.5px] outline-none placeholder:text-faint focus:border-mah"
          />
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            aria-label={question}
            placeholder="Type the answer"
            className="min-h-8 flex-1 resize-y rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13.5px] leading-snug outline-none placeholder:text-faint focus:border-mah"
          />
        )}
        <button type="submit" className="btn btn-quiet !min-h-8" disabled={!text.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}
