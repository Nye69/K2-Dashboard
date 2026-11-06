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
import { configPath, DEFAULT_PASSWORD, DEFAULT_USER, displayName, loadConfig, nginxIncludes, publicView, pushView, saveConfig, validateCredentials, validateSettings } from './lib/config.mjs';
import { isLanRequest, normalizeIp, originIp } from './lib/net.mjs';
import { isValidSubscription, sendPush, vapidSubject } from './lib/webpush.mjs';
import { Notifier } from './notifier.mjs';
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
/**
 * Manda una notificación push a todos los dispositivos suscritos (o solo a uno).
 * Las suscripciones que ya no existen (el usuario quitó el permiso o borró la app) se eliminan.
 */
async function broadcast(message, { urgency = 'normal', only } = {}) {
  const subject = vapidSubject(cfg.settings.pushContact);
  if (!subject) {
    log('sin correo de contacto en Ajustes: no se envían notificaciones');
    return { sent: 0, failed: 0, removed: 0, errors: ['Falta el correo de contacto en Ajustes → Avisos'] };
  }
  const targets = cfg.push.subscriptions.filter((sub) => !only || sub.endpoint === only);
  const results = await Promise.all(
    targets.map(async (sub) => {
      try {
        return { sub, r: await sendPush(sub, message, { vapid: cfg.push.vapid, subject, urgency }) };
      } catch (e) {
        return { sub, r: { ok: false, error: e.message } };
      }
    }),
  );
  const gone = new Set(results.filter((x) => x.r.gone).map((x) => x.sub.endpoint));
  if (gone.size) {
    cfg = { ...cfg, push: { ...cfg.push, subscriptions: cfg.push.subscriptions.filter((sub) => !gone.has(sub.endpoint)) } };
    await saveConfig(DATA_DIR, cfg);
    log('suscripciones caducadas eliminadas:', gone.size);
  }
  const failed = results.filter((x) => !x.r.ok && !x.r.gone);
  for (const x of failed) log('notificación fallida en', x.sub.label, x.r.status ?? '', x.r.error ?? '');
  return {
    sent: results.filter((x) => x.r.ok).length,
    failed: failed.length,
    removed: gone.size,
    errors: failed.map((x) => `${x.sub.label}: ${x.r.status ?? ''} ${x.r.error ?? ''}`.trim()),
  };
}

const URGENCY = (priority) => (priority >= 4 ? 'high' : priority <= 2 ? 'low' : 'normal');

const notifier = new Notifier((ev) => {
  broadcast({ title: `${displayName(cfg.settings)}: ${ev.title}`, body: ev.message || '', tag: `k2-${ev.id}`, url: cfg.settings.panelUrl || '/' }, { urgency: URGENCY(ev.priority) }).catch((e) =>
    log('no se pudo notificar:', e.message),
  );
});
notifier.apply(cfg.settings);
await writeIncludes(cfg.settings);

// Si alguien cambia users.json desde fuera (p. ej. --reset-login), se vuelve a leer.
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

const clientInfo = (req) => {
  const info = {
    clientIp: normalizeIp(String(req.headers['x-client-ip'] ?? req.socket.remoteAddress ?? '')),
    peerIp: normalizeIp(String(req.headers['x-peer-ip'] ?? req.headers['x-client-ip'] ?? req.socket.remoteAddress ?? '')),
    forwardedFor: String(req.headers['x-fwd-for'] ?? ''),
    realIp: String(req.headers['x-fwd-real-ip'] ?? ''),
  };
  // IP real del visitante (también para el límite de intentos de inicio de sesión).
  return { ...info, clientIp: info.clientIp, origin: originIp(info) };
};
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
    if (cfg.auth.mustChange && !isLan(req)) return html(res, 403, loginPage({ name: displayName(cfg.settings), error: LAN_ONLY, iconDataUri }));
    return html(res, 200, loginPage({ name: displayName(cfg.settings), firstRun: cfg.auth.mustChange, iconDataUri }));
  }

  if (path === '/auth/login' && method === 'POST') {
    if (!sameOrigin(req)) return res.writeHead(403).end();
    const { origin: clientIp } = clientInfo(req);
    const now = Date.now();
    if (cfg.auth.mustChange && !isLan(req)) return html(res, 403, loginPage({ name: displayName(cfg.settings), error: LAN_ONLY, iconDataUri }));
    if (limiter.blocked(clientIp, now)) return html(res, 429, loginPage({ name: displayName(cfg.settings), error: 'Demasiados intentos. Espera 15 minutos.', iconDataUri }));
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
      return html(res, 401, loginPage({ name: displayName(cfg.settings), error: 'Usuario o contraseña incorrectos.', firstRun: cfg.auth.mustChange, iconDataUri }));
    }
    limiter.reset(clientIp);
    log('login correcto desde', clientIp);
    return redirect(res, cfg.auth.mustChange ? '/setup' : '/', { 'Set-Cookie': newSessionCookie(req) });
  }

  if (path === '/auth/logout') return redirect(res, '/login', { 'Set-Cookie': cookie(req, '', 0) });

  // ---- configuración inicial: cambiar admin / changeme ----
  if (path === '/setup' && method === 'GET') {
    if (!cfg.auth.mustChange) return redirect(res, '/');
    if (!isLan(req)) return html(res, 403, loginPage({ name: displayName(cfg.settings), error: LAN_ONLY, iconDataUri }));
    if (!sessionUser(req)) return redirect(res, '/login');
    return html(res, 200, setupPage({ name: displayName(cfg.settings), iconDataUri }));
  }

  if (path === '/auth/setup' && method === 'POST') {
    if (!sameOrigin(req)) return res.writeHead(403).end();
    if (!cfg.auth.mustChange) return redirect(res, '/');
    if (!isLan(req)) return html(res, 403, loginPage({ name: displayName(cfg.settings), error: LAN_ONLY, iconDataUri }));
    if (!sessionUser(req)) return redirect(res, '/login');
    let form;
    try {
      form = new URLSearchParams(await readBody(req, 4096));
    } catch {
      return res.writeHead(400).end();
    }
    const v = validateCredentials(form.get('user'), form.get('password'), form.get('confirm') ?? '');
    if (v.errors) return html(res, 400, setupPage({ name: displayName(cfg.settings), errors: v.errors, user: form.get('user') ?? '', iconDataUri }));
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

    // ---- notificaciones push ----
    if (path === '/auth/api/push' && method === 'GET') return json(res, 200, pushView(cfg));

    if (path === '/auth/api/push/subscribe' && method === 'POST') {
      const sub = body.subscription;
      if (!isValidSubscription(sub)) return json(res, 400, { error: 'Suscripción no válida' });
      const label = String(body.label ?? 'Dispositivo').trim().slice(0, 60) || 'Dispositivo';
      const others = cfg.push.subscriptions.filter((x) => x.endpoint !== sub.endpoint);
      if (others.length >= 50) return json(res, 400, { error: 'Demasiados dispositivos suscritos (máximo 50)' });
      const entry = { id: randomBytes(6).toString('hex'), label, createdAt: new Date().toISOString(), endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
      cfg = { ...cfg, push: { ...cfg.push, subscriptions: [...others, entry] } };
      await saveConfig(DATA_DIR, cfg);
      log('dispositivo suscrito:', label);
      return json(res, 200, pushView(cfg));
    }

    if (path === '/auth/api/push/unsubscribe' && method === 'POST') {
      cfg = { ...cfg, push: { ...cfg.push, subscriptions: cfg.push.subscriptions.filter((x) => x.endpoint !== body.endpoint && x.id !== body.id) } };
      await saveConfig(DATA_DIR, cfg);
      return json(res, 200, pushView(cfg));
    }

    if (path === '/auth/api/push/test' && method === 'POST') {
      if (!cfg.settings.pushContact) return json(res, 400, { errors: { pushContact: 'Pon primero un correo de contacto y guarda.' } });
      const only = body.endpoint ? String(body.endpoint) : undefined;
      if (!cfg.push.subscriptions.some((x) => !only || x.endpoint === only)) return json(res, 400, { error: 'Este dispositivo no tiene los avisos activados.' });
      const r = await broadcast(
        { title: `Avisos de ${displayName(cfg.settings)} activados`, body: 'Así te llegarán los avisos de la impresora.', tag: 'k2-test', url: cfg.settings.panelUrl || '/' },
        { only },
      );
      if (!r.sent) return json(res, 502, { error: r.errors[0] ?? (r.removed ? 'La suscripción caducó; vuelve a activar los avisos.' : 'No se pudo enviar') });
      return json(res, 200, r);
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
