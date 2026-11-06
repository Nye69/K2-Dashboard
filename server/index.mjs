// Servidor del K2 Dashboard: inicio de sesión, configuración inicial, ajustes y avisos.
// nginx (en el mismo contenedor) le pregunta a /auth/check en cada petición (auth_request).
//
//   node server/index.mjs               arranca el servidor
//   node server/index.mjs --prepare     crea la configuración si falta y escribe los fragmentos de nginx (antes de arrancar nginx)
//   node server/index.mjs --reset-login vuelve a admin / changeme (conserva los ajustes)
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fsp, readFileSync, watchFile } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { hashPassword, makeLimiter, readCookie, signSession, verifyPassword, verifySession } from './lib/auth.mjs';
import { configPath, DEFAULT_PASSWORD, DEFAULT_USER, loadConfig, nginxIncludes, publicView, saveConfig, validateCredentials, validateSettings } from './lib/config.mjs';
import { isLanRequest, normalizeIp } from './lib/net.mjs';
import { Notifier, sendNtfy } from './notifier.mjs';
import { loginPage, setupPage } from './pages.mjs';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const RUN_DIR = process.env.RUN_DIR ?? '/run/k2';
const STATIC_DIR = process.env.STATIC_DIR ?? '/usr/share/nginx/html';
const HOST = process.env.AUTH_HOST ?? '127.0.0.1';
const PORT = Number(process.env.AUTH_PORT ?? 8080);
const RELOAD_NGINX = process.env.RELOAD_NGINX !== '0';
const COOKIE = 'k2s';
const TTL_MS = 30 * 24 * 3600_000;

const log = (...a) => console.log(new Date().toISOString(), ...a);

let cfg = await loadConfig(DATA_DIR);

async function writeIncludes(settings) {
  await fsp.mkdir(RUN_DIR, { recursive: true });
  for (const [name, text] of Object.entries(nginxIncludes(settings))) await fsp.writeFile(join(RUN_DIR, name), text);
}

const reloadNginx = () =>
  new Promise((resolve) => {
    if (!RELOAD_NGINX) return resolve();
    execFile('nginx', ['-s', 'reload'], (err, _out, stderr) => {
      if (err) log('no se pudo recargar nginx:', stderr || err.message);
      resolve();
    });
  });

// --- modos de una sola vez ---
if (process.argv.includes('--reset-login')) {
  cfg.auth = { user: DEFAULT_USER, hash: await hashPassword(DEFAULT_PASSWORD), mustChange: true, secret: randomBytes(32).toString('base64url') };
  await saveConfig(DATA_DIR, cfg);
  console.log('Acceso restablecido a admin / changeme (solo desde la red local). Los ajustes se conservan.');
  process.exit(0);
}
if (process.argv.includes('--prepare')) {
  await writeIncludes(cfg.settings);
  console.log('Configuración lista en', DATA_DIR);
  process.exit(0);
}

// --- servidor ---
const notifier = new Notifier();
notifier.apply(cfg.settings);
await writeIncludes(cfg.settings);

// Si alguien cambia config.json desde fuera (p. ej. --reset-login), se vuelve a leer.
watchFile(configPath(DATA_DIR), { interval: 2000 }, async () => {
  try {
    const next = await loadConfig(DATA_DIR);
    const proxiesOrHost = JSON.stringify([next.settings.printerHost, next.settings.trustedProxies]) !== JSON.stringify([cfg.settings.printerHost, cfg.settings.trustedProxies]);
    cfg = next;
    notifier.apply(cfg.settings);
    if (proxiesOrHost) {
      await writeIncludes(cfg.settings);
      await reloadNginx();
    }
  } catch (e) {
    log('no se pudo releer la configuración:', e.message);
  }
});

let iconDataUri;
try {
  iconDataUri = 'data:image/png;base64,' + readFileSync(join(STATIC_DIR, 'icons', 'apple-touch-icon.png')).toString('base64');
} catch {}

const limiter = makeLimiter(10, 15 * 60_000);

const clientInfo = (req) => ({
  clientIp: normalizeIp(String(req.headers['x-client-ip'] ?? req.socket.remoteAddress ?? '')),
  peerIp: normalizeIp(String(req.headers['x-peer-ip'] ?? req.headers['x-client-ip'] ?? req.socket.remoteAddress ?? '')),
  forwarded: String(req.headers['x-had-forward'] ?? '').trim(),
});
const isLan = (req) => isLanRequest(clientInfo(req));
const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https';

function cookie(req, value, maxAgeSec) {
  return [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`, isHttps(req) ? 'Secure' : ''].filter(Boolean).join('; ');
}
const newSessionCookie = (req) => cookie(req, signSession(cfg.auth.user, cfg.auth.secret, Date.now(), TTL_MS), TTL_MS / 1000);

/** Usuario con sesión válida (o null). */
function sessionUser(req) {
  const s = verifySession(readCookie(req.headers.cookie, COOKIE), cfg.auth.secret, Date.now());
  return s && s.user === cfg.auth.user ? s.user : null;
}

/** Peticiones que cambian algo: si el navegador manda Origin, tiene que ser este mismo sitio. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) {
        reject(new Error('demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const html = (res, status, body) => res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
const json = (res, status, body, headers = {}) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }).end(JSON.stringify(body));
const redirect = (res, to, headers = {}) => res.writeHead(303, { Location: to, ...headers }).end();

const LAN_ONLY = 'La configuración inicial solo se puede hacer desde la red local. Entra con la IP del servidor estando en casa.';

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (path === '/auth/health') return res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');

  if (path === '/auth/check') {
    const ok = !cfg.auth.mustChange && sessionUser(req);
    return res.writeHead(ok ? 204 : 401).end();
  }

  // ---- inicio de sesión ----
  if (path === '/login' && method === 'GET') {
    if (cfg.auth.mustChange && !isLan(req)) return html(res, 403, loginPage({ error: LAN_ONLY, iconDataUri }));
    return html(res, 200, loginPage({ firstRun: cfg.auth.mustChange, iconDataUri }));
  }

  if (path === '/auth/login' && method === 'POST') {
    if (!sameOrigin(req)) return res.writeHead(403).end();
    const { clientIp } = clientInfo(req);
    const now = Date.now();
    if (cfg.auth.mustChange && !isLan(req)) return html(res, 403, loginPage({ error: LAN_ONLY, iconDataUri }));
    if (limiter.blocked(clientIp, now)) return html(res, 429, loginPage({ error: 'Demasiados intentos. Espera 15 minutos.', iconDataUri }));
    let form;
    try {
      form = new URLSearchParams(await readBody(req, 4096));
    } catch {
      return res.writeHead(400).end();
    }
    const user = (form.get('user') ?? '').trim();
    const ok = user === cfg.auth.user && (await verifyPassword(form.get('password') ?? '', cfg.auth.hash));
    if (!ok) {
      limiter.fail(clientIp, now);
      log('login fallido desde', clientIp);
      return html(res, 401, loginPage({ error: 'Usuario o contraseña incorrectos.', firstRun: cfg.auth.mustChange, iconDataUri }));
    }
    limiter.reset(clientIp);
    log('login correcto desde', clientIp);
    return redirect(res, cfg.auth.mustChange ? '/setup' : '/', { 'Set-Cookie': newSessionCookie(req) });
  }

  if (path === '/auth/logout') return redirect(res, '/login', { 'Set-Cookie': cookie(req, '', 0) });

  // ---- configuración inicial: cambiar admin / changeme ----
  if (path === '/setup' && method === 'GET') {
    if (!cfg.auth.mustChange) return redirect(res, '/');
    if (!isLan(req)) return html(res, 403, loginPage({ error: LAN_ONLY, iconDataUri }));
    if (!sessionUser(req)) return redirect(res, '/login');
    return html(res, 200, setupPage({ iconDataUri }));
  }

  if (path === '/auth/setup' && method === 'POST') {
    if (!sameOrigin(req)) return res.writeHead(403).end();
    if (!cfg.auth.mustChange) return redirect(res, '/');
    if (!isLan(req)) return html(res, 403, loginPage({ error: LAN_ONLY, iconDataUri }));
    if (!sessionUser(req)) return redirect(res, '/login');
    let form;
    try {
      form = new URLSearchParams(await readBody(req, 4096));
    } catch {
      return res.writeHead(400).end();
    }
    const v = validateCredentials(form.get('user'), form.get('password'), form.get('confirm') ?? '');
    if (v.errors) return html(res, 400, setupPage({ errors: v.errors, user: form.get('user') ?? '', iconDataUri }));
    cfg = { ...cfg, auth: { user: v.user, hash: await hashPassword(v.password), mustChange: false, secret: randomBytes(32).toString('base64url') } };
    await saveConfig(DATA_DIR, cfg);
    log('administrador creado:', v.user);
    return redirect(res, '/', { 'Set-Cookie': newSessionCookie(req) });
  }

  // ---- API de ajustes (para la app) ----
  if (path.startsWith('/auth/api/')) {
    if (cfg.auth.mustChange || !sessionUser(req)) return json(res, 401, { error: 'Sesión caducada' });
    if (method !== 'GET' && (!sameOrigin(req) || !String(req.headers['content-type'] ?? '').startsWith('application/json'))) return json(res, 403, { error: 'Petición no permitida' });
    let body = {};
    if (method !== 'GET') {
      try {
        body = JSON.parse((await readBody(req, 16_384)) || '{}');
      } catch {
        return json(res, 400, { error: 'JSON no válido' });
      }
    }

    if (path === '/auth/api/settings' && method === 'GET') return json(res, 200, publicView(cfg));

    if (path === '/auth/api/settings' && method === 'PUT') {
      const v = validateSettings(body);
      if (v.errors) return json(res, 400, { errors: v.errors });
      const nginxChanged = JSON.stringify([v.settings.printerHost, v.settings.trustedProxies]) !== JSON.stringify([cfg.settings.printerHost, cfg.settings.trustedProxies]);
      cfg = { ...cfg, settings: v.settings };
      await saveConfig(DATA_DIR, cfg);
      notifier.apply(cfg.settings);
      if (nginxChanged) {
        await writeIncludes(cfg.settings);
        await reloadNginx();
      }
      log('ajustes guardados');
      return json(res, 200, publicView(cfg));
    }

    if (path === '/auth/api/account' && method === 'POST') {
      if (!(await verifyPassword(String(body.currentPassword ?? ''), cfg.auth.hash))) return json(res, 400, { errors: { currentPassword: 'La contraseña actual no es correcta.' } });
      const v = validateCredentials(body.user, body.password, body.confirm ?? '');
      if (v.errors) return json(res, 400, { errors: v.errors });
      // Secreto nuevo: se cierran las sesiones de los demás dispositivos.
      cfg = { ...cfg, auth: { user: v.user, hash: await hashPassword(v.password), mustChange: false, secret: randomBytes(32).toString('base64url') } };
      await saveConfig(DATA_DIR, cfg);
      log('cuenta actualizada:', v.user);
      return json(res, 200, publicView(cfg), { 'Set-Cookie': newSessionCookie(req) });
    }

    if (path === '/auth/api/ntfy-test' && method === 'POST') {
      const v = validateSettings({ ...cfg.settings, ...body });
      if (v.errors) return json(res, 400, { errors: v.errors });
      try {
        await sendNtfy(v.settings, { title: 'Avisos de la K2 activados', message: 'Así te llegarán los avisos de la impresora.', tags: ['printer'] });
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 502, { error: e.message });
      }
    }

    return json(res, 404, { error: 'No existe' });
  }

  res.writeHead(404).end();
}

createServer((req, res) => {
  handle(req, res).catch((e) => {
    log('error:', e);
    if (!res.headersSent) res.writeHead(500).end();
  });
}).listen(PORT, HOST, () => {
  log(`K2 Dashboard escuchando en ${HOST}:${PORT}`);
  if (cfg.auth.mustChange) log('Primer arranque: entra desde la red local con admin / changeme para crear tu usuario.');
});
