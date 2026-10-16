// The data gaps check. Finds what a person would otherwise hunt for before a
// report goes out, and turns each one-click answer into a change the metrics
// engine understands.

import { ATTENDANCES, type Dataset, type Participant } from './data';
import { daysBetween } from './format';
import { DEFAULT_SMALL_BELOW } from './privacy';

export const INACTIVE_AFTER_DAYS = 30;

export type AnswerId = 'didnt_run' | 'ran_not_recorded' | 'still_enrolled' | 'left_program';
export type Answers = Partial<Record<string, AnswerId>>;

export interface AnswerOption {
  id: AnswerId;
  label: string;
}

const SESSION_ANSWERS: AnswerOption[] = [
  { id: 'didnt_run', label: "Didn't run" },
  { id: 'ran_not_recorded', label: 'Ran, attendance not recorded' },
];
const INACTIVE_ANSWERS: AnswerOption[] = [
  { id: 'still_enrolled', label: 'Still enrolled' },
  { id: 'left_program', label: 'Left the program' },
];

interface Base {
  id: string;
  answers: AnswerOption[];
}
export interface SessionNotLogged extends Base { kind: 'session_not_logged'; groupId: string; date: string }
export interface InactiveParticipant extends Base { kind: 'inactive_participant'; participantId: string; groupId: string; lastActivity: string; daysInactive: number }
export interface GoalNoDueDate extends Base { kind: 'goal_no_due_date'; goalId: string }
export interface DuplicateRecord extends Base { kind: 'duplicate_record'; participantId: string; groupId: string; date: string; recordIds: string[] }
export type Finding = SessionNotLogged | InactiveParticipant | GoalNoDueDate | DuplicateRecord;
export type FindingKind = Finding['kind'];

const sessionKey = (groupId: string, date: string) => `${groupId}|${date}`;

/** Most recent record of any kind on or before the as-of date. */
export function lastActivity(ds: Dataset, participantId: string): string | null {
  let last: string | null = null;
  for (const e of ds.engagements) {
    if (e.participant_id === participantId && e.date <= ds.asOf && (last === null || e.date > last)) last = e.date;
  }
  return last;
}

export function detectFindings(ds: Dataset): Finding[] {
  const out: Finding[] = [];

  // A session nobody logged leaves no rows, so only the schedule can reveal it.
  const logged = new Set(ds.engagements.filter((e) => e.activity_type === ATTENDANCES).map((e) => sessionKey(e.group_id, e.date)));
  for (const g of ds.groups) {
    for (const d of g.scheduled_dates) {
      if (d <= ds.asOf && !logged.has(sessionKey(g.id, d))) {
        out.push({ id: `gap-${g.id}-${d}`, kind: 'session_not_logged', groupId: g.id, date: d, answers: SESSION_ANSWERS });
      }
    }
  }

  for (const p of ds.participants) {
    if (p.exit_date !== null) continue;
    const last = lastActivity(ds, p.id) ?? p.join_date;
    const idle = daysBetween(last, ds.asOf);
    if (idle >= INACTIVE_AFTER_DAYS) {
      out.push({ id: `inactive-${p.id}`, kind: 'inactive_participant', participantId: p.id, groupId: p.group_id, lastActivity: last, daysInactive: idle, answers: INACTIVE_ANSWERS });
    }
  }

  for (const g of ds.goals) {
    if (g.due_date === null) out.push({ id: `goal-no-due-${g.id}`, kind: 'goal_no_due_date', goalId: g.id, answers: [] });
  }

  const byPersonSession = new Map<string, string[]>();
  for (const e of ds.engagements) {
    if (e.activity_type !== ATTENDANCES) continue;
    const k = `${e.participant_id}|${e.group_id}|${e.date}`;
    byPersonSession.set(k, [...(byPersonSession.get(k) ?? []), e.id]);
  }
  for (const [k, ids] of byPersonSession) {
    if (ids.length < 2) continue;
    const [participantId, groupId, date] = k.split('|');
    out.push({ id: `duplicate-${participantId}-${date}`, kind: 'duplicate_record', participantId, groupId, date, recordIds: ids, answers: [] });
  }
  return out;
}

export const needsAnswer = (f: Finding): boolean => f.answers.length > 0;
export const unansweredCount = (findings: Finding[], answers: Answers): number =>
  findings.filter((f) => needsAnswer(f) && !answers[f.id]).length;

/** The records the engine counts from, after the answers are applied. */
export interface State {
  answers: Answers;
  /** Sessions answered "Ran, attendance not recorded", as group|date. */
  ranNotRecorded: Set<string>;
  /** Participants with any exit date from an answer applied. */
  people: Participant[];
  /** Participants whose exit date came from a "Left the program" answer. */
  exitedByAnswer: Set<string>;
  /** Funder copy hides people counts from 1 up to one below this (lib/privacy.ts). */
  smallBelow: number;
}

export function applyAnswers(ds: Dataset, findings: Finding[], answers: Answers, smallBelow = DEFAULT_SMALL_BELOW): State {
  const ranNotRecorded = new Set<string>();
  const exitOverride = new Map<string, string>();
  for (const f of findings) {
    const a = answers[f.id];
    if (f.kind === 'session_not_logged' && a === 'ran_not_recorded') ranNotRecorded.add(sessionKey(f.groupId, f.date));
    // "Left the program" sets the exit date to the participant's last activity.
    if (f.kind === 'inactive_participant' && a === 'left_program') exitOverride.set(f.participantId, f.lastActivity);
  }
  const people = ds.participants.map((p) => (exitOverride.has(p.id) ? { ...p, exit_date: exitOverride.get(p.id)! } : p));
  return { answers, ranNotRecorded, people, exitedByAnswer: new Set(exitOverride.keys()), smallBelow };
}
