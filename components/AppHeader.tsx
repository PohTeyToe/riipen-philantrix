'use client';

import { useEffect, useState } from 'react';
import { REPO_URL } from '@/lib/site';
import { CloseIcon } from './icons';

const BYLINE = "Built by Abdallah Safi for Philantrix's Level UP project.";

// 120 words at most, in total.
const HOW: [string, string][] = [
  ['Agent', "Claude read each funder's public form and listed its questions. Parallel workers mapped every field to the records with the engine's tools. Code checked each answer, a second model reviewed it, and rejects went back once, then to a person. Recorded Oct 16; this page replays it."],
  ['Numbers', 'Code in your browser counts every figure and rebuilds on every edit or answer. No model writes a number.'],
  ['Gaps', 'The check compares records with the schedule. Unanswered, a report counts only what was logged.'],
  ['Privacy', 'No names in funder copy. Small counts show as "<5", and so does anything that would reveal one.'],
  ['Data', 'A made-up mentorship org. Not made or endorsed by Philantrix or the funders.'],
];

export function AppHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="no-print border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1480px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <Mark />
        <div className="min-w-0 flex-1">
          <h1 className="text-[14px] font-semibold leading-tight tracking-[-0.01em] sm:text-[14.5px]">Quarter-end funder reports</h1>
          <p className="text-[12.5px] leading-tight text-muted max-sm:hidden">{BYLINE}</p>
        </div>
        <nav className="-mr-2 flex shrink-0 items-center text-[12.5px] font-semibold sm:text-[13px]">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="how-it-works"
            className={`rounded-md px-1.5 py-1.5 transition-colors duration-150 hover:bg-sunken sm:px-2.5 ${open ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'}`}
          >
            How it works
          </button>
          <a href={REPO_URL} className="rounded-md px-1.5 py-1.5 text-muted transition-colors duration-150 hover:bg-sunken hover:text-ink sm:px-2.5">
            Code
          </a>
        </nav>
      </div>
      <p className="-mt-1 px-4 pb-2.5 text-[12px] leading-tight text-muted sm:hidden">{BYLINE}</p>

      {open && (
        <section id="how-it-works" aria-label="How it works" className="fade-in border-t border-line bg-canvas">
          <div className="mx-auto max-w-[1480px] px-4 pb-5 pt-4 sm:px-6">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow">How it works</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="-mr-2 grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink">
                <CloseIcon />
              </button>
            </div>
            <dl className="mt-1 grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-5">
              {HOW.map(([term, text]) => (
                <div key={term}>
                  <dt className="text-[13px] font-semibold">{term}</dt>
                  <dd className="mt-0.5 max-w-[44ch] text-[13px] leading-[1.5] text-muted">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}
    </header>
  );
}

/** A plain report mark. Not Philantrix's logo. */
function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className="size-7 shrink-0 sm:size-8">
      <rect width="32" height="32" rx="8" fill="var(--color-mah)" />
      <path d="M10 22V15M16 22V10M22 22v-4" stroke="var(--color-mah-tint)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
