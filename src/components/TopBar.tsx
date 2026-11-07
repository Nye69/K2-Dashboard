import { LoaderCircle, LogOut, Printer, RotateCw, Settings, Wifi, WifiOff } from 'lucide-react';
import { usePrinter } from '../moonraker/usePrinter';

const PRINT_LABEL: Record<string, [string, string]> = {
  printing: ['Imprimiendo', 'ok'],
  paused: ['Pausada', 'warn'],
  complete: ['Terminada', 'info'],
  cancelled: ['Cancelada', 'warn'],
  error: ['Error', 'err'],
  standby: ['Lista', 'ok'],
};

export function TopBar({ onSettings, name }: { onSettings: () => void; name: string }) {
  const { conn, status } = usePrinter();
  const klippy: string = status.webhooks?.state ?? '';
  const print: string = status.print_stats?.state ?? '';

  let state: [string, string] = ['—', ''];
  if (conn === 'open') {
    if (klippy === 'shutdown') state = ['Apagada', 'err'];
    else if (klippy === 'error') state = ['Error de Klipper', 'err'];
    else if (klippy === 'startup') state = ['Arrancando', 'info'];
    else state = PRINT_LABEL[print] ?? ['Lista', 'ok'];
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
        <span className="pill ok" title="Conectado a la impresora"><Wifi size={14} aria-hidden /><span className="pill-text">Conectado</span></span>
      ) : conn === 'connecting' ? (
        <span className="pill warn"><LoaderCircle size={14} className="spin" aria-hidden />Conectando…</span>
      ) : (
        <span className="pill err"><WifiOff size={14} aria-hidden />Sin conexión</span>
      )}
      {/* La app instalada en el móvil no tiene botón de recargar: este hace lo mismo. */}
      <button className="icon-btn" onClick={() => location.reload()} aria-label="Recargar" title="Recargar">
        <RotateCw size={18} />
      </button>
      <button className="icon-btn" onClick={onSettings} aria-label="Ajustes" title="Ajustes">
        <Settings size={18} />
      </button>
      <form method="post" action="/auth/logout">
        <button className="icon-btn" type="submit" aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </form>
    </header>
  );
}
