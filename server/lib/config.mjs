// Configuración del dashboard: se guarda en DATA_DIR/config.json.
// Las variables de entorno (.env) solo dan los valores del primer arranque; después manda lo que se cambie en Ajustes.
import { randomBytes } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { hashPassword } from './auth.mjs';
import { isHost, isIpOrCidr, parseList } from './net.mjs';

export const DEFAULT_USER = 'admin';
export const DEFAULT_PASSWORD = 'changeme';

export const SETTING_KEYS = ['printerHost', 'panelUrl', 'trustedProxies', 'ntfyUrl', 'ntfyTopic'];

/** Ajustes iniciales a partir del entorno. */
export function settingsFromEnv(env = process.env) {
  return {
    printerHost: (env.PRINTER_HOST ?? '').trim(),
    panelUrl: (env.PANEL_URL ?? '').trim(),
    trustedProxies: parseList(env.TRUSTED_PROXIES),
    ntfyUrl: (env.NTFY_URL ?? 'https://ntfy.sh').trim(),
    ntfyTopic: (env.NTFY_TOPIC ?? '').trim(),
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
    panelUrl: String(input?.panelUrl ?? '').trim().replace(/\/+$/, ''),
    trustedProxies: parseList(input?.trustedProxies),
    ntfyUrl: String(input?.ntfyUrl ?? '').trim().replace(/\/+$/, '') || 'https://ntfy.sh',
    ntfyTopic: String(input?.ntfyTopic ?? '').trim(),
  };
  if (s.printerHost && !isHost(s.printerHost)) errors.printerHost = 'Pon solo la IP o el nombre, sin http:// ni puerto (por ejemplo 192.168.1.50).';
  if (s.panelUrl && !isHttpUrl(s.panelUrl)) errors.panelUrl = 'Tiene que empezar por https:// (por ejemplo https://impresora.midominio.com).';
  const bad = s.trustedProxies.filter((p) => !isIpOrCidr(p));
  if (bad.length) errors.trustedProxies = `No son IP ni rangos válidos: ${bad.join(', ')}`;
  if (!isHttpUrl(s.ntfyUrl)) errors.ntfyUrl = 'Tiene que ser una URL (por defecto https://ntfy.sh).';
  if (s.ntfyTopic && !/^[A-Za-z0-9_-]{1,64}$/.test(s.ntfyTopic)) errors.ntfyTopic = 'Solo letras, números, guiones y guiones bajos (máximo 64).';
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
    version: 1,
    auth: {
      user: DEFAULT_USER,
      hash: await hashPassword(DEFAULT_PASSWORD),
      mustChange: true,
      secret: randomBytes(32).toString('base64url'),
    },
    settings: settingsFromEnv(env),
  };
}

export const configPath = (dataDir) => join(dataDir, 'config.json');

export async function loadConfig(dataDir, env = process.env) {
  try {
    const cfg = JSON.parse(await fsp.readFile(configPath(dataDir), 'utf8'));
    // Ajustes que falten (versiones antiguas) toman su valor por defecto.
    cfg.settings = { ...settingsFromEnv({}), ...cfg.settings };
    return cfg;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const cfg = await freshConfig(env);
    await saveConfig(dataDir, cfg);
    return cfg;
  }
}

/** Escritura atómica (archivo temporal + rename), legible solo por el dueño: contiene el hash y el secreto. */
export async function saveConfig(dataDir, cfg) {
  const file = configPath(dataDir);
  await fsp.mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  await fsp.rename(tmp, file);
}

/** Lo que se puede enseñar a la app (nunca el hash ni el secreto). */
export function publicView(cfg) {
  return { user: cfg.auth.user, settings: cfg.settings };
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
