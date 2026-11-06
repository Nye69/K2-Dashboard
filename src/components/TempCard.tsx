import { Cpu, Flame, Power, SquareDashed, Thermometer } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { setTemp } from '../moonraker/api';
import { usePrinter } from '../moonraker/usePrinter';
import { TempChart } from './TempChart';

export function TempCard() {
  const { status, history, conn } = usePrinter();
  const ex = status.extruder;
  const bed = status.heater_bed;
  const mcu = status['temperature_sensor mcu_temp'];

  return (
    <section className="card" aria-labelledby="temps-title">
      <div className="card-head">
        <Thermometer size={18} aria-hidden color="var(--text-2)" />
        <h2 id="temps-title">Temperaturas</h2>
      </div>
      <div className="heaters">
        {ex && (
          <Heater heater="extruder" name="Boquilla" color="var(--nozzle)" icon={<Flame size={18} />} temp={ex.temperature} target={ex.target} max={350} disabled={conn !== 'open'} />
        )}
        {bed && (
          <Heater heater="heater_bed" name="Cama" color="var(--bed)" icon={<SquareDashed size={18} />} temp={bed.temperature} target={bed.target} max={120} disabled={conn !== 'open'} />
        )}
        {mcu && (
          <div className="heater">
            <span className="ico" style={{ color: 'var(--text-2)' }}><Cpu size={18} aria-hidden /></span>
            <div>
              <div className="name">Electrónica (MCU)</div>
              <div className="temp num">{Number(mcu.temperature ?? 0).toFixed(0)}°</div>
            </div>
          </div>
        )}
      </div>
      <TempChart history={history} />
    </section>
  );
}

function Heater(props: {
  heater: 'extruder' | 'heater_bed';
  name: string;
  color: string;
  icon: ReactNode;
  temp: number;
  target: number;
  max: number;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setValue(props.target ? String(Math.round(props.target)) : '');
  }, [props.target, editing]);

  const apply = async (t: number) => {
    setError('');
    if (!Number.isFinite(t) || t < 0 || t > props.max) {
      setError(`Entre 0 y ${props.max} °C`);
      return;
    }
    try {
      await setTemp(props.heater, t);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const id = `t-${props.heater}`;
  return (
    <div className="heater">
      <span className="ico" style={{ color: props.color }} aria-hidden>{props.icon}</span>
      <div>
        <div className="name">{props.name}</div>
        <div className="temp num">
          {Number(props.temp ?? 0).toFixed(0)}°{' '}
          <small>/ {props.target ? `${Math.round(props.target)}°` : 'apagada'}</small>
        </div>
        {error && <div style={{ color: '#fca5a5', fontSize: 13 }} role="alert">{error}</div>}
      </div>
      <form
        className="target"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          apply(parseFloat(value));
        }}
      >
        <label htmlFor={id} className="sr-only">Objetivo de {props.name} en °C</label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={props.max}
          placeholder="°C"
          value={value}
          disabled={props.disabled}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className="icon-btn"
          title={`Apagar ${props.name.toLowerCase()}`}
          aria-label={`Apagar ${props.name.toLowerCase()}`}
          disabled={props.disabled || !props.target}
          onClick={() => apply(0)}
        >
          <Power size={18} />
        </button>
      </form>
    </div>
  );
}
