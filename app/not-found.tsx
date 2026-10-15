import Link from 'next/link';
import { SampleBar } from '@/components/SampleBar';

export default function NotFound() {
  return (
    <>
      <SampleBar />
      <main className="mx-auto max-w-[40rem] px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-[-0.01em]">There&apos;s no page here</h1>
        <p className="mt-3 text-[16px] leading-[1.6] text-muted">The link may be mistyped. The demo has two pages.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/demo" className="btn btn-primary">Open the demo</Link>
          <Link href="/" prefetch={false} className="btn btn-quiet">About this demo</Link>
        </div>
      </main>
    </>
  );
}
