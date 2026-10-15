'use client';

import { fmtDate } from '@/lib/format';
import type { BarView, GoalView, Report, SectionView } from '@/lib/report';
import { CheckIcon } from '../icons';
import { T } from './Traceable';

/** The report as a page of paper. This element is what prints. */
export function ReportPaper({ report }: { report: Report }) {
  const [main, sub] = splitTitle(report.templateName);
  return (
    <article className="paper relative w-full max-w-[816px] px-5 pb-8 pt-5 sm:px-14 sm:pb-12 sm:pt-9 lg:min-h-[1056px]" aria-label="Report page">
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2 text-[10.5px] uppercase tracking-[0.14em] text-muted">
        <span className="whitespace-nowrap font-semibold text-ink">Sample data</span>
        <span className="truncate text-right">
          {report.orgName}, {report.period.label}
        </span>
      </div>

      <header className="mt-7 sm:mt-9">
        <p className="text-[13px] text-muted">{report.orgName}</p>
        <h1 className="mt-1 font-serif text-[27px] font-semibold leading-[1.1] tracking-[-0.015em] sm:text-[33px]">
          {main}
          {sub && <span className="sr-only">: {sub}</span>}
        </h1>
        {sub && (
          <p aria-hidden className="mt-1 font-serif text-[18px] leading-snug text-muted sm:text-[20px]">
            {sub[0].toUpperCase() + sub.slice(1)}
          </p>
        )}
        <dl className="mt-5 grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-[auto_auto_auto] sm:justify-start">
          <div>
            <dt className="sr-only">Subject</dt>
            <dd>{report.subject}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Period: </dt>
            <dd className="num inline">{report.period.range}</dd>
          </div>
          <div>
            <dt className="inline text-muted">As of </dt>
            <dd className="num inline">{fmtDate(report.asOf)}</dd>
          </div>
        </dl>
      </header>

      <div key={`${report.templateId}|${report.periodId}`} className="fade-in">
        {report.sections.map((s) => (
          <Section key={s.id} s={s} />
        ))}
      </div>

      <footer className="mt-10 border-t border-rule pt-3 text-[11.5px] leading-snug text-muted">
        Sample data. {report.orgName.replace(' (sample)', '')} is a fictional organization, and every record behind this report was made up by a script.
      </footer>
    </article>
  );
}

function splitTitle(name: string): [string, string | null] {
  const i = name.indexOf('): ');
  return i === -1 ? [name, null] : [name.slice(0, i + 1), name.slice(i + 3)];
}

function Section({ s }: { s: SectionView }) {
  return (
    <section className="avoid-break mt-7 grid gap-x-8 gap-y-3 border-t border-rule pt-4 sm:grid-cols-[112px_minmax(0,1fr)]" aria-labelledby={`s-${s.id}`}>
      <h2 id={`s-${s.id}`} className="font-serif text-[17px] font-semibold leading-snug">
        {s.title}
      </h2>
      <div className="min-w-0">
        {s.type === 'figures' && <Figures s={s} />}
        {s.type === 'goals' && <Goals goals={s.goals} />}
        {s.type === 'summary' && (
          <>
            <p className="max-w-[62ch] font-serif text-[15.5px] leading-[1.6]">
              {s.parts.map((p, i) => (p.ref ? <T key={i} r={p.ref}>{p.text}</T> : <span key={i}>{p.text}</span>))}
            </p>
            <p className="mt-2 text-[11.5px] text-muted">{s.label}</p>
          </>
        )}
        {s.type === 'notes' &&
          (s.notes.length ? (
            <ol className="num list-decimal space-y-1 pl-5 text-[13px] leading-snug marker:text-muted">
              {s.notes.map((n) => (
                <li key={n} className="fade-in pl-1">{n}</li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted">No data notes for this period.</p>
          ))}
      </div>
    </section>
  );
}

function Figures({ s }: { s: Extract<SectionView, { type: 'figures' }> }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] sm:gap-x-8">
        {s.figures.map((f) => (
          <div key={f.label} className="min-w-0">
            <T
              r={f.ref}
              className={f.value === null ? 'text-[17px] font-semibold leading-tight' : 'text-[36px] font-semibold leading-none tracking-[-0.02em] sm:text-[38px]'}
            >
              {f.display}
            </T>
            <p className="mt-2 text-[14px] font-semibold leading-tight">{f.label}</p>
            <p className="mt-0.5 max-w-[34ch] text-[12.5px] leading-snug text-muted">{f.definition}</p>
          </div>
        ))}
      </div>

      {s.breakdown && (
        <div className="mt-6">
          <table className="num w-full max-w-[440px] border-collapse text-[13.5px]">
            <caption className="mb-1.5 text-left text-[12.5px] font-semibold">{s.breakdown.title}</caption>
            <thead>
              <tr className="border-b border-rule text-[12px] text-muted">
                {s.breakdown.cells.map((c) => (
                  <th key={c.key} scope="col" className="px-2 pb-1 text-right font-semibold first:pl-0">{c.key}</th>
                ))}
                <th scope="col" className="pb-1 pl-3 text-right font-semibold text-ink">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {s.breakdown.cells.map((c) => (
                  <td key={c.key} className="px-2 pt-1.5 text-right first:pl-0">
                    <T r={c.ref} className={c.hidden === 'secondary' ? 'italic text-muted' : ''}>{c.display}</T>
                  </td>
                ))}
                <td className="pl-3 pt-1.5 text-right font-semibold">
                  <T r={s.breakdown.total.ref}>{s.breakdown.total.display}</T>
                </td>
              </tr>
            </tbody>
          </table>
          {(s.breakdown.cells.some((c) => c.hidden) || s.breakdown.footnote) && (
            <div className="mt-2 space-y-0.5 text-[11.5px] leading-snug text-muted">
              {s.breakdown.cells.some((c) => c.hidden === 'small') && <p>&lt;5 means 1 to 4 people, not shown so no one can be identified.</p>}
              {s.breakdown.footnote && <p>{s.breakdown.footnote}</p>}
            </div>
          )}
        </div>
      )}

      {s.chart && <BarChart title={s.chart.title} bars={s.chart.bars} />}
    </>
  );
}

/** One series, so no legend: the title names it. Values sit at the bar tips. */
function BarChart({ title, bars }: { title: string; bars: BarView[] }) {
  return (
    <figure className="mt-6 max-w-[480px]">
      <figcaption className="text-[12.5px] font-semibold">{title}</figcaption>
      <div className="mt-2.5 space-y-2">
        {bars.map((b) => (
          <div key={b.label} className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 text-[13px] sm:grid-cols-[120px_minmax(0,1fr)]">
            <span className="truncate">{b.label}</span>
            <div className="flex min-w-0 items-center gap-2 border-l border-rule-strong py-0.5">
              {b.value === null ? (
                <>
                  <span aria-hidden className="h-3 w-[3px] shrink-0 rounded-r-[2px] bg-faint/60" />
                  <T r={b.ref} className="text-[12.5px] text-muted">{b.display}</T>
                </>
              ) : (
                <>
                  <span
                    aria-hidden
                    className="h-3 shrink-0 rounded-r-[4px] bg-accent"
                    style={{ width: `calc((100% - 3.5rem) * ${Math.max(0, Math.min(1, b.value)).toFixed(4)})` }}
                  />
                  <T r={b.ref} label={`${b.label}: ${b.display}`} className="font-semibold">{b.display}</T>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1 grid grid-cols-[104px_minmax(0,1fr)] gap-3 text-[10.5px] text-faint sm:grid-cols-[120px_minmax(0,1fr)]">
        <span />
        <div className="relative mr-14 h-3">
          <span className="absolute left-0">0%</span>
          <span className="absolute left-1/2 -translate-x-1/2">50%</span>
          <span className="absolute right-0 translate-x-1/2">100%</span>
        </div>
      </div>
    </figure>
  );
}

const STATUS_STYLE: Record<GoalView['status'], { cls: string; mark: React.ReactNode }> = {
  Met: { cls: 'text-accent', mark: <CheckIcon className="size-3.5" /> },
  'On track': { cls: 'text-accent', mark: <span className="size-2 rounded-full bg-accent" /> },
  Behind: { cls: 'text-amber-ink', mark: <span className="size-2 rounded-full border-[1.5px] border-amber" /> },
  'Past due': { cls: 'text-amber-ink', mark: <span className="size-2 rounded-full bg-amber" /> },
  'No due date': { cls: 'text-muted', mark: <span className="size-2 rounded-full border-[1.5px] border-faint" /> },
};

function Status({ g }: { g: GoalView }) {
  const st = STATUS_STYLE[g.status];
  return (
    <T r={{ kind: 'goal', goalId: g.id, part: 'value' }} changeKeys={[`goal:${g.id}:status`]} className={`inline-flex items-center gap-1.5 whitespace-nowrap font-semibold no-underline ${st.cls}`}>
      <span aria-hidden className="grid size-3.5 place-items-center">{st.mark}</span>
      {g.status}
    </T>
  );
}

function Forecast({ g }: { g: GoalView }) {
  if (!g.forecastLine || !g.forecastDisplay) return null;
  const label = g.forecastLine.slice(0, g.forecastLine.indexOf(':'));
  return (
    <span className="num">
      {label}:{' '}
      <T r={{ kind: 'goal', goalId: g.id, part: 'forecast' }} changeKeys={[`goal:${g.id}:forecast`]}>{g.forecastDisplay}</T> of{' '}
      <T r={{ kind: 'goal', goalId: g.id, part: 'target' }}>{g.targetDisplay}</T>
    </span>
  );
}

function Goals({ goals }: { goals: GoalView[] }) {
  return (
    <>
      <table className="num w-full border-collapse text-[13.5px] max-sm:hidden">
        <thead>
          <tr className="border-b border-rule text-left text-[12px] text-muted">
            <th scope="col" className="pb-1 font-semibold">Tracked Goal</th>
            <th scope="col" className="pb-1 pl-3 text-right font-semibold">Progress</th>
            <th scope="col" className="pb-1 pl-3 text-right font-semibold">Target</th>
            <th scope="col" className="pb-1 pl-4 font-semibold">Due</th>
            <th scope="col" className="pb-1 pl-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((g) => (
            <tr key={g.id} className="border-b border-rule align-top last:border-b-0">
              <td className="py-2 pr-2">
                <span className="font-semibold">{g.name}</span>
                {g.forecastLine && (
                  <span className="mt-0.5 block text-[12.5px] text-muted">
                    <Forecast g={g} />
                  </span>
                )}
              </td>
              <td className="py-2 pl-3 text-right">
                <T r={{ kind: 'goal', goalId: g.id, part: 'value' }} changeKeys={[`goal:${g.id}:value`]} className="font-semibold">{g.display}</T>
              </td>
              <td className="py-2 pl-3 text-right">
                <T r={{ kind: 'goal', goalId: g.id, part: 'target' }}>{g.targetDisplay}</T>
              </td>
              <td className="whitespace-nowrap py-2 pl-4">{g.due}</td>
              <td className="py-2 pl-3"><Status g={g} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="num space-y-3 sm:hidden">
        {goals.map((g) => (
          <li key={g.id} className="border-b border-rule pb-3 text-[13.5px] last:border-b-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold">{g.name}</span>
              <Status g={g} />
            </div>
            <p className="mt-0.5">
              <T r={{ kind: 'goal', goalId: g.id, part: 'value' }} changeKeys={[`goal:${g.id}:value`]} className="font-semibold">{g.display}</T>
              <span className="text-muted"> of </span>
              <T r={{ kind: 'goal', goalId: g.id, part: 'target' }}>{g.targetDisplay}</T>
              <span className="text-muted">, due {g.due === 'Not set' ? 'date not set' : g.due}</span>
            </p>
            {g.forecastLine && (
              <p className="text-[12.5px] text-muted">
                <Forecast g={g} />
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
