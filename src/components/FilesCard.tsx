import { Check, Clock, Eye, FolderOpen, Layers, LoaderCircle, Pencil, Play, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes, formatDate, formatDuration } from '../lib/format';
import { deleteFile, listFiles, renameFile, runGcode, startPrint, uploadFile, type GcodeFile } from '../moonraker/api';
import { calibrateThenPrintScript } from '../lib/calibration';
import { PrintDialog } from './PrintDialog';
import { renameTarget, splitName } from '../lib/rename';
import { labelCuraObjects } from '../lib/labelObjects';
import { usePrinter } from '../moonraker/usePrinter';
import { useConfirm } from './ConfirmDialog';
import { useInView } from '../lib/useInView';
import { useFileInfo } from './PrintCard';

interface UploadState {
  name: string;
  progress: number;
  error?: string;
}

/** Hasta este tamaño se revisa el G-code para poder cancelar piezas por separado (más grande, se sube tal cual). */
const LABEL_MAX_BYTES = 200 * 1024 * 1024;

/** Si es un G-code de Cura con varias piezas, le añade las etiquetas de Klipper. */
async function prepareUpload(file: File): Promise<{ file: File; objects: number }> {
  if (file.size > LABEL_MAX_BYTES) return { file, objects: 0 };
  try {
    const r = labelCuraObjects(await file.text());
    if (!r) return { file, objects: 0 };
    return { file: new File([r.text], file.name, { type: file.type || 'text/plain', lastModified: file.lastModified }), objects: r.objects.length };
  } catch {
    return { file, objects: 0 };
  }
}

export function FilesCard({ viewerPath, onView }: { viewerPath: string | null; onView: (p: string) => void }) {
  const { conn, status, client } = usePrinter();
  const confirm = useConfirm();
  const [files, setFiles] = useState<GcodeFile[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [over, setOver] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [printTarget, setPrintTarget] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState<string | null>(null);

  const input = useRef<HTMLInputElement>(null);

  const state: string = status.print_stats?.state ?? 'standby';
  const busyPrinting = state === 'printing' || state === 'paused';
  // El aviso de "calibrando" se quita cuando la impresión ya empezó.
  useEffect(() => {
    if (calibrating && (state === 'printing' || state === 'error')) setCalibrating(null);
  }, [calibrating, state]);

  const refresh = useCallback(async () => {
    try {
      setLoadError('');
      setFiles(await listFiles());
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (conn === 'open') refresh();
  }, [conn, refresh]);
  useEffect(() => client.onNotify((n) => n.method === 'notify_filelist_changed' && refresh()), [client, refresh]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (files ?? []).filter((f) => !q || f.path.toLowerCase().includes(q)).sort((a, b) => b.modified - a.modified);
  }, [files, query]);

  const upload = async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      if (!/\.(gcode|g|gco)$/i.test(file.name)) {
        setUploads((u) => [...u, { name: file.name, progress: 0, error: 'Solo archivos .gcode' }]);
        continue;
      }
      setUploads((u) => [...u.filter((x) => x.name !== file.name), { name: file.name, progress: 0 }]);
      try {
        const prepared = await prepareUpload(file);
        await uploadFile(prepared.file, (p) => setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, progress: p } : x))));
        setUploads((u) => u.filter((x) => x.name !== file.name));
        if (prepared.objects > 1) setNotice(`${file.name}: ${prepared.objects} piezas. Mientras se imprime podrás cancelar cualquiera sin parar las demás.`);
        refresh();
      } catch (e) {
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, error: (e as Error).message } : x)));
      }
    }
  };

  const doPrint = (f: GcodeFile) => setPrintTarget(f.path);

  const confirmPrint = async (path: string, calibrate: boolean) => {
    setPrintTarget(null);
    setActionError('');
    if (!calibrate) {
      try {
        await startPrint(path);
      } catch (e) {
        setActionError((e as Error).message);
      }
      return;
    }
    // La orden tarda lo que dure la calibración; la impresión arranca sola al terminar (en la impresora).
    setCalibrating(path);
    runGcode(calibrateThenPrintScript(path)).catch((e) => {
      setCalibrating(null);
      setActionError(`No se pudo calibrar: ${(e as Error).message}`);
    });
  };

  /** Devuelve un mensaje de error, o null si salió bien. */
  const doRename = async (f: GcodeFile, input: string): Promise<string | null> => {
    const t = renameTarget(f.path, input, (files ?? []).map((x) => x.path));
    if ('error' in t) return t.error;
    try {
      await renameFile(f.path, t.path);
      if (viewerPath === f.path) onView(t.path);
      await refresh();
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  const doDelete = async (f: GcodeFile) => {
    const ok = await confirm({ title: '¿Borrar archivo?', message: `Se borrará "${f.path}" de la impresora.`, confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    try {
      setActionError('');
      await deleteFile(f.path);
      refresh();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  return (
    <section
      className="card"
      aria-labelledby="files-title"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <div className="card-head">
        <FolderOpen size={18} aria-hidden color="var(--text-2)" />
        <h2 id="files-title">Archivos{files ? ` · ${files.length}` : ''}</h2>
        <div className="spacer" />
        <button className="icon-btn" onClick={refresh} aria-label="Actualizar lista" title="Actualizar lista" disabled={conn !== 'open'}>
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="files-tools">
        <label className="search">
          <Search size={18} aria-hidden />
          <span className="sr-only">Buscar archivo</span>
          <input type="search" placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className="btn primary" onClick={() => input.current?.click()} disabled={conn !== 'open'}>
          <Upload size={18} aria-hidden />Subir G-code
        </button>
        <input
          ref={input}
          type="file"
          accept=".gcode,.g,.gco"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {over && <div className="drop over">Suelta aquí para subir a la impresora</div>}

      {uploads.map((u) => (
        <div key={u.name} className="upload-row">
          {u.error ? null : <LoaderCircle size={16} className="spin" aria-hidden />}
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
          {u.error ? (
            <>
              <span className="err">{u.error}</span>
              <button className="btn" style={{ minHeight: 32 }} onClick={() => setUploads((x) => x.filter((y) => y !== u))}>Cerrar</button>
            </>
          ) : (
            <>
              <div className="bar"><i style={{ width: `${u.progress * 100}%` }} /></div>
              <span className="num">{Math.round(u.progress * 100)}%</span>
            </>
          )}
        </div>
      ))}

      {calibrating && (
        <div className="alert warn" role="status" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <LoaderCircle size={16} className="spin" aria-hidden />
          <span>Calibrando la cama antes de imprimir {calibrating}. Tarda unos minutos; la impresión empezará sola.</span>
        </div>
      )}
      {notice && (
        <div className="alert ok" role="status" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button className="icon-btn" onClick={() => setNotice('')} aria-label="Cerrar aviso" title="Cerrar"><X size={16} /></button>
        </div>
      )}
      {actionError && <div className="alert error" style={{ marginBottom: 12 }} role="alert">{actionError}</div>}
      {loadError && <div className="alert error" style={{ marginBottom: 12 }} role="alert">No se pudo cargar la lista: {loadError}</div>}

      {files === null && !loadError ? (
        <div className="empty">Cargando archivos…</div>
      ) : shown.length === 0 ? (
        <div className="empty">{query ? 'Ningún archivo coincide.' : 'No hay archivos. Sube uno o arrástralo aquí.'}</div>
      ) : (
        <div className="file-list">
          {shown.map((f) => (
            <FileRow
              key={f.path}
              file={f}
              active={viewerPath === f.path}
              canPrint={conn === 'open' && !busyPrinting && !calibrating}
              isPrinting={busyPrinting && status.print_stats?.filename === f.path}
              onPrint={() => doPrint(f)}
              onView={() => onView(f.path)}
              onDelete={() => doDelete(f)}
              onRename={(name) => doRename(f, name)}
            />
          ))}
        </div>
      )}
      {printTarget && <PrintDialog file={printTarget} onCancel={() => setPrintTarget(null)} onPrint={(cal) => confirmPrint(printTarget, cal)} />}
    </section>
  );
}

function FileRow(p: {
  file: GcodeFile;
  active: boolean;
  canPrint: boolean;
  isPrinting: boolean;
  onPrint: () => void;
  onView: () => void;
  onDelete: () => void;
  onRename: (name: string) => Promise<string | null>;
}) {
  const [ref, visible] = useInView<HTMLDivElement>();
  const info = useFileInfo(visible ? p.file.path : null, p.file.modified);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(splitName(p.file.path).base);
    setRenameError('');
    setEditing(true);
  };
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = async () => {
    setSaving(true);
    const err = await p.onRename(draft);
    setSaving(false);
    if (err) setRenameError(err);
    else setEditing(false);
  };
  const cancel = () => {
    setEditing(false);
    setRenameError('');
  };
  return (
    <div ref={ref} className={`file ${p.active ? 'active' : ''}`}>
      <div className="thumb">{info.thumbnail ? <img src={info.thumbnail} alt="" loading="lazy" /> : <Layers size={22} aria-hidden />}</div>
      <div className="file-main">
        {editing ? (
          <form
            className="rename"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="sr-only" htmlFor={`rn-${p.file.path}`}>Nombre nuevo para {p.file.path}</label>
            <input
              id={`rn-${p.file.path}`}
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setRenameError('');
              }}
              onKeyDown={(e) => e.key === 'Escape' && cancel()}
              disabled={saving}
              aria-invalid={!!renameError}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="rename-ext">{splitName(p.file.path).ext}</span>
            <button type="submit" className="icon-btn" disabled={saving} aria-label="Guardar nombre" title="Guardar">
              {saving ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />}
            </button>
            <button type="button" className="icon-btn" onClick={cancel} disabled={saving} aria-label="Cancelar" title="Cancelar">
              <X size={18} />
            </button>
          </form>
        ) : (
          <div className="file-name" title={p.file.path}>{p.file.path}</div>
        )}
        {renameError && <div className="field-error" role="alert">{renameError}</div>}
        <div className="file-meta">
          {info.estimatedSeconds != null && <span><Clock size={12} aria-hidden />{formatDuration(info.estimatedSeconds)}</span>}
          <span>{formatBytes(p.file.size)}</span>
          <span>{formatDate(p.file.modified)}</span>
        </div>
      </div>
      <div className="file-actions">
        <button className="icon-btn" onClick={p.onPrint} disabled={!p.canPrint} aria-label={`Imprimir ${p.file.path}`} title="Imprimir">
          <Play size={18} />
        </button>
        <button className="icon-btn" onClick={p.onView} aria-label={`Ver ${p.file.path} en 3D`} title="Ver en 3D">
          <Eye size={18} />
        </button>
        <button className="icon-btn" onClick={startEdit} disabled={p.isPrinting || editing} aria-label={`Cambiar el nombre de ${p.file.path}`} title={p.isPrinting ? 'No se puede renombrar mientras se imprime' : 'Cambiar nombre'}>
          <Pencil size={18} />
        </button>
        <button className="icon-btn danger" onClick={p.onDelete} disabled={p.isPrinting} aria-label={`Borrar ${p.file.path}`} title="Borrar">
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
