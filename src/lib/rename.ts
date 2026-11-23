import { tFor, type T } from '../i18n';

// Reglas para cambiar el nombre de un archivo de la impresora.

const EXT = /\.(gcode|g|gco)$/i;

/** "carpeta/pieza.gcode" → { dir: "carpeta/", base: "pieza", ext: ".gcode" } */
export function splitName(path: string) {
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const name = path.slice(slash + 1);
  const m = name.match(EXT);
  return { dir, base: m ? name.slice(0, -m[0].length) : name, ext: m ? m[0] : '' };
}

/**
 * Nueva ruta a partir de lo que escribe el usuario. Conserva la carpeta y la extensión
 * (si no la escribe, se añade la que tenía). Devuelve { path } o { error }.
 */
export function renameTarget(oldPath: string, input: string, existing: string[] = [], t: T = tFor('es')): { path: string } | { error: string } {
  const { dir, ext } = splitName(oldPath);
  let name = input.trim().replace(/\s+/g, ' ');
  if (!name) return { error: t('rename.empty') };
  if (/[/\\]/.test(name)) return { error: t('rename.slash') };
  if (name.startsWith('.')) return { error: t('rename.dot') };
  if (/[<>:"|?*\u0000-\u001f]/.test(name)) return { error: t('rename.chars') };
  if (!EXT.test(name)) name += ext || '.gcode';
  if (name.length > 150) return { error: t('rename.long') };
  const path = dir + name;
  if (path === oldPath) return { error: t('rename.same') };
  // Moonraker distingue mayúsculas, pero en la pantalla de la impresora se confunden: se trata como repetido.
  if (existing.some((p) => p.toLowerCase() === path.toLowerCase() && p !== oldPath)) return { error: t('rename.exists') };
  return { path };
}
