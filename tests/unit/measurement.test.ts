import { describe, expect, it } from 'vitest';
import type { RoofPlane, RoomMeasurement } from '../../src/domain/models';
import { calcRoom, pitchFactor, roofPlaneArea, summarizeRoof } from '../../src/services/measurement';

const base = { createdAt: '', updatedAt: '', notes: '', revisions: [] };
const plane = (p: Partial<RoofPlane>): RoofPlane => ({
  id: 'p', name: 'P', shape: 'rectangle', dimensionBasis: 'slope', source: 'measured', ...base, ...p
});
const ft = (value: number) => ({ value, unit: 'ft' as const });

describe('roof planes', () => {
  it('calculates rectangle, triangle and trapezoid areas', () => {
    expect(roofPlaneArea(plane({ length: ft(40), width: ft(16) })).value).toBe(640);
    expect(roofPlaneArea(plane({ shape: 'triangle', length: ft(30), width: ft(14) })).value).toBe(210);
    expect(roofPlaneArea(plane({ shape: 'trapezoid', length: ft(40), length2: ft(20), width: ft(10) })).value).toBe(300);
  });
  it('applies the pitch factor only for plan (horizontal) dimensions', () => {
    expect(pitchFactor(12)).toBeCloseTo(Math.SQRT2, 6);
    const r = roofPlaneArea(plane({ length: ft(10), width: ft(10), pitchRise: 12, dimensionBasis: 'plan' }));
    expect(r.value).toBeCloseTo(141.42, 2);
    expect(r.formula).toContain('pitch factor');
    expect(roofPlaneArea(plane({ length: ft(10), width: ft(10), pitchRise: 12 })).value).toBe(100);
  });
  it('reports missing dimensions instead of guessing', () => {
    const r = roofPlaneArea(plane({ length: ft(10) }));
    expect(r.value).toBeNull();
    expect(r.missing).toEqual(['width']);
    const p = roofPlaneArea(plane({ length: ft(10), width: ft(10), dimensionBasis: 'plan' }));
    expect(p.value).toBeNull();
    expect(p.missing[0]).toMatch(/pitch/);
  });
  it('keeps measured area separate from waste scenarios and excludes incomplete planes', () => {
    const s = summarizeRoof(
      [plane({ id: 'a', length: ft(50), width: ft(20) }), plane({ id: 'b', name: 'B', length: ft(10) })],
      [{ id: 'l', kind: 'eave', length: ft(50), source: 'measured', ...base }],
      [15, 10]
    );
    expect(s.totalAreaSqft).toBe(1000);
    expect(s.totalSquares).toBe(10);
    expect(s.incompletePlanes).toHaveLength(1);
    expect(s.wasteScenarios).toEqual([
      { percent: 10, areaSqft: 1100, squares: 11 },
      { percent: 15, areaSqft: 1150, squares: 11.5 }
    ]);
    expect(s.linearTotalsFt.eave).toBe(50);
  });
});

const room = (r: Partial<RoomMeasurement>): RoomMeasurement => ({
  id: 'r', name: 'Kitchen', level: '', segments: [], openings: [], source: 'measured', ...base, ...r
});

describe('rooms', () => {
  it('calculates floor, ceiling, gross and adjusted wall areas', () => {
    const c = calcRoom(
      room({
        length: ft(14), width: ft(12), height: ft(8),
        openings: [
          { id: 'd', kind: 'door', width: ft(3), height: { value: 80, unit: 'in' }, quantity: 1 },
          { id: 'w', kind: 'window', width: ft(4), height: { value: 42, unit: 'in' }, quantity: 2 }
        ]
      })
    );
    expect(c.floorSqft).toBe(168);
    expect(c.ceilingSqft).toBe(168);
    expect(c.perimeterFt).toBe(52);
    expect(c.grossWallSqft).toBe(416);
    expect(c.openingsSqft).toBe(48);
    expect(c.adjustedWallSqft).toBe(368);
  });
  it('supports segmented irregular rooms and requires a perimeter for walls', () => {
    const c = calcRoom(
      room({
        length: ft(10), width: ft(10), height: ft(8),
        segments: [{ id: 's', label: 'Nook', length: ft(4), width: ft(5), operation: 'add' }]
      })
    );
    expect(c.floorSqft).toBe(120);
    expect(c.adjustedWallSqft).toBeNull();
    expect(c.missing).toContain('perimeter (irregular room)');
    const withPerim = calcRoom(
      room({
        length: ft(10), width: ft(10), height: ft(8), perimeterOverride: ft(48),
        segments: [{ id: 's', label: 'Nook', length: ft(4), width: ft(5), operation: 'add' }]
      })
    );
    expect(withPerim.grossWallSqft).toBe(384);
  });
  it('handles metric dimensions', () => {
    const c = calcRoom(room({ length: { value: 4, unit: 'm' }, width: { value: 3, unit: 'm' }, height: { value: 2.5, unit: 'm' } }));
    expect(c.floorSqft).toBeCloseTo(129.17, 1);
  });
  it('lists missing dimensions', () => {
    const c = calcRoom(room({ length: ft(10) }));
    expect(c.missing).toEqual(['width', 'ceiling height']);
    expect(c.floorSqft).toBeNull();
  });
});
