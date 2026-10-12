/**
 * Measurement and Calculation Engine.
 *
 * Pure functions: given recorded dimensions they return calculated quantities,
 * the formula used, and a list of what is missing. Missing dimensions are never
 * filled in or guessed — the result is reported as incomplete instead.
 */
import type { Dim, RoofLine, RoofLineKind, RoofPlane, RoomMeasurement } from '../domain/models';
import { fmtNumber, round, toFeet } from './units';

export interface CalcResult {
  /** null when the inputs are incomplete. */
  value: number | null;
  formula: string;
  missing: string[];
}

/** Slope factor: length along the roof surface per unit of horizontal run. sqrt(1 + (rise/12)^2). */
export function pitchFactor(rise: number): number {
  return Math.sqrt(1 + (rise / 12) ** 2);
}

export function pitchAngleDegrees(rise: number): number {
  return (Math.atan(rise / 12) * 180) / Math.PI;
}

function ft(d: Dim | undefined): number | null {
  return d ? toFeet(d) : null;
}

/** Surface area of a single roof plane in square feet. */
export function roofPlaneArea(p: RoofPlane): CalcResult {
  const missing: string[] = [];
  const L = ft(p.length);
  const L2 = ft(p.length2);
  const W = ft(p.width);
  let base: number | null = null;
  let formula = '';

  if (p.shape === 'rectangle') {
    if (L === null) missing.push('length');
    if (W === null) missing.push('width');
    if (L !== null && W !== null) base = L * W;
    formula = `length × width = ${fmtNumber(L ?? NaN)} ft × ${fmtNumber(W ?? NaN)} ft`;
  } else if (p.shape === 'triangle') {
    if (L === null) missing.push('base');
    if (W === null) missing.push('height');
    if (L !== null && W !== null) base = (L * W) / 2;
    formula = `½ × base × height = ½ × ${fmtNumber(L ?? NaN)} ft × ${fmtNumber(W ?? NaN)} ft`;
  } else {
    if (L === null) missing.push('side A');
    if (L2 === null) missing.push('side B');
    if (W === null) missing.push('height');
    if (L !== null && L2 !== null && W !== null) base = ((L + L2) / 2) * W;
    formula = `(side A + side B) ÷ 2 × height = (${fmtNumber(L ?? NaN)} + ${fmtNumber(L2 ?? NaN)}) ÷ 2 × ${fmtNumber(W ?? NaN)} ft`;
  }

  if (p.dimensionBasis === 'plan') {
    if (p.pitchRise === undefined) {
      missing.push('pitch (needed to convert plan dimensions to roof surface)');
    } else if (base !== null) {
      const f = pitchFactor(p.pitchRise);
      formula += ` × pitch factor ${fmtNumber(f, 3)} (${p.pitchRise}/12)`;
      base = base * f;
    }
  }

  formula = formula.replace(/NaN/g, '?');
  if (missing.length) return { value: null, formula, missing };
  return { value: round(base as number, 2), formula: `${formula} = ${fmtNumber(base as number)} sq ft`, missing };
}

export interface RoofSummary {
  planeCount: number;
  completePlanes: number;
  totalAreaSqft: number;
  /** Roofing "squares" (1 square = 100 sq ft) of measured area. */
  totalSquares: number;
  incompletePlanes: { id: string; name: string; missing: string[] }[];
  linearTotalsFt: Record<RoofLineKind, number>;
  /** Waste scenarios are estimated material quantities — kept separate from measured area. */
  wasteScenarios: { percent: number; areaSqft: number; squares: number }[];
  sourcesUsed: string[];
}

export function summarizeRoof(planes: RoofPlane[], lines: RoofLine[], wastePercents: number[]): RoofSummary {
  let total = 0;
  let complete = 0;
  const incomplete: RoofSummary['incompletePlanes'] = [];
  const sources = new Set<string>();
  for (const p of planes) {
    const r = roofPlaneArea(p);
    sources.add(p.source);
    if (r.value === null) incomplete.push({ id: p.id, name: p.name, missing: r.missing });
    else {
      total += r.value;
      complete += 1;
    }
  }
  const linear: Record<RoofLineKind, number> = { ridge: 0, hip: 0, valley: 0, eave: 0, rake: 0 };
  for (const l of lines) linear[l.kind] += toFeet(l.length);
  for (const k of Object.keys(linear) as RoofLineKind[]) linear[k] = round(linear[k], 2);

  total = round(total, 2);
  return {
    planeCount: planes.length,
    completePlanes: complete,
    totalAreaSqft: total,
    totalSquares: round(total / 100, 2),
    incompletePlanes: incomplete,
    linearTotalsFt: linear,
    wasteScenarios: [...new Set(wastePercents)]
      .sort((a, b) => a - b)
      .map((percent) => {
        const a = round(total * (1 + percent / 100), 2);
        return { percent, areaSqft: a, squares: round(a / 100, 2) };
      }),
    sourcesUsed: [...sources]
  };
}

export interface RoomCalc {
  floorSqft: number | null;
  ceilingSqft: number | null;
  perimeterFt: number | null;
  grossWallSqft: number | null;
  openingsSqft: number;
  adjustedWallSqft: number | null;
  formulas: { floor: string; perimeter: string; grossWall: string; openings: string; adjustedWall: string };
  missing: string[];
  warnings: string[];
}

export function calcRoom(r: RoomMeasurement): RoomCalc {
  const missing: string[] = [];
  const warnings: string[] = [];
  const L = ft(r.length);
  const W = ft(r.width);
  const H = ft(r.height);
  if (L === null) missing.push('length');
  if (W === null) missing.push('width');
  if (H === null) missing.push('ceiling height');

  // Floor area: main rectangle ± segments.
  let floor: number | null = null;
  let floorFormula = `${fmtNumber(L ?? NaN)} ft × ${fmtNumber(W ?? NaN)} ft`;
  if (L !== null && W !== null) {
    floor = L * W;
    for (const s of r.segments) {
      const a = toFeet(s.length) * toFeet(s.width);
      floor += s.operation === 'add' ? a : -a;
      floorFormula += ` ${s.operation === 'add' ? '+' : '−'} (${s.label || 'segment'} ${fmtNumber(toFeet(s.length))} × ${fmtNumber(toFeet(s.width))})`;
    }
    if (floor < 0) {
      warnings.push('Segments subtract more area than the main rectangle — check the dimensions.');
      floor = null;
    }
  }
  if (floor !== null) floorFormula += ` = ${fmtNumber(floor)} sq ft`;

  // Perimeter: explicit override, else 2 × (L + W). Irregular rooms need an explicit perimeter.
  let perimeter: number | null = null;
  let perimeterFormula: string;
  if (r.perimeterOverride) {
    perimeter = toFeet(r.perimeterOverride);
    perimeterFormula = `entered perimeter = ${fmtNumber(perimeter)} ft`;
  } else if (r.segments.length > 0) {
    perimeterFormula = 'irregular room — enter the measured perimeter to calculate walls';
    missing.push('perimeter (irregular room)');
  } else if (L !== null && W !== null) {
    perimeter = 2 * (L + W);
    perimeterFormula = `2 × (${fmtNumber(L)} + ${fmtNumber(W)}) = ${fmtNumber(perimeter)} ft`;
  } else {
    perimeterFormula = '2 × (length + width) — waiting for dimensions';
  }

  const gross = perimeter !== null && H !== null ? perimeter * H : null;
  const grossFormula =
    gross !== null
      ? `perimeter × height = ${fmtNumber(perimeter as number)} × ${fmtNumber(H as number)} = ${fmtNumber(gross)} sq ft`
      : 'perimeter × height — waiting for dimensions';

  let openings = 0;
  const parts: string[] = [];
  for (const o of r.openings) {
    const a = toFeet(o.width) * toFeet(o.height) * o.quantity;
    openings += a;
    parts.push(`${o.quantity} × ${o.kind} ${fmtNumber(toFeet(o.width))} × ${fmtNumber(toFeet(o.height))}`);
  }
  const openingsFormula = parts.length ? `${parts.join(' + ')} = ${fmtNumber(openings)} sq ft` : 'no openings entered';

  let adjusted: number | null = gross !== null ? gross - openings : null;
  if (adjusted !== null && adjusted < 0) {
    warnings.push('Openings exceed the gross wall area — check door and window sizes.');
    adjusted = null;
  }
  const adjustedFormula =
    adjusted !== null
      ? `gross wall − openings = ${fmtNumber(gross as number)} − ${fmtNumber(openings)} = ${fmtNumber(adjusted)} sq ft`
      : 'gross wall − openings — waiting for dimensions';

  return {
    floorSqft: floor === null ? null : round(floor, 2),
    ceilingSqft: floor === null ? null : round(floor, 2),
    perimeterFt: perimeter === null ? null : round(perimeter, 2),
    grossWallSqft: gross === null ? null : round(gross, 2),
    openingsSqft: round(openings, 2),
    adjustedWallSqft: adjusted === null ? null : round(adjusted, 2),
    formulas: {
      floor: floorFormula.replace(/NaN/g, '?'),
      perimeter: perimeterFormula,
      grossWall: grossFormula,
      openings: openingsFormula,
      adjustedWall: adjustedFormula
    },
    missing,
    warnings
  };
}
