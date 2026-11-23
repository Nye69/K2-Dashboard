import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, ChevronsDown, ChevronsUp, Crosshair, Fan, Flame, Gauge, Lightbulb, LightbulbOff, LoaderCircle, SlidersHorizontal, Snowflake, Waves } from 'lucide-react';
import { useEffect, useState } from 'react';
import { extrudeScript } from '../lib/extrude';
import { CALIBRATE_GCODE } from '../lib/calibration';
import { isCutByProxy, LOAD_SOAK_S, LOAD_TEMP, loadFilamentScript, loadPhase, loadPhaseLabel, reachedLoadTemp } from '../lib/filament';
import { currentSpeedMode, SPEED_MODES, speedModeScript } from '../lib/speedMode';
import { runGcode, setTemp } from '../moonraker/api';

import { usePrinter } from '../moonraker/usePrinter';
import { useConfirm } from './ConfirmDialog';
import { useT } from '../i18n';

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
  const t = useT();
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
  const [notice, setNotice] = useState('');

  // Progreso de "Meter filamento": cuándo llegó a la temperatura y un reloj para la cuenta atrás.
  const nozzleTemp: number | undefined = status.extruder?.temperature;
  const [reachedAt, setReachedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const loading = busy === 'load';
  useEffect(() => {
    if (loading && reachedAt == null && reachedLoadTemp(nozzleTemp)) setReachedAt(Date.now());
  }, [loading, reachedAt, nozzleTemp]);
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const run = async (key: string, script: string | (() => Promise<unknown>), longRunning = false) => {
    setError('');
    setNotice('');
    setBusy(key);
    try {
      await (typeof script === 'string' ? runGcode(script) : script());
    } catch (e) {
      if (longRunning && isCutByProxy(e)) setNotice(t('control.connectionCut'));
      else setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const calibrate = async () => {
    const ok = await confirm({
      title: t('control.calibrateTitle'),
      message: t('control.calibrateMessage'),
      confirmLabel: t('control.calibrateConfirm'),
    });
    if (ok) run('calib', CALIBRATE_GCODE);
  };

  const heat = (p: (typeof PRESETS)[number]) =>
    run(p.name, () => Promise.all([setTemp('extruder', p.nozzle), setTemp('heater_bed', p.bed)]));

  const filament = async (load: boolean) => {
    const ok = await confirm({
      title: load ? t('control.loadTitle') : t('control.unloadTitle'),
      message: load ? t('control.loadMessage', { temp: LOAD_TEMP, soak: LOAD_SOAK_S }) : t('control.unloadMessage'),
      confirmLabel: load ? t('control.loadConfirm') : t('control.unloadConfirm'),
    });
    if (!ok) return;
    if (load) {
      setReachedAt(null);
      setNow(Date.now());
      run('load', loadFilamentScript(), true);
    } else {
      run('unload', 'QUIT_MATERIAL');
    }
  };

  return (
    <section className="card" aria-labelledby="control-title">
      <div className="card-head">
        <SlidersHorizontal size={18} aria-hidden color="var(--text-2)" />
        <h2 id="control-title">{t('control.title')}</h2>
        <div className="spacer" />
        <button
          className={`btn ${light ? 'go' : ''}`}
          disabled={offline || busy === 'light'}
          aria-pressed={light}
          onClick={() => run('light', `SET_PIN PIN=LED VALUE=${light ? 0 : 1}`)}
        >
          {light ? <Lightbulb size={18} aria-hidden /> : <LightbulbOff size={18} aria-hidden />}
          {light ? t('control.lightOn') : t('control.lightOff')}
        </button>
      </div>

      <div className="subhead" style={{ marginTop: 4 }}>{t('control.speed')}</div>
      <div className="speed-modes" role="radiogroup" aria-label={t('control.speed')}>
        {SPEED_MODES.map((m) => {
          const onlyPrinting = m.id === 'silent' && !printing;
          return (
            <button
              key={m.id}
              role="radio"
              aria-checked={speedMode === m.id}
              className={`speed-mode ${speedMode === m.id ? 'on' : ''}`}
              disabled={offline || onlyPrinting || busy === 'speedmode'}
              title={onlyPrinting ? t('control.silentOnlyPrinting') : undefined}
              onClick={() => speedMode !== m.id && run('speedmode', speedModeScript(m.id, qmode))}
            >
              {t(`speed.${m.id}`)}
              {m.pct ? <span className="num"> {m.pct}%</span> : null}
            </button>
          );
        })}
      </div>

      <div className="controls">
        <Slider
          icon={<Fan size={16} />}
          label={t('control.fanPart')}
          value={Math.round((status['output_pin fan0']?.value ?? 0) * 100)}
          min={0}
          max={100}
          unit="%"
          disabled={offline}
          onCommit={(v) => run('fan0', `M106 P0 S${Math.round((v / 100) * 255)}`)}
        />
        <Slider
          icon={<Fan size={16} />}
          label={t('control.fanAux')}
          value={Math.round((status['output_pin fan2']?.value ?? 0) * 100)}
          min={0}
          max={100}
          unit="%"
          disabled={offline}
          onCommit={(v) => run('fan2', `M106 P2 S${Math.round((v / 100) * 255)}`)}
        />
        <Slider
          icon={<Gauge size={16} />}
          label={t('control.exactSpeed')}
          value={Math.round((status.gcode_move?.speed_factor ?? 1) * 100)}
          min={10}
          max={300}
          unit="%"
          disabled={offline}
          onCommit={(v) => run('speed', `M220 S${v}`)}
        />
        <Slider
          icon={<Waves size={16} />}
          label={t('control.flow')}
          value={Math.round((status.gcode_move?.extrude_factor ?? 1) * 100)}
          min={50}
          max={150}
          unit="%"
          marks={[95, 100, 105]}
          disabled={offline}
          onCommit={(v) => run('flow', `M221 S${v}`)}
        />
      </div>

      <div className="subhead">{t('control.changeFilament')}</div>
      <div className="fil-steps">
        <button className="fil-btn" disabled={offline || printing || !!busy} onClick={() => filament(false)}>
          <span className="fil-num" aria-hidden>1</span>
          <span className="fil-text">
            <span className="fil-title">
              {busy === 'unload' ? <LoaderCircle size={18} className="spin" aria-hidden /> : <ArrowUpFromLine size={18} aria-hidden />}
              {busy === 'unload' ? t('control.unloading') : t('control.unload')}
            </span>
            <span className="fil-desc">{t('control.unloadDesc')}</span>
          </span>
        </button>
        <button className="fil-btn" disabled={offline || printing || !!busy} onClick={() => filament(true)}>
          <span className="fil-num" aria-hidden>2</span>
          <span className="fil-text">
            <span className="fil-title">
              {busy === 'load' ? <LoaderCircle size={18} className="spin" aria-hidden /> : <ArrowDownToLine size={18} aria-hidden />}
              <span aria-live="polite">{loading ? loadPhaseLabel(loadPhase(nozzleTemp, reachedAt, now), t) : t('control.load')}</span>
            </span>
            <span className="fil-desc">{t('control.loadDesc')}</span>
          </span>
        </button>
      </div>
      <div className="hint">{t('control.filamentHint', { soak: LOAD_SOAK_S })}</div>
      {notice && <div className="alert" style={{ marginTop: 8 }} role="status">{notice}</div>}

      <div className="subhead">{t('control.preheat')}</div>
      <div className="presets" role="group" aria-label={t('control.preheat')}>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className="btn"
            disabled={offline || printing || busy === p.name}
            title={t('control.presetTitle', { nozzle: p.nozzle, bed: p.bed })}
            onClick={() => heat(p)}
          >
            <Flame size={16} aria-hidden />
            {p.name}
            <span className="preset-temps num">{p.nozzle}/{p.bed}°</span>
          </button>
        ))}
      </div>
      <button className="btn" style={{ marginTop: 8, width: '100%' }} disabled={offline || printing || busy === 'off'} onClick={() => run('off', () => Promise.all([setTemp('extruder', 0), setTemp('heater_bed', 0)]))}>
        <Snowflake size={16} aria-hidden />{t('control.heatOff')}
      </button>

      <div className="subhead">{t('control.calibration')}</div>
      <button className="btn" style={{ width: '100%' }} disabled={offline || printing || !!busy} onClick={calibrate}>
        {busy === 'calib' ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Crosshair size={16} aria-hidden />}
        {busy === 'calib' ? t('control.calibrating') : t('control.calibrate')}
      </button>

      <details className="fine">
        <summary><ChevronRight size={16} aria-hidden className="fine-chev" />{t('control.fineMove')}</summary>
        <p className="hint" style={{ marginTop: 0 }}>{t('control.fineHint')}</p>
        <div className="seg" role="radiogroup" aria-label={t('control.amount')}>
          {AMOUNTS.map((a) => (
            <button key={a} role="radio" aria-checked={amount === a} className={`seg-btn ${amount === a ? 'on' : ''}`} onClick={() => setAmount(a)}>
              {a} mm
            </button>
          ))}
        </div>
        {!printing && !canExtrude ? (
          <div className="cold">
            <span>{t('control.cold')}</span>
            <button className="btn" disabled={offline || !!busy} onClick={() => heat(PRESETS[0])}>
              <Flame size={16} aria-hidden />{t('control.heatPla')}
            </button>
          </div>
        ) : (
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="btn" disabled={offline || printing || !canExtrude || !!busy} onClick={() => run('extrude', extrudeScript(amount, 5))}>
              <ChevronsDown size={18} aria-hidden />{t('control.push', { mm: amount })}
            </button>
            <button className="btn" disabled={offline || printing || !canExtrude || !!busy} onClick={() => run('retract', extrudeScript(-amount, 5))}>
              <ChevronsUp size={18} aria-hidden />{t('control.pull', { mm: amount })}
            </button>
          </div>
        )}
      </details>
      {printing && <div className="hint">{t('control.lockedPrinting')}</div>}
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
