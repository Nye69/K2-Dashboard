import { describe, expect, it } from 'vitest';
import { pickTimes, remainingSeconds } from './eta';

describe('remainingSeconds', () => {
  it('al principio manda la estimación del slicer', () => {
    expect(remainingSeconds({ progress: 0, elapsed: 60, estimated: 1710 })).toBe(1650);
  });
  it('se mezcla sin saltos con el ritmo real', () => {
    const a = remainingSeconds({ progress: 0.099, elapsed: 330, estimated: 1710 })!;
    const b = remainingSeconds({ progress: 0.101, elapsed: 336, estimated: 1710 })!;
    expect(Math.abs(a - b)).toBeLessThan(60);
  });
  it('al final manda el ritmo real', () => {
    expect(remainingSeconds({ progress: 0.9, elapsed: 900, estimated: 1710 })).toBeCloseTo(100 * 0.9 + 810 * 0.1, 0);
  });
  it('sin estimación del slicer usa solo el ritmo', () => {
    expect(remainingSeconds({ progress: 0.5, elapsed: 600 })).toBe(600);
    expect(remainingSeconds({ progress: 0, elapsed: 10 })).toBeNull();
  });
  it('nunca negativo', () => {
    expect(remainingSeconds({ progress: 0.2, elapsed: 3000, estimated: 1000 })).toBeGreaterThanOrEqual(0);
  });
});

describe('pickTimes', () => {
  const fallback = { remaining: 1400, elapsed: 600 };
  it('usa el tiempo que calcula la propia K2 si es reciente', () => {
    expect(pickTimes({ printLeftTime: 1068, printJobTime: 641, at: 10_000 }, fallback, 10_400)).toEqual({ remaining: 1068, elapsed: 641, source: 'printer' });
  });
  it('descuenta los segundos desde el último dato', () => {
    expect(pickTimes({ printLeftTime: 1068, printJobTime: 641, at: 10_000 }, fallback, 13_000)).toEqual({ remaining: 1065, elapsed: 644, source: 'printer' });
  });
  it('si el dato de la K2 es viejo o no hay, usa el cálculo propio', () => {
    expect(pickTimes({ printLeftTime: 1068, printJobTime: 641, at: 0 }, fallback, 30_000)).toEqual({ ...fallback, source: 'estimate' });
    expect(pickTimes(null, fallback, 1)).toEqual({ ...fallback, source: 'estimate' });
  });
});
