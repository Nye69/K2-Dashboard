// La impresora dice por qué byte del archivo va leyendo (virtual_sdcard.file_position) y el visor sabe en qué
// línea empieza cada capa. Cruzando las dos cosas se sabe exactamente qué capa del visor se está imprimiendo,
// aunque el visor cuente de más (Creality Print sube Z en cada desplazamiento y cada subida parece una capa).

/** Byte en que empieza cada línea (UTF-8, como lo cuenta la impresora). */
export function lineByteOffsets(text: string): Uint32Array {
  const bytes = new TextEncoder().encode(text);
  let lines = 1;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 10) lines++;
  const out = new Uint32Array(lines);
  let n = 1;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 10) out[n++] = i + 1;
  return out;
}

/**
 * Última capa del visor que ya empezó en la posición `pos` del archivo.
 * layerStartLines: línea (0-based) en que empieza cada capa del visor, en orden.
 */
export function layerAtFilePosition(layerStartLines: number[], offsets: Uint32Array, pos: number): number {
  let lo = 0;
  let hi = layerStartLines.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const line = Math.min(Math.max(layerStartLines[mid], 0), offsets.length - 1);
    if (offsets[line] <= pos) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
