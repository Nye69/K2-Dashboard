import { parseGcodeFooter, parseGcodeHeader } from '../lib/gcodeInfo';
import { infoFromMetadata, needsFileScan, type FileInfo } from '../lib/metadata';

export type { FileInfo };

export interface GcodeFile {
  path: string;
  modified: number;
  size: number;
}


/** Si la sesión caducó, ir a la pantalla de login. */
export function goLoginIfUnauthorized(status: number) {
  if (status === 401) location.assign('/login');
}

/** Comprueba la sesión (p. ej. cuando se cae el websocket). */
export async function checkSession() {
  try {
    const r = await fetch('/server/info', { cache: 'no-store' });
    goLoginIfUnauthorized(r.status);
  } catch {
    /* sin red: no es problema de sesión */
  }
}

async function json<T>(res: Response): Promise<T> {
  goLoginIfUnauthorized(res.status);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      msg = body?.error?.message ?? msg;
    } catch {
      /* cuerpo no JSON */
    }
    throw new Error(msg);
  }
  return (await res.json()).result as T;
}

const post = (url: string) => fetch(url, { method: 'POST' }).then((r) => json(r));
const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export const listFiles = () =>
  fetch('/server/files/list?root=gcodes')
    .then((r) => json<GcodeFile[]>(r))
    .then((files) => files.filter((f) => /\.(gcode|g|gco)$/i.test(f.path) && !f.path.startsWith('.')));

export const deleteFile = (path: string) =>
  fetch(`/server/files/gcodes/${enc(path)}`, { method: 'DELETE' }).then((r) => json(r));

export const startPrint = (filename: string) => post(`/printer/print/start?filename=${encodeURIComponent(filename)}`);
export const pausePrint = () => post('/printer/print/pause');
export const resumePrint = () => post('/printer/print/resume');
export const cancelPrint = () => post('/printer/print/cancel');
export const runGcode = (script: string) => post(`/printer/gcode/script?script=${encodeURIComponent(script)}`);

export const setTemp = (heater: 'extruder' | 'heater_bed', target: number) =>
  runGcode(`SET_HEATER_TEMPERATURE HEATER=${heater} TARGET=${Math.max(0, Math.round(target))}`);

export function uploadFile(file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/server/files/upload');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      if (xhr.status === 413) return reject(new Error('El archivo es demasiado grande para el servidor (413)'));
      let msg = `Error ${xhr.status}`;
      try {
        msg = JSON.parse(xhr.responseText)?.error?.message ?? msg;
      } catch {
        /* nada */
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error('Error de red al subir'));
    const form = new FormData();
    form.append('root', 'gcodes');
    form.append('file', file, file.name);
    xhr.send(form);
  });
}

export async function fetchRange(path: string, range: string): Promise<string> {
  const res = await fetch(`/server/files/gcodes/${enc(path)}`, { headers: { Range: `bytes=${range}` } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

export async function fetchWholeFile(path: string, onProgress?: (fraction: number) => void, sizeHint = 0): Promise<string> {
  const res = await fetch(`/server/files/gcodes/${enc(path)}`);
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar (${res.status})`);
  // Con gzip no llega Content-Length: se usa el tamaño real del archivo para la barra de progreso.
  const total = sizeHint || Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total && onProgress) onProgress(Math.min(1, loaded / total));
  }
  return new TextDecoder().decode(await new Blob(chunks as BlobPart[]).arrayBuffer());
}

export async function fileMetadata(path: string): Promise<Record<string, any> | null> {
  try {
    const r = await fetch(`/server/files/metadata?filename=${encodeURIComponent(path)}`);
    goLoginIfUnauthorized(r.status);
    return r.ok ? (await r.json()).result : null;
  } catch {
    return null;
  }
}

const infoCache = new Map<string, Promise<FileInfo>>();
const STORE_PREFIX = 'k2info:';

function loadStored(key: string): FileInfo | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    return raw ? (JSON.parse(raw) as FileInfo) : null;
  } catch {
    return null;
  }
}

function store(key: string, info: FileInfo) {
  try {
    localStorage.setItem(STORE_PREFIX + key, JSON.stringify(info));
  } catch {
    /* lleno o bloqueado: no pasa nada, se vuelve a pedir */
  }
}

/**
 * Miniatura, tiempo, capas y filamento de un G-code. Primero pregunta a Moonraker (una petición pequeña);
 * solo si falta algo lee la cabecera y el pie del propio archivo. Se guarda en el móvil para la próxima vez.
 * `modified` = 0 significa "no sé la fecha" (no se guarda en disco, por si el archivo cambia con el mismo nombre).
 */
export function fileInfo(path: string, modified: number): Promise<FileInfo> {
  const key = `${path}@${modified}`;
  let p = infoCache.get(key);
  if (p) return p;
  const stored = modified ? loadStored(key) : null;
  if (stored) {
    p = Promise.resolve(stored);
  } else {
    p = (async () => {
      const info = infoFromMetadata(path, await fileMetadata(path));
      if (needsFileScan(info)) {
        try {
          const [head, tail] = await Promise.all([fetchRange(path, '0-65535'), fetchRange(path, '-49152')]);
          const scanned = { ...parseGcodeHeader(head), ...parseGcodeFooter(tail) };
          for (const [k, v] of Object.entries(scanned)) if ((info as any)[k] == null) (info as any)[k] = v;
        } catch {
          /* sin datos extra */
        }
      }
      if (modified) store(key, info);
      return info;
    })();
  }
  infoCache.set(key, p);
  return p;
}
