import type { GcodeFooterInfo, GcodeHeaderInfo } from './gcodeInfo';

export type FileInfo = GcodeHeaderInfo & GcodeFooterInfo;

const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** URL de una miniatura extraída por Moonraker (relative_path es relativo a la carpeta del G-code). */
export function thumbUrl(gcodePath: string, relativePath: string): string {
  const dir = gcodePath.includes('/') ? gcodePath.slice(0, gcodePath.lastIndexOf('/') + 1) : '';
  return `/server/files/gcodes/${enc(dir + relativePath)}`;
}

interface Meta {
  estimated_time?: number | null;
  layer_count?: number | null;
  filament_total?: number | null;
  filament_weight_total?: number | null;
  filament_type?: string | null;
  thumbnails?: { width: number; height: number; relative_path: string }[] | null;
  [k: string]: unknown;
}

/** Lo que Moonraker ya sabe del archivo (una petición pequeña en vez de leer el G-code). */
export function infoFromMetadata(path: string, m: Meta | null): FileInfo {
  const info: FileInfo = {};
  if (!m) return info;
  if (typeof m.estimated_time === 'number' && m.estimated_time > 0) info.estimatedSeconds = Math.round(m.estimated_time);
  if (typeof m.layer_count === 'number' && m.layer_count > 0) info.layers = m.layer_count;
  if (typeof m.filament_weight_total === 'number' && m.filament_weight_total > 0) info.filamentGrams = m.filament_weight_total;
  else if (typeof m.filament_total === 'number' && m.filament_total > 0) info.filamentMeters = m.filament_total / 1000;
  if (typeof m.filament_type === 'string' && m.filament_type) info.filamentType = m.filament_type;
  const thumbs = (m.thumbnails ?? []).filter((t) => t?.relative_path);
  if (thumbs.length) {
    const best = thumbs.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    info.thumbnail = thumbUrl(path, best.relative_path);
  }
  return info;
}

export const needsFileScan = (i: FileInfo) => !i.thumbnail || !i.estimatedSeconds;
