// The register: one row per participant, one column per session, as a
// program's paper attendance sheet would have it. It's the records drawn as
// a grid, with the data check's findings marked where they sit.

import { ATTENDANCES, type Dataset } from './data';
import { enrolledOn } from './engine';
import type { Finding, State } from './findings';
import { daysBetween } from './format';
import { seatKey, type Edits, type SeatKey } from './edits';

export type SessionStatus = 'logged' | 'gap' | 'didnt_run' | 'ran';

export interface RegisterSession {
  groupId: string;
  date: string;
  /** Days since the first day of the register. */
  day: number;
  status: SessionStatus;
  /** The data check's finding for a session with nothing logged. */
  findingId: string | null;
  attended: number;
  /** People enrolled in the group that day. */
  enrolled: number;
}

export type CellState = 'attended' | 'absent' | 'gap' | 'unknown';

export interface RegisterCell {
  date: string;
  day: number;
  state: CellState;
  /** Logged more than once for this session. */
  duplicate: boolean;
  /** Attended while not enrolled in the group that day. */
  offRoster: boolean;
  /** No activity since the data check's cut-off, and nobody has answered for them. */
  idle: boolean;
  edited: boolean;
}

export interface RegisterRow {
  participantId: string;
  name: string;
  ageRange: string;
  groupId: string;
  joinDate: string;
  exitDate: string | null;
  /** The data check's finding when this person has had no activity for 30+ days. */
  inactiveFindingId: string | null;
  cells: RegisterCell[];
}

export interface RegisterGroup {
  id: string;
  name: string;
  scheduleLabel: string;
  hours: number;
  sessions: RegisterSession[];
  rows: RegisterRow[];
}

export interface Register {
  start: string;
  end: string;
  /** Days from start to end, both included. */
  days: number;
  groups: RegisterGroup[];
}

export function buildRegister(ds: Dataset, st: State, findings: Finding[], edits: Edits, start: string, end: string): Register {
  const counts = new Map<SeatKey, number>();
  const logged = new Set<string>();
  for (const e of ds.engagements) {
    if (e.activity_type !== ATTENDANCES || e.date < start || e.date > end) continue;
    const k = seatKey(e.participant_id, e.group_id, e.date);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    logged.add(`${e.group_id}|${e.date}`);
  }
  const gapFinding = new Map<string, string>();
  const idleSince = new Map<string, { findingId: string; last: string }>();
  for (const f of findings) {
    if (f.kind === 'session_not_logged') gapFinding.set(`${f.groupId}|${f.date}`, f.id);
    if (f.kind === 'inactive_participant' && !st.answers[f.id]) idleSince.set(f.participantId, { findingId: f.id, last: f.lastActivity });
  }
  const inactiveFinding = new Map(findings.flatMap((f) => (f.kind === 'inactive_participant' ? [[f.participantId, f.id] as const] : [])));

  const groups = ds.groups.map((g): RegisterGroup => {
    const dates = new Set(g.scheduled_dates.filter((d) => d >= start && d <= end));
    for (const s of logged) if (s.startsWith(`${g.id}|`)) dates.add(s.slice(g.id.length + 1));
    const people = st.people.filter((p) => p.group_id === g.id).sort((a, b) => a.display_name.localeCompare(b.display_name) || a.id.localeCompare(b.id));

    const sessions = [...dates].sort().map((date): RegisterSession => {
      const key = `${g.id}|${date}`;
      const findingId = gapFinding.get(key) ?? null;
      const answer = findingId ? st.answers[findingId] : undefined;
      const status: SessionStatus = logged.has(key) ? 'logged' : answer === 'didnt_run' ? 'didnt_run' : answer === 'ran_not_recorded' ? 'ran' : 'gap';
      const roster = people.filter((p) => enrolledOn(p, date));
      return {
        groupId: g.id,
        date,
        day: daysBetween(start, date),
        status,
        findingId,
        attended: people.filter((p) => counts.has(seatKey(p.id, g.id, date))).length,
        enrolled: roster.length,
      };
    });

    const rows = people.map((p): RegisterRow => {
      const idle = idleSince.get(p.id);
      const cells: RegisterCell[] = [];
      for (const s of sessions) {
        const k = seatKey(p.id, g.id, s.date);
        const n = counts.get(k) ?? 0;
        const enrolled = enrolledOn(p, s.date);
        if (!enrolled && n === 0) continue;
        if (s.status === 'didnt_run') continue;
        const state: CellState = s.status === 'gap' ? 'gap' : s.status === 'ran' ? 'unknown' : n > 0 ? 'attended' : 'absent';
        cells.push({
          date: s.date,
          day: s.day,
          state,
          duplicate: n > 1,
          offRoster: n > 0 && !enrolled,
          idle: !!idle && s.date > idle.last && state !== 'attended',
          edited: k in edits,
        });
      }
      return {
        participantId: p.id,
        name: p.display_name,
        ageRange: p.age_range,
        groupId: g.id,
        joinDate: p.join_date,
        exitDate: p.exit_date,
        inactiveFindingId: inactiveFinding.get(p.id) ?? null,
        cells,
      };
    });

    return { id: g.id, name: g.name, scheduleLabel: g.schedule_label, hours: g.hours, sessions, rows };
  });

  return { start, end, days: daysBetween(start, end) + 1, groups };
}
