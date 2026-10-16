// Functional icons only, drawn on a 16px grid in the line style of their app (lucide).

type P = { className?: string };
const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const DownloadIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
);
export const CloseIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 4l8 8M12 4l-8 8" /></svg>
);
export const ForwardIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M6 3.5 10.5 8 6 12.5" /></svg>
);
export const BackIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M10 3.5 5.5 8 10 12.5" /></svg>
);
export const CheckIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M3.5 8.5 6.5 11.5 12.5 4.5" /></svg>
);
export const UndoIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M5.5 3 2.5 6l3 3" /><path d="M2.5 6h7a4 4 0 0 1 0 8H7" /></svg>
);
export const ShieldIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M8 1.8 13 3.8v3.7c0 3-2.1 5.5-5 6.7-2.9-1.2-5-3.7-5-6.7V3.8z" /></svg>
);
export const MinusIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 8h8" /></svg>
);
export const PlusIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 8h8M8 4v8" /></svg>
);
export const SparkIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.8 1.8M10.2 10.2 12 12M12 4l-1.8 1.8M5.8 10.2 4 12" /></svg>
);
