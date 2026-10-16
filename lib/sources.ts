// Where a number comes from, as places on the register: the seats, the
// participants and the sessions it was counted from. The register lights
// these up when someone opens a number, so the source is visible, not just
// listed. It reads the same measure the number does (lib/engine.ts).

import { periodById, type Dataset, type Period } from './data';
import { measure, type Measure } from './engine';
import type { State } from './findings';
import { seatKey, type SeatKey } from './edits';
import type { MetricId } from './metrics';
import { ageBands, type TraceRef } from './report';
import { bandLabel } from './privacy';

export type SourceTone = 'counted' | 'against';

export interface Sources {
  /** Seats that count toward the number ('counted') or only toward what it's divided by ('against'). */
  seats: Map<SeatKey, SourceTone>;
  /** Participants it counts, or divides by. */
  people: Map<string, SourceTone>;
  /** Sessions it counts, as group|date. */
  sessions: Set<string>;
  /** The dates the number covers. */
  start: string;
  end: string;
  /** A per-group number: the register dims the other groups. */
  groupId: string | null;
}

const empty = (m: Measure): Sources => ({ seats: new Map(), people: new Map(), sessions: new Set(), start: m.start, end: m.end, groupId: m.groupId });

function forMetric(metric: MetricId, m: Measure): Sources {
  const out = empty(m);
  const attendedSeats = () => {
    for (const e of m.attendance) out.seats.set(seatKey(e.participant_id, e.group_id, e.date), 'counted');
  };
  switch (metric) {
    case 'participants_served':
      attendedSeats();
      for (const pid of m.served) out.people.set(pid, 'counted');
      break;
    case 'new_participants':
      for (const p of m.newParticipants) out.people.set(p.id, 'counted');
      break;
    case 'sessions_delivered':
      for (const s of m.sessions) out.sessions.add(`${s.groupId}|${s.date}`);
      break;
    case 'participant_hours':
      attendedSeats();
      break;
    case 'attendance_rate':
      for (const s of m.seats) if (!s.offRoster) out.seats.set(seatKey(s.participantId, s.groupId, s.date), s.attended ? 'counted' : 'against');
      break;
    case 'enrolled_at_start':
      for (const p of m.enrolledAtStart) out.people.set(p.id, 'counted');
      break;
    case 'enrolled_in_period':
      for (const p of m.enrolledAny) out.people.set(p.id, 'counted');
      break;
    case 'participants_exited':
      for (const p of m.exited) out.people.set(p.id, 'counted');
      break;
    case 'retention_rate':
      for (const p of m.enrolledAny) out.people.set(p.id, m.retained.includes(p) ? 'counted' : 'against');
      break;
    case 'assignment_submissions':
      for (const e of m.submissions) out.seats.set(seatKey(e.participant_id, e.group_id, e.date), 'counted');
      break;
    case 'submissions_per_participant':
      for (const e of m.submissions) out.seats.set(seatKey(e.participant_id, e.group_id, e.date), 'counted');
      for (const pid of m.served) out.people.set(pid, 'against');
      break;
    case 'participants_checked_in':
    case 'confidence_improved':
      for (const c of m.checkins) {
        const tone: SourceTone = metric === 'participants_checked_in' || c.improved ? 'counted' : 'against';
        out.people.set(c.participant.id, tone);
        out.seats.set(seatKey(c.participant.id, c.participant.group_id, c.checkin.date), tone);
      }
      break;
  }
  return out;
}

export function sourcesFor(ds: Dataset, st: State, periodId: Period['id'], ref: TraceRef): Sources {
  const period = periodById(periodId);
  if (ref.kind === 'metric') return forMetric(ref.metric, measure(ds, st, period.start, period.end, ref.groupId ?? null));
  if (ref.kind === 'age') {
    const m = measure(ds, st, period.start, period.end);
    const ranges = ref.band ? (ageBands(ds, st.smallBelow).find((r) => bandLabel(r) === ref.band) ?? [ref.band]) : null;
    const age = new Map(st.people.map((p) => [p.id, p.age_range]));
    const inBand = (pid: string) => !ranges || ranges.includes(age.get(pid) ?? '');
    const out = forMetric('participants_served', m);
    for (const pid of [...out.people.keys()]) if (!inBand(pid)) out.people.delete(pid);
    for (const k of [...out.seats.keys()]) if (!inBand(k.split('|')[0])) out.seats.delete(k);
    return out;
  }
  const goal = ds.goals.find((g) => g.id === ref.goalId);
  if (!goal) throw new Error(`no goal ${ref.goalId}`);
  // A goal counts from its own start date to the end of the period.
  return forMetric(goal.metric as MetricId, measure(ds, st, goal.start_date, period.end));
}
