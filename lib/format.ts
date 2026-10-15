// The one formatter. Every figure on screen, in the PDF and in the Excel file
// goes through these functions, so a number can't round two different ways.

/** Exact half-up rounding of num ÷ den for non-negative integers. */
export const halfUp = (num: number, den: number): number => Math.floor((2 * num + den) / (2 * den));

export const commas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Whole counts, with thousands separators. */
export const fmtCount = (n: number): string => commas(n);

/** Hours are held as hundredths so sums stay exact. */
export const toHundredths = (hours: number): number => Math.round(hours * 100);
export const fmtHours = (hundredths: number): string => commas(halfUp(hundredths, 100));

/** Percent, rounded half up to a whole number. */
export const fmtPercent = (num: number, den: number): string => `${halfUp(100 * num, den)}%`;

/** One decimal, rounded half up. */
export const fmtDecimal1 = (num: number, den: number): string => {
  const tenths = halfUp(10 * num, den);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
};

/**
 * The unrounded value the trace panel shows next to the rounded one. Cut off,
 * not rounded, so 77.49% never reads as "77.5%, shown as 77%".
 */
export const fmtPercentPrecise = (num: number, den: number): string => `${(Math.floor((10000 * num) / den) / 100).toFixed(2)}%`;
export const fmtDecimalPrecise = (num: number, den: number): string => (Math.floor((1000 * num) / den) / 1000).toFixed(3);

// ---------- dates (ISO yyyy-mm-dd, all in UTC) ----------
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
export const daysBetween = (from: string, to: string): number => Math.round((toMs(to) - toMs(from)) / DAY_MS);

/** "Thu Jul 23" */
export const fmtDay = (iso: string): string => {
  const d = new Date(toMs(iso));
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** "Jul 23" */
export const fmtShortDate = (iso: string): string => {
  const d = new Date(toMs(iso));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** "Sep 30, 2026" */
export const fmtDate = (iso: string): string => `${fmtShortDate(iso)}, ${iso.slice(0, 4)}`;
