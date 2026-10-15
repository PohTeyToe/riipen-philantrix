import { sample } from '@/lib/data';
import { CheckIcon } from '../icons';

export type Step = 'records' | 'check' | 'report';

const LABELS: Record<Step, string> = { records: 'Records', check: 'Check', report: 'Report' };

export function Steps({ step, onGo, toAnswer }: { step: Step; onGo: (s: Step) => void; toAnswer: number }) {
  return (
    <header className="no-print border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-x-10 gap-y-1 px-4 pt-3 sm:flex-row sm:items-end sm:px-6 sm:pt-0">
        <div className="min-w-0 sm:py-3">
          <p className="font-serif text-[18px] font-semibold leading-tight tracking-[-0.005em]">Quarter close</p>
          <p className="truncate text-[13px] text-muted">
            {sample.orgName}, {sample.workstream}
          </p>
        </div>
        <nav aria-label="Steps" className="-mx-1 sm:mx-0">
          <ol className="flex">
            {(Object.keys(LABELS) as Step[]).map((s, i) => {
              const current = s === step;
              return (
                <li key={s} className="min-w-0 flex-1 sm:flex-none">
                  <button
                    type="button"
                    onClick={() => onGo(s)}
                    aria-current={current ? 'step' : undefined}
                    className={`group relative flex h-12 w-full items-center gap-2 px-1 text-[14.5px] font-semibold transition-colors duration-150 sm:px-3 ${
                      current ? 'text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <span
                      className={`num grid size-5 shrink-0 place-items-center rounded-full text-[11.5px] ${
                        current ? 'bg-ink text-paper' : 'bg-desk-deep text-muted group-hover:text-ink'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span>{LABELS[s]}</span>
                    {s === 'check' &&
                      (toAnswer > 0 ? (
                        <span className="num whitespace-nowrap rounded-full bg-amber-tint px-2 py-0.5 text-[12px] font-semibold text-amber-ink">
                          {toAnswer}
                          <span className="max-sm:sr-only"> to answer</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-accent">
                          <CheckIcon className="size-3.5" />
                          <span className="max-sm:sr-only">Answered</span>
                        </span>
                      ))}
                    <span
                      aria-hidden
                      className={`absolute inset-x-1 bottom-0 h-[2px] rounded-full transition-colors duration-150 sm:inset-x-3 ${current ? 'bg-accent' : 'bg-transparent'}`}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </header>
  );
}
