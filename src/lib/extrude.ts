export const MAX_EXTRUDE_MM = 100;

/** G-code para mover el filamento `mm` (negativo = retraer) a `speed` mm/s, sin cambiar el modo de extrusión. */
export function extrudeScript(mm: number, speed: number): string {
  const amount = Math.max(-MAX_EXTRUDE_MM, Math.min(MAX_EXTRUDE_MM, Math.round(mm)));
  return [
    'SAVE_GCODE_STATE NAME=k2panel_extrude',
    'M83',
    `G1 E${amount} F${Math.round(speed * 60)}`,
    'RESTORE_GCODE_STATE NAME=k2panel_extrude',
  ].join('\n');
}
