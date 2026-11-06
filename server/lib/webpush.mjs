// Web Push sin dependencias: firma VAPID (RFC 8292) y cifrado aes128gcm (RFC 8291 / RFC 8188).
// Así el propio dashboard manda las notificaciones a Apple, Google, Mozilla o Microsoft, sin servicios intermedios.
import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');

/** Claves VAPID nuevas. Se guardan en config.json; si cambian, hay que volver a suscribir los dispositivos. */
export function generateVapidKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    publicKey: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])),
    privateJwk: privateKey.export({ format: 'jwk' }),
  };
}

/** "correo@x.com" → "mailto:correo@x.com". Apple rechaza los avisos sin un contacto válido. */
export function vapidSubject(contact) {
  const c = String(contact ?? '').trim();
  if (!c) return '';
  if (/^mailto:/i.test(c) || /^https:\/\//i.test(c)) return c;
  return `mailto:${c}`;
}

export const isEmail = (s) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(s ?? '').trim());

/** JWT ES256 para la cabecera Authorization: vapid t=..., k=... */
export function vapidJwt({ audience, subject, privateJwk, now = Date.now(), ttlSec = 12 * 3600 }) {
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + ttlSec, sub: subject }));
  const key = createPrivateKey({ key: privateJwk, format: 'jwk' });
  const sig = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64u(sig)}`;
}

/**
 * Cifra el mensaje para una suscripción (aes128gcm, un solo registro).
 * subscription.keys: { p256dh, auth } en base64url, tal como las da el navegador.
 * Devuelve el cuerpo listo para el POST.
 */
export function encryptPayload(subscription, plaintext, { salt = randomBytes(16), serverKeys } = {}) {
  const uaPublic = fromB64u(subscription.keys.p256dh);
  const authSecret = fromB64u(subscription.keys.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Suscripción con claves no válidas');

  const ecdh = createECDH('prime256v1');
  if (serverKeys) ecdh.setPrivateKey(serverKeys.privateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 = último (y único) registro, sin relleno.
  const data = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, data]);
}

/** Valida una suscripción que llega del navegador. */
export function isValidSubscription(sub) {
  try {
    const u = new URL(sub?.endpoint);
    return u.protocol === 'https:' && fromB64u(sub.keys?.p256dh).length === 65 && fromB64u(sub.keys?.auth).length === 16;
  } catch {
    return false;
  }
}

/**
 * Envía un aviso. Devuelve { ok, status, gone }: gone = la suscripción ya no existe (404/410) y hay que borrarla.
 * urgency: 'very-low' | 'low' | 'normal' | 'high'
 */
export async function sendPush(subscription, message, { vapid, subject, ttl = 24 * 3600, urgency = 'normal', fetchImpl = fetch } = {}) {
  if (!subject) throw new Error('Falta el correo de contacto para las notificaciones');
  const endpoint = new URL(subscription.endpoint);
  const jwt = vapidJwt({ audience: endpoint.origin, subject, privateJwk: vapid.privateJwk });
  const body = encryptPayload(subscription, JSON.stringify(message));
  const res = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 300);
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, error: text };
}
