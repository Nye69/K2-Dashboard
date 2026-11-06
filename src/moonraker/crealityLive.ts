import { useEffect, useState } from 'react';
import type { PrinterTimes } from '../lib/eta';

/**
 * Websocket propio de Creality (puerto 9999 de la K2, reenviado en /k2ws).
 * Solo se usa para leer los tiempos que calcula la impresora, los mismos de su pantalla.
 */
export function useCrealityTimes(): PrinterTimes | null {
  const [times, setTimes] = useState<PrinterTimes | null>(null);

  useEffect(() => {
    let ws: WebSocket | undefined;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    let beat: ReturnType<typeof setInterval>;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/k2ws`);
      ws.onopen = () => {
        beat = setInterval(() => ws?.send(JSON.stringify({ ModeCode: 'heart_beat', msg: new Date() })), 5000);
      };
      ws.onmessage = (e) => {
        let m: Record<string, unknown>;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        if (typeof m.printLeftTime !== 'number') return;
        setTimes((prev) => ({
          printLeftTime: m.printLeftTime as number,
          printJobTime: typeof m.printJobTime === 'number' ? m.printJobTime : prev?.printJobTime,
          at: Date.now(),
        }));
      };
      ws.onclose = () => {
        clearInterval(beat);
        if (!stopped) retry = setTimeout(connect, 5000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(beat);
      ws?.close();
    };
  }, []);

  return times;
}
