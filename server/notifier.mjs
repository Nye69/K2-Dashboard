// Vigila la impresora por el websocket de Moonraker y manda avisos al móvil con ntfy.
// Se reconfigura en caliente cuando cambian los ajustes (IP de la impresora, tema de ntfy...).
import { detectEvents } from './lib/events.mjs';

const SENSORS = ['filament_switch_sensor filament_sensor', 'filament_switch_sensor filament_sensor_2'];
const log = (...a) => console.log(new Date().toISOString(), '[avisos]', ...a);

export async function sendNtfy(settings, { title, message, priority = 3, tags = [] }) {
  if (!settings.ntfyTopic) throw new Error('No hay tema de ntfy configurado');
  // Publicación en JSON: admite tildes y eñes en el título (las cabeceras HTTP no).
  const res = await fetch(settings.ntfyUrl || 'https://ntfy.sh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: settings.ntfyTopic, title, message: message || ' ', priority, tags, ...(settings.panelUrl ? { click: settings.panelUrl } : {}) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ntfy respondió ${res.status}`);
}

export class Notifier {
  settings = {};
  ws = null;
  timer = null;
  backoff = 1000;
  status = {};
  prevSnap = null;

  /** Aplica ajustes nuevos; si cambió la impresora, reconecta. */
  apply(settings) {
    const hostChanged = settings.printerHost !== this.settings.printerHost;
    this.settings = { ...settings };
    if (hostChanged) this.reconnect();
  }

  reconnect() {
    clearTimeout(this.timer);
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      old.onclose = old.onerror = old.onmessage = null;
      try {
        old.close();
      } catch {}
    }
    this.status = {};
    this.prevSnap = null;
    this.backoff = 1000;
    if (this.settings.printerHost) this.connect();
    else log('sin impresora configurada');
  }

  snapshot() {
    const s = this.status;
    return {
      klippy: s.webhooks?.state ?? 'ready',
      klippyMessage: s.webhooks?.state_message ?? '',
      state: s.print_stats?.state ?? 'standby',
      filename: s.print_stats?.filename ?? '',
      message: s.print_stats?.message ?? '',
      filament: SENSORS.filter((k) => s[k]?.enabled).map((k) => !!s[k].filament_detected),
    };
  }

  check() {
    const snap = this.snapshot();
    for (const ev of detectEvents(this.prevSnap, snap)) {
      log('aviso:', ev.id, ev.message);
      if (this.settings.ntfyTopic) sendNtfy(this.settings, ev).catch((e) => log('no se pudo avisar:', e.message));
    }
    this.prevSnap = snap;
  }

  merge(patch) {
    for (const [k, v] of Object.entries(patch)) this.status[k] = { ...this.status[k], ...v };
  }

  connect() {
    const url = `ws://${this.settings.printerHost}:7125/websocket`;
    const ws = new WebSocket(url);
    this.ws = ws;
    let id = 1;
    const subscribe = () =>
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: id++,
          method: 'printer.objects.subscribe',
          params: { objects: Object.fromEntries(['webhooks', 'print_stats', ...SENSORS].map((o) => [o, null])) },
        }),
      );
    ws.onopen = () => {
      log('conectado a', url);
      this.backoff = 1000;
      subscribe();
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.result?.status) {
        this.merge(msg.result.status);
        this.check();
      } else if (msg.method === 'notify_status_update') {
        this.merge(msg.params[0]);
        this.check();
      } else if (msg.method === 'notify_klippy_ready') {
        subscribe();
      } else if (msg.method === 'notify_klippy_shutdown' || msg.method === 'notify_klippy_disconnected') {
        this.merge({ webhooks: { state: 'shutdown' } });
        this.check();
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      log('desconectado; reintento en', this.backoff, 'ms');
      this.timer = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 30_000);
    };
    // Tras un error el websocket se cierra solo y salta onclose (que reintenta).
    // Llamar a ws.close() aquí dispara onerror en bucle y tumba el proceso.
    ws.onerror = () => {};
  }
}
