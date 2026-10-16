import type { Metadata } from 'next';
import { Workspace } from '@/components/workspace/Workspace';
import { NO_INDEX } from '@/lib/site';

// The app used to live here, and older links still point at /demo/.
export const metadata: Metadata = { robots: NO_INDEX };

export default function DemoPage() {
  return <Workspace />;
}
