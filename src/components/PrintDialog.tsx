import { Crosshair, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';

/** Confirmación de impresión con la opción de calibrar la cama antes. */
export function PrintDialog({ file, onCancel, onPrint }: { file: string; onCancel: () => void; onPrint: (calibrate: boolean) => void }) {
  const [calibrate, setCalibrate] = useState(false);
  const okRef = useRef<HTMLButtonElement>(null);
  const t = useT();
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
        <h3 id="print-title">{t('printDialog.title')}</h3>
        <p>{file}</p>
        <label className="calib-option">
          <input type="checkbox" checked={calibrate} onChange={(e) => setCalibrate(e.target.checked)} />
          <span>
            <span className="calib-title"><Crosshair size={16} aria-hidden />{t('printDialog.calibrate')}</span>
            <span className="field-hint">{t('printDialog.calibrateHint')}</span>
          </span>
        </label>
        <div className="actions">
          <button className="btn" onClick={onCancel}>{t('common.cancel')}</button>
          <button ref={okRef} className="btn go" onClick={() => onPrint(calibrate)}>
            <Play size={16} aria-hidden />
            {calibrate ? t('printDialog.calibrateAndPrint') : t('common.print')}
          </button>
        </div>
      </div>
    </div>
  );
}
