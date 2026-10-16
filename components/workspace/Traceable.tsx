'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { refKey, type TraceRef } from '@/lib/report';
import { WAITING } from './model';

interface TraceCtx {
  /** The number whose sources are open. */
  activeKey: string | null;
  /** Numbers the last change moved, with the value each had before. */
  changed: Map<string, string>;
  /** Restarts the change marks on every new change. */
  version: number;
  open: (ref: TraceRef) => void;
}

export const TraceContext = createContext<TraceCtx>({ activeKey: null, changed: new Map(), version: 0, open: () => {} });

/**
 * Any number on a report. Opens its sources: the rows it was counted from, lit
 * up on the register. inline: a number inside a sentence, which keeps the
 * sentence's spacing and marks a change without a label over the line above.
 */
export function T({ r, children, className = '', changeKey, label, inline = false }: { r: TraceRef; children: ReactNode; className?: string; changeKey?: string; label?: string; inline?: boolean }) {
  const { activeKey, changed, version, open } = useContext(TraceContext);
  const key = refKey(r);
  const was = changed.get(changeKey ?? key);
  return (
    <button
      type="button"
      className={`trace ${inline ? 'trace-inline' : ''} ${was !== undefined ? 'changed' : ''} ${className}`}
      aria-pressed={activeKey === key}
      aria-label={label}
      onClick={() => open(r)}
      key={was !== undefined ? `c${version}` : 'n'}
    >
      {children}
      {was !== undefined && !inline && (
        <span className="was" aria-hidden>
          was <s>{was}</s>
        </span>
      )}
    </button>
  );
}

/** A number that isn't traceable on its own (worked out from two others), with the same change mark. */
export function Changed({ children, changeKey, className = '' }: { children: ReactNode; changeKey: string; className?: string }) {
  const { changed, version } = useContext(TraceContext);
  const was = changed.get(changeKey);
  return (
    <span className={`relative ${was !== undefined ? 'changed rounded-[5px]' : ''} ${className}`} key={was !== undefined ? `c${version}` : 'n'}>
      {children}
      {was !== undefined && was !== WAITING && (
        <span className="was" aria-hidden>
          was <s>{was}</s>
        </span>
      )}
    </span>
  );
}
