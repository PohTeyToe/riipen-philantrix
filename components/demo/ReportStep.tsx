'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PERIODS, sample, type Period } from '@/lib/data';
import { downloadExcel, fileStem } from '@/lib/excel';
import type { Answers, Finding } from '@/lib/findings';
import { buildReport, refKey, reportNumbers, reportRefs, type TraceRef } from '@/lib/report';
import { TEMPLATES, type TemplateId } from '@/lib/templates';
import { explain } from '@/lib/trace';
import { BackIcon, DownloadIcon } from '../icons';
import { ReportPaper } from './ReportPaper';
import { TraceContext } from './Traceable';
import { SIDE_PANEL, TracePanel } from './TracePanel';

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
  // A trace the report no longer shows (say, a Foundation figure after
  // switching to the City template) closes rather than describe a number
  // that isn't on the page.
  const refs = useMemo(() => reportRefs(report), [report]);
  const shown = trace && refs.has(refKey(trace)) ? trace : null;
  useEffect(() => {
    if (trace && !shown) setTrace(null);
  }, [trace, shown]);
  const traceView = useMemo(() => (shown ? explain(sample, findings, answers, periodId, shown) : null), [shown, findings, answers, periodId]);
  const ctx = useMemo(() => ({ activeKey: shown ? refKey(shown) : null, changed, open }), [shown, changed, open]);
  // The report moves over to make room for the side panel. Keep the number
  // that opened it in view.
  useEffect(() => {
    if (shown && window.matchMedia(SIDE_PANEL).matches) opener.current?.scrollIntoView({ block: 'nearest' });
  }, [shown]);

  const [excelBusy, setExcelBusy] = useState(false);
  const [excelFailed, setExcelFailed] = useState(false);
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
    setExcelFailed(false);
    try {
      await downloadExcel(report);
    } catch {
      // Usually the Excel code failed to load (offline, or an old page after a redeploy).
      setExcelFailed(true);
    } finally {
      setExcelBusy(false);
    }
  };

  return (
    <TraceContext.Provider value={ctx}>
      {/* Container queries, not screen width: with the side panel open, the report has less room. */}
      <div className={`@container print-root ${traceView ? 'min-[75rem]:pr-[500px]' : ''}`}>
        <div className="mx-auto grid max-w-[1180px] gap-6 px-4 pb-16 pt-5 sm:px-6 @min-[940px]:grid-cols-[232px_minmax(0,816px)] @min-[940px]:justify-center @min-[940px]:gap-10 @min-[940px]:pt-8 print-root">
          <aside className="no-print min-w-0 @min-[940px]:sticky @min-[940px]:top-6 @min-[940px]:self-start" aria-label="Report controls">
            <div className="grid gap-5 @min-[640px]:grid-cols-2 @min-[940px]:grid-cols-1">
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

            <div className="mt-5 flex flex-wrap gap-2 @min-[940px]:flex-col">
              <button type="button" className="btn btn-quiet @max-[940px]:flex-1" onClick={printPdf}>
                <DownloadIcon /> Download PDF
              </button>
              <button type="button" className="btn btn-quiet @max-[940px]:flex-1" onClick={excel} disabled={excelBusy} aria-busy={excelBusy}>
                <DownloadIcon /> {excelBusy ? 'Preparing Excel' : 'Download Excel'}
              </button>
            </div>
            {excelFailed && (
              <p role="alert" className="mt-2 text-[12.5px] font-semibold leading-snug text-amber-ink">
                The Excel file didn&apos;t download. Reload the page and try again.
              </p>
            )}
            <p className="mt-2 text-[12px] leading-snug text-muted">The PDF opens your browser's print dialog. Choose Save as PDF.</p>

            <div className="mt-6 border-t border-rule pt-4 text-[13.5px] leading-snug">
              {toAnswer > 0 ? (
                <p>
                  <span className="font-semibold text-amber-ink">{toAnswer} {toAnswer === 1 ? 'finding' : 'findings'} unanswered.</span>{' '}
                  <span className="text-muted">The funder copy doesn&apos;t show {toAnswer === 1 ? 'it' : 'them'}. It counts only what was logged.</span>{' '}
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
      </div>
      {traceView && <TracePanel view={traceView} onClose={close} />}
    </TraceContext.Provider>
  );
}
