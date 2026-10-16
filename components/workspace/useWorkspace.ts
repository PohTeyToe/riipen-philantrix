'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Period } from '@/lib/data';
import { DEFAULT_SMALL_BELOW } from '@/lib/privacy';
import { build, DEFAULT_FUNDER, diffNumbers, type Change, type FunderId, type Snapshot } from './model';

/** What the last change did: its label, the numbers it moved, and how long the rebuild took. */
export interface Receipt {
  id: number;
  label: string;
  changes: Change[];
  ms: number;
}

const INITIAL: Snapshot = { edits: {}, answers: {}, smallBelow: DEFAULT_SMALL_BELOW };

export function useWorkspace() {
  const [snap, setSnap] = useState<Snapshot>(INITIAL);
  const [history, setHistory] = useState<{ snap: Snapshot; label: string }[]>([]);
  const [periodId, setPeriodId] = useState<Period['id']>('q3');
  const [funderId, setFunderId] = useState<FunderId>(DEFAULT_FUNDER);
  const [staff, setStaff] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const b = useMemo(() => build(snap, periodId, funderId, staff), [snap, periodId, funderId, staff]);

  // After a change to the data (not a switch of period or funder), list what moved.
  const pending = useRef<string | null>(null);
  const prev = useRef({ b, periodId, funderId });
  const seq = useRef(0);
  useEffect(() => {
    const label = pending.current;
    pending.current = null;
    const same = prev.current.periodId === periodId && prev.current.funderId === funderId;
    if (label !== null && same) {
      const t = b.timings;
      setReceipt({ id: ++seq.current, label, changes: diffNumbers(prev.current.b.output, b.output), ms: t.records + t.check + t.count + t.report });
    } else if (!same) {
      setReceipt(null);
    }
    prev.current = { b, periodId, funderId };
  }, [b, periodId, funderId]);

  const commit = useCallback(
    (next: Snapshot, label: string) => {
      pending.current = label;
      setHistory((h) => [...h, { snap, label }]);
      setSnap(next);
    },
    [snap],
  );

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    pending.current = `Undid: ${last.label}`;
    setHistory(history.slice(0, -1));
    setSnap(last.snap);
  }, [history]);

  const reset = useCallback(() => {
    if (snap === INITIAL) return;
    pending.current = 'Back to the logged records';
    setHistory([]);
    setSnap(INITIAL);
  }, [snap]);

  const answerStaff = useCallback((fieldId: string, text: string) => {
    setStaff((s) => ({ ...s, [fieldId]: text }));
  }, []);

  const changed = Object.keys(snap.edits).length > 0 || Object.keys(snap.answers).length > 0 || snap.smallBelow !== DEFAULT_SMALL_BELOW;

  return { snap, b, periodId, setPeriodId, funderId, setFunderId, staff, answerStaff, receipt, commit, undo, reset, canUndo: history.length > 0, changed };
}

export type Workspace = ReturnType<typeof useWorkspace>;
