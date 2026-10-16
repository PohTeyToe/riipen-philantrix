'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { choiceFor, SEP, withoutOptions, type Choice } from '@/lib/choices';
import type { Period } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { fieldName, OP_WORD, parseStaffNumber, type FilledField, type FilledForm, type FilledItem } from '@/lib/forms';
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
  onStaff: (key: string, text: string, label: string) => void;
  onWhy: (itemId: string, fieldId: string) => void;
}

type FieldCb = {
  formId: string;
  onStaff: (item: FilledItem['item'], f: FilledField, text: string) => void;
  onWhy: (itemId: string, fieldId: string) => void;
};

/** One funder's own form, filled from the records. This element is what prints. */
export function FormReport({ filled, period, orgName, replay, focusItems, onHoverItem, onStaff, onWhy }: Props) {
  const { run, counts } = filled;
  const form = run.form;
  const grid = LAYOUT[form.id] === 'grid';
  const reading = replay !== null && replay.t < replay.readAt;
  const shown = (id: string) => replay === null || (replay.doneAt.get(id) ?? Infinity) <= replay.t;
  const live = filled.items.filter((i) => i.fields.some((f) => f.view.state !== 'missing'));
  const untracked = filled.items.filter((i) => i.fields.every((f) => f.view.state === 'missing'));
  const cb: FieldCb = {
    formId: form.id,
    onStaff: (item, f, text) => onStaff(staffKey(form.id, period.id, f.field.id), text, fieldName(item, f.field)),
    onWhy,
  };

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
        // Keyed by period: a typed answer belongs to the period it was typed for.
        <div key={period.id} className={grid ? '' : 'divide-y divide-line'}>
          {grid ? (
            <GridForm items={live} shown={shown} focusItems={focusItems} onHoverItem={onHoverItem} {...cb} />
          ) : (
            live.map((item) => <Question key={item.item.id} item={item} shown={shown(item.item.id)} dim={!!focusItems && !focusItems.includes(item.item.id)} onHoverItem={onHoverItem} {...cb} />)
          )}
          {untracked.length > 0 && <Untracked items={untracked} shown={shown} />}
        </div>
      )}
    </article>
  );
}

/** What code filled leads; what's left for staff is one orange count. */
function Tally({ counts }: { counts: FilledForm['counts'] }) {
  const left = counts.forStaff - counts.staffDone;
  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <ul className="num flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px] text-muted" aria-label="Fields">
        <li>
          <b className="text-[15px] font-semibold text-mah">{counts.fromRecords}</b> filled from records
        </li>
        <li>
          <b className={`text-[15px] font-semibold ${left ? 'text-orange-ink' : 'text-green-ink'}`}>{left}</b> for staff
          {counts.staffDone > 0 && <span> · {counts.staffDone} answered</span>}
        </li>
        {counts.notTracked > 0 && (
          <li>
            <b className="text-[15px] font-semibold text-ink">{counts.notTracked}</b> not tracked
          </li>
        )}
      </ul>
      <p className="no-print text-[12px] text-muted">Click an underlined number for its rows.</p>
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

/** A numbered question with its answers, as on the foundation and municipal forms. */
function Question({ item, shown, dim, onHoverItem, ...cb }: { item: FilledItem; shown: boolean; dim: boolean; onHoverItem: (id: string | null) => void } & FieldCb) {
  const { item: q, fields } = item;
  const many = fields.length > 1;
  const [live, missing] = split(fields);
  const options = fields.flatMap((f) => choiceFor(cb.formId, f.field.id)?.options ?? []);
  const quote = withoutOptions(q.quote, options);
  return (
    <section
      id={`q-${q.id}`}
      className={`avoid-break scroll-mt-4 px-5 py-4 transition-opacity duration-200 @[34rem]:px-7 ${dim ? 'opacity-40' : ''}`}
      onMouseEnter={() => onHoverItem(q.id)}
      onMouseLeave={() => onHoverItem(null)}
      aria-labelledby={`q-${q.id}-title`}
    >
      <h3 id={`q-${q.id}-title`} className="flex gap-2.5 text-[14px] font-semibold leading-snug">
        {q.number && <span className="num grid h-[20px] min-w-[20px] shrink-0 place-items-center rounded-[5px] bg-sunken px-1 text-[11.5px]">{q.number}</span>}
        <span>{q.title}</span>
      </h3>
      {!echoes(q.title, quote) && <p className="mt-1 max-w-[70ch] text-[12.5px] leading-snug text-muted">{quote}</p>}
      <div className={`mt-2.5 ${many ? 'space-y-2.5' : ''}`}>
        {live.map((f) =>
          shown ? (
            <div key={f.field.id} className="fade-in">
              <FieldAnswer f={f} item={q} label={many ? f.field.label : null} {...cb} />
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
  const letters = fields.map((f) => letter(f.field.id).replace('.', '')).filter(Boolean);
  const what = [...new Set(fields.map((f) => (f.view.state === 'missing' ? f.view.what : '')))].filter(Boolean);
  return (
    <details className="group text-[12.5px] leading-snug text-muted">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="size-[7px] shrink-0 rounded-full border border-faint" />
        <span>
          {letters.length ? `${letters.join(', ')}: ` : ''}not in the records{fields.length > 1 && !letters.length ? ` (${fields.length})` : ''}.
        </span>
        <span className="font-semibold text-mah group-open:hidden">What to track</span>
        <span className="hidden font-semibold text-mah group-open:inline">Hide</span>
      </summary>
      <ul className="fade-in mt-1 list-disc space-y-0.5 pl-6">
        {what.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </details>
  );
}

/** The OJJDP layout: a measures grid, the data items lettered, a column for the values. Narrow, it stacks. */
function GridForm({ items, shown, focusItems, onHoverItem, ...cb }: { items: FilledItem[]; shown: (id: string) => boolean; focusItems: string[] | null; onHoverItem: (id: string | null) => void } & FieldCb) {
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
            className={`avoid-break scroll-mt-4 border-b border-line px-5 py-3 transition-opacity duration-200 last:border-b-0 @[34rem]:px-7 ${dim ? 'opacity-40' : ''}`}
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
                      <FieldAnswer f={f} item={q} label={null} compact {...cb} />
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

/** Questions the records hold nothing for, folded into one list that says what to start tracking. Each keeps its id, so the form's source can point at it. */
function Untracked({ items, shown }: { items: FilledItem[]; shown: (id: string) => boolean }) {
  const ready = items.filter((i) => shown(i.item.id));
  if (!ready.length) return null;
  return (
    <details className="group border-t border-line px-5 py-3.5 @[34rem]:px-7">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left [&::-webkit-details-marker]:hidden">
        <span className="text-[13px]">
          <span className="font-semibold">
            {ready.length} {ready.length === 1 ? 'question' : 'questions'}
          </span>
          <span className="text-muted"> with nothing in the records ({ready.reduce((n, i) => n + i.fields.length, 0)} fields)</span>
        </span>
        <span className="text-[12.5px] font-semibold text-mah group-open:hidden">Show</span>
        <span className="hidden text-[12.5px] font-semibold text-mah group-open:inline">Hide</span>
      </summary>
      <ul className="mt-2.5 space-y-2">
        {ready.map(({ item, fields }) => (
          <li key={item.id} id={`q-${item.id}`} className="grid scroll-mt-4 grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 text-[12.5px] leading-snug">
            <span className="num font-semibold text-muted">{item.number ?? ''}</span>
            <span>
              <span className="font-semibold">{item.title}.</span>{' '}
              <span className="text-muted">To track: {[...new Set(fields.map((f) => (f.view.state === 'missing' ? f.view.what : '')))].filter(Boolean).join(' ')}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function FieldAnswer({ f, item, label, compact = false, formId, onStaff, onWhy }: { f: FilledField; item: FilledItem['item']; label: string | null; compact?: boolean } & FieldCb) {
  const { field, view } = f;
  const why = (
    <button type="button" onClick={() => onWhy(item.id, field.id)} className="why no-print text-[11.5px] font-semibold text-faint hover:text-mah" aria-label={`Why the agent answered ${field.label} this way`}>
      Why
    </button>
  );
  const head = label && <p className="text-[12.5px] font-semibold text-muted">{label}</p>;
  const big = compact ? 'text-[17px]' : 'text-[24px] leading-none';

  if (view.state === 'value') {
    return (
      <div>
        {head}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {view.ref ? (
            <T r={view.ref} changeKey={`field:${field.id}`} className={`num font-semibold tracking-[-0.01em] ${big}`} label={`${field.label}: ${view.display}`}>
              {view.display}
            </T>
          ) : (
            <Changed changeKey={`field:${field.id}`} className={`num font-semibold tracking-[-0.01em] ${big}`}>
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
          {view.guarded && <Guarded>Small count hidden</Guarded>}
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
            <Changed changeKey={`field:${field.id}`} className={`num font-semibold text-muted ${compact ? 'text-[15px]' : 'text-[17px]'}`}>
              {view.display}
            </Changed>
          )}
          <Guarded>Privacy guard</Guarded>
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
          {field.formula ? `${field.formula.of.map(letter).map((l) => l.replace('.', '')).join(` ${OP_WORD[field.formula.op]} `)}, ` : ''}once {view.needs.length > 1 ? 'both are' : 'it is'} answered {why}
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
        {view.ask && <StaffInput question={view.ask} value={view.staff} wants="text" onChange={(t) => onStaff(item, f, t)} />}
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
          shows={view.shows}
          wants={field.wants}
          choice={choiceFor(formId, field.id)}
          compact={compact}
          note={view.handedOver === 'rules' ? "The agent's drafts kept breaking the wording rules, so it handed this one over." : view.handedOver === 'review' ? "The reviewer rejected the agent's answer, so it handed this one over." : null}
          onChange={(t) => onStaff(item, f, t)}
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

function Guarded({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-mah">
      <ShieldIcon className="size-3" /> {children}
    </span>
  );
}

const NUMBER_HINT: Record<string, string> = { count: 'A whole number, like 30.', hours: 'A number of hours, like 12.5.', money: 'An amount, like 1,200.' };

/**
 * A field only a person can answer. Closed, it's one quiet line. Choice
 * questions answer in one click from the form's own options; numbers must
 * read as numbers before they count.
 */
function StaffInput({
  question,
  value,
  onChange,
  why,
  wants,
  shows = null,
  choice = null,
  compact = false,
  note = null,
}: {
  question: string;
  value: string | null;
  onChange: (t: string) => void;
  why?: React.ReactNode;
  wants: string;
  shows?: string | null;
  choice?: Choice | null;
  compact?: boolean;
  note?: string | null;
}) {
  const numeric = wants in NUMBER_HINT;
  const [text, setText] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const id = useId();
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const save = (t: string) => {
    const v = t.trim();
    if (v && numeric && parseStaffNumber(wants, v) === null) {
      setError(NUMBER_HINT[wants]);
      return;
    }
    setError(null);
    onChange(v);
    setOpen(false);
  };

  if (choice) {
    const picked = value ? value.split(SEP) : [];
    const pick = (o: string) => onChange(choice.many ? (picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o]).filter((x) => choice.options.includes(x)).sort((a, b) => choice.options.indexOf(a) - choice.options.indexOf(b)).join(SEP) : picked[0] === o ? '' : o);
    return (
      // The form's own question sits above, so the options carry the rest.
      <div className="mt-1">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={question}>
          {choice.options.map((o) => (
            <button key={o} type="button" className="answer !whitespace-normal py-1 text-left leading-snug" aria-pressed={picked.includes(o)} onClick={() => pick(o)}>
              {o.charAt(0).toUpperCase() + o.slice(1)}
            </button>
          ))}
          <span className="ml-1">{why}</span>
        </div>
        {choice.many && <p className="mt-1 text-[11.5px] text-faint">Pick every one that applies.</p>}
      </div>
    );
  }

  if (value && !open) {
    return (
      <div className="mt-0.5">
        {numeric ? (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className={`num font-semibold tracking-[-0.01em] ${compact ? 'text-[17px]' : 'text-[24px] leading-none'}`}>{shows ?? value}</span>
            {shows && <Guarded>{shows.startsWith('<') ? 'Small count hidden' : 'Privacy guard'}</Guarded>}
          </p>
        ) : (
          <p className="whitespace-pre-line text-[14px] leading-[1.55]">{value}</p>
        )}
        <p className="mt-0.5 flex items-center gap-2.5 text-[11.5px] text-muted">
          <span className="font-semibold text-green-ink">Entered by staff</span>
          <button type="button" className="no-print font-semibold text-faint hover:text-mah" onClick={() => setOpen(true)}>
            Edit
          </button>
          <button type="button" className="no-print font-semibold text-faint hover:text-mah" onClick={() => onChange('')}>
            Clear
          </button>
          {why}
        </p>
      </div>
    );
  }
  if (!open) {
    return (
      <p className="flex min-w-0 items-baseline gap-2 text-[12.5px] leading-snug">
        <button type="button" onClick={() => setOpen(true)} className="no-print shrink-0 font-semibold text-mah hover:underline" aria-label={`Answer: ${question}`}>
          Answer
        </button>
        <span className="min-w-0 truncate text-muted" title={question}>
          {question}
        </span>
      </p>
    );
  }
  return (
    <div className="no-print mt-1.5 rounded-lg border border-line-strong bg-canvas px-3 py-2.5">
      <label htmlFor={`${id}-in`} className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
        <span>{question}</span>
        {why}
      </label>
      {note && <p className="mt-0.5 text-[12px] text-muted">{note}</p>}
      <form
        className="mt-2 flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(text);
        }}
      >
        {numeric ? (
          <input
            ref={input}
            id={`${id}-in`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            inputMode={wants === 'count' ? 'numeric' : 'decimal'}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            placeholder={wants === 'money' ? '$' : wants === 'hours' ? 'Hours' : 'Number'}
            className={`h-8 w-32 rounded-md border bg-surface px-2.5 text-[13.5px] outline-none placeholder:text-faint focus:border-mah ${error ? 'border-orange' : 'border-line-strong'}`}
          />
        ) : (
          <textarea
            ref={input}
            id={`${id}-in`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Type the answer"
            className="min-h-8 min-w-0 flex-1 resize-y rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13.5px] leading-snug outline-none placeholder:text-faint focus:border-mah"
          />
        )}
        <button type="submit" className="btn btn-primary !min-h-8" disabled={!text.trim() && !value}>
          {text.trim() || !value ? 'Save' : 'Clear'}
        </button>
        <button type="button" className="btn btn-ghost !min-h-8" onClick={() => { setText(value ?? ''); setError(null); setOpen(false); }}>
          Cancel
        </button>
      </form>
      {error && (
        <p id={`${id}-err`} className="mt-1 text-[12px] font-semibold text-orange-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
