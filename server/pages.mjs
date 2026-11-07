// Páginas que sirve el propio servidor (sin React): inicio de sesión y configuración inicial.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const EYE_ON =
  '<svg class="on" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF =
  '<svg class="off" hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';

const passwordField = (name, label, autocomplete, error) => `
  <label>${label}
    <span class="pw">
      <input name="${name}" type="password" autocomplete="${autocomplete}" required ${error ? 'aria-invalid="true"' : ''}>
      <button type="button" class="eye" aria-label="Mostrar contraseña" aria-pressed="false" title="Mostrar contraseña">${EYE_ON}${EYE_OFF}</button>
    </span>
    ${error ? `<span class="field-err">${esc(error)}</span>` : ''}
  </label>`;

const textField = (name, label, value, error, extra = '') => `
  <label>${label}
    <input name="${name}" value="${esc(value)}" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required ${extra} ${error ? 'aria-invalid="true"' : ''}>
    ${error ? `<span class="field-err">${esc(error)}</span>` : ''}
  </label>`;

function shell({ title, iconDataUri, body, appTitle = 'K2' }) {
  // iOS 27 no carga el icono desde una URL al añadir a la pantalla de inicio (sale una letra): va incrustado.
  const touchIcon = iconDataUri ? `<link rel="apple-touch-icon" sizes="180x180" href="${iconDataUri}">` : '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#121212">
<link rel="manifest" href="/manifest.webmanifest">
${touchIcon}
<link rel="icon" href="/icons/favicon-64.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(appTitle)}">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 16px;
    background: #121212; color: #f5f5f5; font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  form { width: min(380px, 100%); background: #1e1e1e; border: 1px solid #333333; border-radius: 14px; padding: 24px; display: grid; gap: 14px; }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 22px; margin-bottom: 4px; }
  .brand img { width: 40px; height: 40px; border-radius: 10px; }
  p { margin: 0; color: #b3b3b3; font-size: 14px; }
  label { display: grid; gap: 6px; font-size: 14px; color: #b3b3b3; }
  input { height: 48px; padding: 0 12px; border-radius: 10px; border: 1px solid #333333; background: #121212; color: inherit; font-size: 16px; width: 100%; }
  input[aria-invalid="true"] { border-color: #ef4444; }
  input:focus-visible, button:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
  button[type=submit] { height: 48px; border: 0; border-radius: 10px; background: #22c55e; color: #052e14; font-weight: 700; font-size: 16px; cursor: pointer; }
  button[type=submit]:active { transform: scale(.98); }
  .pw { position: relative; display: block; }
  .pw input { padding-right: 52px; }
  .eye { position: absolute; right: 2px; top: 2px; width: 44px; height: 44px; border: 0; background: transparent; color: #b3b3b3;
    display: grid; place-items: center; border-radius: 8px; cursor: pointer; }
  .eye:hover { color: #f5f5f5; background: #2a2a2a; }
  .eye svg[hidden] { display: none; }
  .err { background: #2a1012; border: 1px solid #5f1d22; color: #fca5a5; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
  .info { background: #262626; border: 1px solid #3a3a3a; color: #e5e5e5; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
  .field-err { color: #fca5a5; font-size: 13px; }
</style></head>
<body>
${body}
<script>
  document.querySelectorAll('.eye').forEach((eye) => {
    const pw = eye.parentElement.querySelector('input');
    eye.addEventListener('click', () => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      eye.title = eye.getAttribute('aria-label');
      eye.querySelector('.on').hidden = show;
      eye.querySelector('.off').hidden = !show;
      pw.focus();
    });
  });
  // Si el navegador muestra esta página desde su caché al ir "atrás", pedirla de nuevo:
  // con sesión abierta el servidor redirige al panel.
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
  // Al enviar, nunca dejar contraseñas visibles si la página vuelve.
  document.querySelector('form').addEventListener('submit', (e) => e.target.querySelectorAll('.pw input').forEach((i) => (i.type = 'password')));
</script>
</body></html>`;
}

export function loginPage({ error = '', notice = '', iconDataUri, firstRun = false, name = 'K2' } = {}) {
  return shell({
    title: `${name} · Entrar`,
    appTitle: name,
    iconDataUri,
    body: `<form method="post" action="/auth/login">
  <div class="brand"><img src="/icons/icon-192.png" alt="">${esc(name)}</div>
  ${firstRun ? '<div class="info">Primer arranque: entra con <b>admin</b> / <b>changeme</b> desde tu red local. Después te pedirá un usuario y una contraseña nuevos.</div>' : ''}
  ${notice ? `<div class="info" role="status">${esc(notice)}</div>` : ''}
  ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
  ${textField('user', 'Usuario', '', '', 'autofocus')}
  ${passwordField('password', 'Contraseña', 'current-password')}
  <button type="submit">Entrar</button>
</form>`,
  });
}

export function setupPage({ errors = {}, user = '', iconDataUri, name = 'K2' } = {}) {
  return shell({
    title: `${name} · Crear administrador`,
    appTitle: name,
    iconDataUri,
    body: `<form method="post" action="/auth/setup">
  <div class="brand"><img src="/icons/icon-192.png" alt="">Crea tu usuario</div>
  <p>La cuenta de fábrica (admin / changeme) deja de funcionar en cuanto guardes. Este usuario será el administrador.</p>
  ${errors.general ? `<div class="err" role="alert">${esc(errors.general)}</div>` : ''}
  ${textField('user', 'Usuario nuevo', user, errors.user, 'autofocus')}
  ${passwordField('password', 'Contraseña nueva (mínimo 10 caracteres)', 'new-password', errors.password)}
  ${passwordField('confirm', 'Repite la contraseña', 'new-password', errors.confirm)}
  <button type="submit">Guardar y entrar</button>
</form>`,
  });
}
