import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/lora';
import './globals.css';

const TITLE = 'Quarter-end funder report (sample data)';
const DESCRIPTION = "Checks a quarter of sample program records for gaps, then builds two funders' reports. Built for Philantrix's Level UP project.";

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
  themeColor: '#fafafa',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
