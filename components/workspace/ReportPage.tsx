'use client';

import { useState } from 'react';
import { downloadExcel, fileStem } from '@/lib/excel';
import { fmtDate } from '@/lib/format';
import type { BarView, FigureView, GoalView, Report, SectionView } from '@/lib/report';
import type { Template } from '@/lib/templates';
import { CheckIcon, DownloadIcon } from '../icons';
import { printReport } from './print';
import { T } from './Traceable';

type Figures = Extract<SectionView, { type: 'figures' }>;

/** One funder's report, laid out the way that funder asks. This element is what prints. */
export function ReportPage({ report, template }: { report: Report; template: Template }) {
  const [main, sub] = splitTitle(report.templateName);
  const form = template.layout === 'form';
  let n = 0;
  return (
    <article data-report={report.templateId} className="paper print-flat relative px-5 pb-6 pt-4 @[34rem]:px-7" aria-label={`${template.short} report`}>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow whitespace-nowrap !text-mah">
          Sample data<span className="text-faint"> · </span>
          <span className="text-muted">{report.period.label}</span>
        </p>
        <Downloads report={report} />
      </div>

      <header className="mt-2 border-b border-line pb-4">
        <h2 className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em]">
          {main.replace(' (example)', '')} <span className="text-[15px] font-medium text-faint">(example)</span>
        </h2>
        {sub && <p className="mt-0.5 text-[14px] text-muted">{sub[0].toUpperCase() + sub.slice(1)}</p>}
        <p className="num mt-2 text-[12px] text-muted">
          {report.orgName.replace(' (sample)', '')} · {report.period.range} · as of {fmtDate(report.asOf)}
        </p>
      </header>

      <div key={`${report.templateId}|${report.periodId}`} className="fade-in">
        {report.sections.map((s, i) => {
          if (s.type === 'figures' || s.type === 'goals') n++;
          return (
            <section key={s.id} className="avoid-break border-b border-line py-4 last:border-b-0 last:pb-0" aria-labelledby={`${report.templateId}-${s.id}`}>
              <h3 id={`${report.templateId}-${s.id}`} className="eyebrow mb-3 flex items-center gap-2">
                {form && (s.type === 'figures' || s.type === 'goals') && <span className="num grid size-[18px] place-items-center rounded-[5px] bg-sunken text-[11px] text-ink">{n}</span>}
                {s.title}
              </h3>
              {s.type === 'figures' && (form ? <FormFigures s={s} /> : <BriefFigures s={s} lead={i === 0} />)}
              {s.type === 'goals' && <Goals goals={s.goals} />}
              {s.type === 'summary' && (
                <>
                  <p className="max-w-[62ch] text-[14px] leading-[1.6]">
                    {s.parts.map((p, j) => (p.ref ? <T key={j} r={p.ref}>{p.text}</T> : <span key={j}>{p.text}</span>))}
                  </p>
                  <p className="mt-2 text-[11.5px] text-muted">{s.label}</p>
                </>
              )}
              {s.type === 'notes' && (
                <ol className="num list-decimal space-y-1 pl-5 text-[12.5px] leading-snug marker:text-muted">
                  {s.notes.map((note) => (
                    <li key={note} className="fade-in pl-1">{note}</li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
}

function splitTitle(name: string): [string, string | null] {
  const i = name.indexOf('): ');
  return i === -1 ? [name, null] : [name.slice(0, i + 1), name.slice(i + 3)];
}

/** The City form: numbered fields, label on the left, value on the right. */
function FormFigures({ s }: { s: Figures }) {
  return (
    <>
      <dl className="divide-y divide-line">
        {s.figures.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between gap-4 py-1.5 first:pt-0">
            <dt className="text-[13.5px]">{f.label}</dt>
            <dd className="text-right">
              <Value f={f} className="text-[20px] font-semibold tracking-[-0.01em]" />
            </dd>
          </div>
        ))}
      </dl>
      {s.breakdown && <AgeTable b={s.breakdown} />}
      {s.chart && <Bars title={s.chart.title} bars={s.chart.bars} />}
    </>
  );
}

/** The Foundation brief: the outcome first, in large figures. */
function BriefFigures({ s, lead }: { s: Figures; lead: boolean }) {
  const [first, ...rest] = s.figures;
  return (
    <>
      {lead && first ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-6 gap-y-3">
          <div>
            <Value f={first} className="text-[44px] font-semibold leading-none tracking-[-0.03em] text-mah" />
            <p className="mt-1.5 text-[13.5px] font-semibold">{first.label}</p>
          </div>
          {first.kind === 'percent' && first.value !== null && <Meter value={first.value} />}
          {rest.map((f) => (
            <div key={f.label} className="col-span-2 flex items-baseline gap-2 border-t border-line pt-2.5">
              <Value f={f} className="text-[18px] font-semibold" />
              <span className="text-[13px] text-muted">{f.label.toLowerCase()}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-x-5 gap-y-3">
          {s.figures.map((f) => (
            <div key={f.label} className="min-w-0">
              <Value f={f} className={f.value === null ? 'text-[15px] font-semibold' : 'text-[28px] font-semibold leading-none tracking-[-0.02em]'} />
              <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{f.label}</p>
            </div>
          ))}
        </div>
      )}
      {s.chart && <Bars title={s.chart.title} bars={s.chart.bars} />}
    </>
  );
}

function Value({ f, className }: { f: FigureView; className: string }) {
  return (
    <T r={f.ref} className={`num ${className}`} label={`${f.label}: ${f.display}`}>
      {f.display}
    </T>
  );
}

/** One rate as a bar of 100. */
function Meter({ value }: { value: number }) {
  return (
    <div aria-hidden className="mb-2 h-2 overflow-hidden rounded-full bg-sunken">
      <div className="h-full rounded-full bg-mah transition-[width] duration-300 ease-[var(--ease-out-quint)]" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

function AgeTable({ b }: { b: NonNullable<Figures['breakdown']> }) {
  const small = b.cells.find((c) => c.display.startsWith('<'));
  return (
    <div className="mt-3">
      <p className="text-[12.5px] font-semibold">{b.title}</p>
      <table className="num mt-1.5 w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="text-[11.5px] text-muted">
            {b.cells.map((c) => (
              <th key={c.key} scope="col" className="border-b border-line px-1 pb-1 text-right font-semibold">{c.key}</th>
            ))}
            <th scope="col" className="border-b border-line pb-1 pl-1 text-right font-semibold text-ink">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {b.cells.map((c) => (
              <td key={c.key} className="px-1 pt-1.5 text-right">
                <T r={c.ref} label={`Age ${c.key}: ${c.display}`}>{c.display}</T>
              </td>
            ))}
            <td className="pl-1 pt-1.5 text-right font-semibold">
              <T r={b.total.ref} label={`All ages: ${b.total.display}`}>{b.total.display}</T>
            </td>
          </tr>
        </tbody>
      </table>
      {(small || b.footnote) && (
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
          {small && `${small.display} means fewer than ${small.display.slice(1)}. `}
          {b.footnote}
        </p>
      )}
    </div>
  );
}

/** One series per chart, so no legend: the title names it. Values sit at the bar tips. */
function Bars({ title, bars }: { title: string; bars: BarView[] }) {
  return (
    <figure className="mt-3.5">
      <figcaption className="text-[12.5px] font-semibold">{title}</figcaption>
      <div className="mt-2 space-y-1.5">
        {bars.map((b) => (
          <div key={b.label} className="grid grid-cols-[7.25rem_minmax(0,1fr)] items-center gap-2.5 text-[12.5px]">
            <span className="truncate text-muted">{b.label}</span>
            <div className="flex min-w-0 items-center gap-2">
              {b.value === null ? (
                <T r={b.ref} className="text-[12px] text-muted">{b.display}</T>
              ) : (
                <>
                  <span aria-hidden className="h-3 shrink-0 rounded-[3px] bg-mah transition-[width] duration-300 ease-[var(--ease-out-quint)]" style={{ width: `calc((100% - 2.75rem) * ${Math.max(0, Math.min(1, b.value)).toFixed(4)})` }} />
                  <T r={b.ref} label={`${b.label}: ${b.display}`} className="font-semibold">{b.display}</T>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

const STATUS: Record<GoalView['status'], { cls: string; mark: React.ReactNode }> = {
  Met: { cls: 'text-green-ink', mark: <CheckIcon className="size-3" /> },
  'On track': { cls: 'text-green-ink', mark: <span className="size-[7px] rounded-full bg-green" /> },
  Behind: { cls: 'text-orange-ink', mark: <span className="size-[7px] rounded-full border-[1.5px] border-orange" /> },
  'Past due': { cls: 'text-orange-ink', mark: <span className="size-[7px] rotate-45 bg-orange" /> },
  'No due date': { cls: 'text-muted', mark: <span className="size-[7px] rounded-full border-[1.5px] border-faint" /> },
  'Not shown': { cls: 'text-muted', mark: <span className="h-[1.5px] w-[8px] bg-faint" /> },
};

function Goals({ goals }: { goals: GoalView[] }) {
  return (
    <ul className="space-y-3.5">
      {goals.map((g) => {
        const st = STATUS[g.status];
        const withheld = g.status === 'Not shown' || g.display.startsWith('<');
        return (
          <li key={g.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-[13.5px] font-semibold">{g.name}</p>
              <T r={{ kind: 'goal', goalId: g.id, part: 'value' }} changeKey={`goal:${g.id}:value`} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold no-underline ${st.cls}`}>
                <span aria-hidden className="grid size-3 place-items-center">{st.mark}</span>
                {g.status}
              </T>
            </div>
            {!withheld && g.value !== null && <Progress g={g} />}
            <p className="num mt-1 text-[12.5px] text-muted">
              <T r={{ kind: 'goal', goalId: g.id, part: 'value' }} changeKey={`goal:${g.id}:value`} className="font-semibold text-ink">{g.display}</T>
              {' of '}
              <T r={{ kind: 'goal', goalId: g.id, part: 'target' }}>{g.targetDisplay}</T>
              {g.due !== 'Not set' ? ` · due ${g.due}` : ' · no due date'}
              {g.forecastDisplay && (
                <>
                  {' · forecast '}
                  <T r={{ kind: 'goal', goalId: g.id, part: 'forecast' }} changeKey={`goal:${g.id}:value`}>{g.forecastDisplay}</T>
                </>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Progress to the target, with the forecast as a dashed run past it. */
function Progress({ g }: { g: GoalView }) {
  const scale = Math.max(g.target, g.forecast ?? 0, g.value ?? 0);
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div aria-hidden className="relative mt-1.5 h-2 rounded-full bg-sunken">
      {g.forecast !== null && g.forecast > (g.value ?? 0) && (
        <div className="absolute inset-y-0 left-0 rounded-full border border-dashed border-mah-mid/70" style={{ width: pct(g.forecast) }} />
      )}
      <div className="absolute inset-y-0 left-0 rounded-full bg-mah transition-[width] duration-300 ease-[var(--ease-out-quint)]" style={{ width: pct(g.value ?? 0) }} />
      <div className="absolute -inset-y-1 w-[2px] rounded-full bg-ink" style={{ left: `calc(${pct(g.target)} - 1px)` }} />
    </div>
  );
}

function Downloads({ report }: { report: Report }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pdf = () => printReport(report.templateId, fileStem(report));
  const excel = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await downloadExcel(report);
    } catch {
      // Usually the Excel code failed to load (offline, or an old page after a redeploy).
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="no-print -mr-1.5 flex items-center gap-0.5">
      {failed && <span role="alert" className="mr-1 text-[12px] font-semibold text-orange-ink">Excel didn&apos;t download. Try again.</span>}
      <button type="button" className="btn btn-ghost !min-h-7 !px-2 text-[12.5px]" onClick={pdf} title="Opens the print dialog. Choose Save as PDF." aria-label={`Download ${report.templateName} as PDF`}>
        <DownloadIcon className="size-3.5" /> PDF
      </button>
      <button type="button" className="btn btn-ghost !min-h-7 !px-2 text-[12.5px]" onClick={excel} disabled={busy} aria-busy={busy} aria-label={`Download ${report.templateName} as Excel`}>
        <DownloadIcon className="size-3.5" /> {busy ? 'Preparing' : 'Excel'}
      </button>
    </div>
  );
}
