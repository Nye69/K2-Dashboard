// Datos del dashboard, en DATA_DIR (en Docker: /data, montado desde DATA_PATH del servidor).
//
//   users.json     cuentas (usuario, contraseña cifrada con scrypt, rol)
//   settings.json  ajustes (impresora, dominio, proxies, correo de contacto)
//   secrets.json   secreto de las sesiones y claves VAPID de las notificaciones
//   devices.json   dispositivos con notificaciones push
//   storage/       para funciones futuras (archivos del usuario, copias...)
//
// Las variables de entorno (.env) solo dan los valores del primer arranque; después manda lo que se cambie en Ajustes.
import { randomBytes } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { hashPassword } from './auth.mjs';
import { isHost, isIpOrCidr, parseList } from './net.mjs';
import { generateVapidKeys, isEmail } from './webpush.mjs';

export const DEFAULT_USER = 'admin';
export const DEFAULT_PASSWORD = 'changeme';

export const SETTING_KEYS = ['printerHost', 'panelUrl', 'trustedProxies', 'pushContact'];

/** Ajustes iniciales a partir del entorno. */
/** "k2.midominio.com" → "https://k2.midominio.com" (sin barra final). */
export function normalizePanelUrl(value) {
  const v = String(value ?? '').trim().replace(/\/+$/, '');
  if (!v) return '';
  // Solo si no trae ningún esquema: "ftp://x" se deja tal cual para que la validación lo rechace.
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

export function settingsFromEnv(env = process.env) {
  return {
    printerHost: (env.PRINTER_HOST ?? '').trim(),
    panelUrl: normalizePanelUrl(env.PANEL_URL),
    trustedProxies: parseList(env.TRUSTED_PROXIES),
    pushContact: (env.PUSH_CONTACT_EMAIL ?? '').trim(),
  };
}

const isHttpUrl = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Valida y limpia los ajustes que llegan desde la app.
 * Devuelve { settings } o { errors: { campo: mensaje } }.
 */
export function validateSettings(input) {
  const errors = {};
  const s = {
    printerHost: String(input?.printerHost ?? '').trim(),
    panelUrl: normalizePanelUrl(input?.panelUrl),
    trustedProxies: parseList(input?.trustedProxies),
    pushContact: String(input?.pushContact ?? '').trim().replace(/^mailto:/i, ''),
  };
  if (s.printerHost && !isHost(s.printerHost)) errors.printerHost = 'Pon solo la IP o el nombre, sin http:// ni puerto (por ejemplo 192.168.1.50).';
  if (s.panelUrl && !isHttpUrl(s.panelUrl)) errors.panelUrl = 'Tiene que empezar por https:// (por ejemplo https://impresora.midominio.com).';
  const bad = s.trustedProxies.filter((p) => !isIpOrCidr(p));
  if (bad.length) errors.trustedProxies = `No son IP ni rangos válidos: ${bad.join(', ')}`;
  if (s.pushContact && !isEmail(s.pushContact)) errors.pushContact = 'Pon un correo válido (por ejemplo tu@correo.com).';
  return Object.keys(errors).length ? { errors } : { settings: s };
}

/** Usuario y contraseña nuevos. */
export function validateCredentials(user, password, confirm) {
  const errors = {};
  const u = String(user ?? '').trim();
  if (!/^[A-Za-z0-9._@-]{3,32}$/.test(u)) errors.user = 'De 3 a 32 caracteres: letras, números, punto, guion, guion bajo o @.';
  const p = String(password ?? '');
  if (p.length < 10) errors.password = 'Mínimo 10 caracteres.';
  else if (p === DEFAULT_PASSWORD || p.toLowerCase() === u.toLowerCase()) errors.password = 'Esa contraseña es demasiado fácil.';
  if (confirm !== undefined && p !== confirm) errors.confirm = 'Las contraseñas no coinciden.';
  return Object.keys(errors).length ? { errors } : { user: u, password: p };
}

/** Configuración nueva: admin / changeme, que obliga a cambiarlos en el primer inicio de sesión. */
export async function freshConfig(env = process.env) {
  return {
    version: 2,
    auth: {
      user: DEFAULT_USER,
      hash: await hashPassword(DEFAULT_PASSWORD),
      mustChange: true,
      secret: randomBytes(32).toString('base64url'),
    },
    settings: settingsFromEnv(env),
    push: { vapid: generateVapidKeys(), subscriptions: [] },
  };
}

export const FILES = {
  users: 'users.json',
  settings: 'settings.json',
  secrets: 'secrets.json',
  devices: 'devices.json',
};
export const STORAGE_DIR = 'storage';
const LEGACY = 'config.json';

export const dataFile = (dataDir, name) => join(dataDir, FILES[name]);
/** Archivo que se vigila para recargar si alguien lo cambia desde fuera (p. ej. --reset-login). */
export const configPath = (dataDir) => dataFile(dataDir, 'users');

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return undefined;
    throw new Error(`No se pudo leer ${file}: ${e.message}`);
  }
}

/** Escritura atómica (temporal + rename), legible solo por el dueño. */
async function writeJson(file, data) {
  await fsp.mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await fsp.rename(tmp, file);
}

const STORAGE_README = `Carpeta reservada para funciones futuras del K2 Dashboard (archivos del usuario, copias de seguridad...).
Se conserva entre actualizaciones porque está dentro del volumen de datos.
`;

/** Pasa la configuración en memoria a los archivos separados. */
function toFiles(cfg) {
  return {
    users: { version: 1, users: [{ username: cfg.auth.user, hash: cfg.auth.hash, role: 'admin', mustChange: !!cfg.auth.mustChange }] },
    settings: { version: 1, ...cfg.settings },
    secrets: { version: 1, sessionSecret: cfg.auth.secret, vapid: cfg.push.vapid },
    devices: { version: 1, push: cfg.push.subscriptions ?? [] },
  };
}

function cleanSettings(raw) {
  const merged = { ...settingsFromEnv({}), ...raw };
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, merged[k]]));
  out.panelUrl = normalizePanelUrl(out.panelUrl);
  return out;
}

/**
 * Carga los datos. Si no hay nada, crea admin / changeme con los ajustes del entorno.
 * Si encuentra el config.json de versiones anteriores, lo reparte en los archivos nuevos y lo renombra.
 */
export async function loadConfig(dataDir, env = process.env) {
  await fsp.mkdir(join(dataDir, STORAGE_DIR), { recursive: true });
  const readme = join(dataDir, STORAGE_DIR, 'LEEME.txt');
  await fsp.writeFile(readme, STORAGE_README, { flag: 'wx' }).catch(() => {});

  const [users, settings, secrets, devices] = await Promise.all(Object.keys(FILES).map((k) => readJson(dataFile(dataDir, k))));

  if (!users) {
    const legacy = await readJson(join(dataDir, LEGACY));
    const cfg = legacy?.auth ? { ...legacy, settings: cleanSettings(legacy.settings) } : await freshConfig(env);
    cfg.push = cfg.push?.vapid ? { vapid: cfg.push.vapid, subscriptions: cfg.push.subscriptions ?? [] } : { vapid: generateVapidKeys(), subscriptions: [] };
    await saveConfig(dataDir, cfg);
    if (legacy) await fsp.rename(join(dataDir, LEGACY), join(dataDir, `${LEGACY}.migrado`)).catch(() => {});
    return cfg;
  }

  const admin = users.users?.find((u) => u.role === 'admin') ?? users.users?.[0];
  if (!admin) throw new Error(`${FILES.users} no tiene ningún usuario. Usa --reset-login.`);
  const cfg = {
    version: 2,
    auth: { user: admin.username, hash: admin.hash, mustChange: !!admin.mustChange, secret: secrets?.sessionSecret ?? randomBytes(32).toString('base64url') },
    settings: cleanSettings(settings ?? settingsFromEnv(env)),
    push: { vapid: secrets?.vapid ?? generateVapidKeys(), subscriptions: devices?.push ?? [] },
  };
  // Si faltaba algún archivo (borrado a mano, versión intermedia), se vuelve a escribir.
  if (!settings || !secrets?.sessionSecret || !secrets?.vapid || !devices) await saveConfig(dataDir, cfg);
  return cfg;
}

export async function saveConfig(dataDir, cfg) {
  const files = toFiles(cfg);
  // users.json el último: es el que se vigila para recargar.
  for (const name of ['settings', 'secrets', 'devices', 'users']) await writeJson(dataFile(dataDir, name), files[name]);
}

/** Lo que se puede enseñar a la app (nunca el hash, el secreto ni la clave privada). */
export function publicView(cfg) {
  return { user: cfg.auth.user, settings: cfg.settings };
}

/** Dispositivos suscritos, sin las claves. */
export function pushView(cfg) {
  return {
    publicKey: cfg.push.vapid.publicKey,
    contactSet: !!cfg.settings.pushContact,
    devices: cfg.push.subscriptions.map((s) => ({ id: s.id, label: s.label, createdAt: s.createdAt, endpoint: s.endpoint })),
  };
}

/**
 * Fragmentos de nginx que dependen de los ajustes. Los valores ya vienen validados
 * (isHost / isIpOrCidr), así que no pueden colar directivas.
 */
export function nginxIncludes(settings) {
  const host = settings.printerHost || '127.0.0.1'; // sin configurar: 502 en vez de error de sintaxis
  const printer = `# Generado por el dashboard: no editar a mano.\nset $k2_host "${host}";\n`;
  const proxies = settings.trustedProxies ?? [];
  const realip = proxies.length
    ? `# Generado por el dashboard: proxies de confianza.\n${proxies.map((p) => `set_real_ip_from ${p};`).join('\n')}\nreal_ip_header X-Forwarded-For;\nreal_ip_recursive on;\n`
    : '# Generado por el dashboard: ningún proxy de confianza.\n';
  return { 'printer.conf': printer, 'realip.conf': realip };
}
