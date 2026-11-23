import { Ban } from 'lucide-react';
import { useState } from 'react';
import { runGcode } from '../moonraker/api';
import { usePrinter } from '../moonraker/usePrinter';
import { useConfirm } from './ConfirmDialog';
import { useT } from '../i18n';

/** Piezas del archivo (exclude_object). Permite cancelar una sin parar las demás. */
export function ObjectsList() {
  const { status, conn } = usePrinter();
  const confirm = useConfirm();
  const t = useT();
  const [error, setError] = useState('');
  const eo = status.exclude_object ?? {};
  const objects: { name: string }[] = eo.objects ?? [];
  const excluded: string[] = eo.excluded_objects ?? [];
  const current: string | null = eo.current_object ?? null;

  if (objects.length < 2) return null;
  const remaining = objects.filter((o) => !excluded.includes(o.name)).length;

  const cancel = async (name: string) => {
    const ok = await confirm({
      title: t('objects.cancelTitle'),
      message: t('objects.cancelMessage', { name: name.replace(/_/g, ' ') }),
      confirmLabel: t('objects.cancelConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      setError('');
      await runGcode(`EXCLUDE_OBJECT NAME="${name.replace(/"/g, '')}"`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="objects">
      <div className="subhead" style={{ margin: '4px 0 2px' }}>{t('objects.title', { left: remaining, total: objects.length })}</div>
      {objects.map((o) => {
        const isExcluded = excluded.includes(o.name);
        return (
          <div key={o.name} className={`object ${isExcluded ? 'excluded' : ''} ${o.name === current ? 'current' : ''}`}>
            <span className="name" title={o.name}>{o.name.replace(/_/g, ' ')}{o.name === current ? t('objects.printing') : ''}{isExcluded ? t('objects.cancelled') : ''}</span>
            <button
              className="icon-btn danger"
              disabled={isExcluded || conn !== 'open' || remaining <= 1}
              onClick={() => cancel(o.name)}
              aria-label={t('objects.cancelAria', { name: o.name })}
              title={remaining <= 1 ? t('objects.lastOne') : t('objects.cancelOne')}
            >
              <Ban size={18} />
            </button>
          </div>
        );
      })}
      {error && <div className="alert error" role="alert">{error}</div>}
    </div>
  );
}
