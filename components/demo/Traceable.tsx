'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { refKey, type TraceRef } from '@/lib/report';

interface TraceCtx {
  activeKey: string | null;
  changed: Set<string>;
  open: (ref: TraceRef, el: HTMLElement) => void;
}

export const TraceContext = createContext<TraceCtx>({ activeKey: null, changed: new Set(), open: () => {} });

/** Any number on the report. Opens the staff view of how it was counted. */
export function T({ r, children, className = '', changeKeys, label }: { r: TraceRef; children: ReactNode; className?: string; changeKeys?: string[]; label?: string }) {
  const { activeKey, changed, open } = useContext(TraceContext);
  const key = refKey(r);
  const isChanged = (changeKeys ?? [key]).some((k) => changed.has(k));
  return (
    <button
      type="button"
      className={`trace ${isChanged ? 'changed' : ''} ${className}`}
      aria-expanded={activeKey === key}
      aria-controls={activeKey === key ? 'trace-panel' : undefined}
      aria-label={label}
      onClick={(e) => open(r, e.currentTarget)}
    >
      {children}
    </button>
  );
}

export const useTraceContext = () => useContext(TraceContext);
