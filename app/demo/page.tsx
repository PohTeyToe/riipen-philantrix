import type { Metadata } from 'next';
import { Demo } from '@/components/demo/Demo';
import { NO_INDEX } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Quarter close (sample data)',
  robots: NO_INDEX,
};

export default function DemoPage() {
  return <Demo />;
}
