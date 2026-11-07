import * as GCodePreview from 'gcode-preview';
import { Box, LoaderCircle, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Box3, Color, Vector3, type Object3D } from 'three';
import { formatBytes } from '../lib/format';
import { printedLayerIndex } from '../lib/layers';
import { layerAtFilePosition, lineByteOffsets } from '../lib/filePosition';
import { fetchWholeFile, fileMetadata } from '../moonraker/api';
import { useInView } from '../lib/useInView';
import { usePrinter } from '../moonraker/usePrinter';

/** Por debajo de este tamaño la vista se carga sola; por encima, el usuario pulsa "Cargar vista". */
const AUTOLOAD_BYTES = 8 * 1024 * 1024;
const BUILD = { x: 260, y: 260, z: 260 };

/** Hasta este tamaño de G-code se dibuja con tubos iluminados; más grande, con líneas (más ligero). */
const tubesLimit = () => (window.matchMedia('(pointer: coarse)').matches ? 4 : 10) * 1024 * 1024;

/** Apunta la cámara al centro del modelo y la aleja lo justo para que quepa entero. */
function frameModel(v: GCodePreview.WebGLPreview) {
  const group = (v as unknown as { group?: Object3D }).group;
  if (!group) return;
  group.updateMatrixWorld(true);
  // Las dos primeras piezas son el preámbulo y la línea de purga del borde de la cama: no cuentan para encuadrar.
  const parts = group.children.length > 4 ? group.children.slice(2) : group.children;
  const box = new Box3();
  parts.forEach((c) => box.expandByObject(c));
  if (box.isEmpty()) return;
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const radius = Math.max(size.x, size.y, size.z, 20);
  const fov = (v.camera.fov * Math.PI) / 180;
  const dist = (radius / 2 / Math.tan(fov / 2)) * 1.3;
  v.controls.target.set(center.x, center.y, center.z);
  // Vista desde delante y arriba (~40°), como mirando la cama de la impresora.
  const dir = new Vector3(0.25, 0.75, 1).normalize().multiplyScalar(dist);
  v.camera.position.set(center.x + dir.x, center.y + dir.y, center.z + dir.z);
  v.camera.lookAt(center.x, center.y, center.z);
  v.controls.update();
  v.renderer.render(v.scene, v.camera);
}

const GREEN = new Color('#22c55e').getHSL({ h: 0, s: 0, l: 0 });

/**
 * En modo líneas la librería aclara cada capa según la altura (luminosidad 10 %→80 %) y la parte de arriba sale
 * casi blanca. Se reescala esa luminosidad a 16 %→42 %: se sigue notando la altura pero sin "quemarse".
 * Solo toca los colores verdes (la capa actual amarilla se queda igual).
 */
function toneDownLines(v: GCodePreview.WebGLPreview) {
  const group = (v as unknown as { group?: Object3D }).group;
  if (!group || v.renderTubes) return;
  const hsl = { h: 0, s: 0, l: 0 };
  group.traverse((o) => {
    const m = (o as unknown as { material?: { color?: Color } }).material;
    const c = m?.color;
    if (!c) return;
    c.getHSL(hsl);
    if (Math.abs(hsl.h - GREEN.h) > 0.04) return;
    c.setHSL(hsl.h, Math.min(hsl.s, 0.75), 0.16 + ((Math.min(Math.max(hsl.l, 0.1), 0.8) - 0.1) / 0.7) * 0.26);
  });
}

/** Dibuja y, si son líneas, baja el brillo. */
function draw(v: GCodePreview.WebGLPreview) {
  v.render();
  if (!v.renderTubes) {
    toneDownLines(v);
    v.renderer.render(v.scene, v.camera);
  }
}

type Phase = { kind: 'idle' } | { kind: 'ask'; size: number } | { kind: 'loading'; progress: number } | { kind: 'ready' } | { kind: 'error'; message: string };

export function GcodeViewer({ path }: { path: string | null }) {
  const { status } = usePrinter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef(0);
  // Para saber qué capa del visor se está imprimiendo a partir del byte por el que va la impresora.
  const offsetsRef = useRef<Uint32Array | null>(null);
  const layerStartsRef = useRef<number[]>([]);
  const [inViewRef, visible] = useInView<HTMLElement>('100px');
  const preview = useRef<GCodePreview.WebGLPreview | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [maxLayer, setMaxLayer] = useState(0);
  const [layer, setLayer] = useState(0);
  // Por defecto se ve el modelo entero; "solo lo impreso" es opcional (al principio de una impresión casi no se ve nada).
  const [follow, setFollow] = useState(false);
  const [simplified, setSimplified] = useState(false);

  const printingThis = status.print_stats?.filename === path && ['printing', 'paused'].includes(status.print_stats?.state);
  // Capa del visor que se está imprimiendo: por la posición en el archivo si se sabe (exacto), si no por proporción.
  const filePos = Number(status.virtual_sdcard?.file_position) || 0;
  const printedLayer =
    printingThis && maxLayer > 0
      ? filePos > 0 && offsetsRef.current && layerStartsRef.current.length
        ? layerAtFilePosition(layerStartsRef.current, offsetsRef.current, filePos)
        : printedLayerIndex(status.virtual_sdcard ?? {}, maxLayer)
      : null;

  // Crear el visor una vez.
  useEffect(() => {
    if (!canvasRef.current) return;
    const p = GCodePreview.init({
      canvas: canvasRef.current,
      buildVolume: BUILD,
      backgroundColor: '#161616',
      extrusionColor: '#22c55e',
      extrusionWidth: 0.45,
      topLayerColor: '#facc15',
      travelColor: '#4a4a4a',
      renderTravel: false,
      initialCameraPosition: [0, 320, 380],
    });
    preview.current = p;
    const ro = new ResizeObserver(() => p.resize());
    if (stageRef.current) ro.observe(stageRef.current);
    return () => {
      ro.disconnect();
      p.dispose();
      preview.current = null;
    };
  }, []);

  const load = async (p: string) => {
    setPhase({ kind: 'loading', progress: 0 });
    try {
      const text = await fetchWholeFile(p, (f) => setPhase({ kind: 'loading', progress: f }), sizeRef.current);
      const v = preview.current;
      if (!v) return;
      v.clear();
      v.startLayer = undefined;
      v.endLayer = undefined;
      // Tubos con luz: se ve como la pieza real. Con líneas, la librería aclara cada capa según la altura
      // (de 10 % a 80 % de luminosidad) y la parte de arriba sale casi blanca, "quemada".
      // Los tubos pesan el doble: en archivos muy grandes (y antes en el móvil) se usan líneas.
      v.renderTubes = text.length <= tubesLimit();
      setSimplified(!v.renderTubes);
      v.processGCode(text);
      offsetsRef.current = lineByteOffsets(text);
      layerStartsRef.current = v.layers.map((l) => l.lineNumber);
      const max = Math.max(0, v.layers.length - 1);
      setMaxLayer(max);
      setLayer(max);
      setFollow(false);
      draw(v);
      frameModel(v);
      setPhase({ kind: 'ready' });
    } catch (e) {
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  };

  // Al cambiar de archivo (y solo cuando el visor está en pantalla): comprobar tamaño y cargar o preguntar.
  // En el móvil el visor queda abajo: así no se descargan megas de G-code al abrir la app.
  useEffect(() => {
    preview.current?.clear();
    setMaxLayer(0);
    if (!path) return setPhase({ kind: 'idle' });
    if (!visible) return setPhase({ kind: 'idle' });
    let alive = true;
    fileMetadata(path).then((m) => {
      if (!alive) return;
      const size = Number(m?.size) || 0;
      sizeRef.current = size;
      if (size > AUTOLOAD_BYTES) setPhase({ kind: 'ask', size });
      else load(path);
    });
    return () => {
      alive = false;
    };
  }, [path, visible]);

  // Mostrar hasta la capa elegida (o la que se está imprimiendo).
  const shownLayer = follow && printedLayer != null ? printedLayer : layer;
  useEffect(() => {
    const v = preview.current;
    if (!v || phase.kind !== 'ready') return;
    const t = setTimeout(() => {
      v.endLayer = shownLayer + 1;
      draw(v);
    }, 80);
    return () => clearTimeout(t);
  }, [shownLayer, phase.kind]);

  const resetCamera = () => {
    if (preview.current) frameModel(preview.current);
  };

  return (
    <section ref={inViewRef} className="card viewer" aria-labelledby="viewer-title">
      <div className="card-head">
        <Box size={18} aria-hidden color="var(--text-2)" />
        <h2 id="viewer-title">Vista del G-code</h2>
        <div className="spacer" />
        {path && <span className="viewer-name" title={path}>{path}</span>}
        <button className="icon-btn" onClick={resetCamera} aria-label="Centrar la cámara" title="Centrar la cámara" disabled={phase.kind !== 'ready'}>
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="viewer-stage" ref={stageRef}>
        <canvas ref={canvasRef} aria-label="Vista 3D del G-code. Arrastra para girar, pellizca o usa la rueda para hacer zoom." />
        {phase.kind !== 'ready' && (
          <div className="viewer-empty">
            {phase.kind === 'idle' && <div><Box size={32} aria-hidden />{path ? 'Cargando vista…' : 'Pulsa el ojo de un archivo para verlo en 3D.'}</div>}
            {phase.kind === 'ask' && (
              <div>
                Este archivo pesa {formatBytes(phase.size)}.
                <button className="btn primary" onClick={() => path && load(path)}>Cargar vista</button>
              </div>
            )}
            {phase.kind === 'loading' && (
              <div>
                <LoaderCircle size={28} className="spin" aria-hidden />
                Cargando… {Math.round(phase.progress * 100)}%
              </div>
            )}
            {phase.kind === 'error' && (
              <div>
                No se pudo cargar: {phase.message}
                <button className="btn" onClick={() => path && load(path)}>Reintentar</button>
              </div>
            )}
          </div>
        )}
      </div>

      {phase.kind === 'ready' && maxLayer > 0 && (
        <div className="viewer-controls">
          <label htmlFor="layer" className="num" style={{ fontSize: 14, color: 'var(--text-2)', minWidth: 96 }}>
            Capa {shownLayer + 1} / {maxLayer + 1}
          </label>
          <input
            id="layer"
            type="range"
            min={0}
            max={maxLayer}
            value={shownLayer}
            onChange={(e) => {
              setFollow(false);
              setLayer(Number(e.target.value));
            }}
          />
          {printingThis && (
            <label className="toggle">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              Solo lo impreso
            </label>
          )}
        </div>
      )}
      {phase.kind === 'ready' && simplified && <div className="viewer-note">Vista simplificada por el tamaño del archivo.</div>}
      {phase.kind === 'ready' && printedLayer != null && (
        <div className="viewer-printing">
          Imprimiendo este archivo
          {status.virtual_sdcard?.layer_count ? ` · capa ${status.virtual_sdcard.layer} de ${status.virtual_sdcard.layer_count}` : ''}
        </div>
      )}
    </section>
  );
}
