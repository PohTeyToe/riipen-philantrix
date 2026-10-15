import type { Metadata } from 'next';
import { Demo } from '@/components/demo/Demo';

export const metadata: Metadata = {
  title: 'Quarter close (sample data)',
};

export default function DemoPage() {
  return <Demo />;
}
