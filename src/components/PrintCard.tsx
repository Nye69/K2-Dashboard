import { CalendarClock, CircleCheck, Clock, Hourglass, Layers, Pause, Play, Printer, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pickTimes, remainingSeconds } from '../lib/eta';
import { useCrealityTimes } from '../moonraker/crealityLive';
import { formatClock, formatDuration } from '../lib/format';
import { cancelPrint, fileInfo, pausePrint, resumePrint, type FileInfo } from '../moonraker/api';
import { usePrinter } from '../moonraker/usePrinter';
import { useConfirm } from './ConfirmDialog';
import { ObjectsList } from './ObjectsList';

export function useFileInfo(path: string | null | undefined, modified = 0) {
  const [info, setInfo] = useState<FileInfo>({});
  useEffect(() => {
    setInfo({});
    if (!path) return;
    let alive = true;
    fileInfo(path, modified).then((i) => alive && setInfo(i));
    return () => {
      alive = false;
    };
  }, [path, modified]);
  return info;
}

export function PrintCard() {
  const { conn, status, markUserPause } = usePrinter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ps = status.print_stats ?? {};
  const sd = status.virtual_sdcard ?? {};
  const state: string = ps.state ?? 'standby';
  const filename: string = ps.filename ?? '';
  const info = useFileInfo(filename);
  const active = state === 'printing' || state === 'paused';

  const progress: number = sd.progress ?? status.display_status?.progress ?? 0;
  const k2Times = useCrealityTimes();
  const ownElapsed: number = ps.print_duration ?? 0;
  const own = { remaining: remainingSeconds({ progress, elapsed: ownElapsed, estimated: info.estimatedSeconds }), elapsed: ownElapsed };
  const { remaining: rawRemaining, elapsed } = pickTimes(k2Times, own, Date.now());
  const remaining = active ? rawRemaining : null;
  const layer: number | undefined = sd.layer_count ? sd.layer : ps.info?.current_layer ?? undefined;
  const layers: number | undefined = sd.layer_count || ps.info?.total_layer || info.layers;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onPause = () => run(async () => {
    markUserPause();
    await pausePrint();
  });
  const onStop = async () => {
    const ok = await confirm({
      title: '¿Parar la impresión?',
      message: `Se cancelará "${filename}". No se puede reanudar después.`,
      confirmLabel: 'Parar impresión',
      danger: true,
    });
    if (ok) run(cancelPrint);
  };

  const disabled = conn !== 'open' || busy;

  return (
    <section className="card" aria-labelledby="print-title">
      <div className="card-head">
        <Printer size={18} aria-hidden color="var(--text-2)" />
        <h2 id="print-title">Impresión</h2>
      </div>

      {!active ? (
        <div className="idle">
          <CircleCheck size={36} aria-hidden />
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>
            {state === 'complete' ? 'Impresión terminada' : state === 'cancelled' ? 'Impresión cancelada' : state === 'error' ? 'La última impresión falló' : 'Lista para imprimir'}
          </div>
          {filename && state !== 'standby' && <div className="job-sub">{filename}</div>}
          <div className="job-sub" style={{ marginTop: 4 }}>Elige un archivo abajo para empezar.</div>
        </div>
      ) : (
        <>
          <div className="job">
            <div className="thumb">{info.thumbnail ? <img src={info.thumbnail} alt="" /> : <Layers size={28} aria-hidden />}</div>
            <div style={{ minWidth: 0 }}>
              <div className="job-name">{filename}</div>
              <div className="job-sub">
                {state === 'paused' ? 'Pausada' : 'Imprimiendo'}
                {info.filamentType ? ` · ${info.filamentType}` : ''}
                {info.filamentGrams ? ` · ${info.filamentGrams.toFixed(0)} g` : info.filamentMeters ? ` · ${info.filamentMeters.toFixed(1)} m de filamento` : ''}
              </div>
            </div>
          </div>
          <div className="big-pct num">{(progress * 100).toFixed(0)}%</div>
          <div
            className={`bar ${state === 'paused' ? 'paused' : ''}`}
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso de la impresión"
          >
            <i style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="stats">
            <Stat icon={<Hourglass size={14} />} label="Falta" value={formatDuration(remaining)} />
            <Stat icon={<CalendarClock size={14} />} label="Termina" value={remaining != null ? formatClock(Date.now() + remaining * 1000) : '—'} />
            <Stat icon={<Clock size={14} />} label="Lleva" value={formatDuration(elapsed)} />
            <Stat icon={<Layers size={14} />} label="Capa" value={layer != null && layers ? `${layer} / ${layers}` : '—'} />
          </div>
          <div className="actions">
            {state === 'paused' ? (
              <button className="btn go" disabled={disabled} onClick={() => run(resumePrint)}>
                <Play size={18} aria-hidden />Reanudar
              </button>
            ) : (
              <button className="btn" disabled={disabled} onClick={onPause}>
                <Pause size={18} aria-hidden />Pausar
              </button>
            )}
            <button className="btn danger" disabled={disabled} onClick={onStop}>
              <Square size={16} aria-hidden />Parar
            </button>
          </div>
          <ObjectsList />
        </>
      )}
      {error && <div className="alert error" style={{ marginTop: 12 }} role="alert">{error}</div>}
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{icon}{label}</div>
      <div className="value num">{value}</div>
    </div>
  );
}
