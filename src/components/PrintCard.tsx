import { CalendarClock, CircleCheck, Clock, Hourglass, Layers, Pause, Play, Printer, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pickTimes, remainingSeconds } from '../lib/eta';
import { useCrealityTimes } from '../moonraker/crealityLive';
import { formatClock, formatDuration } from '../lib/format';
import { cancelPrint, fileInfo, pausePrint, resumePrint, type FileInfo } from '../moonraker/api';
import { usePrinter } from '../moonraker/usePrinter';
import { useConfirm } from './ConfirmDialog';
import { ObjectsList } from './ObjectsList';
import { useLang, useT } from '../i18n';

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
  const t = useT();
  const lang = useLang();
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
      title: t('print.stopTitle'),
      message: t('print.stopMessage', { file: filename }),
      confirmLabel: t('print.stopConfirm'),
      danger: true,
    });
    if (ok) run(cancelPrint);
  };

  const disabled = conn !== 'open' || busy;

  return (
    <section className="card" aria-labelledby="print-title">
      <div className="card-head">
        <Printer size={18} aria-hidden color="var(--text-2)" />
        <h2 id="print-title">{t('print.title')}</h2>
      </div>

      {!active ? (
        <div className="idle">
          <CircleCheck size={36} aria-hidden />
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>
            {t(state === 'complete' ? 'print.finished' : state === 'cancelled' ? 'print.cancelled' : state === 'error' ? 'print.lastFailed' : 'print.ready')}
          </div>
          {filename && state !== 'standby' && <div className="job-sub">{filename}</div>}
          <div className="job-sub" style={{ marginTop: 4 }}>{t('print.pickFile')}</div>
        </div>
      ) : (
        <>
          <div className="job">
            <div className="thumb">{info.thumbnail ? <img src={info.thumbnail} alt="" /> : <Layers size={28} aria-hidden />}</div>
            <div style={{ minWidth: 0 }}>
              <div className="job-name">{filename}</div>
              <div className="job-sub">
                {state === 'paused' ? t('print.paused') : t('print.printing')}
                {info.filamentType ? ` · ${info.filamentType}` : ''}
                {info.filamentGrams ? ` · ${info.filamentGrams.toFixed(0)} g` : info.filamentMeters ? ` · ${t('print.meters', { m: info.filamentMeters.toFixed(1) })}` : ''}
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
            aria-label={t('print.progress')}
          >
            <i style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="stats">
            <Stat icon={<Hourglass size={14} />} label={t('print.left')} value={formatDuration(remaining)} />
            <Stat icon={<CalendarClock size={14} />} label={t('print.ends')} value={remaining != null ? formatClock(Date.now() + remaining * 1000, lang) : '—'} />
            <Stat icon={<Clock size={14} />} label={t('print.elapsed')} value={formatDuration(elapsed)} />
            <Stat icon={<Layers size={14} />} label={t('print.layer')} value={layer != null && layers ? `${layer} / ${layers}` : '—'} />
          </div>
          <div className="actions">
            {state === 'paused' ? (
              <button className="btn go" disabled={disabled} onClick={() => run(resumePrint)}>
                <Play size={18} aria-hidden />{t('print.resume')}
              </button>
            ) : (
              <button className="btn" disabled={disabled} onClick={onPause}>
                <Pause size={18} aria-hidden />{t('print.pause')}
              </button>
            )}
            <button className="btn danger" disabled={disabled} onClick={onStop}>
              <Square size={16} aria-hidden />{t('print.stop')}
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
