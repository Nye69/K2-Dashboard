import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { computeAlerts, TEMP_TOLERANCE_C, type Alert } from '../lib/alerts';
import { checkSession } from './api';
import { MoonrakerClient, type ConnState } from './client';

export const SENSORS = ['filament_switch_sensor filament_sensor', 'filament_switch_sensor filament_sensor_2'] as const;

const OBJECTS: Record<string, null | string[]> = {
  webhooks: null,
  print_stats: null,
  virtual_sdcard: null,
  display_status: null,
  extruder: null,
  heater_bed: null,
  'temperature_sensor mcu_temp': null,
  'output_pin LED': null,
  'output_pin fan0': null,
  'output_pin fan2': null,
  gcode_move: ['speed_factor', 'extrude_factor'],
  exclude_object: null,
  ...Object.fromEntries(SENSORS.map((s) => [s, null])),
};

type Obj = Record<string, any>;
export type RawStatus = Record<string, Obj>;

export interface TempSample {
  t: number;
  nozzle: number;
  nozzleTarget: number;
  bed: number;
  bedTarget: number;
}

export interface PrinterState {
  conn: ConnState;
  status: RawStatus;
  history: TempSample[];
  alerts: Alert[];
  /** Llamar justo antes de pausar desde el panel, para no avisar de "pausa inesperada". */
  markUserPause: () => void;
  client: MoonrakerClient;
}

const HISTORY_MS = 10 * 60_000;
const SAMPLE_MS = 2_000;

function merge(prev: RawStatus, patch: RawStatus): RawStatus {
  const next = { ...prev };
  for (const [k, v] of Object.entries(patch)) next[k] = { ...prev[k], ...v };
  return next;
}

export function usePrinterConnection(): PrinterState {
  const client = useMemo(() => new MoonrakerClient(OBJECTS), []);
  const [conn, setConn] = useState<ConnState>('connecting');
  const [status, setStatus] = useState<RawStatus>({});
  const [history, setHistory] = useState<TempSample[]>([]);
  const [now, setNow] = useState(Date.now());
  const [pausedByUser, setPausedByUser] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const offSince = useRef<Record<string, number | null>>({});

  useEffect(() => {
    const offs = [
      client.onState((s) => {
        setConn(s);
        if (s === 'closed') checkSession();
      }),
      client.onStatus((patch) => setStatus((prev) => merge(prev, patch as RawStatus))),
    ];
    client.connect();
    return () => {
      offs.forEach((o) => o());
      client.disconnect();
    };
  }, [client]);

  // Muestreo de temperaturas para la gráfica y la detección de "fuera de rango".
  useEffect(() => {
    const id = setInterval(() => {
      const s = statusRef.current;
      const t = Date.now();
      setNow(t);
      if (!s.extruder || !s.heater_bed) return;
      const sample: TempSample = {
        t,
        nozzle: s.extruder.temperature ?? 0,
        nozzleTarget: s.extruder.target ?? 0,
        bed: s.heater_bed.temperature ?? 0,
        bedTarget: s.heater_bed.target ?? 0,
      };
      setHistory((h) => [...h.filter((x) => t - x.t < HISTORY_MS), sample]);
      for (const [key, temp, target] of [
        ['extruder', sample.nozzle, sample.nozzleTarget],
        ['heater_bed', sample.bed, sample.bedTarget],
      ] as const) {
        const off = target > 0 && Math.abs(temp - target) > TEMP_TOLERANCE_C;
        if (!off) offSince.current[key] = null;
        else if (offSince.current[key] == null) offSince.current[key] = t;
      }
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  const printState: string = status.print_stats?.state ?? 'standby';
  useEffect(() => {
    if (printState !== 'paused') setPausedByUser(false);
  }, [printState]);

  const alerts = useMemo(
    () =>
      computeAlerts({
        connected: conn === 'open',
        klippyState: status.webhooks?.state ?? 'ready',
        klippyMessage: status.webhooks?.state_message ?? '',
        printState,
        printMessage: status.print_stats?.message ?? '',
        pausedByUser,
        filamentSensors: SENSORS.filter((k) => status[k]).map((k, i) => ({
          name: i === 0 ? 'Sensor de filamento' : 'Sensor de filamento 2',
          detected: !!status[k].filament_detected,
          enabled: !!status[k].enabled,
        })),
        heaters: [
          { key: 'extruder', name: 'Boquilla' },
          { key: 'heater_bed', name: 'Cama' },
        ]
          .filter((h) => status[h.key])
          .map((h) => ({
            name: h.name,
            temp: status[h.key].temperature ?? 0,
            target: status[h.key].target ?? 0,
            offSinceMs: offSince.current[h.key] ?? null,
          })),
        now,
      }),
    [conn, status, printState, pausedByUser, now],
  );

  return { conn, status, history, alerts, markUserPause: () => setPausedByUser(true), client };
}

export const PrinterContext = createContext<PrinterState | null>(null);

export function usePrinter(): PrinterState {
  const ctx = useContext(PrinterContext);
  if (!ctx) throw new Error('usePrinter fuera de PrinterContext');
  return ctx;
}
