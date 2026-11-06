/**
 * Compara dos instantáneas del estado de la impresora y devuelve los avisos a enviar.
 * snapshot = { klippy, state, filename, message, filament: boolean[] }
 */
export function detectEvents(prev, next) {
  if (!prev) return [];
  const out = [];
  const file = next.filename || prev.filename || '';

  if (prev.state !== next.state) {
    switch (next.state) {
      case 'printing':
        if (prev.state !== 'paused') out.push({ id: 'started', title: 'Empezó la impresión', message: file, priority: 2, tags: ['printer'] });
        break;
      case 'complete':
        out.push({ id: 'complete', title: 'Impresión terminada', message: file, priority: 4, tags: ['white_check_mark'] });
        break;
      case 'error':
        out.push({ id: 'error', title: 'La impresión falló', message: [file, next.message].filter(Boolean).join('\n'), priority: 5, tags: ['x'] });
        break;
      case 'paused':
        out.push({ id: 'paused', title: 'Impresión pausada', message: [file, next.message].filter(Boolean).join('\n'), priority: 4, tags: ['pause_button'] });
        break;
      case 'cancelled':
        out.push({ id: 'cancelled', title: 'Impresión cancelada', message: file, priority: 3, tags: ['stop_button'] });
        break;
    }
  }

  const active = next.state === 'printing' || next.state === 'paused';
  const lost = (next.filament ?? []).some((has, i) => !has && (prev.filament ?? [])[i] !== false);
  if (active && lost) {
    out.push({ id: 'filament', title: 'No se detecta filamento', message: file, priority: 5, tags: ['warning'] });
  }

  if (prev.klippy !== next.klippy && (next.klippy === 'shutdown' || next.klippy === 'error')) {
    out.push({ id: 'klippy', title: 'Klipper tiene un error', message: next.klippyMessage || '', priority: 5, tags: ['rotating_light'] });
  }
  return out;
}
