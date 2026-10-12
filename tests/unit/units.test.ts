import { describe, expect, it } from 'vitest';
import { fmtArea, parseLength, toFeet, sqftToSqm, dimToInput } from '../../src/services/units';

describe('parseLength', () => {
  it('parses plain numbers in the default unit', () => {
    expect(parseLength('12.5', 'ft')).toEqual({ ok: true, dim: { value: 12.5, unit: 'ft' } });
    expect(parseLength('3.2', 'm')).toEqual({ ok: true, dim: { value: 3.2, unit: 'm' } });
  });
  it('parses feet and inches, keeping precision in inches', () => {
    expect(parseLength(`12'6"`, 'ft')).toEqual({ ok: true, dim: { value: 150, unit: 'in' } });
    expect(parseLength('12ft 6in', 'm')).toEqual({ ok: true, dim: { value: 150, unit: 'in' } });
    expect(parseLength(`12'`, 'm')).toEqual({ ok: true, dim: { value: 12, unit: 'ft' } });
  });
  it('parses explicit units', () => {
    expect(parseLength('150in', 'ft')).toEqual({ ok: true, dim: { value: 150, unit: 'in' } });
    expect(parseLength('3.8 m', 'ft')).toEqual({ ok: true, dim: { value: 3.8, unit: 'm' } });
  });
  it('rejects invalid input', () => {
    expect(parseLength('', 'ft').ok).toBe(false);
    expect(parseLength('abc', 'ft').ok).toBe(false);
    expect(parseLength('-3', 'ft').ok).toBe(false);
    expect(parseLength(`5'14"`, 'ft').ok).toBe(false);
  });
  it('round-trips through dimToInput', () => {
    const r = parseLength(dimToInput({ value: 150, unit: 'in' }), 'ft');
    expect(r).toEqual({ ok: true, dim: { value: 150, unit: 'in' } });
  });
});

describe('conversions', () => {
  it('converts to feet', () => {
    expect(toFeet({ value: 24, unit: 'in' })).toBe(2);
    expect(toFeet({ value: 1, unit: 'm' })).toBeCloseTo(3.28084, 4);
  });
  it('converts areas and formats with units', () => {
    expect(sqftToSqm(10.7639)).toBeCloseTo(1, 3);
    expect(fmtArea(100, 'imperial')).toBe('100 sq ft');
    expect(fmtArea(107.64, 'metric')).toBe('10 m²');
  });
});
