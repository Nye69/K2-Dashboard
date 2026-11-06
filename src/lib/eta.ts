export interface PrinterTimes {
  /** segundos restantes que calcula la propia K2 (websocket de Creality, puerto 9999) */
  printLeftTime?: number;
  printJobTime?: number;
  /** Date.now() del último dato recibido */
  at: number;
}

const FRESH_MS = 15_000;

/** Prefiere los tiempos de la K2 (los mismos que su pantalla y su web); si no llegan, el cálculo propio. */
export function pickTimes(
  k2: PrinterTimes | null,
  fallback: { remaining: number | null; elapsed: number },
  now: number,
): { remaining: number | null; elapsed: number; source: 'printer' | 'estimate' } {
  if (k2 && typeof k2.printLeftTime === 'number' && now - k2.at < FRESH_MS) {
    const dt = Math.round((now - k2.at) / 1000);
    return {
      remaining: Math.max(0, k2.printLeftTime - dt),
      elapsed: typeof k2.printJobTime === 'number' ? k2.printJobTime + dt : fallback.elapsed,
      source: 'printer',
    };
  }
  return { ...fallback, source: 'estimate' };
}

/**
 * Tiempo restante en segundos. Mezcla la estimación del slicer (fiable al principio)
 * con el ritmo real (fiable al final), con un peso igual al progreso, para que no salte.
 */
export function remainingSeconds(i: { progress: number; elapsed: number; estimated?: number }): number | null {
  const p = Math.min(1, Math.max(0, i.progress));
  const byRate = p > 0.005 ? i.elapsed / p - i.elapsed : null;
  const bySlicer = i.estimated ? Math.max(0, i.estimated - i.elapsed) : null;
  if (byRate == null) return bySlicer;
  if (bySlicer == null) return Math.max(0, byRate);
  return Math.max(0, p * byRate + (1 - p) * bySlicer);
}
