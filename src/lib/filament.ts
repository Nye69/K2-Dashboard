// Meter filamento en la K2 sin tener que repetir Extrude varias veces.
// "Sacar filamento" (QUIT_MATERIAL) corta el filamento y enfría la boquilla: el trozo del color anterior se
// queda dentro y se endurece. LOAD_MATERIAL empieza a empujar en cuanto la boquilla marca su temperatura, antes
// de que el calor llegue a ese trozo, y el filamento nuevo no lo puede mover. Calentando antes y esperando con la
// boquilla caliente, sale a la primera (probado en la impresora el 2026-11-23).

import { tFor, type T } from '../i18n';

/** Temperatura a la que calienta la propia macro de carga ([filament_rack] temp). */
export const LOAD_TEMP = 220;
/** Tiempo con la boquilla ya caliente antes de empujar, para que se ablande el trozo que quedó dentro. */
export const LOAD_SOAK_S = 90;
/** Margen para dar la temperatura por alcanzada (M109 espera hasta ~1 °C por debajo). */
const REACHED_MARGIN = 3;

/** Una sola orden: se ejecuta entera en la impresora aunque se cierre la app. */
export function loadFilamentScript(temp = LOAD_TEMP, soakS = LOAD_SOAK_S): string {
  return `M109 S${temp}\nG4 P${Math.round(soakS * 1000)}\nLOAD_MATERIAL`;
}

export type LoadPhase =
  | { step: 'heating'; temp: number }
  | { step: 'soaking'; secondsLeft: number }
  | { step: 'loading' };

export const reachedLoadTemp = (temp: number | undefined) => (temp ?? 0) >= LOAD_TEMP - REACHED_MARGIN;

/**
 * En qué paso va la carga, para mostrarlo en el botón.
 * reachedAt: cuándo (ms) llegó a la temperatura durante esta carga, o null si aún no.
 */
export function loadPhase(temp: number | undefined, reachedAt: number | null, now: number, soakS = LOAD_SOAK_S): LoadPhase {
  if (reachedAt == null) return { step: 'heating', temp: Math.round(temp ?? 0) };
  const left = Math.ceil(soakS - (now - reachedAt) / 1000);
  return left > 0 ? { step: 'soaking', secondsLeft: left } : { step: 'loading' };
}

export function loadPhaseLabel(p: LoadPhase, t: T = tFor('es')): string {
  if (p.step === 'heating') return t('load.heating', { temp: p.temp, target: LOAD_TEMP });
  if (p.step === 'soaking') {
    const m = Math.floor(p.secondsLeft / 60);
    const s = String(p.secondsLeft % 60).padStart(2, '0');
    return t('load.soaking', { time: `${m}:${s}` });
  }
  return t('load.loading');
}

/**
 * La carga tarda unos 3 minutos. Si un proxy corta la petición antes (502/504 o sin respuesta),
 * la orden sigue ejecutándose en la impresora: no es un error de verdad.
 */
export function isCutByProxy(e: unknown): boolean {
  if (e instanceof TypeError) return true; // fetch sin respuesta
  const msg = e instanceof Error ? e.message : String(e);
  return /^(502|504)\b/.test(msg);
}
