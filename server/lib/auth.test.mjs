import { describe, expect, it } from 'vitest';
import { hashPassword, makeLimiter, readCookie, signSession, verifyPassword, verifySession } from './auth.mjs';

const SECRET = 'secreto-de-prueba';

describe('contraseña', () => {
  it('verifica la correcta y rechaza la incorrecta', async () => {
    const h = await hashPassword('Clave Segura 123');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Clave Segura 123', h)).toBe(true);
    expect(await verifyPassword('clave segura 123', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
  });
  it('un hash mal formado nunca valida', async () => {
    expect(await verifyPassword('x', 'basura')).toBe(false);
  });
});

describe('sesión', () => {
  it('firma y verifica', () => {
    const t = signSession('usuario', SECRET, 1000, 60_000);
    expect(verifySession(t, SECRET, 2000)).toEqual({ user: 'usuario' });
  });
  it('caduca', () => {
    const t = signSession('usuario', SECRET, 1000, 60_000);
    expect(verifySession(t, SECRET, 61_001)).toBeNull();
  });
  it('rechaza tokens manipulados o con otro secreto', () => {
    const t = signSession('usuario', SECRET, 1000, 60_000);
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'usuario', exp: 9e15 })).toString('base64url');
    expect(verifySession(`${forged}.${sig}`, SECRET, 2000)).toBeNull();
    expect(verifySession(t, 'otro', 2000)).toBeNull();
    expect(verifySession(`${body}`, SECRET, 2000)).toBeNull();
    expect(verifySession(undefined, SECRET, 2000)).toBeNull();
  });
});

describe('readCookie', () => {
  it('lee la cookie de sesión', () => {
    expect(readCookie('a=1; k2s=abc.def; b=2', 'k2s')).toBe('abc.def');
    expect(readCookie('a=1', 'k2s')).toBeUndefined();
    expect(readCookie(undefined, 'k2s')).toBeUndefined();
  });
});

describe('límite de intentos', () => {
  it('bloquea tras 10 fallos en 15 minutos y se libera después', () => {
    const l = makeLimiter(10, 15 * 60_000);
    for (let i = 0; i < 10; i++) l.fail('1.2.3.4', 0);
    expect(l.blocked('1.2.3.4', 1000)).toBe(true);
    expect(l.blocked('5.6.7.8', 1000)).toBe(false);
    expect(l.blocked('1.2.3.4', 15 * 60_000 + 1)).toBe(false);
  });
  it('un acierto borra los fallos', () => {
    const l = makeLimiter(3, 60_000);
    l.fail('ip', 0);
    l.fail('ip', 0);
    l.reset('ip');
    l.fail('ip', 0);
    expect(l.blocked('ip', 1)).toBe(false);
  });
});
