// Idioma del panel. Lo elige cada dispositivo en Ajustes; se guarda en el navegador y en la cookie "k2-lang"
// (el servidor la usa para el login, los mensajes de error y las notificaciones). Por defecto, español.
import { useCallback, useSyncExternalStore } from 'react';
import { en } from './en';
import { es, type Key } from './es';

export type Lang = 'es' | 'en';
export type { Key };
export type Vars = Record<string, string | number>;
export type T = (key: Key, vars?: Vars) => string;

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
];

const DICTS: Record<Lang, Record<Key, string>> = { es, en };
const STORE_KEY = 'k2-lang';

const isLang = (v: unknown): v is Lang => v === 'es' || v === 'en';

function readSaved(): Lang {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (isLang(v)) return v;
  } catch {
    /* sin almacenamiento */
  }
  if (typeof document !== 'undefined') {
    const m = /(?:^|;\s*)k2-lang=([a-z]{2})/.exec(document.cookie);
    if (isLang(m?.[1])) return m[1];
  }
  return 'es';
}

let current: Lang = typeof window === 'undefined' ? 'es' : readSaved();
const listeners = new Set<() => void>();

export const getLang = () => current;

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORE_KEY, lang);
  } catch {
    /* sin almacenamiento: queda la cookie */
  }
  document.cookie = `${STORE_KEY}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.documentElement.lang = lang;
  listeners.forEach((f) => f());
}

/** Texto en un idioma; {var} se sustituye por vars.var. Si falta en inglés, sale en español. */
export function translate(lang: Lang, key: Key, vars?: Vars): string {
  const s = DICTS[lang][key] ?? es[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : s;
}

export const tFor = (lang: Lang): T => (key, vars) => translate(lang, key, vars);
/** Para código fuera de React (mensajes de error de la API). */
export const tNow: T = (key, vars) => translate(current, key, vars);

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export const useLang = () => useSyncExternalStore(subscribe, getLang, () => 'es' as Lang);

export function useT(): T {
  const lang = useLang();
  return useCallback<T>((key, vars) => translate(lang, key, vars), [lang]);
}

/** Locale para fechas y horas. */
export const dateLocale = (lang: Lang) => (lang === 'en' ? 'en-US' : 'es');

if (typeof document !== 'undefined') document.documentElement.lang = current;
