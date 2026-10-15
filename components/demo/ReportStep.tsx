'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PERIODS, sample, type Period } from '@/lib/data';
import { downloadExcel, fileStem } from '@/lib/excel';
import type { Answers, Finding } from '@/lib/findings';
import { buildReport, refKey, reportNumbers, type TraceRef } from '@/lib/report';
import { TEMPLATES, type TemplateId } from '@/lib/templates';
import { explain } from '@/lib/trace';
import { BackIcon, DownloadIcon } from '../icons';
import { ReportPaper } from './ReportPaper';
import { TraceContext } from './Traceable';
import { TracePanel } from './TracePanel';

export function ReportStep({
  findings,
  answers,
  baseline,
  flashed,
  templateId,
  periodId,
  onTemplate,
  onPeriod,
  toAnswer,
  onCheck,
}: {
  findings: Finding[];
  answers: Answers;
  baseline: Answers;
  flashed: Set<string>;
  templateId: TemplateId;
  periodId: Period['id'];
  onTemplate: (t: TemplateId) => void;
  onPeriod: (p: Period['id']) => void;
  toAnswer: number;
  onCheck: () => void;
}) {
  const report = useMemo(() => buildReport(sample, findings, answers, templateId, periodId), [findings, answers, templateId, periodId]);

  // Numbers an answer moved since the viewer last saw this report: highlight once.
  const view = `${templateId}|${periodId}`;
  const changed = useMemo(() => {
    const before = reportNumbers(buildReport(sample, findings, baseline, templateId, periodId));
    const out = new Set<string>();
    for (const [k, v] of reportNumbers(report)) if (before.get(k) !== v && !flashed.has(`${view}|${k}`)) out.add(k);
    return out;
  }, [report, baseline, findings, templateId, periodId, flashed, view]);
  useEffect(() => {
    for (const k of changed) flashed.add(`${view}|${k}`);
  }, [changed, flashed, view]);

  const [trace, setTrace] = useState<TraceRef | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((ref: TraceRef, el: HTMLElement) => {
    opener.current = el;
    setTrace((cur) => (cur && refKey(cur) === refKey(ref) ? null : ref));
  }, []);
  const close = useCallback(() => {
    setTrace(null);
    opener.current?.focus({ preventScroll: true });
  }, []);
  const traceView = useMemo(() => (trace ? explain(sample, findings, answers, periodId, trace) : null), [trace, findings, answers, periodId]);
  const ctx = useMemo(() => ({ activeKey: trace ? refKey(trace) : null, changed, open }), [trace, changed, open]);

  const [excelBusy, setExcelBusy] = useState(false);
  const printPdf = () => {
    const title = document.title;
    document.title = fileStem(report);
    const restore = () => {
      document.title = title;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  };
  const excel = async () => {
    setExcelBusy(true);
    try {
      await downloadExcel(report);
    } finally {
      setExcelBusy(false);
    }
  };

  return (
    <TraceContext.Provider value={ctx}>
      <div className="mx-auto grid max-w-[1180px] gap-6 px-4 pb-16 pt-5 sm:px-6 lg:grid-cols-[232px_minmax(0,816px)] lg:justify-center lg:gap-10 lg:pt-8 print-root">
        <aside className="no-print min-w-0 lg:sticky lg:top-6 lg:self-start" aria-label="Report controls">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <h2 id="ctl-template" className="mb-1.5 text-[12.5px] font-semibold text-muted">Funder template</h2>
              <div className="seg w-full" role="group" aria-labelledby="ctl-template">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" aria-pressed={templateId === t.id} onClick={() => onTemplate(t.id)}>
                    {t.short}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 id="ctl-period" className="mb-1.5 text-[12.5px] font-semibold text-muted">Period</h2>
              <div className="seg w-full" role="group" aria-labelledby="ctl-period">
                {PERIODS.map((p) => (
                  <button key={p.id} type="button" aria-pressed={periodId === p.id} onClick={() => onPeriod(p.id)} className="!px-2">
                    {p.short}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 lg:flex-col">
            <button type="button" className="btn btn-quiet max-lg:flex-1" onClick={printPdf}>
              <DownloadIcon /> Download PDF
            </button>
            <button type="button" className="btn btn-quiet max-lg:flex-1" onClick={excel} disabled={excelBusy} aria-busy={excelBusy}>
              <DownloadIcon /> {excelBusy ? 'Preparing Excel' : 'Download Excel'}
            </button>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-muted">The PDF opens your browser's print dialog. Choose Save as PDF.</p>

          <div className="mt-6 border-t border-rule pt-4 text-[13.5px] leading-snug">
            {toAnswer > 0 ? (
              <p>
                <span className="font-semibold text-amber-ink">{toAnswer} {toAnswer === 1 ? 'finding' : 'findings'} unanswered.</span>{' '}
                <span className="text-muted">The funder copy doesn&apos;t show them. It counts only what was logged.</span>{' '}
                <button type="button" onClick={onCheck} className="-my-[3px] inline-flex items-center py-[3px] font-semibold text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                  <BackIcon className="size-3.5" /> Answer on Check
                </button>
              </p>
            ) : (
              <p className="text-muted">
                Every finding is answered.{' '}
                <button type="button" onClick={onCheck} className="-my-[3px] py-[3px] font-semibold text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                  Review answers
                </button>
              </p>
            )}
            <p className="mt-3 text-muted">Click any underlined number to see how it was counted.</p>
          </div>
        </aside>

        <div className="min-w-0 print-root">
          <ReportPaper report={report} />
        </div>
      </div>
      {traceView && <TracePanel view={traceView} onClose={close} />}
    </TraceContext.Provider>
  );
}
