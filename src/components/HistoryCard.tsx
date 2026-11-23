import { History, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { formatDuration } from '../lib/format';
import { startPrint } from '../moonraker/api';
import { usePrinter } from '../moonraker/usePrinter';
import { useConfirm } from './ConfirmDialog';
import { dateLocale, tNow, useLang, useT, type Key, type Lang } from '../i18n';

interface Job {
  job_id: string;
  filename: string;
  status: string;
  start_time: number;
  end_time: number | null;
  print_duration: number;
  filament_used: number;
  exists: boolean;
}

const STATUS: Record<string, [Key, string]> = {
  completed: ['history.completed', 'ok'],
  in_progress: ['history.inProgress', 'info'],
  cancelled: ['history.cancelled', 'warn'],
  error: ['history.error', 'err'],
  klippy_shutdown: ['history.klippyShutdown', 'err'],
  klippy_disconnect: ['history.disconnected', 'err'],
  interrupted: ['history.interrupted', 'err'],
  server_exit: ['history.interrupted', 'err'],
};

const when = (sec: number, lang: Lang) =>
  new Date(sec * 1000).toLocaleString(dateLocale(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function HistoryCard() {
  const { conn, client, status } = usePrinter();
  const confirm = useConfirm();
  const t = useT();
  const lang = useLang();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const printing = ['printing', 'paused'].includes(status.print_stats?.state);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/server/history/list?limit=50&order=desc');
      if (!r.ok) throw new Error(`${r.status}`);
      setJobs((await r.json()).result.jobs);
      setError('');
    } catch (e) {
      setError(tNow('history.loadError', { error: (e as Error).message }));
    }
  }, []);

  useEffect(() => {
    if (conn === 'open') load();
  }, [conn, load]);
  useEffect(() => client.onNotify((n) => n.method === 'notify_history_changed' && load()), [client, load]);

  const reprint = async (j: Job) => {
    const ok = await confirm({ title: t('history.reprintTitle'), message: j.filename, confirmLabel: t('common.print') });
    if (!ok) return;
    try {
      await startPrint(j.filename);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const shown = showAll ? jobs ?? [] : (jobs ?? []).slice(0, 6);
  const done = (jobs ?? []).filter((j) => j.status === 'completed');
  const totalTime = done.reduce((s, j) => s + j.print_duration, 0);
  const totalFil = done.reduce((s, j) => s + j.filament_used, 0) / 1000;

  return (
    <section className="card" aria-labelledby="history-title">
      <div className="card-head">
        <History size={18} aria-hidden color="var(--text-2)" />
        <h2 id="history-title">{t('history.title')}</h2>
        <div className="spacer" />
        {done.length > 0 && (
          <span className="job-sub num">{t('history.summary', { n: done.length, time: formatDuration(totalTime), m: totalFil.toFixed(0) })}</span>
        )}
      </div>
      {error && <div className="alert error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
      {jobs === null && !error ? (
        <div className="empty">{t('common.loading')}</div>
      ) : jobs && jobs.length === 0 ? (
        <div className="empty">{t('history.empty')}</div>
      ) : (
        <div className="history">
          {shown.map((j) => {
            const [key, tone] = STATUS[j.status] ?? [null, 'info'];
            const label = key ? t(key) : j.status;
            return (
              <div key={j.job_id} className="hist">
                <div className="hist-main">
                  <div className="hist-name">{j.filename}</div>
                  <div className="hist-meta num">
                    <span>{when(j.start_time, lang)}</span>
                    {j.print_duration > 0 && <span>{formatDuration(j.print_duration)}</span>}
                    {j.filament_used > 0 && <span>{(j.filament_used / 1000).toFixed(1)} m</span>}
                  </div>
                </div>
                <span className={`badge ${tone}`}>{label}</span>
                <button
                  className="icon-btn"
                  disabled={!j.exists || printing || conn !== 'open'}
                  onClick={() => reprint(j)}
                  aria-label={t('history.reprintAria', { file: j.filename })}
                  title={j.exists ? t('history.reprint') : t('history.gone')}
                >
                  <RotateCw size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {jobs && jobs.length > 6 && (
        <button className="btn" style={{ marginTop: 10, width: '100%' }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? t('history.less') : t('history.all', { n: jobs.length })}
        </button>
      )}
    </section>
  );
}
