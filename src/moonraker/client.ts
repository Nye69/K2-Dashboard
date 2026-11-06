export type ConnState = 'connecting' | 'open' | 'closed';
type Status = Record<string, Record<string, unknown>>;

interface Pending {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
}

type Listener<T> = (v: T) => void;

/** Cliente JSON-RPC de Moonraker por WebSocket con reconexión automática. */
export class MoonrakerClient {
  state: ConnState = 'closed';
  private ws?: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private backoff = 1000;
  private stopped = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private statusL = new Set<Listener<Status>>();
  private stateL = new Set<Listener<ConnState>>();
  private notifyL = new Set<Listener<{ method: string; params: unknown }>>();

  constructor(private objects: Record<string, null | string[]>) {}

  private url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/websocket`;
  }

  connect() {
    this.stopped = false;
    this.setState('connecting');
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = async () => {
      this.backoff = 1000;
      try {
        await this.call('server.connection.identify', {
          client_name: 'k2-panel',
          version: '0.1.0',
          type: 'web',
          url: location.origin,
        });
      } catch {
        /* versiones antiguas no lo tienen */
      }
      this.setState('open');
      this.subscribe();
    };
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onclose = () => {
      this.failPending('Conexión cerrada');
      this.setState('closed');
      if (!this.stopped) {
        this.retryTimer = setTimeout(() => this.connect(), this.backoff);
        this.backoff = Math.min(this.backoff * 2, 10_000);
      }
    };
    ws.onerror = () => ws.close();
  }

  disconnect() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.ws?.close();
  }

  /** Vuelve a pedir el estado completo (p. ej. tras reiniciar Klipper). */
  async subscribe() {
    try {
      const res = await this.call<{ status: Status }>('printer.objects.subscribe', { objects: this.objects });
      this.statusL.forEach((l) => l(res.status));
    } catch {
      /* Klipper aún no está listo; se reintenta con notify_klippy_ready */
    }
  }

  call<T = unknown>(method: string, params?: object): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return reject(new Error('Sin conexión'));
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }));
    });
  }

  onStatus(l: Listener<Status>) {
    this.statusL.add(l);
    return () => void this.statusL.delete(l);
  }
  onState(l: Listener<ConnState>) {
    this.stateL.add(l);
    return () => void this.stateL.delete(l);
  }
  onNotify(l: Listener<{ method: string; params: unknown }>) {
    this.notifyL.add(l);
    return () => void this.notifyL.delete(l);
  }

  private setState(s: ConnState) {
    this.state = s;
    this.stateL.forEach((l) => l(s));
  }

  private failPending(msg: string) {
    this.pending.forEach((p) => p.reject(new Error(msg)));
    this.pending.clear();
  }

  private onMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? 'Error de Moonraker'));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'notify_status_update') {
      this.statusL.forEach((l) => l(msg.params[0]));
    } else if (msg.method === 'notify_klippy_ready') {
      this.subscribe();
    }
    if (msg.method) this.notifyL.forEach((l) => l({ method: msg.method, params: msg.params }));
  }
}
