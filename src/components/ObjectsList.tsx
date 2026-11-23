import { Ban } from 'lucide-react';
import { useState } from 'react';
import { K2_SE_BED } from '../lib/bed';
import { objectOutline, setFocusedObject, useFocusedObject, type BedObject } from '../lib/objectFocus';
import { runGcode } from '../moonraker/api';
import { usePrinter } from '../moonraker/usePrinter';
import { useConfirm } from './ConfirmDialog';
import { useT } from '../i18n';

const pretty = (name: string) => name.replace(/_/g, ' ');

/** Piezas del archivo (exclude_object). Permite cancelar una sin parar las demás. */
export function ObjectsList() {
  const { status, conn } = usePrinter();
  const confirm = useConfirm();
  const t = useT();
  const focused = useFocusedObject();
  const [error, setError] = useState('');
  const eo = status.exclude_object ?? {};
  const objects: BedObject[] = eo.objects ?? [];
  const excluded: string[] = eo.excluded_objects ?? [];
  const current: string | null = eo.current_object ?? null;

  if (objects.length < 2) return null;
  const remaining = objects.filter((o) => !excluded.includes(o.name)).length;

  const cancel = async (name: string) => {
    // La pieza sigue marcada mientras se decide.
    setFocusedObject(name);
    const ok = await confirm({
      title: t('objects.cancelTitle'),
      message: t('objects.cancelMessage', { name: pretty(name) }),
      confirmLabel: t('objects.cancelConfirm'),
      danger: true,
    });
    setFocusedObject(null);
    if (!ok) return;
    try {
      setError('');
      await runGcode(`EXCLUDE_OBJECT NAME="${name.replace(/"/g, '')}"`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Ratón encima o foco con teclado: se marca. En el móvil, tocar la fila (fuera del botón) la marca o desmarca.
  const focusProps = (name: string) => ({
    onMouseEnter: () => setFocusedObject(name),
    onMouseLeave: () => setFocusedObject(null),
    onFocus: () => setFocusedObject(name),
    onBlur: () => setFocusedObject(null),
  });

  return (
    <div className="objects">
      <div className="subhead" style={{ margin: '4px 0 2px' }}>{t('objects.title', { left: remaining, total: objects.length })}</div>
      <BedMap objects={objects} excluded={excluded} current={current} focused={focused} />
      {objects.map((o) => {
        const isExcluded = excluded.includes(o.name);
        const isFocused = focused === o.name;
        return (
          <div
            key={o.name}
            className={`object ${isExcluded ? 'excluded' : ''} ${o.name === current ? 'current' : ''} ${isFocused ? 'focused' : ''}`}
            {...focusProps(o.name)}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              setFocusedObject(isFocused ? null : o.name);
            }}
          >
            <span className="name" title={o.name}>
              {pretty(o.name)}
              {o.name === current ? t('objects.printing') : ''}
              {isExcluded ? t('objects.cancelled') : ''}
            </span>
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

/** Mapa de la cama visto desde arriba, con el frente abajo: cada pieza con su contorno. */
function BedMap({ objects, excluded, current, focused }: { objects: BedObject[]; excluded: string[]; current: string | null; focused: string | null }) {
  const t = useT();
  const shapes = objects.map((o) => ({ o, poly: objectOutline(o) })).filter((s): s is { o: BedObject; poly: number[][] } => !!s.poly);
  if (!shapes.length) return null;

  // Cama de la K2 SE, ampliada si alguna pieza se sale (otra impresora).
  const all = shapes.flatMap((s) => s.poly);
  const minX = Math.min(0, ...all.map((p) => p[0]));
  const minY = Math.min(0, ...all.map((p) => p[1]));
  const maxX = Math.max(K2_SE_BED.x, ...all.map((p) => p[0]));
  const maxY = Math.max(K2_SE_BED.y, ...all.map((p) => p[1]));
  const w = maxX - minX;
  const h = maxY - minY;
  const label = 16; // espacio para "FRENTE" debajo
  // En el G-code Y crece hacia el fondo; en el dibujo, hacia abajo: se invierte para que el frente quede abajo.
  const pts = (poly: number[][]) => poly.map(([x, y]) => `${(x - minX).toFixed(1)},${(maxY - y).toFixed(1)}`).join(' ');

  return (
    <svg className="bed-map" viewBox={`-2 -2 ${w + 4} ${h + label + 4}`} role="img" aria-label={t('objects.mapAria')}>
      <rect x={0} y={0} width={w} height={h} rx={4} className="bed-map-bed" />
      <line x1={0} y1={h} x2={w} y2={h} className="bed-map-front" />
      <text x={w / 2} y={h + 12} textAnchor="middle" className="bed-map-label">{t('viewer.front').toUpperCase()}</text>
      {shapes.map(({ o, poly }) => {
        const cls = [
          'bed-map-obj',
          excluded.includes(o.name) ? 'excluded' : '',
          o.name === current ? 'current' : '',
          o.name === focused ? 'focused' : '',
        ].join(' ');
        return (
          <polygon
            key={o.name}
            points={pts(poly)}
            className={cls}
            onMouseEnter={() => setFocusedObject(o.name)}
            onMouseLeave={() => setFocusedObject(null)}
            onClick={() => setFocusedObject(focused === o.name ? null : o.name)}
          >
            <title>{pretty(o.name)}</title>
          </polygon>
        );
      })}
    </svg>
  );
}
