import { parseSlicerTime } from './format';

export interface GcodeHeaderInfo {
  layers?: number;
  /** data URL de la miniatura más grande incluida en el archivo */
  thumbnail?: string;
  /** Cura escribe el tiempo y el filamento en la cabecera */
  estimatedSeconds?: number;
  filamentMeters?: number;
}

export interface GcodeFooterInfo {
  estimatedSeconds?: number;
  filamentGrams?: number;
  filamentType?: string;
}

export function parseGcodeHeader(text: string): GcodeHeaderInfo {
  const info: GcodeHeaderInfo = {};
  // Creality Print / Orca: "; total layer number: 62"   Cura: ";LAYER_COUNT:67"
  const layers = text.match(/^;\s*(?:total layer number:|LAYER_COUNT:)\s*(\d+)/m);
  if (layers) info.layers = parseInt(layers[1], 10);
  // Cura: ";TIME:1710" (segundos) y ";Filament used: 5.28041m"
  const time = text.match(/^;TIME:(\d+(?:\.\d+)?)\s*$/m);
  if (time) info.estimatedSeconds = Math.round(parseFloat(time[1]));
  const meters = text.match(/^;Filament used:\s*([\d.]+)m\b/m);
  if (meters) info.filamentMeters = parseFloat(meters[1]);

  let best: { area: number; data: string } | undefined;
  const re = /^;\s*thumbnail begin (\d+)x(\d+) \d+\s*$([\s\S]*?)^;\s*thumbnail end/gm;
  for (const m of text.matchAll(re)) {
    const area = parseInt(m[1], 10) * parseInt(m[2], 10);
    const data = m[3].replace(/^;\s?/gm, '').replace(/\s+/g, '');
    if (data && (!best || area > best.area)) best = { area, data };
  }
  if (best) info.thumbnail = `data:image/png;base64,${best.data}`;
  return info;
}

export function parseGcodeFooter(text: string): GcodeFooterInfo {
  const info: GcodeFooterInfo = {};
  const time = text.match(/^;\s*estimated printing time[^=]*=\s*(.+)$/m);
  if (time) {
    const s = parseSlicerTime(time[1]);
    if (s !== undefined) info.estimatedSeconds = s;
  }
  const grams = text.match(/^;\s*filament used \[g\]\s*=\s*([\d.]+)/m);
  if (grams) info.filamentGrams = parseFloat(grams[1]);
  const type = text.match(/^;\s*filament_type\s*=\s*([^;\n]+)/m);
  if (type) info.filamentType = type[1].trim();
  return info;
}
