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
/** The exact total, for the trace panel: "614.5", "614.25", "1,200.0". */
export const fmtHoursExact = (hundredths: number): string => {
  const cents = String(hundredths % 100).padStart(2, '0');
  return `${commas(Math.floor(hundredths / 100))}.${cents.endsWith('0') ? cents[0] : cents}`;
};

/** Percent, rounded half up to a whole number. */
export const fmtPercent = (num: number, den: number): string => `${halfUp(100 * num, den)}%`;

/** One decimal, rounded half up. */
export const fmtDecimal1 = (num: number, den: number): string => {
  const tenths = halfUp(10 * num, den);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
};

/**
 * num ÷ den, rounded half up to `places` decimals (at least `min`), with
 * thousands separators. It adds places until the shown value rounds the same
 * way as the exact one, so 77.496 reads "77.496", never "77.50, shown as 77".
 */
function precise(num: number, den: number, min: number, wholePlaces: number): string {
  const shown = halfUp(num * 10 ** wholePlaces, den);
  for (let places = min; ; places++) {
    const scaled = halfUp(num * 10 ** places, den);
    const back = halfUp(scaled, 10 ** (places - wholePlaces));
    if (back === shown || places >= min + 4) {
      const s = String(scaled).padStart(places + 1, '0');
      return `${commas(Number(s.slice(0, -places)))}.${s.slice(-places)}`;
    }
  }
}

/** The value the trace panel shows next to a rounded percent, e.g. "80.56%". */
export const fmtPercentPrecise = (num: number, den: number): string => `${precise(100 * num, den, 2, 0)}%`;
/** The value the trace panel shows next to a one-decimal figure, e.g. "4.075". */
export const fmtDecimalPrecise = (num: number, den: number): string => precise(num, den, 3, 1);
/** The value the trace panel shows next to a whole number, e.g. "1,142.168". */
export const fmtWholePrecise = (num: number, den: number): string => precise(num, den, 3, 0);

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

/** "Jul 23" inside the period, "Sep 9, 2025" outside it, so an old date never reads as this year's. */
export const fmtDateIn = (iso: string, start: string, end: string): string => (iso >= start && iso <= end ? fmtShortDate(iso) : fmtDate(iso));
