// Calibración de la cama de la K2.
// G29 es la macro de la propia impresora: calienta la cama, hace home, limpia la boquilla, mide una malla de 7×7
// puntos y la guarda (CXSAVE_CONFIG, que guarda sin reiniciar Klipper). START_PRINT no calibra: usa la malla guardada.

export const CALIBRATE_GCODE = 'G29';

/**
 * Calibrar y después imprimir, todo en la misma orden: se ejecuta entera en la impresora,
 * aunque se cierre la app mientras calibra.
 */
export function calibrateThenPrintScript(filename: string): string {
  const safe = filename.replace(/["\n\r]/g, '');
  return `${CALIBRATE_GCODE}\nSDCARD_PRINT_FILE FILENAME="${safe}"`;
}
