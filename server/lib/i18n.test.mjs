import { describe, expect, it } from 'vitest';
import { loginPage, setupPage } from '../pages.mjs';
import { validateCredentials, validateSettings } from './config.mjs';
import { langCookie, langOf, t } from './i18n.mjs';

describe('idioma del servidor', () => {
  it('lee la cookie k2-lang y, sin ella o con un valor raro, usa español', () => {
    expect(langOf({ headers: { cookie: 'k2s=abc; k2-lang=en' } })).toBe('en');
    expect(langOf({ headers: { cookie: 'k2-lang=fr' } })).toBe('es');
    expect(langOf({ headers: {} })).toBe('es');
  });
  it('la cookie dura un año y vale para todo el sitio', () => {
    expect(langCookie('en')).toBe('k2-lang=en; Path=/; Max-Age=31536000; SameSite=Lax');
    expect(langCookie('xx')).toMatch(/^k2-lang=es;/);
  });
  it('sustituye variables', () => {
    expect(t('en', 'push.testTitle', { name: 'K2' })).toBe('K2 notifications enabled');
    expect(t('es', 'push.testTitle', { name: 'K2' })).toBe('Avisos de K2 activados');
  });
});

describe('errores de validación en el idioma pedido', () => {
  it('ajustes', () => {
    expect(validateSettings({ printerHost: 'http://x:1' }, 'en').errors.printerHost).toMatch(/^Enter only the IP/);
    expect(validateSettings({ printerHost: 'http://x:1' }).errors.printerHost).toMatch(/^Pon solo la IP/);
  });
  it('usuario y contraseña', () => {
    expect(validateCredentials('ab', 'corta', 'otra', 'en').errors).toEqual({
      user: '3 to 32 characters: letters, numbers, dot, hyphen, underscore or @.',
      password: 'At least 10 characters.',
      confirm: 'The passwords do not match.',
    });
  });
});

describe('páginas de login y configuración inicial', () => {
  it('en inglés, con lang="en" y enlace para volver a español', () => {
    const html = loginPage({ lang: 'en', firstRun: true });
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Sign in');
    expect(html).toContain('href="/login?lang=es"');
  });
  it('el enlace de idioma de la configuración inicial apunta a /setup (también en la página de error)', () => {
    expect(setupPage({ lang: 'es' })).toContain('href="/setup?lang=en"');
  });
});
