export type Lang = 'es' | 'en';
export const LANGS: Lang[];
export const DEFAULT_LANG: Lang;
export const LANG_COOKIE: string;
export const MESSAGES: Record<Lang, Record<string, string>>;
export function normalizeLang(v: unknown): Lang;
export function langOf(req: { headers?: { cookie?: string } }): Lang;
export function langCookie(lang: string): string;
export function t(lang: string, key: string, vars?: Record<string, string | number>): string;
