import { LoaderCircle, LogOut, Printer, RotateCw, Settings, Wifi, WifiOff } from 'lucide-react';
import { usePrinter } from '../moonraker/usePrinter';
import { useT, type Key } from '../i18n';

const PRINT_LABEL: Record<string, [Key, string]> = {
  printing: ['top.printing', 'ok'],
  paused: ['top.paused', 'warn'],
  complete: ['top.complete', 'info'],
  cancelled: ['top.cancelled', 'warn'],
  error: ['top.error', 'err'],
  standby: ['top.ready', 'ok'],
};

export function TopBar({ onSettings, name }: { onSettings: () => void; name: string }) {
  const { conn, status } = usePrinter();
  const t = useT();
  const klippy: string = status.webhooks?.state ?? '';
  const print: string = status.print_stats?.state ?? '';

  let state: [string, string] = ['—', ''];
  if (conn === 'open') {
    const [key, tone]: [Key, string] =
      klippy === 'shutdown' ? ['top.shutdown', 'err'] : klippy === 'error' ? ['top.klippyError', 'err'] : klippy === 'startup' ? ['top.startup', 'info'] : PRINT_LABEL[print] ?? ['top.ready', 'ok'];
    state = [t(key), tone];
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-icon"><Printer size={20} aria-hidden /></span>
        {name ? <span className="brand-name" title={name}>{name}</span> : <>K2<span className="brand-sub">Dashboard</span></>}
      </div>
      <div className="spacer" />
      {conn === 'open' && state[1] && (
        <span className={`pill ${state[1]}`}><span className="dot" />{state[0]}</span>
      )}
      {conn === 'open' ? (
        <span className="pill ok" title={t('top.connectedTitle')}><Wifi size={14} aria-hidden /><span className="pill-text">{t('top.connected')}</span></span>
      ) : conn === 'connecting' ? (
        <span className="pill warn"><LoaderCircle size={14} className="spin" aria-hidden />{t('top.connecting')}</span>
      ) : (
        <span className="pill err"><WifiOff size={14} aria-hidden />{t('top.offline')}</span>
      )}
      {/* La app instalada en el móvil no tiene botón de recargar: este hace lo mismo. */}
      <button className="icon-btn" onClick={() => location.reload()} aria-label={t('top.reload')} title={t('top.reload')}>
        <RotateCw size={18} />
      </button>
      <button className="icon-btn" onClick={onSettings} aria-label={t('top.settings')} title={t('top.settings')}>
        <Settings size={18} />
      </button>
      <form method="post" action="/auth/logout">
        <button className="icon-btn" type="submit" aria-label={t('top.logout')} title={t('top.logout')}>
          <LogOut size={18} />
        </button>
      </form>
    </header>
  );
}
