'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sample, type Period } from '@/lib/data';
import { detectFindings, unansweredCount, type AnswerId, type Answers } from '@/lib/findings';
import type { TemplateId } from '@/lib/templates';
import { SampleBar } from '../SampleBar';
import { CheckStep } from './CheckStep';
import { RecordsStep } from './RecordsStep';
import { ReportStep } from './ReportStep';
import { Steps, type Step } from './Steps';

const STEPS: Step[] = ['records', 'check', 'report'];
const stepFromHash = (): Step => {
  const h = typeof window === 'undefined' ? '' : window.location.hash.replace('#', '');
  return (STEPS as string[]).includes(h) ? (h as Step) : 'records';
};

/**
 * "Quarter close": Records, then Check, then Report. Answers live here so a
 * gap answered on Check moves the numbers on Report.
 */
export function Demo() {
  const findings = useMemo(() => detectFindings(sample), []);
  const [step, setStep] = useState<Step>('records');
  const [answers, setAnswers] = useState<Answers>({});
  const [templateId, setTemplateId] = useState<TemplateId>('city-youth-grant');
  const [periodId, setPeriodId] = useState<Period['id']>('q3');

  // Figures that differ from what was on the report when the viewer last left
  // it get a brief highlight, once each. Before the first visit, the
  // comparison is with no answers at all.
  const baseline = useRef<Answers>({});
  const flashed = useRef<Set<string>>(new Set());
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const stepRef = useRef(step);

  const enter = useCallback((next: Step) => {
    if (stepRef.current === 'report' && next !== 'report') {
      baseline.current = answersRef.current;
      flashed.current = new Set();
    }
    stepRef.current = next;
    setStep(next);
  }, []);

  useEffect(() => {
    enter(stepFromHash());
    const onHash = () => {
      enter(stepFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [enter]);

  const go = useCallback((next: Step) => {
    if (window.location.hash === `#${next}`) return;
    window.location.hash = next;
  }, []);

  const answer = useCallback((findingId: string, a: AnswerId | null) => {
    setAnswers((prev) => {
      const out = { ...prev };
      if (a === null) delete out[findingId];
      else out[findingId] = a;
      return out;
    });
  }, []);

  const toAnswer = unansweredCount(findings, answers);

  return (
    <div className="min-h-dvh">
      <SampleBar link={{ href: '/', label: 'About this demo' }} />
      <Steps step={step} onGo={go} toAnswer={toAnswer} />
      <main id="main" className="print-root">
        {step === 'records' && <RecordsStep onNext={() => go('check')} />}
        {step === 'check' && <CheckStep findings={findings} answers={answers} onAnswer={answer} onNext={() => go('report')} />}
        {step === 'report' && (
          <ReportStep
            findings={findings}
            answers={answers}
            baseline={baseline.current}
            flashed={flashed.current}
            templateId={templateId}
            periodId={periodId}
            onTemplate={setTemplateId}
            onPeriod={setPeriodId}
            toAnswer={toAnswer}
            onCheck={() => go('check')}
          />
        )}
      </main>
    </div>
  );
}
