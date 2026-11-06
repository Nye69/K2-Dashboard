export interface Alert {
  id: string;
  level: 'error' | 'warn';
  title: string;
  detail?: string;
}

export interface AlertInput {
  connected: boolean;
  klippyState: string;
  klippyMessage: string;
  printState: string;
  printMessage: string;
  /** true si la pausa actual la pidió el usuario desde el panel */
  pausedByUser: boolean;
  filamentSensors: { name: string; detected: boolean; enabled: boolean }[];
  /** offSinceMs: desde cuándo la temperatura está a más de 10 °C del objetivo (null si está bien) */
  heaters: { name: string; temp: number; target: number; offSinceMs: number | null }[];
  now: number;
}

export const TEMP_TOLERANCE_C = 10;
export const TEMP_GRACE_MS = 30_000;

export function computeAlerts(i: AlertInput): Alert[] {
  if (!i.connected) {
    return [{ id: 'disconnected', level: 'error', title: 'Sin conexión con la impresora', detail: 'Intentando reconectar…' }];
  }
  const out: Alert[] = [];
  if (i.klippyState === 'error' || i.klippyState === 'shutdown') {
    out.push({
      id: 'klippy',
      level: 'error',
      title: i.klippyState === 'shutdown' ? 'Klipper se ha apagado' : 'Klipper tiene un error',
      detail: i.klippyMessage || undefined,
    });
  }
  if (i.printState === 'error') {
    out.push({ id: 'print_error', level: 'error', title: 'La impresión falló', detail: i.printMessage || undefined });
  }
  if (i.printState === 'paused' && !i.pausedByUser) {
    out.push({
      id: 'paused_unexpected',
      level: 'warn',
      title: 'La impresión se pausó sola',
      detail: i.printMessage || 'Revisa el filamento o la impresora.',
    });
  }
  const active = i.printState === 'printing' || i.printState === 'paused';
  if (active) {
    for (const s of i.filamentSensors) {
      if (s.enabled && !s.detected) {
        out.push({ id: `filament_${s.name}`, level: 'warn', title: 'No se detecta filamento', detail: s.name });
      }
    }
  }
  if (i.printState === 'printing') {
    for (const h of i.heaters) {
      if (h.target > 0 && h.offSinceMs !== null && i.now - h.offSinceMs > TEMP_GRACE_MS) {
        out.push({
          id: `temp_${h.name}`,
          level: 'warn',
          title: `${h.name} fuera de temperatura`,
          detail: `${h.temp.toFixed(0)} °C de ${h.target.toFixed(0)} °C`,
        });
      }
    }
  }
  return out;
}
