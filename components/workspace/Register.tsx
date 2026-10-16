'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { seatKey } from '@/lib/edits';
import { fmtDay, fmtShortDate } from '@/lib/format';
import type { Register as RegisterModel, RegisterCell, RegisterGroup, RegisterRow, RegisterSession } from '@/lib/register';
import type { Sources } from '@/lib/sources';

/** Places on the register to point at: a hovered gap, a row in a list. */
export interface Spot {
  sessions?: string[];
  people?: string[];
  seats?: string[];
}

export interface RegisterProps {
  model: RegisterModel;
  /** The period the reports show. Seats outside it fade. */
  range: { start: string; end: string };
  sources: Sources | null;
  spot: Spot | null;
  selected: { groupId: string; date: string } | null;
  onSelect: (groupId: string, date: string, participantId?: string) => void;
  /** Ticks a seat. Null on touch screens, where a tap only picks the session. */
  onToggle: ((key: string, label: string) => void) | null;
}

const AXIS = 18;
const HEAD = 22;
const GAP = 10;

interface Hit {
  group: RegisterGroup;
  session: RegisterSession;
  row: RegisterRow | null;
  cell: RegisterCell | null;
}

export function Register({ model, range, sources, spot, selected, onSelect, onToggle }: RegisterProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(420);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pitch = width < 400 ? 6 : 8;
  const cellH = pitch - 2;
  const dayW = width / model.days;
  const cellW = Math.max(3, Math.min(cellH + 1, dayW * 2 - 2));
  const cx = (day: number) => day * dayW + dayW / 2;

  // Each group's top edge.
  const layout = useMemo(() => {
    let y = AXIS;
    return model.groups.map((g) => {
      const top = y;
      y += HEAD + g.rows.length * pitch + GAP;
      return { g, top, body: top + HEAD };
    });
  }, [model, pitch]);
  const height = layout.length ? layout[layout.length - 1].body + layout[layout.length - 1].g.rows.length * pitch + 2 : AXIS;

  const [hover, setHover] = useState<Hit | null>(null);
  const [cursor, setCursor] = useState<{ gi: number; ri: number; si: number }>({ gi: 0, ri: 0, si: 0 });
  const [focused, setFocused] = useState(false);

  const hitAt = useCallback(
    (x: number, y: number): Hit | null => {
      for (const { g, body } of layout) {
        if (y < body - 6 || y > body + g.rows.length * pitch + 2) continue;
        let best: RegisterSession | null = null;
        let dist = Infinity;
        for (const s of g.sessions) {
          const d = Math.abs(cx(s.day) - x);
          if (d < dist) {
            dist = d;
            best = s;
          }
        }
        if (!best || dist > Math.max(dayW * 1.6, 6)) return null;
        const ri = Math.floor((y - body) / pitch);
        const row = ri >= 0 && ri < g.rows.length ? g.rows[ri] : null;
        const cell = row?.cells.find((c) => c.date === best!.date) ?? null;
        return { group: g, session: best, row, cell };
      }
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, pitch, dayW],
  );

  const point = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return hitAt(((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height);
  };

  const act = (h: Hit) => {
    if (onToggle && h.cell && h.row && (h.cell.state === 'attended' || h.cell.state === 'absent')) {
      const was = h.cell.state === 'attended';
      onToggle(seatKey(h.row.participantId, h.group.id, h.session.date), `${h.row.name}, ${h.group.name} ${fmtDay(h.session.date)}: ${was ? 'unticked' : 'ticked'}`);
    }
    onSelect(h.group.id, h.session.date, h.row?.participantId);
  };

  // Keyboard: arrows move a cursor over seats, Enter or Space ticks.
  const cursorHit = (): Hit | null => {
    const g = model.groups[cursor.gi];
    if (!g) return null;
    const session = g.sessions[Math.min(cursor.si, g.sessions.length - 1)];
    const row = g.rows[Math.min(cursor.ri, g.rows.length - 1)] ?? null;
    return { group: g, session, row, cell: row?.cells.find((c) => c.date === session.date) ?? null };
  };
  const onKey = (e: React.KeyboardEvent) => {
    const g = model.groups[cursor.gi];
    if (!g) return;
    let { gi, ri, si } = cursor;
    if (e.key === 'ArrowRight') si = Math.min(si + 1, g.sessions.length - 1);
    else if (e.key === 'ArrowLeft') si = Math.max(si - 1, 0);
    else if (e.key === 'ArrowDown') {
      if (ri < g.rows.length - 1) ri++;
      else if (gi < model.groups.length - 1) {
        const date = g.sessions[si]?.date ?? '';
        gi++;
        ri = 0;
        si = nearest(model.groups[gi].sessions, date);
      }
    } else if (e.key === 'ArrowUp') {
      if (ri > 0) ri--;
      else if (gi > 0) {
        const date = g.sessions[si]?.date ?? '';
        gi--;
        ri = model.groups[gi].rows.length - 1;
        si = nearest(model.groups[gi].sessions, date);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      const h = cursorHit();
      if (h) act(h);
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    setCursor({ gi, ri, si });
  };
  const live = focused ? cursorHit() : null;

  const inRange = (date: string) => date >= range.start && date <= range.end;
  const spotSessions = useMemo(() => new Set(spot?.sessions ?? []), [spot]);
  const spotPeople = useMemo(() => new Set(spot?.people ?? []), [spot]);
  const spotSeats = useMemo(() => new Set(spot?.seats ?? []), [spot]);

  return (
    <div ref={wrap} className="relative select-none">
      <div
        role="application"
        tabIndex={0}
        aria-label="Attendance register. Arrow keys move between seats; Enter ticks or unticks."
        aria-describedby="register-live"
        onKeyDown={onKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="rounded-md focus-visible:outline-offset-4"
      >
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          className="block overflow-visible"
          onPointerMove={(e) => e.pointerType === 'mouse' && setHover(point(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const h = point(e as unknown as React.PointerEvent<SVGSVGElement>);
            if (h) act(h);
          }}
          style={{ cursor: hover ? 'pointer' : 'default' }}
          aria-hidden
        >
          <Axis width={width} height={height} days={model.days} start={model.start} dayW={dayW} />
          {layout.map(({ g, top, body }) => {
            const groupDim = sources?.groupId && sources.groupId !== g.id;
            return (
              <g key={g.id} opacity={groupDim ? 0.25 : 1}>
                <text x={0} y={top + 14} className="fill-ink text-[11.5px] font-semibold">
                  {g.name}
                  <tspan className="fill-faint font-medium">{'  '}{g.scheduleLabel.split(',')[0]} · {g.rows.length}</tspan>
                </text>
                {g.sessions.map((s) => {
                  const key = `${g.id}|${s.date}`;
                  const x = cx(s.day) - cellW / 2 - 2;
                  const h = g.rows.length * pitch + 2;
                  const isSel = selected?.groupId === g.id && selected.date === s.date;
                  const isHover = hover?.group.id === g.id && hover.session.date === s.date;
                  const lit = sources?.sessions.has(key);
                  return (
                    <g key={key}>
                      {s.status === 'gap' && <rect x={x} y={body - 3} width={cellW + 4} height={h + 2} rx={2} className="fill-orange-tint stroke-orange" strokeWidth={1} />}
                      {lit && <rect x={x} y={body - 3} width={cellW + 4} height={h + 2} rx={2} className="fill-mah-tint stroke-mah-soft" strokeWidth={1} />}
                      {(isHover || isSel || spotSessions.has(key)) && (
                        <rect x={x - 1} y={body - 4} width={cellW + 6} height={h + 4} rx={3} fill="none" className={isSel || spotSessions.has(key) ? 'stroke-mah' : 'stroke-faint'} strokeWidth={isSel ? 1.5 : 1} />
                      )}
                      {s.status === 'gap' && <circle cx={cx(s.day)} cy={body - 8} r={2.5} className="fill-orange" />}
                      {s.status === 'didnt_run' && <path d={`M${cx(s.day) - 2.5} ${body + 1}l5 5m0 -5l-5 5`} className="stroke-faint" strokeWidth={1.2} />}
                    </g>
                  );
                })}
                {g.rows.map((row, ri) => {
                  const y = body + ri * pitch;
                  // When a number has seats, the seats are the source: the people tint only shows for counts of people alone.
                  const personTone = sources && sources.seats.size === 0 ? sources.people.get(row.participantId) : undefined;
                  const spotted = spotPeople.has(row.participantId);
                  return (
                    <g key={row.participantId}>
                      {(personTone || spotted) && <rect x={-3} y={y - 1} width={width + 6} height={pitch} rx={2} className={spotted ? 'fill-mah-soft/60' : personTone === 'counted' ? 'fill-mah-tint' : 'fill-sunken'} />}
                      {row.cells.map((c) => {
                        const k = seatKey(row.participantId, g.id, c.date);
                        const tone = sources?.seats.get(k);
                        const lit = !sources || tone || personTone || sources.sessions.has(`${g.id}|${c.date}`);
                        const faded = !inRange(c.date) || (sources && (!lit || c.date < sources.start || c.date > sources.end));
                        return <Cell key={c.date} c={c} x={cx(c.day) - cellW / 2} y={y} w={cellW} h={cellH} faded={!!faded} against={tone === 'against'} spotted={spotSeats.has(k)} />;
                      })}
                      {row.inactiveFindingId && row.cells.some((c) => c.idle) && <circle cx={width - 1} cy={y + cellH / 2} r={2} className="fill-orange" />}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {live && (() => {
            const l = layout.find((x) => x.g.id === live.group.id)!;
            const ri = live.row ? live.group.rows.indexOf(live.row) : 0;
            return <rect x={cx(live.session.day) - cellW / 2 - 2} y={l.body + ri * pitch - 2} width={cellW + 4} height={cellH + 4} rx={2} fill="none" className="stroke-mah" strokeWidth={1.5} />;
          })()}
        </svg>
      </div>
      <p id="register-live" aria-live="polite" className="sr-only">
        {live ? describe(live) : ''}
      </p>
      {hover && <Tip hit={hover} x={(cx(hover.session.day) / width) * 100} y={tipY(hover, layout, pitch)} total={height} />}
    </div>
  );
}

function nearest(sessions: RegisterSession[], date: string): number {
  let best = 0;
  sessions.forEach((s, i) => {
    if (Math.abs(Date.parse(s.date) - Date.parse(date)) < Math.abs(Date.parse(sessions[best].date) - Date.parse(date))) best = i;
  });
  return best;
}

function tipY(h: Hit, layout: { g: RegisterGroup; body: number }[], pitch: number): number {
  const l = layout.find((x) => x.g.id === h.group.id)!;
  return h.row ? l.body + h.group.rows.indexOf(h.row) * pitch : l.body - 6;
}

function Cell({ c, x, y, w, h, faded, against, spotted }: { c: RegisterCell; x: number; y: number; w: number; h: number; faded: boolean; against: boolean; spotted: boolean }) {
  let cls: string;
  let stroke = 'none';
  if (c.state === 'attended') cls = c.offRoster ? 'fill-mah/50' : 'fill-mah';
  else if (c.state === 'gap') {
    cls = 'fill-orange-tint';
    stroke = 'var(--color-orange)';
  } else if (c.state === 'unknown') {
    cls = 'fill-surface';
    stroke = 'var(--color-faint)';
  } else if (c.idle) {
    cls = 'fill-orange-tint';
    stroke = 'var(--color-orange)';
  } else cls = against ? 'fill-mah-soft' : 'fill-absent';
  return (
    <g opacity={faded ? 0.16 : 1}>
      <rect x={x} y={y} width={w} height={h} rx={1.2} className={cls} stroke={stroke} strokeWidth={stroke === 'none' ? 0 : 0.9} />
      {c.duplicate && <rect x={x - 1.2} y={y - 1.2} width={w + 2.4} height={h + 2.4} rx={1.8} fill="none" className="stroke-mah-mid" strokeWidth={1} />}
      {c.edited && <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) / 4.2} className={c.state === 'attended' ? 'fill-surface' : 'fill-mah'} />}
      {spotted && <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={2} fill="none" className="stroke-mah" strokeWidth={1.5} />}
    </g>
  );
}

function Axis({ width, height, days, start, dayW }: { width: number; height: number; days: number; start: string; dayW: number }) {
  const ticks: { x: number; label: string }[] = [];
  for (let d = 0; d < days; d++) {
    const iso = new Date(Date.parse(`${start}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
    if (iso.endsWith('-01')) ticks.push({ x: d * dayW, label: fmtShortDate(iso).split(' ')[0] });
  }
  return (
    <g>
      {ticks.map((t) => (
        <g key={t.label}>
          <line x1={t.x} x2={t.x} y1={AXIS - 4} y2={height} className="stroke-line" strokeWidth={1} />
          <text x={t.x + 4} y={11} className="fill-faint text-[11px] font-semibold uppercase tracking-[0.08em]">
            {t.label}
          </text>
        </g>
      ))}
      <line x1={width} x2={width} y1={AXIS - 4} y2={height} className="stroke-line" strokeWidth={1} />
    </g>
  );
}

function describe(h: Hit): string {
  const where = `${h.group.name}, ${fmtDay(h.session.date)}`;
  if (h.session.status === 'gap') return `${where}: nothing logged${h.row ? `. ${h.row.name}` : ''}`;
  if (h.session.status === 'didnt_run') return `${where}: answered, didn't run`;
  if (!h.row) return `${where}: ${h.session.attended} of ${h.session.enrolled} attended`;
  if (!h.cell) return `${h.row.name}, ${where}: not enrolled`;
  return `${h.row.name}, ${where}: ${cellWords(h.cell)}`;
}

function cellWords(c: RegisterCell): string {
  const base = c.state === 'attended' ? 'attended' : c.state === 'absent' ? 'absent' : c.state === 'gap' ? 'nothing logged' : 'ran, attendance not recorded';
  const flags = [c.duplicate && 'logged twice, counted once', c.idle && 'no activity for 30+ days', c.offRoster && 'not enrolled that day', c.edited && 'edited'].filter(Boolean);
  return [base, ...flags].join(', ');
}

function Tip({ hit, x, y, total }: { hit: Hit; x: number; y: number; total: number }) {
  const { group, session, row, cell } = hit;
  const right = x > 62;
  const title = row ? row.name : group.name;
  let line: string;
  if (session.status === 'gap') line = 'Nothing logged. Click to answer.';
  else if (session.status === 'didnt_run') line = "Answered: didn't run";
  else if (session.status === 'ran' && !cell) line = 'Ran, attendance not recorded';
  else if (!row) line = `${session.attended} of ${session.enrolled} attended`;
  else if (!cell) line = 'Not enrolled that day';
  else line = cellWords(cell).replace(/^./, (m) => m.toUpperCase());
  return (
    <div
      className="pointer-events-none absolute z-20 w-max max-w-[15rem] rounded-md bg-ink px-2 py-1 text-[12px] leading-snug text-surface shadow-lg"
      style={{
        left: right ? undefined : `calc(${x}% + 10px)`,
        right: right ? `calc(${100 - x}% + 10px)` : undefined,
        top: `${(y / total) * 100}%`,
        translate: '0 -35%',
      }}
    >
      <span className="font-semibold">{title}</span>
      <span className="text-surface/70">
        {' · '}
        {row ? `${group.name.split(' ')[0]} ${fmtDay(session.date)}` : fmtDay(session.date)}
      </span>
      <span className="block">{line}</span>
    </div>
  );
}
