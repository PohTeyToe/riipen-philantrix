import type { Metadata } from 'next';
import { Workspace } from '@/components/workspace/Workspace';
import { NO_INDEX } from '@/lib/site';

export const metadata: Metadata = { robots: NO_INDEX };

export default function Home() {
  return <Workspace />;
}
