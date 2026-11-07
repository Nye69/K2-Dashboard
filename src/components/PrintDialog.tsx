import { Crosshair, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Confirmación de impresión con la opción de calibrar la cama antes. */
export function PrintDialog({ file, onCancel, onPrint }: { file: string; onCancel: () => void; onPrint: (calibrate: boolean) => void }) {
  const [calibrate, setCalibrate] = useState(false);
  const okRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancelRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="scrim" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="print-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="print-title">¿Imprimir este archivo?</h3>
        <p>{file}</p>
        <label className="calib-option">
          <input type="checkbox" checked={calibrate} onChange={(e) => setCalibrate(e.target.checked)} />
          <span>
            <span className="calib-title"><Crosshair size={16} aria-hidden />Calibrar la cama antes</span>
            <span className="field-hint">Mide la cama (7×7 puntos) y limpia la boquilla antes de empezar. Tarda unos minutos más. Útil si cambiaste la placa o la primera capa no pega bien.</span>
          </span>
        </label>
        <div className="actions">
          <button className="btn" onClick={onCancel}>Cancelar</button>
          <button ref={okRef} className="btn go" onClick={() => onPrint(calibrate)}>
            <Play size={16} aria-hidden />
            {calibrate ? 'Calibrar e imprimir' : 'Imprimir'}
          </button>
        </div>
      </div>
    </div>
  );
}
