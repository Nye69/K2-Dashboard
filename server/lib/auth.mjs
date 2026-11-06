import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const scryptAsync = (pw, salt) =>
  new Promise((resolve, reject) => scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? reject(e) : resolve(k))));

/** "scrypt$<sal base64>$<hash base64>" */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !hash || !password) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');

export function signSession(user, secret, now, ttlMs) {
  const body = Buffer.from(JSON.stringify({ u: user, exp: now + ttlMs })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(token, secret, now) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const good = Buffer.from(sign(body, secret));
  const got = Buffer.from(sig);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof u === 'string' && typeof exp === 'number' && exp > now ? { user: u } : null;
  } catch {
    return null;
  }
}

export function readCookie(header, name) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** Cuenta fallos por IP en una ventana de tiempo. */
export function makeLimiter(max, windowMs) {
  const fails = new Map();
  const recent = (ip, now) => (fails.get(ip) ?? []).filter((t) => now - t < windowMs);
  return {
    fail(ip, now) {
      fails.set(ip, [...recent(ip, now), now]);
    },
    reset(ip) {
      fails.delete(ip);
    },
    blocked(ip, now) {
      return recent(ip, now).length >= max;
    },
  };
}
