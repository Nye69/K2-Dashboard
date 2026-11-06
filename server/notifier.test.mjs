import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notifier } from './notifier.mjs';

/** WebSocket falso: guarda la última instancia para poder "recibir" mensajes. */
class FakeWS {
  static last;
  sent = [];
  constructor(url) {
    this.url = url;
    FakeWS.last = this;
  }
  send(m) {
    this.sent.push(m);
  }
  close() {}
  emit(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

const printing = { webhooks: { state: 'ready' }, print_stats: { state: 'printing', filename: 'a.gcode', message: '' } };

describe('Notifier', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWS);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('al conectar con una impresión ya en marcha no avisa de nada', () => {
    const events = [];
    const n = new Notifier((e) => events.push(e.id));
    n.apply({ printerHost: '10.0.0.5' });
    const ws = FakeWS.last;
    ws.onopen();
    // Llega una actualización parcial antes de la respuesta completa (pasa en la K2).
    ws.emit({ method: 'notify_status_update', params: [{ print_stats: { print_duration: 90 } }] });
    ws.emit({ id: 1, result: { status: printing } });
    expect(events).toEqual([]);
  });

  it('después sí avisa de los cambios reales', () => {
    const events = [];
    const n = new Notifier((e) => events.push(e.id));
    n.apply({ printerHost: '10.0.0.5' });
    const ws = FakeWS.last;
    ws.onopen();
    ws.emit({ id: 1, result: { status: printing } });
    ws.emit({ method: 'notify_status_update', params: [{ print_stats: { state: 'complete' } }] });
    expect(events).toEqual(['complete']);
  });
});
