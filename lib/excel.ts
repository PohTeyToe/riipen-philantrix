// The Excel export: the report as it stands, as plain sheets. Numbers stay
// numeric with display formats; suppressed cells are text. Built from the
// report model, which has no names in it.

import { fmtDate } from './format';
import { smallRange } from './privacy';
import type { MetricKind } from './metrics';
import type { Report } from './report';

export type Cell = string | number | { v: number; z: string } | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
  widths: number[];
}

const FORMAT: Record<MetricKind, string> = { people: '#,##0', count: '#,##0', hours: '#,##0', percent: '0%', decimal: '0.0' };

/** A number keeps its format; a "<5" or an empty value stays as the text shown on the page. */
function cell(kind: MetricKind, value: number | null, display: string): Cell {
  if (value === null || display.startsWith('<')) return display;
  return { v: value, z: FORMAT[kind] };
}

export function workbookSheets(r: Report): Sheet[] {
  const label = `SAMPLE DATA. ${r.sampleLabel.replace(/^Sample data\.\s*/, '')}`;
  const head: Cell[][] = [[label], [r.orgName], [r.templateName], [`Subject: ${r.subject}`], [`Period: ${r.period.range}`], [`As of ${fmtDate(r.asOf)}`], []];
  const sheets: Sheet[] = [];

  const summary: Cell[][] = [...head, ['Metric', 'Value', 'Definition']];
  for (const s of r.sections) if (s.type === 'figures') for (const f of s.figures) summary.push([f.label, cell(f.kind, f.value, f.display), f.definition]);
  const summaryText = r.sections.find((s) => s.type === 'summary');
  if (summaryText?.type === 'summary') summary.push([], ['Summary', summaryText.parts.map((p) => p.text).join('')], ['', summaryText.label]);
  sheets.push({ name: 'Summary', rows: summary, widths: [34, 14, 80] });

  for (const s of r.sections) {
    if (s.type !== 'figures' || !s.chart) continue;
    const rows: Cell[][] = [[label], [], ['Group', s.chart.title.replace(/ by group$/, '')]];
    for (const b of s.chart.bars) rows.push([b.label, cell('percent', b.value, b.display)]);
    sheets.push({ name: 'By group', rows, widths: [22, 22] });
  }

  for (const s of r.sections) {
    if (s.type !== 'figures' || !s.breakdown) continue;
    const b = s.breakdown;
    const rows: Cell[][] = [[label], [], ['Age range', 'Participants served']];
    for (const c of b.cells) rows.push([c.key, cell('people', c.value, c.display)]);
    rows.push(['Total', cell('people', b.total.value, b.total.display)]);
    rows.push([]);
    if (b.cells.some((c) => c.display.startsWith('<'))) rows.push([`<${r.smallBelow} means ${smallRange(r.smallBelow)}.`]);
    if (b.footnote) rows.push([b.footnote]);
    sheets.push({ name: 'Age range', rows, widths: [22, 22] });
  }

  const goals: Cell[][] = [[label], [], ['Goal', 'Progress', 'Target', 'Due', 'Status', 'Forecast']];
  for (const s of r.sections) {
    if (s.type !== 'goals') continue;
    for (const g of s.goals) {
      goals.push([g.name, cell(g.kind, g.value, g.display), g.kind === 'percent' ? { v: g.target, z: '0%' } : { v: g.target, z: '#,##0' }, g.due, g.status, g.forecastLine ?? '']);
    }
  }
  sheets.push({ name: 'Goals', rows: goals, widths: [30, 12, 12, 16, 12, 36] });

  // Like the page: no notes, no notes sheet.
  const notes = r.sections.find((s) => s.type === 'notes');
  if (notes?.type === 'notes') sheets.push({ name: 'Data notes', rows: [[label], [], ['Data note'], ...notes.notes.map((n) => [n])], widths: [110] });

  return sheets;
}

export function fileStem(r: Report): string {
  return `kestrel-lane-sample_${r.templateId}_${r.period.label.toLowerCase().replace(/\s+/g, '-')}`;
}

/** Loads SheetJS only when someone asks for the file. */
export async function downloadExcel(r: Report): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of workbookSheets(r)) {
    const plain = s.rows.map((row) => row.map((c) => (c !== null && typeof c === 'object' ? c.v : c)));
    const ws = XLSX.utils.aoa_to_sheet(plain);
    s.rows.forEach((row, ri) =>
      row.forEach((c, ci) => {
        if (c !== null && typeof c === 'object') {
          const ref = XLSX.utils.encode_cell({ r: ri, c: ci });
          if (ws[ref]) ws[ref].z = c.z;
        }
      }),
    );
    ws['!cols'] = s.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  XLSX.writeFile(wb, `${fileStem(r)}.xlsx`, { compression: true });
}
