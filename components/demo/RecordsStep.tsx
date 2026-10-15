'use client';

import { useMemo, useState } from 'react';
import { ATTENDANCES, SUBMISSIONS, sample } from '@/lib/data';
import { commas, fmtDate, fmtDay, fmtShortDate } from '@/lib/format';
import { ForwardIcon } from '../icons';

const PAGE = 100;
const START = '2026-07-01';

export function RecordsStep({ onNext }: { onNext: () => void }) {
  const [group, setGroup] = useState('all');
  const [activity, setActivity] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  const people = useMemo(() => new Map(sample.participants.map((p) => [p.id, p])), []);
  const groups = useMemo(() => new Map(sample.groups.map((g) => [g.id, g])), []);
  const all = useMemo(
    () =>
      sample.engagements
        .filter((e) => e.date >= START && e.date <= sample.asOf)
        .sort((a, b) => a.date.localeCompare(b.date) || a.group_id.localeCompare(b.group_id) || b.activity_type.localeCompare(a.activity_type) || a.participant_id.localeCompare(b.participant_id)),
    [],
  );
  const rows = all.filter((e) => (group === 'all' || e.group_id === group) && (activity === 'all' || e.activity_type === activity));
  const filtered = group !== 'all' || activity !== 'all';
  const shown = rows.slice(0, limit);

  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="font-serif text-[26px] font-semibold leading-tight tracking-[-0.01em]">Records</h1>
          <p className="num mt-1 text-[15px]">
            {commas(sample.participants.length)} participants, {sample.groups.length} groups, {commas(all.length)} records
          </p>
          <p className="text-[13.5px] text-muted">
            Engagements logged {fmtShortDate(START)} to {fmtDate(sample.asOf)}, as of {fmtShortDate(sample.asOf)}
          </p>
        </div>
        <button type="button" onClick={onNext} className="btn btn-primary">
          Check data <ForwardIcon />
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-muted">
          Group
          <select className="field-select min-w-[11rem]" value={group} onChange={(e) => { setGroup(e.target.value); setLimit(PAGE); }}>
            <option value="all">All groups</option>
            {sample.groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-muted">
          Activity type
          <select className="field-select min-w-[13rem]" value={activity} onChange={(e) => { setActivity(e.target.value); setLimit(PAGE); }}>
            <option value="all">All activity types</option>
            <option value={ATTENDANCES}>{ATTENDANCES}</option>
            <option value={SUBMISSIONS}>{SUBMISSIONS}</option>
          </select>
        </label>
        {filtered && (
          <p className="num pb-2 text-[13.5px] text-muted">
            {commas(rows.length)} of {commas(all.length)} records
          </p>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-rule bg-paper">
        <table className="w-full border-collapse text-[14px] max-sm:hidden">
          <thead>
            <tr className="border-b border-rule bg-desk/60 text-left text-[12.5px] text-muted">
              <th scope="col" className="px-4 py-2 font-semibold">Date</th>
              <th scope="col" className="px-3 py-2 font-semibold">Group</th>
              <th scope="col" className="px-3 py-2 font-semibold">Participant</th>
              <th scope="col" className="px-3 py-2 font-semibold">Activity type</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Duration / Units</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id} className="border-b border-rule last:border-b-0">
                <td className="num whitespace-nowrap px-4 py-1.5 text-muted">{fmtDay(e.date)}</td>
                <td className="whitespace-nowrap px-3 py-1.5">{groups.get(e.group_id)?.name}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-medium">{people.get(e.participant_id)?.display_name}</td>
                <td className="px-3 py-1.5">{e.activity_type}</td>
                <td className="num px-4 py-1.5 text-right">{e.units}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="sm:hidden" aria-label="Records">
          {shown.map((e) => (
            <li key={e.id} className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-rule px-4 py-2.5 last:border-b-0">
              <span className="font-medium">{people.get(e.participant_id)?.display_name}</span>
              <span className="num text-right">{e.units}</span>
              <span className="num text-[13px] text-muted">
                {fmtDay(e.date)}, {groups.get(e.group_id)?.name}
              </span>
              <span className="text-right text-[13px] text-muted">{e.activity_type}</span>
            </li>
          ))}
        </ul>
        {rows.length > limit && (
          <div className="border-t border-rule px-4 py-3">
            <button type="button" className="btn btn-quiet" onClick={() => setLimit(rows.length)}>
              Show all {commas(rows.length)} records
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
