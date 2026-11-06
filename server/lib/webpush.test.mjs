import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptPayload, generateVapidKeys, isEmail, isValidSubscription, sendPush, vapidJwt, vapidSubject } from './webpush.mjs';

const b64u = (b) => Buffer.from(b).toString('base64url');

/** Un "navegador" de prueba: genera sus claves y sabe descifrar como lo haría él (RFC 8291). */
function fakeBrowser() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const subscription = { endpoint: 'https://push.example.com/abc', keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } };
  const decrypt = (body) => {
    const salt = body.subarray(0, 16);
    const idlen = body[20];
    const asPublic = body.subarray(21, 21 + idlen);
    const data = body.subarray(21 + idlen);
    const secret = ecdh.computeSecret(asPublic);
    const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]);
    const ikm = Buffer.from(hkdfSync('sha256', secret, auth, info, 32));
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(data.subarray(data.length - 16));
    const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
    expect(plain[plain.length - 1]).toBe(2); // delimitador de último registro
    return { text: plain.subarray(0, -1).toString(), rs: body.readUInt32BE(16), idlen };
  };
  return { subscription, decrypt };
}

describe('encryptPayload', () => {
  it('el navegador puede descifrar el mensaje (aes128gcm)', () => {
    const b = fakeBrowser();
    const out = b.decrypt(encryptPayload(b.subscription, '{"title":"Impresión terminada ✅"}'));
    expect(out).toEqual({ text: '{"title":"Impresión terminada ✅"}', rs: 4096, idlen: 65 });
  });
  it('cada envío usa claves y sal nuevas', () => {
    const b = fakeBrowser();
    expect(encryptPayload(b.subscription, 'x').equals(encryptPayload(b.subscription, 'x'))).toBe(false);
  });
  it('rechaza claves mal formadas', () => {
    expect(() => encryptPayload({ keys: { p256dh: 'abc', auth: 'abc' } }, 'x')).toThrow();
  });
});

describe('VAPID', () => {
  it('genera claves y firma un JWT ES256 verificable con la clave pública', () => {
    const v = generateVapidKeys();
    expect(Buffer.from(v.publicKey, 'base64url')).toHaveLength(65);
    const jwt = vapidJwt({ audience: 'https://web.push.apple.com', subject: 'mailto:a@b.com', privateJwk: v.privateJwk, now: 1_000_000 });
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({ aud: 'https://web.push.apple.com', exp: 1000 + 12 * 3600, sub: 'mailto:a@b.com' });
    const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: v.privateJwk.x, y: v.privateJwk.y }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${h}.${p}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
  });
  it('vapidSubject añade mailto: y respeta https', () => {
    expect(vapidSubject('yo@ejemplo.com')).toBe('mailto:yo@ejemplo.com');
    expect(vapidSubject('mailto:yo@ejemplo.com')).toBe('mailto:yo@ejemplo.com');
    expect(vapidSubject('https://ejemplo.com')).toBe('https://ejemplo.com');
    expect(vapidSubject('')).toBe('');
  });
  it('isEmail', () => {
    expect(isEmail('yo@ejemplo.com')).toBe(true);
    expect(isEmail('yo@ejemplo')).toBe(false);
    expect(isEmail('no es correo')).toBe(false);
  });
});

describe('isValidSubscription', () => {
  it('exige https y claves del tamaño correcto', () => {
    const { subscription } = fakeBrowser();
    expect(isValidSubscription(subscription)).toBe(true);
    expect(isValidSubscription({ ...subscription, endpoint: 'http://push.example.com/x' })).toBe(false);
    expect(isValidSubscription({ ...subscription, keys: { p256dh: 'x', auth: 'y' } })).toBe(false);
    expect(isValidSubscription(null)).toBe(false);
  });
});

describe('sendPush', () => {
  it('manda las cabeceras correctas y marca las suscripciones caducadas', async () => {
    const v = generateVapidKeys();
    const b = fakeBrowser();
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url, init };
      return new Response('', { status: 410 });
    };
    const r = await sendPush(b.subscription, { title: 'Hola' }, { vapid: v, subject: 'mailto:a@b.com', urgency: 'high', fetchImpl });
    expect(r).toMatchObject({ ok: false, status: 410, gone: true });
    expect(seen.url).toBe('https://push.example.com/abc');
    expect(seen.init.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', Urgency: 'high', TTL: '86400' });
    expect(seen.init.headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${v.publicKey}$`));
    expect(JSON.parse(b.decrypt(seen.init.body).text)).toEqual({ title: 'Hola' });
  });
  it('sin correo de contacto no envía', async () => {
    const b = fakeBrowser();
    await expect(sendPush(b.subscription, {}, { vapid: generateVapidKeys(), subject: '' })).rejects.toThrow(/correo/);
  });
});
