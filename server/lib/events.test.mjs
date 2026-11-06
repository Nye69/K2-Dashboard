import { describe, expect, it } from 'vitest';
import { detectEvents } from './events.mjs';

const base = { klippy: 'ready', state: 'printing', filename: 'pieza.gcode', message: '', filament: [true, true] };
const ids = (prev, next) => detectEvents(prev, { ...base, ...next }).map((e) => e.id);

describe('detectEvents', () => {
  it('el primer estado no avisa', () => {
    expect(detectEvents(null, base)).toEqual([]);
  });
  it('sin cambios no avisa', () => {
    expect(ids(base, {})).toEqual([]);
  });
  it('terminada', () => {
    const [e] = detectEvents(base, { ...base, state: 'complete' });
    expect(e).toMatchObject({ id: 'complete', title: 'Impresión terminada', message: 'pieza.gcode' });
  });
  it('error con el mensaje de Klipper y prioridad alta', () => {
    const [e] = detectEvents(base, { ...base, state: 'error', message: 'Heater extruder not heating' });
    expect(e).toMatchObject({ id: 'error', priority: 5 });
    expect(e.message).toContain('Heater extruder not heating');
  });
  it('pausada y cancelada', () => {
    expect(ids(base, { state: 'paused' })).toEqual(['paused']);
    expect(ids(base, { state: 'cancelled' })).toEqual(['cancelled']);
  });
  it('empieza una impresión', () => {
    expect(ids({ ...base, state: 'standby' }, { state: 'printing' })).toEqual(['started']);
  });
  it('reanudar tras pausa no avisa como nueva', () => {
    expect(ids({ ...base, state: 'paused' }, { state: 'printing' })).toEqual([]);
  });
  it('se acaba el filamento durante la impresión', () => {
    expect(ids(base, { filament: [false, true] })).toEqual(['filament']);
    expect(ids({ ...base, state: 'standby' }, { state: 'standby', filament: [false, true] })).toEqual([]);
  });
  it('klipper se apaga', () => {
    expect(ids(base, { klippy: 'shutdown', state: 'error' })).toContain('klippy');
  });
});
