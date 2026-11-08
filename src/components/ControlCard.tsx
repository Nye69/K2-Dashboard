import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, ChevronsDown, ChevronsUp, Crosshair, Fan, Flame, Gauge, Lightbulb, LightbulbOff, LoaderCircle, SlidersHorizontal, Snowflake, Waves } from 'lucide-react';
import { useEffect, useState } from 'react';
import { extrudeScript } from '../lib/extrude';
import { CALIBRATE_GCODE } from '../lib/calibration';
import { currentSpeedMode, SPEED_MODES, speedModeScript } from '../lib/speedMode';
import { runGcode, setTemp } from '../moonraker/api';

import { usePrinter } from '../moonraker/usePrinter';
import { useConfirm } from './ConfirmDialog';

const AMOUNTS = [5, 10, 25, 50];

const PRESETS = [
  { name: 'PLA', nozzle: 210, bed: 60 },
  { name: 'PETG', nozzle: 240, bed: 80 },
  { name: 'ABS', nozzle: 250, bed: 100 },
  { name: 'TPU', nozzle: 225, bed: 50 },
];

export function ControlCard() {
  const { conn, status } = usePrinter();
  const confirm = useConfirm();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const offline = conn !== 'open';
  const state: string = status.print_stats?.state ?? 'standby';
  const printing = state === 'printing' || state === 'paused';
  const light = (status['output_pin LED']?.value ?? 0) > 0;
  const canExtrude = !!status.extruder?.can_extrude;
  const [amount, setAmount] = useState(10);
  const qmode = Number(status['gcode_macro Qmode']?.flag ?? 0) === 1;
  const speedMode = currentSpeedMode(status.gcode_move?.speed_factor, status['gcode_macro Qmode']?.flag);

  const run = async (key: string, script: string | (() => Promise<unknown>)) => {
    setError('');
    setBusy(key);
    try {
      await (typeof script === 'string' ? runGcode(script) : script());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const calibrate = async () => {
    const ok = await confirm({
      title: '¿Calibrar la cama?',
      message: 'La cama tiene que estar vacía. La impresora la calienta, limpia la boquilla y mide 49 puntos. Tarda unos minutos.',
      confirmLabel: 'Calibrar',
    });
    if (ok) run('calib', CALIBRATE_GCODE);
  };

  const heat = (p: (typeof PRESETS)[number]) =>
    run(p.name, () => Promise.all([setTemp('extruder', p.nozzle), setTemp('heater_bed', p.bed)]));

  const filament = async (load: boolean) => {
    const ok = await confirm({
      title: load ? '¿Meter filamento?' : '¿Sacar filamento?',
      message: load
        ? 'Antes, empuja el filamento nuevo por el tubo hasta que no entre más. La impresora calentará la boquilla y lo meterá hasta que salga por la punta.'
        : 'La impresora calentará la boquilla, cortará el filamento y lo echará atrás. Cuando termine, tira de él con suavidad para sacarlo.',
      confirmLabel: load ? 'Meter' : 'Sacar',
    });
    if (ok) run(load ? 'load' : 'unload', load ? 'LOAD_MATERIAL' : 'QUIT_MATERIAL');
  };

  return (
    <section className="card" aria-labelledby="control-title">
      <div className="card-head">
        <SlidersHorizontal size={18} aria-hidden color="var(--text-2)" />
        <h2 id="control-title">Control</h2>
        <div className="spacer" />
        <button
          className={`btn ${light ? 'go' : ''}`}
          disabled={offline || busy === 'light'}
          aria-pressed={light}
          onClick={() => run('light', `SET_PIN PIN=LED VALUE=${light ? 0 : 1}`)}
        >
          {light ? <Lightbulb size={18} aria-hidden /> : <LightbulbOff size={18} aria-hidden />}
          Luz {light ? 'encendida' : 'apagada'}
        </button>
      </div>

      <div className="subhead" style={{ marginTop: 4 }}>Velocidad de impresión</div>
      <div className="speed-modes" role="radiogroup" aria-label="Velocidad de impresión">
        {SPEED_MODES.map((m) => {
          const onlyPrinting = m.id === 'silent' && !printing;
          return (
            <button
              key={m.id}
              role="radio"
              aria-checked={speedMode === m.id}
              className={`speed-mode ${speedMode === m.id ? 'on' : ''}`}
              disabled={offline || onlyPrinting || busy === 'speedmode'}
              title={onlyPrinting ? 'Solo mientras imprime: baja aceleración, velocidad y ventiladores para hacer menos ruido' : undefined}
              onClick={() => speedMode !== m.id && run('speedmode', speedModeScript(m.id, qmode))}
            >
              {m.label}
              {m.pct ? <span className="num"> {m.pct}%</span> : null}
            </button>
          );
        })}
      </div>

      <div className="controls">
        <Slider
          icon={<Fan size={16} />}
          label="Ventilador de capa"
          value={Math.round((status['output_pin fan0']?.value ?? 0) * 100)}
          min={0}
          max={100}
          unit="%"
          disabled={offline}
          onCommit={(v) => run('fan0', `M106 P0 S${Math.round((v / 100) * 255)}`)}
        />
        <Slider
          icon={<Fan size={16} />}
          label="Ventilador auxiliar"
          value={Math.round((status['output_pin fan2']?.value ?? 0) * 100)}
          min={0}
          max={100}
          unit="%"
          disabled={offline}
          onCommit={(v) => run('fan2', `M106 P2 S${Math.round((v / 100) * 255)}`)}
        />
        <Slider
          icon={<Gauge size={16} />}
          label="Velocidad exacta"
          value={Math.round((status.gcode_move?.speed_factor ?? 1) * 100)}
          min={10}
          max={300}
          unit="%"
          disabled={offline}
          onCommit={(v) => run('speed', `M220 S${v}`)}
        />
        <Slider
          icon={<Waves size={16} />}
          label="Flujo"
          value={Math.round((status.gcode_move?.extrude_factor ?? 1) * 100)}
          min={50}
          max={150}
          unit="%"
          marks={[95, 100, 105]}
          disabled={offline}
          onCommit={(v) => run('flow', `M221 S${v}`)}
        />
      </div>

      <div className="subhead">Cambiar filamento</div>
      <div className="fil-steps">
        <button className="fil-btn" disabled={offline || printing || !!busy} onClick={() => filament(false)}>
          <span className="fil-num" aria-hidden>1</span>
          <span className="fil-text">
            <span className="fil-title">
              {busy === 'unload' ? <LoaderCircle size={18} className="spin" aria-hidden /> : <ArrowUpFromLine size={18} aria-hidden />}
              {busy === 'unload' ? 'Sacando…' : 'Sacar filamento'}
            </span>
            <span className="fil-desc">Calienta, corta y retrae el viejo. Luego tira de él suave.</span>
          </span>
        </button>
        <button className="fil-btn" disabled={offline || printing || !!busy} onClick={() => filament(true)}>
          <span className="fil-num" aria-hidden>2</span>
          <span className="fil-text">
            <span className="fil-title">
              {busy === 'load' ? <LoaderCircle size={18} className="spin" aria-hidden /> : <ArrowDownToLine size={18} aria-hidden />}
              {busy === 'load' ? 'Metiendo…' : 'Meter filamento'}
            </span>
            <span className="fil-desc">Empuja el nuevo por el tubo hasta que no entre más y pulsa. Calienta y lo mete solo.</span>
          </span>
        </button>
      </div>
      <div className="hint">Son los mismos que Retract y Extrude de la pantalla de la impresora: calientan la boquilla ellos solos, no tienes que precalentar antes.</div>

      <div className="subhead">Precalentar</div>
      <div className="presets" role="group" aria-label="Precalentar">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className="btn"
            disabled={offline || printing || busy === p.name}
            title={`Boquilla ${p.nozzle} °C, cama ${p.bed} °C`}
            onClick={() => heat(p)}
          >
            <Flame size={16} aria-hidden />
            {p.name}
            <span className="preset-temps num">{p.nozzle}/{p.bed}°</span>
          </button>
        ))}
      </div>
      <button className="btn" style={{ marginTop: 8, width: '100%' }} disabled={offline || printing || busy === 'off'} onClick={() => run('off', () => Promise.all([setTemp('extruder', 0), setTemp('heater_bed', 0)]))}>
        <Snowflake size={16} aria-hidden />Apagar calor
      </button>

      <div className="subhead">Calibración</div>
      <button className="btn" style={{ width: '100%' }} disabled={offline || printing || !!busy} onClick={calibrate}>
        {busy === 'calib' ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Crosshair size={16} aria-hidden />}
        {busy === 'calib' ? 'Calibrando la cama…' : 'Calibrar cama'}
      </button>

      <details className="fine">
        <summary><ChevronRight size={16} aria-hidden className="fine-chev" />Mover unos milímetros (avanzado)</summary>
        <p className="hint" style={{ marginTop: 0 }}>
          Solo mueve el filamento un poco, sin cortar ni calentar. Sirve, por ejemplo, para purgar el color viejo después de meter uno nuevo.
        </p>
        <div className="seg" role="radiogroup" aria-label="Cantidad de filamento">
          {AMOUNTS.map((a) => (
            <button key={a} role="radio" aria-checked={amount === a} className={`seg-btn ${amount === a ? 'on' : ''}`} onClick={() => setAmount(a)}>
              {a} mm
            </button>
          ))}
        </div>
        {!printing && !canExtrude ? (
          <div className="cold">
            <span>La boquilla está fría: tiene que pasar de 170 °C.</span>
            <button className="btn" disabled={offline || !!busy} onClick={() => heat(PRESETS[0])}>
              <Flame size={16} aria-hidden />Calentar (PLA 210 °C)
            </button>
          </div>
        ) : (
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="btn" disabled={offline || printing || !canExtrude || !!busy} onClick={() => run('extrude', extrudeScript(amount, 5))}>
              <ChevronsDown size={18} aria-hidden />Empujar {amount} mm
            </button>
            <button className="btn" disabled={offline || printing || !canExtrude || !!busy} onClick={() => run('retract', extrudeScript(-amount, 5))}>
              <ChevronsUp size={18} aria-hidden />Echar atrás {amount} mm
            </button>
          </div>
        )}
      </details>
      {printing && <div className="hint">El filamento y el precalentado no se pueden tocar mientras imprime.</div>}
      {error && <div className="alert error" style={{ marginTop: 12 }} role="alert">{error}</div>}
    </section>
  );
}

function Slider(p: {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  marks?: number[];
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => setDraft(null), [p.value]);
  const shown = draft ?? p.value;
  const id = `s-${p.label.replace(/\s+/g, '-')}`;
  const commit = () => {
    if (draft != null && draft !== p.value) p.onCommit(draft);
  };
  return (
    <div className="slider">
      <label htmlFor={id} className="slider-label">
        <span aria-hidden>{p.icon}</span>
        {p.label}
        <span className="slider-value num">{shown}{p.unit}</span>
      </label>
      <input
        id={id}
        type="range"
        min={p.min}
        max={p.max}
        value={shown}
        disabled={p.disabled}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      {p.marks && (
        <div className="marks">
          {p.marks.map((m) => (
            <button key={m} className="mark" disabled={p.disabled} onClick={() => p.onCommit(m)}>{m}{p.unit}</button>
          ))}
        </div>
      )}
    </div>
  );
}
