import { Settings as SettingsIcon } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { AlertBanner } from './components/AlertBanner';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ControlCard } from './components/ControlCard';
import { FilesCard } from './components/FilesCard';
import { HistoryCard } from './components/HistoryCard';
import { SettingsDialog } from './components/SettingsDialog';
import { PrintCard } from './components/PrintCard';
import { TempCard } from './components/TempCard';
import { TopBar } from './components/TopBar';
import { useInView } from './lib/useInView';
import { getSettings } from './settings/api';
import { PrinterContext, usePrinterConnection } from './moonraker/usePrinter';

// three.js pesa; se carga aparte para que el panel aparezca antes en el móvil.
const GcodeViewer = lazy(() => import('./components/GcodeViewer').then((m) => ({ default: m.GcodeViewer })));

function ViewerPlaceholder() {
  return (
    <section className="card viewer">
      <div className="viewer-stage" />
    </section>
  );
}

export default function App() {
  const printer = usePrinterConnection();
  const printing: string = printer.status.print_stats?.filename ?? '';
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  // El código del visor 3D (three.js) solo se descarga cuando el visor aparece en pantalla.
  const [viewerSlot, viewerSeen] = useInView<HTMLDivElement>('300px');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // null = aún no se sabe; '' = falta configurar la impresora.
  const [printerHost, setPrinterHost] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((v) => {
        setPrinterHost(v.settings.printerHost);
        if (!v.settings.printerHost) setSettingsOpen(true);
      })
      .catch(() => {});
  }, []);

  // Si empieza una impresión, el visor pasa a mostrar ese archivo.
  useEffect(() => {
    if (printing) setViewerPath(printing);
  }, [printing]);

  return (
    <PrinterContext.Provider value={printer}>
      <ConfirmProvider>
        <div className="app">
          <TopBar onSettings={() => setSettingsOpen(true)} />
          {printerHost === '' && (
            <div className="alert warn setup-banner" role="status">
              <span>Falta poner la IP de la impresora para conectarse.</span>
              <button className="btn" onClick={() => setSettingsOpen(true)}>
                <SettingsIcon size={16} aria-hidden />Abrir ajustes
              </button>
            </div>
          )}
          <AlertBanner />
          <main className="grid">
            <div className="area-print"><PrintCard /></div>
            <div className="area-temps"><TempCard /></div>
            <div className="area-control"><ControlCard /></div>
            <div className="area-history"><HistoryCard /></div>
            <div className="area-viewer" ref={viewerSlot}>
              {viewerSeen ? (
                <Suspense fallback={<ViewerPlaceholder />}>
                  <GcodeViewer path={viewerPath} />
                </Suspense>
              ) : (
                <ViewerPlaceholder />
              )}
            </div>
            <div className="area-files"><FilesCard viewerPath={viewerPath} onView={setViewerPath} /></div>
          </main>
        </div>
        {settingsOpen && (
          <SettingsDialog
            onClose={() => setSettingsOpen(false)}
            onSaved={(st) => {
              const changed = st.printerHost !== printerHost;
              setPrinterHost(st.printerHost);
              // La conexión con la impresora va por nginx: al cambiar la IP se vuelve a conectar desde cero.
              if (changed && printerHost !== null) setTimeout(() => location.reload(), 600);
            }}
          />
        )}
      </ConfirmProvider>
    </PrinterContext.Provider>
  );
}
