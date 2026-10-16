// Edits a viewer makes to the records: tick or untick one person at one
// session. The engine then counts the edited records like any others, so an
// edit moves every number that depends on it, and the data check runs again.

import { ATTENDANCES, type Dataset, type Engagement } from './data';

/** `${participantId}|${groupId}|${date}` */
export type SeatKey = string;
export const seatKey = (participantId: string, groupId: string, date: string): SeatKey => `${participantId}|${groupId}|${date}`;

/** Each edited seat and whether the person attended. Seats not listed keep their records. */
export type Edits = Record<SeatKey, boolean>;

const isAttendance = (e: Engagement) => e.activity_type === ATTENDANCES;

/** The Attendances records for each seat, as logged. */
export function attendanceBySeat(ds: Dataset): Map<SeatKey, Engagement[]> {
  const out = new Map<SeatKey, Engagement[]>();
  for (const e of ds.engagements) {
    if (!isAttendance(e)) continue;
    const k = seatKey(e.participant_id, e.group_id, e.date);
    const list = out.get(k);
    if (list) list.push(e);
    else out.set(k, [e]);
  }
  return out;
}

/**
 * The records with the edits applied. Unticking removes every Attendances
 * record for that seat, duplicates included. Ticking adds one record at the
 * group's session length. With no edits, the dataset itself comes back, so
 * anything cached on it stays valid.
 */
export function applyEdits(ds: Dataset, edits: Edits): Dataset {
  const keys = Object.keys(edits);
  if (!keys.length) return ds;
  const hours = new Map(ds.groups.map((g) => [g.id, g.hours]));
  const engagements = ds.engagements.filter((e) => !(isAttendance(e) && seatKey(e.participant_id, e.group_id, e.date) in edits));
  for (const k of keys.sort()) {
    if (!edits[k]) continue;
    const [participant_id, group_id, date] = k.split('|');
    const units = hours.get(group_id);
    if (units === undefined) throw new Error(`no group ${group_id}`);
    engagements.push({ id: `EDIT-${participant_id}-${group_id}-${date}`, date, group_id, participant_id, activity_type: ATTENDANCES, units });
  }
  return { ...ds, engagements };
}

/**
 * Flips one seat. An edit that puts a seat back the way it was logged is
 * dropped rather than kept, so "edited" always means "differs from the
 * records", and a logged duplicate comes back as it was.
 */
export function toggleSeat(original: Dataset, edits: Edits, key: SeatKey): Edits {
  const logged = attendanceBySeat(original).has(key);
  const now = key in edits ? edits[key] : logged;
  const next = { ...edits };
  if (!now === logged) delete next[key];
  else next[key] = !now;
  return next;
}

/** Sets every listed seat at once (a whole session ticked or cleared), with the same rule. */
export function setSeats(original: Dataset, edits: Edits, keys: SeatKey[], attended: boolean): Edits {
  const logged = attendanceBySeat(original);
  const next = { ...edits };
  for (const k of keys) {
    if (logged.has(k) === attended) delete next[k];
    else next[k] = attended;
  }
  return next;
}
