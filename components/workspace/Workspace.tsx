'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PERIODS, periodById, sample } from '@/lib/data';
import { needsAnswer } from '@/lib/findings';
import { fieldName, fmtSeconds, OP_WORD, runById, type FormField, type FormItem, type FormRun, type RunEvent } from '@/lib/forms';
import { METRICS } from '@/lib/metrics';
import { refKey, type TraceRef } from '@/lib/report';
import { templateById, type TemplateId } from '@/lib/templates';
import { AppHeader } from '../AppHeader';
import { CloseIcon } from '../icons';
import { FormReport, type ReplayState } from './FormReport';
import { CheckView, CountView, FormSourceView, fmtMs, GuardView, RecordsView, SourcesView } from './Inspectors';
import { diffNumbers, FUNDERS, guardActions, isForm, outputFor, type Output } from './model';
import { Pipeline, type Node, type Step } from './Pipeline';
import { Readable } from './Readable';
import { ReportPage } from './ReportPage';
import { RunCard } from './RunCard';
import { TraceContext } from './Traceable';
import { useWorkspace } from './useWorkspace';

type Pane = Step | 'sources';
const HASHES: Pane[] = ['form', 'agent', 'records', 'check', 'count', 'guard'];
const ORG = sample.orgName.replace(' (sample)', '');

/** Wide screens show the inspector beside the report; narrower ones open it as a sheet. */
function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 72rem)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

export function Workspace() {
  const ws = useWorkspace();
  const { b, periodId, funderId } = ws;
  const wide = useWide();
  const period = periodById(periodId);
  const form = isForm(funderId) ? runById(funderId) : null;

  const [pane, setPane] = useState<Pane>('agent');
  const [sheet, setSheet] = useState(false);
  const closeSheet = useCallback(() => setSheet(false), []);
  // The first visit replays the run once, unless a link asked for a step.
  const [autoplay, setAutoplay] = useState(false);
  useEffect(() => setAutoplay(!window.location.hash), []);
  const [traceRef, setTraceRef] = useState<TraceRef | null>(null);
  const [event, setEvent] = useState<RunEvent | null>(null);
  const [replayT, setReplayT] = useState<number | null>(null);
  const [litItems, setLitItems] = useState<string[] | null>(null);
  const [focusItems, setFocusItems] = useState<string[] | null>(null);
  const [why, setWhy] = useState<{ item: FormItem; field: FormField } | null>(null);
  const backTo = useRef<Pane>('agent');
  // Side by side: a second funder's report from the same build.
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const second = useMemo(() => (compareWith ? outputFor(b, compareWith, ws.staff) : null), [b, compareWith, ws.staff]);
  const prevSecond = useRef<{ id: string | null; out: Output | null; receipt: number }>({ id: null, out: null, receipt: 0 });
  const [secondChanged, setSecondChanged] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const p = prevSecond.current;
    const rid = ws.receipt?.id ?? 0;
    if (second && p.out && p.id === compareWith && rid !== p.receipt) setSecondChanged(new Map(diffNumbers(p.out, second).map((c) => [c.key, c.before])));
    else if (p.id !== compareWith) setSecondChanged(new Map());
    prevSecond.current = { id: compareWith, out: second, receipt: rid };
  }, [second, compareWith, ws.receipt]);

  const open = useCallback(
    (p: Pane) => {
      setPane(p);
      setCompareWith(null);
      if (!wide) setSheet(true);
      if (HASHES.includes(p) && window.location.hash !== `#${p}`) history.replaceState(null, '', `#${p}`);
    },
    [wide],
  );

  // Step links (#check, #records, #guard...) open their step, on load and on any later hash change; #report scrolls to the report.
  useEffect(() => {
    const go = () => {
      const h = window.location.hash.slice(1);
      if ((HASHES as string[]).includes(h)) {
        setPane(h as Pane);
        setCompareWith(null);
        if (window.matchMedia('(max-width: 71.99rem)').matches) setSheet(true);
      } else if (h === 'report') {
        requestAnimationFrame(() => document.querySelector('[data-report]')?.scrollIntoView({ block: 'start' }));
      }
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []);

  /** Another funder: its run starts fresh. */
  const switchFunder = (id: string) => {
    ws.setFunderId(id);
    setEvent(null);
    setFocusItems(null);
    setWhy(null);
    setReplayT(null);
    if (!isForm(id) && pane === 'form') setPane('agent');
    if (id === compareWith) setCompareWith(null);
  };


  const openTrace = useCallback(
    (ref: TraceRef) => {
      if (pane !== 'sources') backTo.current = pane;
      setTraceRef(ref);
      open('sources');
    },
    [pane, open],
  );

  // Change marks on the numbers the last edit or answer moved.
  const changed = useMemo(() => new Map((ws.receipt?.changes ?? []).map((c) => [c.key, c.before])), [ws.receipt]);
  const trace = useMemo(() => ({ activeKey: pane === 'sources' && traceRef ? refKey(traceRef) : null, changed, version: ws.receipt?.id ?? 0, open: openTrace }), [pane, traceRef, changed, ws.receipt, openTrace]);

  const actions = guardActions(b.output);
  // Timings are measured in this browser, so the static HTML has none; they appear once the page runs here.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const t = mounted ? b.timings : { records: NaN, check: NaN, count: NaN, report: NaN };
  const open_ = b.findings.filter((f) => needsAnswer(f) && !ws.snap.answers[f.id]).length;
  const edited = Object.keys(ws.snap.edits).length;
  const counts = b.output.kind === 'form' ? b.output.form.counts : null;
  const forYou = counts ? counts.forStaff - counts.staffDone : 0;

  const replayDone = useMemo(() => {
    if (!form || replayT === null) return null;
    return form.items.filter((i) => form.events.some((e) => ((e.detail.items as string[] | undefined) ?? []).includes(i.id)) && Math.max(...form.events.filter((e) => ((e.detail.items as string[] | undefined) ?? []).includes(i.id)).map((e) => e.end)) <= replayT).length;
  }, [form, replayT]);

  const nodes: Record<Step, Node> = {
    form: form
      ? { id: 'form', label: "Funder's form", stat: `${form.form.pages} ${form.form.pages === 1 ? 'page' : 'pages'} · ${form.totals.questions} questions` }
      : { id: 'form', label: 'Template', stat: 'Example, built by hand' },
    agent: form
      ? { id: 'agent', label: 'Agent maps the form', stat: `${form.totals.model_calls} model calls · ${form.totals.tool_calls} tool calls`, time: fmtSeconds(form.duration_ms) }
      : { id: 'agent', label: 'Agent', stat: 'Drafted the summary once' },
    records: { id: 'records', label: 'Records', stat: `${b.ds.engagements.length} rows${edited ? ` · ${edited} edited` : ` · ${sample.participants.length} people`}`, time: fmtMs(t.records) },
    check: { id: 'check', label: 'Gap check', stat: open_ ? <><span>{b.findings.length} found · </span><span className="text-orange-ink">{open_} open</span></> : `${b.findings.length} found · all answered`, time: fmtMs(t.check) },
    count: { id: 'count', label: 'Count', stat: `${Object.keys(b.figures.metrics).length} metrics`, time: fmtMs(t.count) },
    guard: { id: 'guard', label: 'Fill + privacy guard', stat: `${actions.length} hidden · no names`, time: fmtMs(t.report) },
    report: replayDone !== null ? { id: 'report', label: 'Report', stat: `${replayDone} of ${form?.items.length} questions in` } : { id: 'report', label: 'Report', stat: counts ? (forYou ? <>{counts.fromRecords} filled · <span className="text-orange-ink">{forYou}</span> for staff</> : `${counts.fromRecords} filled · staff done`) : 'Every field filled' },
  };

  const replay: ReplayState | null = useMemo(() => {
    if (!form || replayT === null) return null;
    const doneAt = new Map<string, number>();
    for (const e of form.events) for (const id of (e.detail.items as string[] | undefined) ?? []) doneAt.set(id, Math.max(doneAt.get(id) ?? 0, e.end));
    const readAt = Math.max(...form.events.filter((e) => e.lane === 'Read form').map((e) => e.end));
    return { t: replayT, doneAt, readAt };
  }, [form, replayT]);

  /** Why the agent answered a field: looked up in the run of the report that was clicked, which becomes the one on screen. */
  const onWhy = (run: FormRun, itemId: string, fieldId: string) => {
    const item = run.items.find((i) => i.id === itemId);
    const field = item?.fields.find((f) => f.id === fieldId);
    if (!item || !field) return;
    if (run.form.id !== funderId) ws.setFunderId(run.form.id);
    setReplayT(null);
    setWhy({ item, field });
    const ev = run.events.find((e) => e.kind === 'llm' && ((e.detail.items as string[] | undefined) ?? []).includes(itemId));
    setEvent(ev ?? null);
    setFocusItems([itemId]);
    open('agent');
  };

  /** A question picked on the form's source: open it if it's folded away, scroll to it and flash it. */
  const pickQuestion = (id: string) => {
    const el = document.getElementById(`q-${id}`);
    if (!el) return;
    const fold = el.closest('details');
    if (fold) fold.open = true;
    if (!wide) setSheet(false);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
      const tint = getComputedStyle(document.documentElement).getPropertyValue('--color-mah-tint');
      el.animate([{ backgroundColor: tint }, { backgroundColor: 'transparent' }], { duration: still ? 1 : 1400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    });
  };

  const inspector = (() => {
    if (pane === 'sources' && traceRef) return <SourcesView ws={ws} traceRef={traceRef} periodId={periodId} onBack={() => open(backTo.current)} />;
    if (pane === 'records') return <RecordsView ws={ws} range={{ start: period.start, end: period.end }} />;
    if (pane === 'check') return <CheckView ws={ws} ms={t.check} />;
    if (pane === 'count') return <CountView ws={ws} ms={t.count} period={period} />;
    if (pane === 'guard') return <GuardView ws={ws} actions={actions} ms={t.report} />;
    if (pane === 'form' && form) return <FormSourceView run={form} onPick={pickQuestion} />;
    if (form) {
      return (
        <div className="space-y-3">
          {why && <WhyNote item={why.item} field={why.field} onClose={() => setWhy(null)} />}
          <RunCard
            run={form}
            litItems={litItems}
            selected={event}
            onSelect={(e) => {
              setEvent(e);
              setWhy(null);
            }}
            replayT={replayT}
            onReplay={(t) => {
              setReplayT(t);
              if (t !== null) setAutoplay(false);
            }}
            onFocusItems={setFocusItems}
            autoplay={autoplay}
          />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <ExampleNote id={funderId as TemplateId} />
        <RecordsView ws={ws} range={{ start: period.start, end: period.end }} />
      </div>
    );
  })();

  const render = (out: Output, id: string, live: boolean) =>
    out.kind === 'form' ? (
      <FormReport
        filled={out.form}
        period={period}
        orgName={ORG}
        replay={live ? replay : null}
        focusItems={live && pane === 'agent' ? (litItems ? null : focusItems) : null}
        onHoverItem={(i) => live && setLitItems(i ? [i] : null)}
        onStaff={ws.answerStaff}
        onWhy={(itemId, fieldId) => onWhy(out.form.run, itemId, fieldId)}
      />
    ) : (
      <ReportPage report={out.report} template={templateById(id as TemplateId)} />
    );
  const report = render(b.output, funderId, true);
  const comparing = wide && compareWith !== null && second !== null;
  const modal = !wide && sheet;

  return (
    <TraceContext.Provider value={trace}>
      {/* While the phone sheet is open, the page behind it can't take focus. */}
      <div className="flex min-h-dvh flex-col" inert={modal}>
        <AppHeader />
        <section aria-label="Organization, period and funder" className="no-print border-b border-line bg-surface">
          <div className="mx-auto max-w-[1480px] px-4 pb-3 pt-3 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <p className="font-serif text-[20px] font-semibold leading-tight tracking-[-0.01em]">{ORG}</p>
                <p className="eyebrow mt-0.5 flex flex-wrap gap-x-1.5">
                  <span className="text-mah">Sample data</span>
                  <span aria-hidden>·</span>
                  <span>{period.range}</span>
                </p>
              </div>
              <div className="seg" role="group" aria-label="Period">
                {PERIODS.map((p) => (
                  <button key={p.id} type="button" aria-pressed={p.id === periodId} onClick={() => ws.setPeriodId(p.id)}>
                    {p.short}
                  </button>
                ))}
              </div>
            </div>
            <FunderTabs
              value={funderId}
              onChange={switchFunder}
              compare={wide ? compareWith !== null : null}
              onCompare={() => setCompareWith(compareWith ? null : FUNDERS.find((f) => f.id !== funderId)!.id)}
            />
          </div>
        </section>

        <div className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-10 pt-4 sm:px-6">
          <section aria-label="Pipeline" className="no-print">
            <Pipeline nodes={nodes} selected={comparing || pane === 'sources' || pane === 'report' ? null : pane} onSelect={(s) => {
                if (s === 'report') document.querySelector('[data-report]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                else {
                  setCompareWith(null);
                  open(s);
                }
              }} pulse={ws.receipt?.id ?? 0} />
          </section>

          {comparing ? (
            <div className="print-flat mt-4 grid grid-cols-2 gap-5">
              <main id="main" className="print-root print-flat min-w-0">
                {report}
              </main>
              <div className="print-flat min-w-0">
                <div className="no-print mb-2 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
                    Beside it
                    <select className="field-select" value={compareWith!} onChange={(e) => setCompareWith(e.target.value)}>
                      {FUNDERS.filter((f) => f.id !== funderId).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.short}
                          {f.kind === 'example' ? ' (example)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="text-[12.5px] text-muted">Same records, their format.</span>
                </div>
                <TraceContext.Provider value={{ ...trace, changed: secondChanged }}>{render(second!, compareWith!, false)}</TraceContext.Provider>
              </div>
            </div>
          ) : (
          <div className="mt-4 grid gap-5 min-[72rem]:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
            {wide ? (
              <aside className="no-print scroll-y sticky top-4 max-h-[calc(100dvh-2rem)] self-start pb-2 pr-1" aria-label="Inspector">
                {inspector}
              </aside>
            ) : (
              form && (
                <div className="no-print">
                  <RunCard run={form} litItems={null} selected={null} onSelect={() => {}} replayT={null} onReplay={() => {}} onFocusItems={() => {}} compact onExpand={() => open('agent')} />
                </div>
              )
            )}
            <main id="main" className="print-root min-w-0">
              {report}
            </main>
          </div>
          )}
        </div>

        <footer className="no-print mx-auto w-full max-w-[1480px] px-4 pb-6 text-[12px] text-faint sm:px-6">
          Sample data. Not made or endorsed by Philantrix or any funder shown.
        </footer>
      </div>
      {modal && <Sheet onClose={closeSheet}>{inspector}</Sheet>}
    </TraceContext.Provider>
  );
}

function FunderTabs({ value, onChange, compare, onCompare }: { value: string; onChange: (id: string) => void; compare: boolean | null; onCompare: () => void }) {
  const real = FUNDERS.filter((f) => f.kind === 'form');
  const examples = FUNDERS.filter((f) => f.kind === 'example');
  const tab = (f: (typeof FUNDERS)[number]) => (
    <button
      key={f.id}
      type="button"
      role="tab"
      aria-selected={f.id === value}
      onClick={() => onChange(f.id)}
      className={`relative -mb-px whitespace-nowrap border-b-2 px-1 pb-2 pt-2.5 text-[13.5px] font-semibold transition-colors duration-150 ${f.id === value ? 'border-mah text-ink' : 'border-transparent text-muted hover:text-ink'}`}
    >
      {f.short}
    </button>
  );
  return (
    <div className="-mb-3 mt-2 flex items-end gap-x-5">
      <div className="flex min-w-0 flex-1 items-end gap-x-5 overflow-x-auto [scrollbar-width:none] max-md:[mask-image:linear-gradient(to_right,black_82%,transparent)]" role="tablist" aria-label="Funder">
        <span role="presentation" className="shrink-0 pb-2.5 text-[12px] font-semibold text-faint">Real forms</span>
        {real.map(tab)}
        <span aria-hidden className="mb-3 h-4 w-px shrink-0 bg-line-strong" />
        <span role="presentation" className="shrink-0 pb-2.5 text-[12px] font-semibold text-faint">Examples</span>
        {examples.map(tab)}
      </div>
      {compare !== null && (
        <button type="button" onClick={onCompare} aria-pressed={compare} className={`btn mb-1.5 shrink-0 !min-h-7 !px-2.5 text-[12.5px] ${compare ? 'btn-primary' : 'btn-quiet'}`}>
          <CompareIcon /> Side by side
        </button>
      )}
    </div>
  );
}

function CompareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <rect x="2" y="3" width="5" height="10" rx="1.2" />
      <rect x="9" y="3" width="5" height="10" rx="1.2" />
    </svg>
  );
}

function WhyNote({ item, field, onClose }: { item: FormItem; field: FormField; onClose: () => void }) {
  const verdicts = field.history.filter((h) => h.step === 'review');
  const checks = field.history.filter((h) => h.step === 'check');
  const name = (id: string) => {
    const f = item.fields.find((x) => x.id === id);
    return f ? fieldName(item, f) : id;
  };
  const answer =
    field.answer === 'metric'
      ? `Mapped to ${METRICS[field.metric!]?.label.toLowerCase() ?? field.metric}${field.age_range ? `, age ${field.age_range}` : ''}.`
      : field.answer === 'formula'
        ? `Worked out: ${field.formula?.of.map(name).join(` ${OP_WORD[field.formula.op]} `)}.`
        : field.answer === 'draft'
          ? 'Drafted from the records, numbers as slots.'
          : field.answer === 'ask'
            ? 'Left for a person.'
            : 'Not in the records.';
  return (
    <div className="fade-in rounded-xl border border-line bg-surface px-4 py-3 text-[13px]" role="region" aria-label="Why the agent answered this way">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{fieldName(item, field)}</p>
        <button type="button" onClick={onClose} className="-mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
          <CloseIcon className="size-3.5" />
        </button>
      </div>
      <p className="mt-1 text-muted">&ldquo;{field.quote}&rdquo;</p>
      <p className="mt-1.5">
        <b className="font-semibold">{answer}</b> <Readable text={field.reason} />
      </p>
      {checks.map((c, i) => (
        <p key={i} className="mt-1 text-[12.5px] text-orange-ink">
          Code check: <Readable text={c.problems?.join('; ') ?? ''} />
        </p>
      ))}
      {verdicts.map((v, i) => (
        <p key={i} className={`mt-1 text-[12.5px] ${v.verdict === 'pass' ? 'text-green-ink' : 'text-orange-ink'}`}>
          Review call {v.verdict === 'pass' ? 'passed it' : 'rejected it'}: <Readable text={v.reason ?? ''} />
        </p>
      ))}
    </div>
  );
}

function ExampleNote({ id }: { id: TemplateId }) {
  return (
    <div className="rounded-2xl bg-mah px-5 py-4 text-on-mah">
      <p className="eyebrow !text-on-mah-muted">{templateById(id).short}: example template</p>
      <p className="mt-1.5 text-[13.5px] leading-snug">
        Built by hand, so there&apos;s no agent run. Claude wrote its summary once, with a slot for every number; code fills them live.
      </p>
    </div>
  );
}

/** Phones: an inspector in a bottom sheet. Focus moves into it on open and back to where it was on close. */
function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      root.style.overflow = was;
      back?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <div aria-hidden className="no-print fixed inset-0 z-30 bg-ink/30" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Inspector" className="no-print sheet-in fixed inset-x-0 bottom-0 z-40 flex max-h-[86dvh] flex-col rounded-t-2xl bg-canvas shadow-[0_-12px_40px_-12px_oklch(20.5%_0.006_29/0.3)]">
        <div className="flex justify-end px-2 pt-2">
          <button ref={close} type="button" onClick={onClose} className="grid size-11 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="scroll-y min-h-0 flex-1 px-4 pb-8">{children}</div>
      </div>
    </>
  );
}
