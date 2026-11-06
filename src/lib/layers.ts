/** Índice de capa del visor (0..maxLayer) que corresponde a lo que la impresora ya ha impreso. */
export function printedLayerIndex(sd: { layer?: number; layer_count?: number; progress?: number }, maxLayer: number): number {
  if (maxLayer <= 0) return 0;
  const fraction = sd.layer_count ? (sd.layer ?? 0) / sd.layer_count : (sd.progress ?? 0);
  return Math.min(maxLayer, Math.max(0, Math.round(fraction * maxLayer)));
}
