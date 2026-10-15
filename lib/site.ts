// Links and switches for the walkthrough page.

export const LINKS = {
  /** The public repo for this demo. Update if the repo gets a different name. */
  repo: 'https://github.com/PohTeyToe/philantrix-funder-report',
  github: 'https://github.com/PohTeyToe',
  linkedin: 'https://linkedin.com/in/abdallah-safi',
};

/**
 * True only when the org-scoped row-level security policies and their pgTAP
 * tests ran green locally and in GitHub Actions. While false, the walkthrough
 * leaves that line out and keeps the work in the plan.
 */
export const RLS_SHIPPED = true;
