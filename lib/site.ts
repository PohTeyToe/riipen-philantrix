import type { Metadata } from 'next';

/** Each page sets this; see app/layout.tsx. */
export const NO_INDEX: Metadata['robots'] = { index: false, follow: false };

/** The public repo for this demo. */
export const REPO_URL = 'https://github.com/PohTeyToe/riipen-philantrix';
