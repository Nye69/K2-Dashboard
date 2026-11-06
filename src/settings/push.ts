// Notificaciones push en este dispositivo: registro del service worker, permiso y suscripción.

export interface PushDevice {
  id: string;
  label: string;
  createdAt: string;
  endpoint: string;
}

export interface PushInfo {
  publicKey: string;
  contactSet: boolean;
  devices: PushDevice[];
}

export type PushSupport = 'ok' | 'ios-browser' | 'unsupported' | 'insecure';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** ¿Se pueden activar los avisos aquí? En iPhone solo desde la app añadida a la pantalla de inicio. */
export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return 'insecure';
  if (isIos() && !isStandalone()) return 'ios-browser';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

/** Nombre corto del dispositivo para la lista. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || isIos() ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const browser = isStandalone() ? 'app' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}

const b64uToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/auth/api/push${path}`, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fieldMsg = data.errors ? Object.values(data.errors)[0] : undefined;
    throw new Error((data.error as string) ?? (fieldMsg as string) ?? `Error ${res.status}`);
  }
  return data as T;
}

export const getPushInfo = () => api<PushInfo>('');

/** La suscripción de este dispositivo, si la hay. */
export async function currentSubscription() {
  const reg = await navigator.serviceWorker?.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Pide permiso y suscribe este dispositivo. Tiene que llamarse desde un toque del usuario (iOS lo exige). */
export async function enablePush(publicKey: string): Promise<PushInfo> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('No diste permiso para las notificaciones. Actívalo en los ajustes del sistema para esta app.');
  const reg = (await registerServiceWorker())!;
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Si la suscripción es de otras claves (p. ej. se reinstaló el servidor), se rehace.
  const key = b64uToBytes(publicKey);
  const same = sub?.options.applicationServerKey && new Uint8Array(sub.options.applicationServerKey).every((b, i) => b === key[i]);
  if (sub && !same) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return api<PushInfo>('/subscribe', { subscription: sub.toJSON(), label: deviceLabel() });
}

export async function disablePush(): Promise<PushInfo> {
  const sub = await currentSubscription();
  const endpoint = sub?.endpoint;
  await sub?.unsubscribe();
  return api<PushInfo>('/unsubscribe', { endpoint });
}

export const removeDevice = (id: string) => api<PushInfo>('/unsubscribe', { id });
export const sendTestPush = (endpoint?: string) => api<{ sent: number }>('/test', { endpoint });
