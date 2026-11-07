// Modos de velocidad como en Creality Print.
// "Silencioso" es la macro QMODE de la propia K2: baja aceleración y velocidad máxima, pone la velocidad al 50 %
// y reduce los ventiladores. Solo funciona imprimiendo (la macro no hace nada en reposo). QMODE_EXIT lo deshace.

export type SpeedModeId = 'silent' | 'stable' | 'standard' | 'ultrafast';

export interface SpeedMode {
  id: SpeedModeId;
  label: string;
  /** Porcentaje de velocidad (M220). Silencioso no tiene: lo decide la macro. */
  pct?: number;
}

export const SPEED_MODES: SpeedMode[] = [
  { id: 'silent', label: 'Silencioso' },
  { id: 'stable', label: 'Estable', pct: 50 },
  { id: 'standard', label: 'Estándar', pct: 100 },
  { id: 'ultrafast', label: 'Ultrarrápido', pct: 125 },
];

/** Modo activo según la impresora: Silencioso si QMODE está encendido; si no, el que coincida con la velocidad. */
export function currentSpeedMode(speedFactor: number | undefined, qmodeFlag: number | undefined): SpeedModeId | null {
  if (Number(qmodeFlag) === 1) return 'silent';
  const pct = Math.round((speedFactor ?? 1) * 100);
  return SPEED_MODES.find((m) => m.pct === pct)?.id ?? null;
}

/** G-code para pasar a un modo. Al salir de Silencioso hay que restaurar antes aceleración y ventiladores. */
export function speedModeScript(id: SpeedModeId, qmodeActive: boolean): string {
  if (id === 'silent') return 'QMODE';
  const mode = SPEED_MODES.find((m) => m.id === id)!;
  return [qmodeActive ? 'QMODE_EXIT' : null, `M220 S${mode.pct}`].filter(Boolean).join('\n');
}
