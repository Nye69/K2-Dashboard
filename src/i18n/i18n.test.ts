import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../../server/lib/i18n.mjs';
import { en } from './en';
import { es } from './es';
import { translate } from './index';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('traducciones del panel', () => {
  it('inglés tiene todas las claves, sin textos vacíos ni claves de sobra', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    for (const [k, v] of Object.entries(en)) expect(v.trim(), k).not.toBe('');
  });
  it('las variables {x} son las mismas en los dos idiomas', () => {
    for (const k of Object.keys(es) as (keyof typeof es)[]) expect(vars(en[k]), k).toEqual(vars(es[k]));
  });
  it('sustituye variables', () => {
    expect(translate('en', 'history.all', { n: 12 })).toBe('Show all 12');
    expect(translate('es', 'history.all', { n: 12 })).toBe('Ver las 12');
  });
});

describe('traducciones del servidor', () => {
  it('inglés tiene las mismas claves y variables que español', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.es).sort());
    for (const k of Object.keys(MESSAGES.es)) expect(vars(MESSAGES.en[k]), k).toEqual(vars(MESSAGES.es[k]));
  });
});
