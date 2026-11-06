// Ajustes del dashboard (los guarda el servidor Node en /data/config.json).

export interface Settings {
  printerName: string;
  printerHost: string;
  panelUrl: string;
  trustedProxies: string[];
  pushContact: string;
}

export interface SettingsView {
  user: string;
  settings: Settings;
}

export type FieldErrors = Partial<Record<string, string>>;

export class ApiError extends Error {
  constructor(
    message: string,
    public fields: FieldErrors = {},
  ) {
    super(message);
  }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/auth/api/${path}`, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    location.assign('/login');
    throw new ApiError('Sesión caducada');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? (data.errors ? 'Revisa los campos marcados.' : `Error ${res.status}`), data.errors ?? {});
  return data as T;
}

export const getSettings = () => call<SettingsView>('settings');
export const saveSettings = (s: Settings) => call<SettingsView>('settings', 'PUT', s);
export const updateAccount = (a: { currentPassword: string; user: string; password: string; confirm: string }) => call<SettingsView>('account', 'POST', a);
