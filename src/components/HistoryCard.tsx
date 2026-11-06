import { History, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { formatDuration } from '../lib/format';
import { startPrint } from '../moonraker/api';
import { usePrinter } from '../moonraker/usePrinter';
import { useConfirm } from './ConfirmDialog';

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

const STATUS: Record<string, [string, string]> = {
  completed: ['Terminada', 'ok'],
  in_progress: ['En curso', 'info'],
  cancelled: ['Cancelada', 'warn'],
  error: ['Error', 'err'],
  klippy_shutdown: ['Klipper se apagó', 'err'],
  klippy_disconnect: ['Desconectada', 'err'],
  interrupted: ['Interrumpida', 'err'],
  server_exit: ['Interrumpida', 'err'],
};

const when = (sec: number) =>
  new Date(sec * 1000).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function HistoryCard() {
  const { conn, client, status } = usePrinter();
  const confirm = useConfirm();
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
      setError(`No se pudo cargar el historial (${(e as Error).message})`);
    }
  }, []);

  useEffect(() => {
    if (conn === 'open') load();
  }, [conn, load]);
  useEffect(() => client.onNotify((n) => n.method === 'notify_history_changed' && load()), [client, load]);

  const reprint = async (j: Job) => {
    const ok = await confirm({ title: '¿Imprimir otra vez?', message: j.filename, confirmLabel: 'Imprimir' });
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
        <h2 id="history-title">Historial</h2>
        <div className="spacer" />
        {done.length > 0 && (
          <span className="job-sub num">{done.length} terminadas · {formatDuration(totalTime)} · {totalFil.toFixed(0)} m</span>
        )}
      </div>
      {error && <div className="alert error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
      {jobs === null && !error ? (
        <div className="empty">Cargando…</div>
      ) : jobs && jobs.length === 0 ? (
        <div className="empty">Todavía no hay impresiones.</div>
      ) : (
        <div className="history">
          {shown.map((j) => {
            const [label, tone] = STATUS[j.status] ?? [j.status, 'info'];
            return (
              <div key={j.job_id} className="hist">
                <div className="hist-main">
                  <div className="hist-name">{j.filename}</div>
                  <div className="hist-meta num">
                    <span>{when(j.start_time)}</span>
                    {j.print_duration > 0 && <span>{formatDuration(j.print_duration)}</span>}
                    {j.filament_used > 0 && <span>{(j.filament_used / 1000).toFixed(1)} m</span>}
                  </div>
                </div>
                <span className={`badge ${tone}`}>{label}</span>
                <button
                  className="icon-btn"
                  disabled={!j.exists || printing || conn !== 'open'}
                  onClick={() => reprint(j)}
                  aria-label={`Imprimir otra vez ${j.filename}`}
                  title={j.exists ? 'Imprimir otra vez' : 'El archivo ya no está en la impresora'}
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
          {showAll ? 'Ver menos' : `Ver las ${jobs.length}`}
        </button>
      )}
    </section>
  );
}
