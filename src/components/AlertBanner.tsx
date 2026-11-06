import { CircleX, TriangleAlert } from 'lucide-react';
import { usePrinter } from '../moonraker/usePrinter';

export function AlertBanner() {
  const { alerts } = usePrinter();
  if (!alerts.length) return null;
  return (
    <div className="alerts" role="status" aria-live="polite">
      {alerts.map((a) => (
        <div key={a.id} className={`alert ${a.level}`}>
          {a.level === 'error' ? <CircleX size={20} aria-hidden /> : <TriangleAlert size={20} aria-hidden />}
          <div>
            <strong>{a.title}</strong>
            {a.detail && <span>{a.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
