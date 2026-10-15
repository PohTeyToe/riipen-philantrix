import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-sans-3';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quarter-end funder report (sample data)',
  description:
    'A working slice built for Philantrix\'s Platform Expansion project on Riipen: one quarter of sample engagement records, a data gaps check, and two funder reports where every number traces to its rows.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#eef0f3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
