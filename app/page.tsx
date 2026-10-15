import Link from 'next/link';
import { SampleBar } from '@/components/SampleBar';
import { ForwardIcon } from '@/components/icons';
import { sample } from '@/lib/data';
import { LINKS, RLS_SHIPPED } from '@/lib/site';

const ORG = sample.orgName.replace(' (sample)', '');

const STEPS: { text: string; img: string; w: number; h: number; alt: string; page?: boolean }[] = [
  {
    text: 'Press Check data. It finds 3 sessions with no attendance logged. Answer one and watch Sessions delivered change.',
    img: '/walkthrough/check.webp',
    w: 1880,
    h: 1120,
    alt: 'The Check screen. A Coding Club session on Thu Jul 23 is answered "Ran, attendance not recorded", and Sessions delivered moves from 42 to 43.',
  },
  {
    text: 'Build the report, then flip the funder toggle. Same records, a different report.',
    img: '/walkthrough/toggle.webp',
    w: 2000,
    h: 1120,
    alt: 'The report screen with the funder template toggle set to Foundation, showing retention by group and goals.',
  },
  {
    text: "Click any number. You'll see the formula in plain words and the rows behind it.",
    img: '/walkthrough/trace.webp',
    w: 1520,
    h: 1400,
    alt: 'The staff view of the attendance rate: the formula, the arithmetic, and one row per seat, absences included.',
  },
  {
    text: 'Download the PDF or the Excel file.',
    img: '/walkthrough/print.webp',
    w: 1224,
    h: 1040,
    page: true,
    alt: 'The report as it prints on US Letter, with SAMPLE DATA in the running header.',
  },
];

type Cell = { text: string; headStart?: boolean };
const PLAN: { weeks: string; note?: string; lead: Cell; ui: Cell; ops: Cell }[] = [
  {
    weeks: 'Oct 26 to 30',
    note: 'check-in Oct 30',
    lead: { text: 'Repo and dev Supabase access, app running locally. Agree with you on the first report and how each number is counted.' },
    ui: { text: 'Learn the app, list UI issues on Dashboard and Reports.' },
    ops: { text: 'Map auth flows and endpoints, write the first auth tests.' },
  },
  {
    weeks: 'Nov 2 to 13',
    lead: { text: 'Program report on your real schema: metrics file and tests.', headStart: true },
    ui: { text: 'Report and goal views in your design system.' },
    ops: { text: 'Endpoint tests, row-level security review per table, fixes.', headStart: RLS_SHIPPED },
  },
  {
    weeks: 'Nov 16 to 27',
    lead: { text: 'Funder templates, PDF and Excel export.', headStart: true },
    ui: { text: 'Charts and the data gaps screen.', headStart: true },
    ops: { text: 'Staging deploy, CI on every pull request, env handling.' },
  },
  {
    weeks: 'Nov 30 to Dec 11',
    note: 'spotlight Dec 11',
    lead: { text: "Dry run on one pilot org's data, if you're OK with that. Fix what it finds." },
    ui: { text: 'Polish, phone layout, accessibility pass.' },
    ops: { text: 'Migration docs, security fixes.' },
  },
  {
    weeks: 'Dec 14 to 18',
    note: 'submit Dec 18',
    lead: { text: 'Handover notes, final review sweep.' },
    ui: { text: 'Handover.' },
    ops: { text: 'Handover.' },
  },
];
const ROLES = [
  { key: 'lead', label: 'Abdallah (lead)' },
  { key: 'ui', label: 'Student 2: dashboards and UI' },
  { key: 'ops', label: 'Student 3: auth, tests, deploy' },
] as const;

const HeadStart = () => (
  <span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-accent-tint px-2 py-px align-[1px] text-[11.5px] font-semibold text-accent-deep">Head start</span>
);

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="font-serif text-[23px] font-semibold leading-tight tracking-[-0.01em] sm:text-[26px]">{children}</h2>;
}

export default function Walkthrough() {
  return (
    <>
      <SampleBar link={{ href: '/demo', label: 'Open the demo' }} />
      <main className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6 sm:py-12">
        <article className="paper px-5 py-9 sm:px-14 sm:py-14 lg:px-20">
          <header className="max-w-[44rem]">
            <h1 className="font-serif text-[36px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[50px]">Quarter-end funder report</h1>
            <p className="mt-4 text-[18px] leading-snug text-muted sm:text-[20px]">
              A working slice I built for Philantrix&apos;s Platform Expansion project on Riipen. Sample data, your stack.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/demo" className="btn btn-primary h-11 px-5 text-[15.5px]">
                Open the demo <ForwardIcon />
              </Link>
              <a href={LINKS.repo} className="btn btn-quiet h-11 px-5 text-[15.5px]">
                See the code
              </a>
            </div>
          </header>

          <div className="mt-12 max-w-[40rem] space-y-4 text-[17px] leading-[1.6]">
            <p>
              Your home page says &quot;Every funder wants a different format.&quot; It also says one impact update can mean three days &quot;hunting down spreadsheets,
              consolidating data, reformatting reports.&quot; So I built the quarter-end report I&apos;d want if I ran a program.
            </p>
            <p>
              It takes one quarter of attendance and assignment records from a sample youth mentorship org. Before it builds anything, it checks the data for gaps.
              Then it makes the same quarter into reports for two different funders, and you can click any number to see how it was counted. Names never reach the
              funder copy, and counts under 5 are hidden.
            </p>
          </div>

          <section className="mt-16" aria-labelledby="try">
            <H2 id="try">Try this first</H2>
            <ol className="mt-6 space-y-10">
              {STEPS.map((s, i) => (
                <li key={s.img} className="grid items-start gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10">
                  <p className="flex gap-3 text-[17px] leading-[1.5]">
                    <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-semibold text-paper">{i + 1}</span>
                    <span>{s.text}</span>
                  </p>
                  <Link
                    href="/demo"
                    tabIndex={-1}
                    className={`block overflow-hidden rounded-lg border border-rule bg-desk transition-[border-color] duration-150 hover:border-faint ${s.page ? 'px-[8%] pt-[5%]' : ''}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.img}
                      alt={s.alt}
                      width={s.w}
                      height={s.h}
                      loading={i < 2 ? 'eager' : 'lazy'}
                      className={`block h-auto w-full ${s.page ? 'shadow-[0_1px_2px_oklch(26%_0.03_265/0.08),0_8px_24px_-6px_oklch(26%_0.03_265/0.18)]' : ''}`}
                    />
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          <div className="mt-16 grid gap-x-14 gap-y-14 lg:grid-cols-2">
            <section aria-labelledby="real">
              <H2 id="real">What&apos;s real and what&apos;s sample</H2>
              <ul className="mt-5 space-y-3.5 text-[16px] leading-[1.55]">
                {[
                  ['Real', 'The words and data shapes. Workstreams, Groups, Participants, Engagements, Tracked Goals, Attendances and Assignment Submissions all come from the product screenshots on your site.'],
                  ['Real', 'The stack. Next.js, TypeScript and Tailwind, with Supabase migrations and tests in the repo.'],
                  ['Sample', `The org, ${ORG}, and everyone in it. A script made them up, and every screen and export says so.`],
                  ['Sample', "The two funder templates. They're examples to correct, not real funders' forms."],
                  ['Sample', 'The summary paragraph. Claude drafted the words ahead of time, and the report fills in every number.'],
                ].map(([tag, text]) => (
                  <li key={text} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
                    <span className={`mt-[3px] h-fit justify-self-start rounded px-1.5 py-px text-[12px] font-semibold uppercase tracking-[0.06em] ${tag === 'Real' ? 'bg-accent-tint text-accent-deep' : 'bg-desk-deep text-muted'}`}>
                      {tag}
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="space-y-12">
              <section aria-labelledby="why">
                <H2 id="why">Why I started here</H2>
                <p className="mt-4 text-[16px] leading-[1.6]">
                  The report screenshots on your site are built for one person (&quot;Subject: participant&quot;). Most funders ask about the whole program. So this one
                  treats the workstream as the subject and rolls up the same engagement records. I don&apos;t know what you&apos;ve built since May, so read this as how
                  I&apos;d approach a program report, not a guess at what&apos;s missing.
                </p>
              </section>
              <section aria-labelledby="guessed">
                <H2 id="guessed">What I guessed</H2>
                <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[16px] leading-[1.55] marker:text-faint">
                  <li>That groups meet on a set schedule. The gaps check needs one to spot a session nobody logged.</li>
                  <li>That goals have a start date, so pace can be forecast to the due date.</li>
                  <li>How a funder template is set up. Yours may already work differently.</li>
                  <li>Some table names in the migration. The guessed ones say so in a comment.</li>
                </ul>
              </section>
            </div>
          </div>

          <section className="mt-16" aria-labelledby="plan">
            <H2 id="plan">How I&apos;d run the 8 weeks</H2>
            <p className="mt-4 max-w-[40rem] text-[16px] leading-[1.6]">
              If you take on three students, here&apos;s how I&apos;d split it. It&apos;s a starting point and I expect you&apos;ll change it. About 8 hours a week each, Oct 26
              to Dec 18.
            </p>

            <table className="mt-6 w-full border-collapse text-[14.5px] leading-snug max-md:hidden">
              <thead>
                <tr className="border-b-2 border-ink text-left align-bottom">
                  <th scope="col" className="w-[15%] pb-2 pr-4 font-semibold">Weeks</th>
                  {ROLES.map((r) => (
                    <th key={r.key} scope="col" className="w-[28%] pb-2 pr-4 font-semibold">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN.map((row) => (
                  <tr key={row.weeks} className="border-b border-rule align-top">
                    <th scope="row" className="py-3 pr-4 text-left font-semibold">
                      <span className="num block">{row.weeks}</span>
                      {row.note && <span className="num block text-[12.5px] font-normal text-muted">{row.note}</span>}
                    </th>
                    {ROLES.map((r) => (
                      <td key={r.key} className="py-3 pr-4">
                        {row[r.key].text}
                        {row[r.key].headStart && <HeadStart />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <ol className="mt-6 space-y-4 md:hidden">
              {PLAN.map((row) => (
                <li key={row.weeks} className="rounded-lg border border-rule p-4">
                  <p className="num font-semibold">
                    {row.weeks}
                    {row.note && <span className="font-normal text-muted">, {row.note}</span>}
                  </p>
                  <dl className="mt-2 space-y-2 text-[14.5px] leading-snug">
                    {ROLES.map((r) => (
                      <div key={r.key}>
                        <dt className="text-[12.5px] font-semibold text-muted">{r.label}</dt>
                        <dd>
                          {row[r.key].text}
                          {row[r.key].headStart && <HeadStart />}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[13px] text-muted">Head start marks what this demo already prototypes. Everything else needs your codebase.</p>
            <p className="mt-5 max-w-[40rem] text-[16px] leading-[1.6]">
              I&apos;d review every pull request before it reaches whoever owns the code on your side. You keep the final say on merges.
            </p>
          </section>

          <div className="mt-16 grid gap-x-14 gap-y-14 lg:grid-cols-2">
            <section aria-labelledby="questions">
              <H2 id="questions">Questions I&apos;d bring to our first call</H2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-[16px] leading-[1.55] marker:font-semibold marker:text-muted">
                <li>What does Reports do today beyond the per-participant template? Is a program report already in the works?</li>
                <li>Which funders do your pilot organizations report to, and what do they ask for?</li>
                <li>Who reviews student code, and can we get the repo and a dev Supabase project in week one?</li>
                <li>Do groups keep a set schedule in Philantrix, or only the sessions someone logs?</li>
              </ol>
            </section>
            <section aria-labelledby="hood">
              <H2 id="hood">Under the hood</H2>
              <p className="mt-1 text-[14px] text-muted">For whoever reviews code.</p>
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[16px] leading-[1.55] marker:text-faint">
                <li>One metrics file. Each number is an activity type, a way to count it, a denominator and a period.</li>
                <li>Tests for the awkward cases: someone who joins mid-quarter, a group with no sessions, the same person logged twice in one session, a goal already past due.</li>
                <li>A Supabase migration and one SQL view that does the same roll-up.</li>
                {RLS_SHIPPED && <li>Org-scoped row-level security with pgTAP tests that run in GitHub Actions.</li>}
                <li>A build check that fails if the AI summary contains any number the model typed itself.</li>
              </ul>
            </section>
          </div>

          <section className="mt-16 border-t border-rule pt-8" aria-label="About me">
            <p className="max-w-[44rem] text-[16px] leading-[1.6]">
              I&apos;m Abdallah Safi, a 4th-year Computer Engineering student at TMU. This spring I led a 3-person team at VJDS: 44 FastAPI endpoints over 19 Supabase
              tables with row-level security, and 3 CI/CD workflows with Vercel preview deploys.
            </p>
            <p className="mt-3 flex gap-5 text-[15px] font-semibold">
              <a href={LINKS.github} className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">GitHub</a>
              <a href={LINKS.linkedin} className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">LinkedIn</a>
            </p>
          </section>
        </article>
        <p className="mt-6 px-1 text-center text-[13px] text-muted">
          Built by Abdallah Safi for Philantrix&apos;s Riipen project. Not made or endorsed by Philantrix. All data is sample data.
        </p>
      </main>
    </>
  );
}
