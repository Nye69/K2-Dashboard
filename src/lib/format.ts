export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** "1d 2h 3m 4s" → segundos. */
export function parseSlicerTime(text: string): number | undefined {
  const units: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
  let total = 0;
  let found = false;
  for (const [, num, unit] of text.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)) {
    total += parseFloat(num) * units[unit];
    found = true;
  }
  return found ? Math.round(total) : undefined;
}

export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  const today = new Date();
  const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return time;
  return `${d.toLocaleDateString('es', { weekday: 'short' })} ${time}`;
}

export function formatDate(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}
