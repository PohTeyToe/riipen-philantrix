import Link from 'next/link';
import { sample } from '@/lib/data';

/** On every screen, so sample data can't pass for real. */
export function SampleBar({ link }: { link?: { href: string; label: string } }) {
  return (
    <div className="no-print bg-ink text-paper/85">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-1.5 text-[13px] sm:px-6">
        <p>
          <span className="font-semibold uppercase tracking-[0.08em] text-paper">Sample data.</span>{' '}
          {sample.sampleLabel.replace(/^Sample data\.\s*/, '')}
        </p>
        {link && (
          <Link href={link.href} className="shrink-0 font-semibold text-paper underline decoration-paper/40 underline-offset-2 hover:decoration-paper">
            {link.label}
          </Link>
        )}
      </div>
    </div>
  );
}
