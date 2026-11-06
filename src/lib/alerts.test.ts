import { describe, expect, it } from 'vitest';
import { computeAlerts, type AlertInput } from './alerts';

const base: AlertInput = {
  connected: true,
  klippyState: 'ready',
  klippyMessage: 'Printer is ready',
  printState: 'printing',
  printMessage: '',
  pausedByUser: false,
  filamentSensors: [{ name: 'filament_sensor', detected: true, enabled: true }],
  heaters: [{ name: 'Boquilla', temp: 220, target: 220, offSinceMs: null }],
  now: 100_000,
};
const ids = (i: Partial<AlertInput>) => computeAlerts({ ...base, ...i }).map((a) => a.id);

describe('computeAlerts', () => {
  it('todo bien = sin alertas', () => expect(ids({})).toEqual([]));

  it('sin conexión tapa todo lo demás', () => {
    expect(ids({ connected: false, printState: 'error' })).toEqual(['disconnected']);
  });

  it('klipper en error o shutdown', () => {
    const a = computeAlerts({ ...base, klippyState: 'shutdown', klippyMessage: 'MCU error' });
    expect(a[0]).toMatchObject({ id: 'klippy', level: 'error', detail: 'MCU error' });
    expect(ids({ klippyState: 'error' })).toContain('klippy');
    expect(ids({ klippyState: 'startup' })).toEqual([]);
  });

  it('impresión en error', () => {
    const a = computeAlerts({ ...base, printState: 'error', printMessage: 'Heater extruder not heating' });
    expect(a.find((x) => x.id === 'print_error')?.detail).toBe('Heater extruder not heating');
  });

  it('pausa inesperada solo si no la pidió el usuario', () => {
    expect(ids({ printState: 'paused' })).toContain('paused_unexpected');
    expect(ids({ printState: 'paused', pausedByUser: true })).not.toContain('paused_unexpected');
  });

  it('sin filamento solo imprimiendo/pausada y con sensor activo', () => {
    const empty = [{ name: 'filament_sensor', detected: false, enabled: true }];
    expect(ids({ filamentSensors: empty })).toContain('filament_filament_sensor');
    expect(ids({ filamentSensors: empty, printState: 'standby' })).not.toContain('filament_filament_sensor');
    expect(ids({ filamentSensors: [{ ...empty[0], enabled: false }] })).toEqual([]);
  });

  it('temperatura fuera de rango más de 30 s mientras imprime', () => {
    const h = (offSinceMs: number | null) => [{ name: 'Cama', temp: 40, target: 60, offSinceMs }];
    expect(ids({ heaters: h(100_000 - 31_000) })).toContain('temp_Cama');
    expect(ids({ heaters: h(100_000 - 10_000) })).not.toContain('temp_Cama');
    expect(ids({ heaters: h(100_000 - 31_000), printState: 'standby' })).not.toContain('temp_Cama');
  });
});
