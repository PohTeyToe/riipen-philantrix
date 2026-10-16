import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';

export default function NotFound() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-[40rem] px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-[24px] font-bold tracking-[-0.02em]">No page here</h1>
        <Link href="/" className="btn btn-primary mt-5">Open the report</Link>
      </main>
    </>
  );
}
