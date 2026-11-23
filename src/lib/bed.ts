// Tamaño de la cama para el visor 3D.
// Creality Print (y OrcaSlicer) escriben al final del G-code el área imprimible del perfil de la impresora:
//   ; printable_area = 0x0,220x0,220x215,0x215
//   ; printable_height = 245
// Si el archivo no lo trae (Cura, etc.), se usa la de la K2 SE: 220 × 215 × 245 mm con el origen delante a la izquierda.

export interface Bed {
  /** ancho (X) y fondo (Y) en mm */
  x: number;
  y: number;
  /** altura imprimible en mm */
  z: number;
  /** esquina delantera izquierda del área imprimible, en coordenadas del G-code */
  minX: number;
  minY: number;
}

export const K2_SE_BED: Bed = { x: 220, y: 215, z: 245, minX: 0, minY: 0 };

/** Solo se mira el final del archivo (ahí está la configuración del slicer) y el principio por si acaso. */
const SCAN = 200_000;

export function bedFromGcode(text: string, fallback: Bed = K2_SE_BED): Bed {
  const part = text.length > SCAN * 2 ? text.slice(0, SCAN) + '\n' + text.slice(-SCAN) : text;
  const area = /^;\s*printable_area\s*=\s*(.+)$/m.exec(part)?.[1];
  const height = Number(/^;\s*printable_height\s*=\s*([\d.]+)/m.exec(part)?.[1]);
  const z = height > 0 && height < 2000 ? height : fallback.z;
  if (!area) return { ...fallback, z };
  const pts = area
    .split(',')
    .map((p) => p.trim().split('x').map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  if (pts.length < 3) return { ...fallback, z };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const x = Math.max(...xs) - minX;
  const y = Math.max(...ys) - minY;
  if (!(x > 10 && y > 10 && x < 2000 && y < 2000)) return { ...fallback, z };
  return { x, y, z, minX, minY };
}
