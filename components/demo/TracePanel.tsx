'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { TraceView } from '@/lib/trace';
import { CloseIcon } from '../icons';

const FIRST_ROWS = 60;
const PHONE = '(width < 48rem)';

/** On phones the sheet covers the page, so it acts as a modal: focus stays inside. */
function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}

/**
 * Slides in from the right, and the report stays clickable beside it. On
 * phones it's a bottom sheet over a backdrop, and Tab cycles inside it.
 */
export function TracePanel({ view, onClose }: { view: TraceView; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [all, setAll] = useState(false);
  const phone = usePhone();

  // Moves focus itself, wrapping at either end, so Tab never reaches the page behind.
  const trapTab = (e: ReactKeyboardEvent) => {
    if (!phone || e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    e.preventDefault();
    const at = document.activeElement;
    const after = (el: HTMLElement) => !!at && (at.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const next = e.shiftKey ? [...items].reverse().find((el) => el !== at && !after(el)) ?? items[items.length - 1] : items.find((el) => el !== at && after(el)) ?? items[0];
    next.focus();
  };

  useEffect(() => {
    setAll(false);
    titleRef.current?.focus({ preventScroll: true });
  }, [view.title, view.scope]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = all ? view.rows : view.rows.slice(0, FIRST_ROWS);

  return (
    <>
      <div aria-hidden className="no-print fixed inset-0 z-30 bg-ink/25 md:hidden" onClick={onClose} />
      <aside
        ref={panelRef}
        id="trace-panel"
        role="dialog"
        aria-modal={phone}
        aria-labelledby="trace-title"
        onKeyDown={trapTab}
        className="no-print fixed inset-x-0 bottom-0 z-40 flex max-h-[84dvh] flex-col rounded-t-2xl bg-paper shadow-[0_-12px_40px_-12px_oklch(26%_0.03_265/0.35)] [animation:sheet-in_200ms_var(--ease-out-quint)_both] md:inset-x-auto md:right-0 md:top-0 md:max-h-none md:w-[min(500px,100vw)] md:rounded-none md:border-l md:border-rule md:shadow-[-16px_0_40px_-16px_oklch(26%_0.03_265/0.25)] md:[animation:panel-in_200ms_var(--ease-out-quint)_both]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-rule bg-desk/70 py-2 pl-5 pr-2 md:rounded-none max-md:rounded-t-2xl">
          <p className="text-[12.5px] font-semibold text-muted">Staff view. Names never appear in the funder copy.</p>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-md text-muted hover:bg-desk-deep hover:text-ink" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">
          <p className="text-[12.5px] text-muted">{view.scope}</p>
          <h2 id="trace-title" ref={titleRef} tabIndex={-1} className="mt-0.5 font-serif text-[21px] font-semibold leading-tight outline-none">
            {view.title}
          </h2>
          <p className="num mt-2 text-[34px] font-semibold leading-none tracking-[-0.02em]">{view.value}</p>
          {view.funderShows && (
            <div className="mt-3 rounded-md bg-accent-tint px-3 py-2 text-[13.5px] leading-snug text-accent-deep">
              <p className="font-semibold">
                The funder copy shows <span className="num">{view.funderShows}</span>
              </p>
              {view.staffNote && <p>{view.staffNote}</p>}
            </div>
          )}

          <h3 className="mt-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">How it's counted</h3>
          <p className="mt-1 text-[14px] leading-snug">{view.formula}</p>

          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">The arithmetic</h3>
          <div className="mt-1 space-y-1">
            {view.arithmetic.map((a) => (
              <p key={a} className="num text-[14px] leading-snug">{a}</p>
            ))}
          </div>

          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-y border-rule py-3 text-[13px]">
            {view.facts.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-muted">{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>

          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Rows behind it</h3>
          <p className="num mt-1 text-[13px] leading-snug text-muted">{view.rowsCaption}</p>
          {view.rows.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-md border border-rule">
              <table className="num w-full border-collapse text-[13px]">
                <thead className="sticky top-0">
                  <tr className="bg-desk text-left text-[11.5px] text-muted">
                    {view.columns.map((c, i) => (
                      <th key={c} scope="col" className={`whitespace-nowrap px-2.5 py-1.5 font-semibold ${view.numeric.includes(i) ? 'text-right' : ''}`}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t border-rule ${r.tone === 'absent' || r.tone === 'left' ? 'bg-absent text-muted' : ''} ${r.tone === 'duplicate' ? 'italic text-muted' : ''} ${r.tone === 'answered' ? 'bg-accent-tint/60' : ''}`}>
                      {r.cells.map((c, j) => (
                        <td key={j} className={`whitespace-nowrap px-2.5 py-1 ${view.numeric.includes(j) ? 'text-right' : ''}`}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {view.rows.length > FIRST_ROWS && !all && (
            <button type="button" className="btn btn-quiet mt-3" onClick={() => setAll(true)}>
              Show all {view.rows.length.toLocaleString('en-US')} rows
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
