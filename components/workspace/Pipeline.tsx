'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type Step = 'form' | 'agent' | 'records' | 'check' | 'count' | 'guard' | 'report';

export interface Node {
  id: Step;
  label: string;
  stat: ReactNode;
  /** Measured or recorded time. */
  time?: string;
}

interface Props {
  nodes: Record<Step, Node>;
  selected: Step | null;
  onSelect: (s: Step) => void;
  /** Bumps on every rebuild, so the live steps flash. */
  pulse: number;
}

const EDGES: [Step, Step][] = [
  ['form', 'agent'],
  ['records', 'check'],
  ['check', 'count'],
  ['agent', 'guard'],
  ['count', 'guard'],
  ['guard', 'report'],
];

const LIVE: Step[] = ['records', 'check', 'count', 'guard', 'report'];

/**
 * The whole system on one line: the funder's form goes through the agent, the
 * records go through the data check and the counts, and both meet at the
 * privacy guard before the report. Each step opens its inspector.
 */
export function Pipeline({ nodes, selected, onSelect, pulse }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<Partial<Record<Step, HTMLButtonElement | null>>>({});
  const [paths, setPaths] = useState<{ d: string; key: string }[]>([]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const base = el.getBoundingClientRect();
      const r = (s: Step) => {
        const n = refs.current[s];
        if (!n) return null;
        const b = n.getBoundingClientRect();
        return { l: b.left - base.left, r: b.right - base.left, t: b.top - base.top, b: b.bottom - base.top, cy: b.top - base.top + b.height / 2 };
      };
      const out: { d: string; key: string }[] = [];
      for (const [a, b] of EDGES) {
        const p = r(a);
        const q = r(b);
        if (!p || !q || q.l <= p.r) continue;
        const x1 = p.r + 3;
        const x2 = q.l - 5;
        if (Math.abs(p.cy - q.cy) < 2) out.push({ key: `${a}-${b}`, d: `M${x1} ${p.cy}H${x2}` });
        else {
          const mid = x1 + (x2 - x1) / 2;
          const y2 = q.cy + (p.cy < q.cy ? -8 : 8);
          out.push({ key: `${a}-${b}`, d: `M${x1} ${p.cy}H${mid - 6}Q${mid} ${p.cy} ${mid} ${p.cy + Math.sign(y2 - p.cy) * 6}V${y2 - Math.sign(y2 - p.cy) * 6}Q${mid} ${y2} ${mid + 6} ${y2}H${x2}` });
        }
      }
      setPaths(out);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const button = (s: Step, className = '') => {
    const n = nodes[s];
    const on = selected === s;
    const isAgent = s === 'agent';
    return (
      <button
        ref={(el) => {
          refs.current[s] = el;
        }}
        type="button"
        onClick={() => onSelect(s)}
        aria-pressed={on}
        className={`relative z-[1] flex min-w-0 rounded-[10px] border text-left transition-[background-color,border-color,box-shadow] duration-150 max-md:items-baseline max-md:gap-x-1.5 max-md:px-2.5 max-md:py-1.5 md:flex-col md:items-start md:px-3 md:py-2 ${
          on ? 'border-mah bg-mah-tint shadow-[inset_0_0_0_1px_var(--color-mah)]' : isAgent ? 'border-mah/45 bg-surface hover:border-mah' : 'border-line bg-surface hover:border-line-strong'
        } ${className}`}
      >
        <span className="flex items-baseline justify-between gap-2 md:w-full">
          <span className={`whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.07em] md:text-[11.5px] ${on || isAgent ? 'text-mah' : 'text-muted'}`}>{n.label}</span>
          {n.time && (
            <span key={LIVE.includes(s) ? pulse : 0} className={`num shrink-0 rounded px-0.5 text-[11px] font-medium text-faint max-md:hidden ${LIVE.includes(s) && pulse ? 'tick-flash' : ''}`}>
              {n.time}
            </span>
          )}
        </span>
        <span className="num text-[12.5px] font-semibold leading-snug md:mt-0.5 md:truncate md:text-[13px]">{n.stat}</span>
      </button>
    );
  };

  return (
    <div ref={box} className="relative">
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible max-md:hidden">
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1 1.2 6.6 4 1 6.8" fill="none" className="stroke-faint" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        {paths.map((p) => (
          <path key={p.key} d={p.d} fill="none" className="stroke-line-strong" strokeWidth={1.5} markerEnd="url(#arrow)" />
        ))}
      </svg>
      <nav aria-label="Pipeline" className="flex flex-wrap gap-1.5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,1.05fr)] md:gap-x-7 md:gap-y-2.5">
        {button('form', 'md:col-start-1 md:row-start-1')}
        {button('agent', 'md:col-span-2 md:col-start-2 md:row-start-1')}
        {button('records', 'md:col-start-1 md:row-start-2')}
        {button('check', 'md:col-start-2 md:row-start-2')}
        {button('count', 'md:col-start-3 md:row-start-2')}
        {button('guard', 'md:col-start-4 md:row-span-2 md:row-start-1 md:self-center')}
        {button('report', 'md:col-start-5 md:row-span-2 md:row-start-1 md:self-center')}
      </nav>
    </div>
  );
}
