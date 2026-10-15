// Functional icons only: download, close, back, forward, check.

type P = { className?: string };
const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const DownloadIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
);
export const CloseIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 4l8 8M12 4l-8 8" /></svg>
);
export const BackIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
);
export const ForwardIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M6 3.5 10.5 8 6 12.5" /></svg>
);
export const CheckIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M3.5 8.5 6.5 11.5 12.5 4.5" /></svg>
);
