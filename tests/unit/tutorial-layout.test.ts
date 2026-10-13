import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../src/tutorial/Tutorial';
import { TOURS } from '../../src/tutorial/steps';

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;

describe('tutorial overlay positioning', () => {
  it('places the card below a target in the upper half, arrow pointing up at it', () => {
    const l = computeLayout(rect(100, 80, 200, 40), 1200, 800, 180);
    expect(l.arrow!.rotate).toBe(0);
    expect(l.arrow!.top).toBeGreaterThan(120);
    expect(l.card.top).toBeGreaterThan(120);
  });
  it('places the card above a target in the lower half and keeps it on screen', () => {
    const l = computeLayout(rect(20, 700, 100, 40), 390, 844, 200);
    expect(l.arrow!.rotate).toBe(180);
    expect(l.card.top + 200).toBeLessThanOrEqual(700);
    expect(l.card.left).toBeGreaterThanOrEqual(8);
  });
  it('never covers a very tall target', () => {
    const l = computeLayout(rect(0, 50, 390, 700), 390, 844, 220);
    const overlaps = l.card.top < 50 + 700 + 6 && l.card.top + 220 > 50 - 6;
    expect(overlaps && l.card.top > 8 && l.card.top + 220 < 836).toBe(false);
  });
  it('centres the card when the target is missing', () => {
    const l = computeLayout(null, 400, 800, 200);
    expect(l.spot).toBeNull();
    expect(l.card.top).toBe(300);
  });
  it('defines a tutorial with steps for all five modules', () => {
    expect(TOURS.map((t) => t.id).sort()).toEqual(['measure', 'mission', 'notes', 'photos', 'qc']);
    for (const t of TOURS) expect(t.steps.length).toBeGreaterThanOrEqual(5);
  });
});
