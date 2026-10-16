'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fieldName, fmtSeconds, lanes as laneList, peakParallel, type FormRun, type RunEvent } from '@/lib/forms';
import { BackIcon, ForwardIcon } from '../icons';
import { Readable } from './Readable';

const LABEL_W = 70;
const BAR = 14;
const AXIS = 22;
/** Drawing order: steps and calls underneath, checks and verdicts on top, so a check that lands on a step can still be clicked. */
const LAYER: Record<RunEvent['kind'], number> = { step: 0, llm: 1, tool: 2, check: 3, gate: 4 };
/** A replay lasts about this long, whatever the run's length. */
const REPLAY_MS = 10_000;

interface Props {
  run: FormRun;
  /** Questions the report is pointing at (hovered), to light their events. */
  litItems: string[] | null;
  selected: RunEvent | null;
  onSelect: (e: RunEvent | null) => void;
  replayT: number | null;
  onReplay: (t: number | null) => void;
  onFocusItems: (items: string[] | null) => void;
  /** Phones: the lanes only, and a tap opens the full run. */
  compact?: boolean;
  onExpand?: () => void;
  /** Plays the recorded run once when the card first shows. */
  autoplay?: boolean;
}

const stamp = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const items = (e: RunEvent): string[] => (Array.isArray(e.detail.items) ? (e.detail.items as string[]) : []);

/** The recorded agent run: one lane per worker, every model call, tool call, check and review on a shared clock. */
export function RunCard({ run, litItems, selected, onSelect, replayT, onReplay, onFocusItems, compact = false, onExpand, autoplay = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lanes = useMemo(() => laneList(run), [run]);
  const ROW = width < 420 ? 24 : 30;
  const peak = useMemo(() => peakParallel(run), [run]);
  const dur = run.duration_ms;
  const track = width - LABEL_W;
  const x = (ms: number) => LABEL_W + (ms / dur) * track;
  const height = AXIS + lanes.length * ROW + 4;
  const t = run.totals;
  // Code checks and the review call are counted apart: a check fails, a review rejects answers.
  const failed = run.events.filter((e) => e.kind === 'check' && e.status === 'fail').length;
  const rejected = run.events.filter((e) => e.kind === 'gate' && e.status === 'fail').reduce((n, e) => n + ((e.detail.rejected as string[] | undefined)?.length ?? 0), 0);

  // Replay: a playhead runs over the recorded clock. Reading the form is one long call, so it plays
  // faster than the workers do; the panel says both speeds.
  const raf = useRef<number | null>(null);
  const readEnd = useMemo(() => Math.max(0, ...run.events.filter((e) => e.lane === 'Read form').map((e) => e.end)), [run]);
  const READ_MS = 2_500;
  const readSpeed = Math.max(1, Math.round(readEnd / READ_MS));
  const speed = Math.max(1, Math.round((dur - readEnd) / (REPLAY_MS - READ_MS)));
  const toRun = (ms: number) => (ms * readSpeed < readEnd ? ms * readSpeed : readEnd + (ms - readEnd / readSpeed) * speed);
  const toWall = (t: number) => (t < readEnd ? t / readSpeed : readEnd / readSpeed + (t - readEnd) / speed);
  const play = (from = 0) => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onReplay(null);
      return;
    }
    const begin = performance.now() - toWall(from);
    const tick = (now: number) => {
      const at = toRun(now - begin);
      if (at >= dur) {
        raf.current = null;
        onReplay(null);
        return;
      }
      onReplay(at);
      raf.current = requestAnimationFrame(tick);
    };
    onSelect(null);
    raf.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    onReplay(null);
  };
  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);
  // First visit: the run plays once by itself, a moment after the page settles.
  useEffect(() => {
    if (!autoplay || compact) return;
    const t = window.setTimeout(() => play(0), 600);
    return () => window.clearTimeout(t);
  }, [autoplay]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new form stops the old replay.
  useEffect(() => stop, [run.form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [hover, setHover] = useState<RunEvent | null>(null);
  // The detail can open on a default event; only a hover or a click dims the rest.
  const [picked, setPicked] = useState(false);
  useEffect(() => setPicked(false), [run.form.id]);
  const focus = hover ?? (picked ? selected : null);
  const lit = (e: RunEvent) => {
    if (focus) return e.id === focus.id || e.detail.parent === focus.id;
    if (litItems) return items(e).some((i) => litItems.includes(i)) || (e.kind === 'tool' && items(run.events.find((p) => p.id === e.detail.parent) ?? e).some((i) => litItems.includes(i)));
    return true;
  };
  const anyLit = !!focus || !!litItems;
  const visible = (e: RunEvent) => replayT === null || e.start <= replayT;

  const ticks = useMemo(() => {
    // At least about 48px between labels.
    const step = [5_000, 10_000, 15_000, 30_000, 60_000, 120_000].find((st) => (st / dur) * track >= 48) ?? 120_000;
    const out: number[] = [];
    for (let s = 0; s <= dur; s += step) out.push(s);
    return out;
  }, [dur, track]);

  // Every mark but tool calls, in time order, for stepping through the run.
  const order = useMemo(() => run.events.filter((x) => x.kind !== 'tool').sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)), [run]);
  const step = (d: 1 | -1) => {
    if (!selected) return;
    const at = order.findIndex((x) => x.id === (selected.kind === 'tool' ? selected.detail.parent : selected.id));
    const next = order[at + d];
    if (next) pick(next);
  };

  const pick = (e: RunEvent | null) => {
    setPicked(e !== null);
    onSelect(e);
    onFocusItems(e ? items(e.kind === 'tool' ? (run.events.find((p) => p.id === e.detail.parent) ?? e) : e) : null);
  };

  return (
    <section aria-labelledby="run-title" className="rounded-2xl bg-mah text-on-mah">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4">
        <div className="min-w-0">
          <h2 id="run-title" className="eyebrow !text-on-mah-muted">
            Agent run <span className="font-medium normal-case tracking-normal text-on-mah-faint">· recorded {fmtDay(run.recorded_on)}</span>
          </h2>
          <p className="num mt-1.5 text-[13px] leading-snug text-on-mah-muted">
            <b className="font-semibold text-on-mah">{fmtSeconds(dur)}</b> · <b className="font-semibold text-on-mah">{peak}</b> workers at once · <b className="font-semibold text-on-mah">{t.model_calls}</b> model calls ·{' '}
            <b className="font-semibold text-on-mah">{t.tool_calls}</b> tool calls · <b className="font-semibold text-on-mah">{t.checks}</b> checks
            {failed > 0 && (
              <>
                , <b className="font-semibold text-orange-on-mah">{failed} failed</b>
              </>
            )}
            {rejected > 0 && (
              <>
                {' '}· review rejected <b className="font-semibold text-orange-on-mah">{rejected}</b>
              </>
            )}
          </p>
        </div>
        {compact ? null : replayT === null ? (
          <button type="button" onClick={() => play()} className="btn !min-h-8 border border-mah-line bg-mah-well text-on-mah hover:border-on-mah-faint">
            <PlayIcon /> Replay
          </button>
        ) : (
          <button type="button" onClick={stop} className="btn !min-h-8 border border-mah-line bg-mah-well text-on-mah hover:border-on-mah-faint">
            <span aria-hidden className="size-2.5 rounded-[2px] bg-on-mah" /> Stop
          </button>
        )}
      </div>

      <div ref={wrap} className="relative mt-3 px-5">
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" role="img" aria-label={`Timeline of the recorded run: ${lanes.length} lanes over ${fmtSeconds(dur)}`} onMouseLeave={() => setHover(null)}>
          <rect
            x={LABEL_W}
            y={0}
            width={track}
            height={AXIS - 4}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              play(Math.max(0, ((e.clientX - r.left) / r.width) * dur));
            }}
          >
            <title>Replay from here</title>
          </rect>
          {ticks.map((s) => (
            <g key={s}>
              <line x1={x(s)} x2={x(s)} y1={AXIS - 6} y2={height} className="stroke-mah-line" strokeWidth={1} />
              <text x={x(s) + 3} y={10} className="num pointer-events-none fill-on-mah-faint text-[10.5px] font-semibold">
                {s === 0 ? '0:00' : stamp(s)}
              </text>
            </g>
          ))}
          {lanes.map((lane, li) => {
            const y = AXIS + li * ROW;
            const mid = y + ROW / 2;
            return (
              <g key={lane.id}>
                <text x={0} y={mid + 4} className="fill-on-mah-muted text-[11.5px] font-semibold">
                  {lane.id}
                </text>
                <line x1={LABEL_W} x2={width} y1={mid} y2={mid} className="stroke-mah-line" strokeWidth={1} strokeDasharray="2 4" />
                {lane.events.filter(visible).sort((a, b) => LAYER[a.kind] - LAYER[b.kind]).map((e) => {
                  const on = !anyLit || lit(e);
                  const cut = replayT !== null && e.end > replayT ? replayT : e.end;
                  const common = {
                    opacity: on ? 1 : 0.35,
                    'data-event': e.id,
                    onMouseEnter: () => setHover(e),
                    onClick: () => (compact ? onExpand?.() : pick(selected?.id === e.id ? null : e)),
                    style: { cursor: 'pointer' },
                  };
                  const sel = selected?.id === e.id;
                  if (e.kind === 'llm') {
                    const review = e.label.startsWith('Review');
                    const w = Math.max(3, x(cut) - x(e.start));
                    return (
                      <g key={e.id} {...common}>
                        <rect x={x(e.start)} y={mid - BAR / 2} width={w} height={BAR} rx={3} className={review ? 'fill-mah-well stroke-on-mah-muted' : 'fill-on-mah'} strokeWidth={review ? 1.25 : 0} />
                        {sel && <rect x={x(e.start) - 2.5} y={mid - BAR / 2 - 2.5} width={w + 5} height={BAR + 5} rx={5} fill="none" className="stroke-on-mah" strokeWidth={1.5} />}
                      </g>
                    );
                  }
                  if (e.kind === 'tool') {
                    return <line key={e.id} {...common} x1={x(e.start)} x2={x(e.start)} y1={mid - BAR / 2 + 2} y2={mid + BAR / 2 - 2} className="stroke-mah" strokeWidth={1.6} />;
                  }
                  if (e.kind === 'check') {
                    const fail = e.status === 'fail';
                    return (
                      <g key={e.id} {...common}>
                        <circle cx={x(e.start) + 4} cy={mid} r={4.5} className={fail ? 'fill-orange-on-mah' : 'fill-green-on-mah'} />
                        {fail && <path d={`M${x(e.start) + 2} ${mid - 2}l4 4m0 -4l-4 4`} className="stroke-mah" strokeWidth={1.4} />}
                        {sel && <circle cx={x(e.start) + 4} cy={mid} r={7.5} fill="none" className="stroke-on-mah" strokeWidth={1.5} />}
                      </g>
                    );
                  }
                  if (e.kind === 'gate') {
                    const fail = e.status === 'fail';
                    const cx = x(e.start) + 5;
                    return (
                      <g key={e.id} {...common}>
                        <path d={`M${cx} ${mid - 5.5}l5.5 5.5l-5.5 5.5l-5.5 -5.5z`} className={fail ? 'fill-orange-on-mah' : 'fill-green-on-mah'} />
                        {sel && <circle cx={cx} cy={mid} r={8.5} fill="none" className="stroke-on-mah" strokeWidth={1.5} />}
                      </g>
                    );
                  }
                  return <rect key={e.id} {...common} x={x(e.start)} y={mid - 3} width={6} height={6} rx={1} className="fill-on-mah-muted" />;
                })}
              </g>
            );
          })}
          {replayT !== null && <line x1={x(replayT)} x2={x(replayT)} y1={AXIS - 8} y2={height} className="stroke-orange-on-mah" strokeWidth={1.5} />}
        </svg>
        {hover && !selected && <Tip e={hover} run={run} x={(x(hover.start) / width) * 100} y={((AXIS + lanes.findIndex((l) => l.id === hover.lane) * ROW) / height) * 100} />}
      </div>

      {compact ? (
        <button type="button" onClick={onExpand} className="mt-2 flex w-full items-center justify-between rounded-b-2xl border-t border-mah-line bg-mah-well px-5 py-3 text-left text-[13px] font-semibold text-on-mah">
          Open the run: every call, tool and check <ForwardIcon className="size-3.5" />
        </button>
      ) : (
        <>
          <Legend />
          <div className="mt-3 rounded-b-2xl border-t border-mah-line bg-mah-well px-5 py-4" aria-live="polite">
            {replayT !== null ? (
              <p className="num text-[13px] text-on-mah-muted">
                Replay of the recorded run · {replayT < readEnd ? `reading at ${readSpeed}×` : `mapping at ${speed}×`} · <b className="font-semibold text-on-mah">{stamp(replayT)}</b> of {stamp(dur)}
              </p>
            ) : selected ? (
              <Detail e={selected} run={run} onClose={() => pick(null)} onStep={step} />
            ) : (
              <p className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-on-mah-muted">
                Click a mark for its inputs and verdict.
                <button type="button" onClick={() => pick(order[0])} className="font-semibold text-on-mah hover:underline">
                  Step through
                </button>
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Legend() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-5 text-[11.5px] text-on-mah-muted" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-4 rounded-[2px] bg-on-mah" /> model call
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-4 rounded-[2px] border border-on-mah-muted" /> review
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="relative h-2.5 w-4 rounded-[2px] bg-on-mah">
          <span className="absolute inset-y-[2px] left-[7px] w-[1.6px] bg-mah" />
        </span>
        tool call
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full bg-green-on-mah" /> check passed
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full bg-orange-on-mah" /> rejected
      </li>
    </ul>
  );
}

function Tip({ e, run, x, y }: { e: RunEvent; run: FormRun; x: number; y: number }) {
  const right = x > 58;
  const tools = run.events.filter((t) => t.detail.parent === e.id).length;
  return (
    <div
      className="pointer-events-none absolute z-20 w-max max-w-[16rem] rounded-md bg-surface px-2 py-1 text-[12px] leading-snug text-ink shadow-lg"
      style={{ left: right ? undefined : `calc(${x}% + 8px)`, right: right ? `calc(${100 - x}% + 8px)` : undefined, top: `calc(${y}% - 6px)` }}
    >
      <span className="font-semibold">{e.label}</span>
      <span className="num block text-muted">
        {e.lane} · {fmtSeconds(Math.max(1, e.end - e.start))}
        {tools > 0 && ` · ${tools} tool ${tools === 1 ? 'call' : 'calls'}`}
        {e.kind === 'check' && ` · ${e.status === 'fail' ? 'failed' : 'passed'}`}
      </span>
    </div>
  );
}

function fmtDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function Detail({ e, run, onClose, onStep }: { e: RunEvent; run: FormRun; onClose: () => void; onStep: (d: 1 | -1) => void }) {
  const tools = run.events.filter((t) => t.detail.parent === e.id);
  const parent = e.detail.parent ? run.events.find((p) => p.id === e.detail.parent) : null;
  const its = items(parent ?? e);
  const fields = run.items.filter((i) => its.includes(i.id)).flatMap((i) => i.fields);
  // A review call lists every verdict it gave; the gate after it, the rejections.
  const review = e.kind === 'llm' && e.label.startsWith('Review');
  const reviewNotes =
    e.kind === 'gate' || review
      ? fields.flatMap((f) => f.history.filter((h) => h.step === 'review' && (review || h.verdict === 'fail')).map((h, i) => ({ id: `${f.id}-${i}`, label: f.label, pass: h.verdict === 'pass', reason: h.reason ?? '' })))
      : [];
  return (
    <div className="fade-in text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-on-mah">{e.kind === 'tool' ? `Tool call: ${e.label}` : e.label}</p>
          <p className="num mt-0.5 text-[12px] text-on-mah-muted">
            {e.lane} · {e.end - e.start < 500 ? `at ${stamp(e.start)}` : `${stamp(e.start)} to ${stamp(e.end)} · ${fmtSeconds(e.end - e.start)}`}
            {e.kind === 'check' && ` · ran in ${((e.detail.micros ?? 0) / 1000).toFixed(1)} ms`}
            {e.kind === 'llm' && e.detail.tokens_in ? ` · ${e.detail.model} · ${e.detail.tokens_in.toLocaleString('en-US')} tokens in, ${e.detail.tokens_out?.toLocaleString('en-US')} out` : ''}
          </p>
        </div>
        <div className="-mr-1 flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => onStep(-1)} aria-label="Previous step" className="grid size-7 place-items-center rounded text-on-mah-muted hover:bg-mah hover:text-on-mah">
            <BackIcon className="size-3.5" />
          </button>
          <button type="button" onClick={() => onStep(1)} aria-label="Next step" className="grid size-7 place-items-center rounded text-on-mah-muted hover:bg-mah hover:text-on-mah">
            <ForwardIcon className="size-3.5" />
          </button>
          <button type="button" onClick={onClose} className="rounded px-1.5 py-0.5 text-[12px] font-semibold text-on-mah-muted hover:bg-mah hover:text-on-mah">
            Close
          </button>
        </div>
      </div>

      {its.length > 0 && (
        <p className="mt-2 text-[12px] text-on-mah-muted">
          {its.length === 1 ? 'Question' : 'Questions'}: <span className="num font-semibold text-on-mah">{its.map((i) => { const q = run.items.find((x) => x.id === i); return q?.number ?? q?.title ?? i; }).join(', ')}</span>
        </p>
      )}

      {e.kind === 'check' && (
        <div className="mt-2">
          {e.detail.problems?.length ? (
            <ul className="space-y-1">
              {e.detail.problems.slice(0, 6).map((p) => {
                const [where, what] = problemParts(p, run);
                return (
                  <li key={p} className="flex gap-2 leading-snug">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange-on-mah" />
                    <span className="text-on-mah">
                      {where && <b className="font-semibold">{where}: </b>}
                      <Readable text={what} chip="bg-mah text-on-mah-muted" />
                    </span>
                  </li>
                );
              })}
              {e.detail.problems.length > 6 && <li className="text-on-mah-muted">and {e.detail.problems.length - 6} more</li>}
            </ul>
          ) : (
            <p className="text-green-on-mah">{e.lane === 'Read form' ? 'Passed. Every quote is on the form, word for word.' : 'Passed. Code checked metric ids, units, age ranges, formulas and the wording rules.'}</p>
          )}
        </div>
      )}

      {reviewNotes.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {reviewNotes.slice(0, 6).map((n) => (
            <li key={n.id} className="flex gap-2 leading-snug">
              <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.pass ? 'bg-green-on-mah' : 'bg-orange-on-mah'}`} />
              <span>
                <span className={`font-semibold ${n.pass ? 'text-green-on-mah' : 'text-orange-on-mah'}`}>
                  {n.label}: {n.pass ? 'passed' : 'rejected'}.
                </span>{' '}
                <span className="text-on-mah">
                  <Readable text={n.reason} chip="bg-mah text-on-mah-muted" />
                </span>
              </span>
            </li>
          ))}
          {reviewNotes.length > 6 && <li className="text-on-mah-muted">and {reviewNotes.length - 6} more</li>}
        </ul>
      )}

      {e.kind === 'tool' && <ToolIO e={e} />}
      {tools.length > 0 && (
        <div className="mt-2.5">
          <p className="eyebrow !text-on-mah-faint">{tools.length} tool {tools.length === 1 ? 'call' : 'calls'}</p>
          <ul className="mt-1 space-y-1.5">
            {tools.map((tc) => (
              <li key={tc.id}>
                <ToolIO e={tc} compact />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** "q5.1: comparison word ..." as the field's name on the form and the problem. */
function problemParts(p: string, run: FormRun): [string | null, string] {
  const m = /^([\w.-]+): (.*)$/.exec(p);
  if (!m) return [null, p];
  for (const item of run.items) {
    if (item.id === m[1]) return [item.number ? `${item.number} ${item.title}` : item.title, m[2]];
    const fd = item.fields.find((f) => f.id === m[1]);
    if (fd) return [fieldName(item, fd), m[2]];
  }
  return [m[1], m[2]];
}

function ToolIO({ e, compact = false }: { e: RunEvent; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const args = e.detail.input && Object.keys(e.detail.input).length ? JSON.stringify(e.detail.input) : '';
  return (
    <div className="font-mono text-[11.5px] leading-snug">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-left text-on-mah hover:underline">
        {e.label}({args}) <span className="text-on-mah-faint">· {Math.max(1, e.end - e.start)} ms</span>
      </button>
      {open && e.detail.output && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-mah px-2.5 py-1.5 text-on-mah-muted">{e.detail.output}</pre>}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M3 1.8v8.4L10 6z" fill="currentColor" />
    </svg>
  );
}
