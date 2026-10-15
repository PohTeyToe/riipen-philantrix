import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-sans-3';
import './globals.css';

const TITLE = 'Quarter-end funder report (sample data)';
const DESCRIPTION =
  'A working slice built for Philantrix\'s Platform Expansion project on Riipen: one quarter of sample engagement records, a data gaps check, and two funder reports where every number traces to its rows.';

// og:image needs an absolute URL, so it's added with metadataBase at deploy time.
// robots is set on each page: the 404 page gets Next's own noindex, and a
// second one here would print two robots tags there.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: 'website', title: TITLE, description: DESCRIPTION },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
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
