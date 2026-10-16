import { Fragment } from 'react';
import { METRICS, type MetricId } from '@/lib/metrics';

/**
 * Recorded text from the agent, with the metric ids it wrote ("{confidence_improved}",
 * "participants_served") shown as the metric's name, marked as a slot.
 */
export function Readable({ text, chip = 'bg-sunken text-ink' }: { text: string; chip?: string }) {
  return (
    <>
      {text.split(/(\{[a-z0-9_]+\}|\b[a-z]+(?:_[a-z]+)+\b)/g).map((part, i) => {
        const id = part.replace(/^\{|\}$/g, '');
        const metric = METRICS[id as MetricId];
        if (!metric && !/^\{.+\}$/.test(part)) return <Fragment key={i}>{part}</Fragment>;
        return (
          <span key={i} className={`whitespace-nowrap rounded px-1 py-px text-[0.92em] font-medium ${chip}`} title={metric ? `Metric: ${id}` : undefined}>
            {metric ? metric.label.toLowerCase() : id === 'period' ? 'the period' : id.replace(/_/g, ' ')}
          </span>
        );
      })}
    </>
  );
}
