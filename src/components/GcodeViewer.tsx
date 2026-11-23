import * as GCodePreview from 'gcode-preview';
import { Box, LoaderCircle, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Box3, BufferGeometry, CanvasTexture, Float32BufferAttribute, Color, DoubleSide, Group, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type Object3D } from 'three';
import { bedFromGcode, K2_SE_BED, type Bed } from '../lib/bed';
import { objectOutline, useFocusedObject, type BedObject } from '../lib/objectFocus';
import { formatBytes } from '../lib/format';
import { printedLayerIndex } from '../lib/layers';
import { layerAtFilePosition, lineByteOffsets } from '../lib/filePosition';
import { fetchWholeFile, fileMetadata } from '../moonraker/api';
import { useInView } from '../lib/useInView';
import { usePrinter } from '../moonraker/usePrinter';
import { useT } from '../i18n';

/** Por debajo de este tamaño la vista se carga sola; por encima, el usuario pulsa "Cargar vista". */
const AUTOLOAD_BYTES = 8 * 1024 * 1024;

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

/**
 * Marca del frente de la cama: el borde delantero en verde y el texto "FRENTE" en el suelo, delante.
 * En el G-code de la K2 el frente es Y = 0 (ahí va la línea de purga); la librería lo dibuja hacia la cámara.
 */
function makeFrontMarker(bed: Bed, label: string): { group: Group; dispose: () => void } {
  const group = new Group();
  const lineGeo = new BufferGeometry().setFromPoints([new Vector3(-bed.x / 2, 0.3, bed.y / 2), new Vector3(bed.x / 2, 0.3, bed.y / 2)]);
  const lineMat = new LineBasicMaterial({ color: '#22c55e' });
  group.add(new Line(lineGeo, lineMat));

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#22c55e';
  ctx.font = '600 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), 256, 50);
  const tex = new CanvasTexture(canvas);
  const textW = Math.min(70, bed.x * 0.4);
  const textGeo = new PlaneGeometry(textW, (textW * 96) / 512);
  const textMat = new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthWrite: false });
  const text = new Mesh(textGeo, textMat);
  text.rotation.x = -Math.PI / 2; // tumbado en el suelo, legible desde delante
  text.position.set(0, 0.2, bed.y / 2 + 10);
  group.add(text);

  return {
    group,
    dispose: () => {
      lineGeo.dispose();
      lineMat.dispose();
      textGeo.dispose();
      textMat.dispose();
      tex.dispose();
    },
  };
}

/** Pasa un punto del G-code (mm) a la escena: la librería pone el área imprimible centrada en el origen. */
const toWorld = (bed: Bed, x: number, y: number, h: number) => new Vector3(x - bed.minX - bed.x / 2, h, -(y - bed.minY) + bed.y / 2);

/**
 * Caja amarilla alrededor de una pieza (la señalada en la lista de piezas): aristas, paredes semitransparentes y suelo.
 * Un poco más grande que la pieza para que no quede escondida detrás de ella.
 */
function makeHighlight(poly: number[][], bed: Bed, height: number): { group: Group; dispose: () => void } {
  const group = new Group();
  const color = '#facc15';
  const PAD = 2.5;
  const top = Math.max(height, 1) + 2;
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const padded = poly.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / d) * PAD, y + ((y - cy) / d) * PAD];
  });
  const low = padded.map(([x, y]) => toWorld(bed, x, y, 0.4));
  const high = padded.map(([x, y]) => toWorld(bed, x, y, top));
  const pts: Vector3[] = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    pts.push(low[i], low[j], high[i], high[j], low[i], high[i]);
  }
  const edgeGeo = new BufferGeometry().setFromPoints(pts);
  const edgeMat = new LineBasicMaterial({ color });
  group.add(new LineSegments(edgeGeo, edgeMat));
  // Suelo: triángulos en abanico desde el centro (los contornos de Klipper son convexos).
  const c = low.reduce((a, p) => a.add(p), new Vector3()).divideScalar(low.length);
  const tri: number[] = [];
  for (let i = 0; i < low.length; i++) {
    const a = low[i];
    const b = low[(i + 1) % low.length];
    tri.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const fillGeo = new BufferGeometry();
  fillGeo.setAttribute('position', new Float32BufferAttribute(tri, 3));
  const fillMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false });
  group.add(new Mesh(fillGeo, fillMat));
  // Paredes: dos triángulos por lado.
  const wall: number[] = [];
  for (let i = 0; i < low.length; i++) {
    const j = (i + 1) % low.length;
    for (const p of [low[i], low[j], high[j], low[i], high[j], high[i]]) wall.push(p.x, p.y, p.z);
  }
  const wallGeo = new BufferGeometry();
  wallGeo.setAttribute('position', new Float32BufferAttribute(wall, 3));
  const wallMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false });
  group.add(new Mesh(wallGeo, wallMat));
  return {
    group,
    dispose: () => {
      edgeGeo.dispose();
      edgeMat.dispose();
      fillGeo.dispose();
      fillMat.dispose();
      wallGeo.dispose();
      wallMat.dispose();
    },
  };
}

/**
 * Dibuja y, si son líneas, baja el brillo. La librería pone el (0,0) del G-code en la esquina delantera izquierda
 * de la cama; si el área imprimible empieza en otro punto, se desplaza el modelo. Después se añade la marca del frente.
 */
function draw(v: GCodePreview.WebGLPreview, bed: Bed, front: Group | null, extra: Group | null = null) {
  v.render();
  const group = (v as unknown as { group?: Object3D }).group;
  if (group && (bed.minX || bed.minY)) group.position.set(-bed.x / 2 - bed.minX, 0, bed.y / 2 + bed.minY);
  if (front) v.scene.add(front);
  if (extra) v.scene.add(extra);
  if (!v.renderTubes) toneDownLines(v);
  v.renderer.render(v.scene, v.camera);
}

type Phase = { kind: 'idle' } | { kind: 'ask'; size: number } | { kind: 'loading'; progress: number } | { kind: 'ready' } | { kind: 'error'; message: string };

export function GcodeViewer({ path }: { path: string | null }) {
  const t = useT();
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
  // Cama del archivo cargado (la del slicer si viene en el G-code) y la marca del frente para esa cama.
  const bedRef = useRef<Bed>(K2_SE_BED);
  const frontRef = useRef<{ key: string; group: Group; dispose: () => void } | null>(null);
  const frontLabel = t('viewer.front');
  // Pieza señalada en la lista de piezas: se marca en el modelo si este es el archivo que se imprime.
  const focusedName = useFocusedObject();
  const highlightRef = useRef<{ group: Group; dispose: () => void } | null>(null);
  const frontFor = (bed: Bed) => {
    const key = `${bed.x}x${bed.y}:${frontLabel}`;
    if (frontRef.current?.key !== key) {
      frontRef.current?.dispose();
      frontRef.current = { key, ...makeFrontMarker(bed, frontLabel) };
    }
    return frontRef.current.group;
  };

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
      buildVolume: { x: K2_SE_BED.x, y: K2_SE_BED.y, z: K2_SE_BED.z },
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
      frontRef.current?.dispose();
      frontRef.current = null;
      highlightRef.current?.dispose();
      highlightRef.current = null;
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
      const bed = bedFromGcode(text);
      bedRef.current = bed;
      v.buildVolume = { x: bed.x, y: bed.y, z: bed.z };
      v.processGCode(text);
      offsetsRef.current = lineByteOffsets(text);
      layerStartsRef.current = v.layers.map((l) => l.lineNumber);
      const max = Math.max(0, v.layers.length - 1);
      setMaxLayer(max);
      setLayer(max);
      setFollow(false);
      draw(v, bed, frontFor(bed));
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
      draw(v, bedRef.current, frontFor(bedRef.current), highlightRef.current?.group ?? null);
    }, 80);
    return () => clearTimeout(t);
  }, [shownLayer, phase.kind, frontLabel]);

  const objects: BedObject[] = printingThis ? status.exclude_object?.objects ?? [] : [];
  const focusedPoly = focusedName ? objectOutline(objects.find((o) => o.name === focusedName) ?? { name: '' }) : null;
  const focusedKey = focusedPoly ? JSON.stringify(focusedPoly) : '';
  useEffect(() => {
    const v = preview.current;
    if (!v || phase.kind !== 'ready') return;
    if (highlightRef.current) {
      v.scene.remove(highlightRef.current.group);
      highlightRef.current.dispose();
      highlightRef.current = null;
    }
    if (focusedPoly) {
      const group = (v as unknown as { group?: Object3D }).group;
      const height = group ? new Box3().setFromObject(group).max.y : 10;
      highlightRef.current = makeHighlight(focusedPoly, bedRef.current, Number.isFinite(height) ? height : 10);
      v.scene.add(highlightRef.current.group);
    }
    v.renderer.render(v.scene, v.camera);
    // focusedPoly cambia de referencia en cada render: se compara por su contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedKey, phase.kind]);

  const resetCamera = () => {
    if (preview.current) frameModel(preview.current);
  };

  return (
    <section ref={inViewRef} className="card viewer" aria-labelledby="viewer-title">
      <div className="card-head">
        <Box size={18} aria-hidden color="var(--text-2)" />
        <h2 id="viewer-title">{t('viewer.title')}</h2>
        <div className="spacer" />
        {path && <span className="viewer-name" title={path}>{path}</span>}
        <button className="icon-btn" onClick={resetCamera} aria-label={t('viewer.center')} title={t('viewer.center')} disabled={phase.kind !== 'ready'}>
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="viewer-stage" ref={stageRef}>
        <canvas ref={canvasRef} aria-label={t('viewer.canvas')} />
        {phase.kind !== 'ready' && (
          <div className="viewer-empty">
            {phase.kind === 'idle' && <div><Box size={32} aria-hidden />{path ? t('viewer.loadingView') : t('viewer.pickFile')}</div>}
            {phase.kind === 'ask' && (
              <div>
                {t('viewer.size', { size: formatBytes(phase.size) })}
                <button className="btn primary" onClick={() => path && load(path)}>{t('viewer.load')}</button>
              </div>
            )}
            {phase.kind === 'loading' && (
              <div>
                <LoaderCircle size={28} className="spin" aria-hidden />
                {t('viewer.loading', { pct: Math.round(phase.progress * 100) })}
              </div>
            )}
            {phase.kind === 'error' && (
              <div>
                {t('viewer.error', { error: phase.message })}
                <button className="btn" onClick={() => path && load(path)}>{t('viewer.retry')}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {phase.kind === 'ready' && maxLayer > 0 && (
        <div className="viewer-controls">
          <label htmlFor="layer" className="num" style={{ fontSize: 14, color: 'var(--text-2)', minWidth: 96 }}>
            {t('viewer.layer', { n: shownLayer + 1, total: maxLayer + 1 })}
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
              {t('viewer.onlyPrinted')}
            </label>
          )}
        </div>
      )}
      {phase.kind === 'ready' && simplified && <div className="viewer-note">{t('viewer.simplified')}</div>}
      {phase.kind === 'ready' && printedLayer != null && (
        <div className="viewer-printing">
          {t('viewer.printingThis')}
          {status.virtual_sdcard?.layer_count ? t('viewer.printingLayer', { n: status.virtual_sdcard.layer, total: status.virtual_sdcard.layer_count }) : ''}
        </div>
      )}
    </section>
  );
}
