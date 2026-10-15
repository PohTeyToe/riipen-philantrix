// Links and switches for the walkthrough page.

export const LINKS = {
  /** The public repo for this demo. Update if the repo gets a different name. */
  repo: 'https://github.com/PohTeyToe/philantrix-funder-report',
  github: 'https://github.com/PohTeyToe',
  linkedin: 'https://linkedin.com/in/abdallah-safi',
};

/**
 * True only once LINKS.repo is public and its CI run is green. While false,
 * the walkthrough has no "See the code" button, so it never links to a 404.
 */
export const REPO_PUBLIC = false;

/**
 * True only while the row-level security tests pass: `npm test` runs
 * supabase/tests/database/rls.test.sql on PGlite (tests/rls.test.ts). While
 * false, the walkthrough leaves that line out and keeps the work in the plan.
 */
export const RLS_SHIPPED = true;
