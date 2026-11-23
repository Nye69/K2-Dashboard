import type { TempSample } from '../moonraker/usePrinter';
import { useT } from '../i18n';

const W = 600;
const H = 140;
const PAD = { l: 34, r: 8, t: 8, b: 18 };
const WINDOW_MS = 10 * 60_000;

export function TempChart({ history }: { history: TempSample[] }) {
  const t = useT();
  if (history.length < 2) {
    return <div className="chart empty" style={{ padding: 12 }}>{t('chart.collecting')}</div>;
  }
  const end = history[history.length - 1].t;
  const start = end - WINDOW_MS;
  const maxV = Math.max(60, ...history.flatMap((s) => [s.nozzle, s.nozzleTarget, s.bed, s.bedTarget])) * 1.08;
  const x = (t: number) => PAD.l + ((t - start) / WINDOW_MS) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / maxV) * (H - PAD.t - PAD.b);
  const line = (key: keyof TempSample) => history.map((s) => `${x(s.t).toFixed(1)},${y(s[key] as number).toFixed(1)}`).join(' ');
  const step = maxV > 200 ? 50 : maxV > 100 ? 25 : 20;
  const ticks = Array.from({ length: Math.floor(maxV / step) + 1 }, (_, i) => i * step);
  const last = history[history.length - 1];

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('chart.aria', { nozzle: last.nozzle.toFixed(0), bed: last.bed.toFixed(0) })}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#333333" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#8a8a8a">{v}°</text>
          </g>
        ))}
        <text x={PAD.l} y={H - 4} fontSize={11} fill="#8a8a8a">-10 min</text>
        <text x={W - PAD.r} y={H - 4} fontSize={11} fill="#8a8a8a" textAnchor="end">{t('chart.now')}</text>
        <polyline points={line('nozzleTarget')} fill="none" stroke="var(--nozzle)" strokeOpacity={0.5} strokeDasharray="5 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <polyline points={line('bedTarget')} fill="none" stroke="var(--bed)" strokeOpacity={0.5} strokeDasharray="5 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <polyline points={line('nozzle')} fill="none" stroke="var(--nozzle)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        <polyline points={line('bed')} fill="none" stroke="var(--bed)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="legend">
        <span><i style={{ background: 'var(--nozzle)' }} />{t('temps.nozzle')}</span>
        <span><i style={{ background: 'var(--bed)' }} />{t('temps.bed')}</span>
        <span style={{ color: 'var(--text-3)' }}><i className="dash" />{t('chart.target')}</span>
      </div>
    </div>
  );
}
