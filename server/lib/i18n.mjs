// Textos del servidor (login, configuración inicial, errores de la API y notificaciones) en español e inglés.
// El idioma lo elige cada dispositivo en Ajustes y viaja en la cookie "k2-lang". Sin cookie: español.

export const LANGS = ['es', 'en'];
export const DEFAULT_LANG = 'es';
export const LANG_COOKIE = 'k2-lang';

export const normalizeLang = (v) => (LANGS.includes(v) ? v : DEFAULT_LANG);

/** Idioma de la petición, según la cookie k2-lang. */
export function langOf(req) {
  const m = /(?:^|;\s*)k2-lang=([a-z]{2})/.exec(String(req?.headers?.cookie ?? ''));
  return normalizeLang(m?.[1]);
}

/** Cookie para recordar el idioma (también la pone la app desde Ajustes). */
export const langCookie = (lang) => `${LANG_COOKIE}=${normalizeLang(lang)}; Path=/; Max-Age=31536000; SameSite=Lax`;

const M = {
  es: {
    'login.title': 'Entrar',
    'login.user': 'Usuario',
    'login.password': 'Contraseña',
    'login.submit': 'Entrar',
    'login.firstRun': 'Primer arranque: entra con <b>admin</b> / <b>changeme</b> desde tu red local. Después te pedirá un usuario y una contraseña nuevos.',
    'login.bad': 'Usuario o contraseña incorrectos.',
    'login.rate': 'Demasiados intentos. Espera 15 minutos.',
    'login.lanOnly': 'La configuración inicial solo se puede hacer desde la red local. Entra con la IP del servidor estando en casa.',
    'setup.title': 'Crear administrador',
    'setup.heading': 'Crea tu usuario',
    'setup.intro': 'La cuenta de fábrica (admin / changeme) deja de funcionar en cuanto guardes. Este usuario será el administrador.',
    'setup.user': 'Usuario nuevo',
    'setup.password': 'Contraseña nueva (mínimo 10 caracteres)',
    'setup.confirm': 'Repite la contraseña',
    'setup.submit': 'Guardar y entrar',
    'pw.show': 'Mostrar contraseña',
    'pw.hide': 'Ocultar contraseña',
    'lang.switch': 'English',
    'lang.switchTo': 'en',

    'v.nameLong': 'Máximo 40 caracteres.',
    'v.nameChars': 'El nombre no puede llevar < ni >.',
    'v.host': 'Pon solo la IP o el nombre, sin http:// ni puerto (por ejemplo 192.168.1.50).',
    'v.url': 'Tiene que empezar por https:// (por ejemplo https://impresora.midominio.com).',
    'v.proxies': 'No son IP ni rangos válidos: {list}',
    'v.email': 'Pon un correo válido (por ejemplo tu@correo.com).',
    'v.user': 'De 3 a 32 caracteres: letras, números, punto, guion, guion bajo o @.',
    'v.passwordShort': 'Mínimo 10 caracteres.',
    'v.passwordEasy': 'Esa contraseña es demasiado fácil.',
    'v.confirm': 'Las contraseñas no coinciden.',

    'api.session': 'Sesión caducada',
    'api.forbidden': 'Petición no permitida',
    'api.badJson': 'JSON no válido',
    'api.notFound': 'No existe',
    'api.wrongPassword': 'La contraseña actual no es correcta.',
    'api.badSubscription': 'Suscripción no válida',
    'api.tooManyDevices': 'Demasiados dispositivos suscritos (máximo 50)',
    'api.contactFirst': 'Pon primero un correo de contacto y guarda.',
    'api.notSubscribed': 'Este dispositivo no tiene los avisos activados.',
    'api.expired': 'La suscripción caducó; vuelve a activar los avisos.',
    'api.sendFailed': 'No se pudo enviar',
    'api.noContact': 'Falta el correo de contacto en Ajustes → Avisos',
    'device.default': 'Dispositivo',

    'push.testTitle': 'Avisos de {name} activados',
    'push.testBody': 'Así te llegarán los avisos de la impresora.',
    'event.started': 'Empezó la impresión',
    'event.complete': 'Impresión terminada',
    'event.error': 'La impresión falló',
    'event.paused': 'Impresión pausada',
    'event.cancelled': 'Impresión cancelada',
    'event.filament': 'No se detecta filamento',
    'event.klippy': 'Klipper tiene un error',
  },
  en: {
    'login.title': 'Sign in',
    'login.user': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.firstRun': 'First start: sign in with <b>admin</b> / <b>changeme</b> from your local network. You will then be asked for a new username and password.',
    'login.bad': 'Wrong username or password.',
    'login.rate': 'Too many attempts. Wait 15 minutes.',
    'login.lanOnly': 'The first-time setup can only be done from your local network. Open the server by its IP while at home.',
    'setup.title': 'Create administrator',
    'setup.heading': 'Create your account',
    'setup.intro': 'The default account (admin / changeme) stops working as soon as you save. This user will be the administrator.',
    'setup.user': 'New username',
    'setup.password': 'New password (at least 10 characters)',
    'setup.confirm': 'Repeat the password',
    'setup.submit': 'Save and sign in',
    'pw.show': 'Show password',
    'pw.hide': 'Hide password',
    'lang.switch': 'Español',
    'lang.switchTo': 'es',

    'v.nameLong': '40 characters at most.',
    'v.nameChars': 'The name cannot contain < or >.',
    'v.host': 'Enter only the IP or hostname, without http:// or a port (for example 192.168.1.50).',
    'v.url': 'It has to start with https:// (for example https://printer.mydomain.com).',
    'v.proxies': 'Not valid IPs or ranges: {list}',
    'v.email': 'Enter a valid email (for example you@mail.com).',
    'v.user': '3 to 32 characters: letters, numbers, dot, hyphen, underscore or @.',
    'v.passwordShort': 'At least 10 characters.',
    'v.passwordEasy': 'That password is too easy.',
    'v.confirm': 'The passwords do not match.',

    'api.session': 'Session expired',
    'api.forbidden': 'Request not allowed',
    'api.badJson': 'Invalid JSON',
    'api.notFound': 'Not found',
    'api.wrongPassword': 'The current password is not correct.',
    'api.badSubscription': 'Invalid subscription',
    'api.tooManyDevices': 'Too many subscribed devices (50 at most)',
    'api.contactFirst': 'Enter a contact email and save first.',
    'api.notSubscribed': 'Notifications are not enabled on this device.',
    'api.expired': 'The subscription expired; enable notifications again.',
    'api.sendFailed': 'Could not send',
    'api.noContact': 'The contact email is missing in Settings → Notifications',
    'device.default': 'Device',

    'push.testTitle': '{name} notifications enabled',
    'push.testBody': 'This is how printer notifications will reach you.',
    'event.started': 'Print started',
    'event.complete': 'Print finished',
    'event.error': 'Print failed',
    'event.paused': 'Print paused',
    'event.cancelled': 'Print cancelled',
    'event.filament': 'No filament detected',
    'event.klippy': 'Klipper has an error',
  },
};

export const MESSAGES = M;

/** Texto en el idioma pedido; {var} se sustituye por vars.var. */
export function t(lang, key, vars = {}) {
  const s = M[normalizeLang(lang)][key] ?? M.es[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
