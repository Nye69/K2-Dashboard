import { describe, expect, it } from 'vitest';
import { isCutByProxy, loadFilamentScript, loadPhase, loadPhaseLabel, reachedLoadTemp } from './filament';

describe('loadFilamentScript', () => {
  it('calienta a 220 °C, espera 90 s con la boquilla caliente y después carga con la macro de la impresora', () => {
    expect(loadFilamentScript()).toBe('M109 S220\nG4 P90000\nLOAD_MATERIAL');
  });
  it('acepta otra temperatura y otra espera', () => {
    expect(loadFilamentScript(240, 60)).toBe('M109 S240\nG4 P60000\nLOAD_MATERIAL');
  });
});

describe('loadPhase', () => {
  it('calentando mientras no llega a la temperatura', () => {
    expect(loadPhase(150.4, null, 0)).toEqual({ step: 'heating', temp: 150 });
    expect(loadPhase(undefined, null, 0)).toEqual({ step: 'heating', temp: 0 });
  });
  it('cuenta atrás desde que llegó a la temperatura', () => {
    expect(loadPhase(220, 1000, 1000)).toEqual({ step: 'soaking', secondsLeft: 90 });
    expect(loadPhase(220, 1000, 61_500)).toEqual({ step: 'soaking', secondsLeft: 30 });
  });
  it('después de la espera, metiendo', () => {
    expect(loadPhase(220, 1000, 91_000)).toEqual({ step: 'loading' });
  });
});

describe('reachedLoadTemp', () => {
  it('da la temperatura por alcanzada con un pequeño margen', () => {
    expect(reachedLoadTemp(217)).toBe(true);
    expect(reachedLoadTemp(216.9)).toBe(false);
    expect(reachedLoadTemp(undefined)).toBe(false);
  });
});

describe('loadPhaseLabel', () => {
  it('textos de cada paso', () => {
    expect(loadPhaseLabel({ step: 'heating', temp: 150 })).toBe('Calentando… 150/220 °C');
    expect(loadPhaseLabel({ step: 'soaking', secondsLeft: 65 })).toBe('Ablandando el color anterior… 1:05');
    expect(loadPhaseLabel({ step: 'loading' })).toBe('Metiendo…');
  });
});

describe('isCutByProxy', () => {
  it('502/504 y peticiones sin respuesta no son errores de la impresora', () => {
    expect(isCutByProxy(new Error('504 Gateway Time-out'))).toBe(true);
    expect(isCutByProxy(new Error('502 Bad Gateway'))).toBe(true);
    expect(isCutByProxy(new TypeError('Failed to fetch'))).toBe(true);
  });
  it('los errores de Klipper sí se muestran', () => {
    expect(isCutByProxy(new Error('Must home axis first'))).toBe(false);
    expect(isCutByProxy(new Error('500 Internal Server Error'))).toBe(false);
  });
});
