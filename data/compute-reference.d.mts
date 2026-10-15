// Types for tests/reference.test.ts. The implementation is plain JavaScript on purpose.
export interface RefData {
  org: unknown;
  participants: unknown[];
  engagements: { id: string; date: string; group_id: string; participant_id: string; activity_type: string; units: number }[];
  checkins: unknown[];
  goals: unknown[];
}
export interface RefFigure { value: number | null; display: string }
export interface RefRate extends RefFigure { group_id: string }
export interface RefPeriod {
  metrics: Record<string, RefFigure>;
  attendance_rate_by_group: RefRate[];
  retention_by_group: RefRate[];
  participants_by_age_range: { total: RefFigure; cells: { age_range: string; value: number; display: string; hidden: string | null }[]; footnote: string | null };
  goals: { id: string; display: string; status: string; forecast: number | null; forecast_display: string | null; forecast_line: string | null }[];
  data_notes: { finding_id: string; kind: string; templates: string[]; text: string }[];
}
export const PERIODS: { id: string; start: string; end: string }[];
export function loadData(dir?: string): RefData;
export function computeAll(
  data: RefData,
  states: Record<string, Record<string, string>>,
): { findings: { id: string }[]; results: Record<string, Record<string, RefPeriod>>; narrativeSlots: Record<string, Record<string, Record<string, Record<string, string>>>> };
