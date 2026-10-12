/**
 * Unit handling. Dimensions are stored exactly as entered (value + unit);
 * calculations convert to feet internally and results are displayed in the
 * user's preferred unit system with the unit always shown.
 */
import type { Dim, LengthUnit, UnitSystem } from '../domain/models';

export const FT_PER_UNIT: Record<LengthUnit, number> = {
  ft: 1,
  in: 1 / 12,
  m: 3.280839895013123
};

export const SQFT_PER_SQM = 10.763910416709722;

export function toFeet(d: Dim): number {
  return d.value * FT_PER_UNIT[d.unit];
}

export function fromFeet(feet: number, unit: LengthUnit): number {
  return feet / FT_PER_UNIT[unit];
}

export function sqftToSqm(sqft: number): number {
  return sqft / SQFT_PER_SQM;
}

export function sqmToSqft(sqm: number): number {
  return sqm * SQFT_PER_SQM;
}

export function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function fmtNumber(n: number, places = 2): string {
  return round(n, places).toLocaleString('en-US', { maximumFractionDigits: places, minimumFractionDigits: 0 });
}

/** Original entry, e.g. 12.5 ft or 150 in. */
export function fmtDim(d: Dim | undefined): string {
  if (!d) return '—';
  return `${fmtNumber(d.value)} ${d.unit}`;
}

export function fmtLengthFt(feet: number, system: UnitSystem): string {
  return system === 'metric' ? `${fmtNumber(fromFeet(feet, 'm'))} m` : `${fmtNumber(feet)} ft`;
}

export function fmtArea(sqft: number, system: UnitSystem): string {
  return system === 'metric' ? `${fmtNumber(sqftToSqm(sqft))} m²` : `${fmtNumber(sqft)} sq ft`;
}

export function areaUnitLabel(system: UnitSystem): string {
  return system === 'metric' ? 'm²' : 'sq ft';
}

export function lengthUnitLabel(system: UnitSystem): string {
  return system === 'metric' ? 'm' : 'ft';
}

export type ParseResult = { ok: true; dim: Dim } | { ok: false; error: string };

/**
 * Parse a field-friendly length entry. Accepts:
 *   "12.5" (in the default unit), "12'6\"", "12' 6", "12ft 6in", "150in", "150\"", "3.2m", "3.2 m"
 * Feet-and-inches entries are stored in inches so the original precision is kept.
 */
export function parseLength(raw: string, defaultUnit: LengthUnit): ParseResult {
  const s = raw.trim().toLowerCase().replace(/,/g, '');
  if (s === '') return { ok: false, error: 'Enter a value' };

  const num = (t: string) => Number.parseFloat(t);

  let m = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/);
  if (m) {
    const ft = num(m[1]);
    const inch = m[2] ? num(m[2]) : 0;
    if (inch >= 12) return { ok: false, error: 'Inches must be less than 12 in a feet-and-inches entry' };
    if (inch === 0) return { ok: true, dim: { value: ft, unit: 'ft' } };
    return { ok: true, dim: { value: round(ft * 12 + inch, 4), unit: 'in' } };
  }
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/);
  if (m) return { ok: true, dim: { value: num(m[1]), unit: 'in' } };
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|meter|meters|metre|metres)$/);
  if (m) return { ok: true, dim: { value: num(m[1]), unit: 'm' } };
  m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return { ok: true, dim: { value: num(m[1]), unit: defaultUnit } };
  if (s.startsWith('-')) return { ok: false, error: 'Dimensions cannot be negative' };
  return { ok: false, error: 'Not a recognised length (try 12.5, 12\'6", 150in or 3.8m)' };
}

/** Display a Dim in a friendly way for input fields. */
export function dimToInput(d: Dim | undefined): string {
  if (!d) return '';
  if (d.unit === 'in' && d.value >= 12) {
    const ft = Math.floor(d.value / 12);
    const inch = round(d.value - ft * 12, 4);
    return inch === 0 ? `${ft}'` : `${ft}'${inch}"`;
  }
  return `${d.value}${d.unit === 'ft' ? "'" : d.unit === 'in' ? '"' : 'm'}`;
}
