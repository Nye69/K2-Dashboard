import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, parseSlicerTime } from './format';

describe('formatDuration', () => {
  it('horas y minutos', () => expect(formatDuration(5040)).toBe('1 h 24 min'));
  it('solo minutos', () => expect(formatDuration(1939)).toBe('32 min'));
  it('segundos', () => expect(formatDuration(45)).toBe('45 s'));
  it('días', () => expect(formatDuration(90000)).toBe('1 d 1 h'));
  it('valores inválidos', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(NaN)).toBe('—');
    expect(formatDuration(-3)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
  });
});

describe('formatBytes', () => {
  it('MB', () => expect(formatBytes(2237205)).toBe('2.1 MB'));
  it('KB', () => expect(formatBytes(2048)).toBe('2 KB'));
  it('B', () => expect(formatBytes(512)).toBe('512 B'));
});

describe('parseSlicerTime', () => {
  it('m s', () => expect(parseSlicerTime('32m 19s')).toBe(1939));
  it('h m s', () => expect(parseSlicerTime('1h 2m 3s')).toBe(3723));
  it('d h', () => expect(parseSlicerTime('1d 2h')).toBe(93600));
  it('basura', () => expect(parseSlicerTime('abc')).toBeUndefined());
});
