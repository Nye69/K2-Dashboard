// Convierte las piezas que marca Cura (";MESH:nombre") en las órdenes de Klipper para poder
// cancelar una pieza durante la impresión (EXCLUDE_OBJECT_DEFINE / _START / _END).
// Creality Print ya las escribe; Cura no, y Moonraker tiene ese preprocesado apagado en la K2.

export interface LabelResult {
  text: string;
  /** Nombres de las piezas tal como los verá Klipper. */
  objects: string[];
}

const MESH = ';MESH:';
const NONMESH = 'NONMESH';

/** Nombre válido para Klipper (sin espacios ni comillas), legible. */
export function objectName(raw: string): string {
  const base = raw.trim().replace(/\.(stl|3mf|obj|step|stp)$/i, '');
  const clean = base.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
  return clean || 'pieza';
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * Añade las etiquetas de Klipper a un G-code de Cura con varias piezas.
 * Devuelve null si no hace falta: ya etiquetado, sin marcas de Cura o con una sola pieza.
 */
export function labelCuraObjects(gcode: string): LabelResult | null {
  if (gcode.includes('EXCLUDE_OBJECT_DEFINE')) return null;
  if (!gcode.includes(MESH)) return null;

  const lines = gcode.split('\n');

  // 1.ª pasada: piezas (nombre de Cura → nombre para Klipper) y su contorno a partir de los movimientos que extruyen.
  const names = new Map<string, string>();
  const used = new Set<string>();
  const box = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
  let current: string | null = null;
  let x = NaN;
  let y = NaN;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith(MESH)) {
      const mesh = line.slice(MESH.length).trim();
      if (mesh === NONMESH || !mesh) {
        current = null;
        continue;
      }
      if (!names.has(mesh)) {
        let n = objectName(mesh);
        for (let i = 2; used.has(n); i++) n = `${objectName(mesh)}_${i}`;
        used.add(n);
        names.set(mesh, n);
      }
      current = names.get(mesh)!;
      continue;
    }
    if (line.startsWith(';LAYER:') || line.startsWith(';TIME_ELAPSED:')) {
      current = null;
      continue;
    }
    if (line.startsWith('G0') || line.startsWith('G1')) {
      const mx = /\bX(-?[\d.]+)/.exec(line);
      const my = /\bY(-?[\d.]+)/.exec(line);
      if (mx) x = Number(mx[1]);
      if (my) y = Number(my[1]);
      if (current && /\bE-?[\d.]+/.test(line) && (mx || my) && Number.isFinite(x) && Number.isFinite(y)) {
        const b = box.get(current) ?? { minX: x, minY: y, maxX: x, maxY: y };
        b.minX = Math.min(b.minX, x);
        b.minY = Math.min(b.minY, y);
        b.maxX = Math.max(b.maxX, x);
        b.maxY = Math.max(b.maxY, y);
        box.set(current, b);
      }
    }
  }

  const objects = [...names.values()];
  if (objects.length < 2) return null;

  const defines = objects.map((n) => {
    const b = box.get(n);
    if (!b) return `EXCLUDE_OBJECT_DEFINE NAME=${n}`;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const poly = `[[${fmt(b.minX)},${fmt(b.minY)}],[${fmt(b.maxX)},${fmt(b.minY)}],[${fmt(b.maxX)},${fmt(b.maxY)}],[${fmt(b.minX)},${fmt(b.maxY)}]]`;
    return `EXCLUDE_OBJECT_DEFINE NAME=${n} CENTER=${fmt(cx)},${fmt(cy)} POLYGON=${poly}`;
  });

  // 2.ª pasada: escribir. Las definiciones van justo antes de la primera capa (después del G-code de inicio).
  const out: string[] = [];
  let defined = false;
  current = null;
  const close = () => {
    if (current) out.push(`EXCLUDE_OBJECT_END NAME=${current}`);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!defined && line.startsWith(';LAYER:')) {
      out.push('; --- Piezas para poder cancelarlas por separado (añadido por K2 Dashboard) ---', ...defines);
      defined = true;
    }
    if (line.startsWith(';LAYER:') || line.startsWith(';TIME_ELAPSED:') || line.startsWith(';End of Gcode')) close();
    if (line.startsWith(MESH)) {
      close();
      out.push(raw);
      const mesh = line.slice(MESH.length).trim();
      const n = names.get(mesh);
      if (n) {
        out.push(`EXCLUDE_OBJECT_START NAME=${n}`);
        current = n;
      }
      continue;
    }
    out.push(raw);
  }
  close();
  if (!defined) return null; // sin capas: no es un G-code de Cura normal

  return { text: out.join('\n'), objects };
}
