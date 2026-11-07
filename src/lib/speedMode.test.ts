import { describe, expect, it } from 'vitest';
import { currentSpeedMode, speedModeScript } from './speedMode';

describe('currentSpeedMode', () => {
  it('QMODE encendido = Silencioso, aunque la velocidad sea 50 %', () => {
    expect(currentSpeedMode(0.5, 1)).toBe('silent');
  });
  it('reconoce cada porcentaje', () => {
    expect(currentSpeedMode(0.5, 0)).toBe('stable');
    expect(currentSpeedMode(1, 0)).toBe('standard');
    expect(currentSpeedMode(1.25, 0)).toBe('ultrafast');
    expect(currentSpeedMode(undefined, undefined)).toBe('standard');
  });
  it('una velocidad que no es de ningún modo no marca ninguno', () => {
    expect(currentSpeedMode(0.8, 0)).toBeNull();
  });
});

describe('speedModeScript', () => {
  it('Silencioso usa la macro de la impresora', () => {
    expect(speedModeScript('silent', false)).toBe('QMODE');
  });
  it('los demás cambian la velocidad', () => {
    expect(speedModeScript('ultrafast', false)).toBe('M220 S125');
  });
  it('si Silencioso estaba activo, primero lo deshace', () => {
    expect(speedModeScript('standard', true)).toBe('QMODE_EXIT\nM220 S100');
  });
});
