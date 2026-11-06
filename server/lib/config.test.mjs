import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyPassword } from './auth.mjs';
import { loadConfig, nginxIncludes, normalizePanelUrl, publicView, saveConfig, settingsFromEnv, validateCredentials, validateSettings } from './config.mjs';

describe('primer arranque', () => {
  it('crea admin/changeme, obliga a cambiarlos y toma los ajustes del entorno', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'k2cfg-'));
    const cfg = await loadConfig(dir, { PRINTER_HOST: '10.0.0.5', TRUSTED_PROXIES: '10.0.0.1, 10.0.0.2' });
    expect(cfg.auth.user).toBe('admin');
    expect(cfg.auth.mustChange).toBe(true);
    expect(await verifyPassword('changeme', cfg.auth.hash)).toBe(true);
    expect(cfg.auth.secret.length).toBeGreaterThanOrEqual(32);
    expect(cfg.settings).toEqual({ printerName: '', printerHost: '10.0.0.5', panelUrl: '', trustedProxies: ['10.0.0.1', '10.0.0.2'], pushContact: '' });
    expect(Buffer.from(cfg.push.vapid.publicKey, 'base64url')).toHaveLength(65);
    expect(cfg.push.subscriptions).toEqual([]);
    const files = (await readdir(dir)).sort();
    expect(files).toEqual(['devices.json', 'secrets.json', 'settings.json', 'storage', 'users.json']);
    for (const f of ['users.json', 'secrets.json', 'settings.json', 'devices.json']) expect((await stat(join(dir, f))).mode & 0o777).toBe(0o600);
    expect(await readdir(join(dir, 'storage'))).toEqual(['LEEME.txt']);
    const users = JSON.parse(await readFile(join(dir, 'users.json'), 'utf8'));
    expect(users.users).toEqual([{ username: 'admin', hash: expect.stringMatching(/^scrypt\$/), role: 'admin', mustChange: true }]);
    expect(await readFile(join(dir, 'settings.json'), 'utf8')).not.toContain('scrypt');
  });

  it('después manda el archivo, no el entorno', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'k2cfg-'));
    const cfg = await loadConfig(dir, { PRINTER_HOST: '10.0.0.5' });
    cfg.settings.printerHost = '10.0.0.9';
    await saveConfig(dir, cfg);
    expect((await loadConfig(dir, { PRINTER_HOST: '10.0.0.5' })).settings.printerHost).toBe('10.0.0.9');
    expect(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')).printerHost).toBe('10.0.0.9');
  });
});

describe('normalizePanelUrl', () => {
  it('añade https:// si falta y quita la barra final', () => {
    expect(normalizePanelUrl('k2.ejemplo.com')).toBe('https://k2.ejemplo.com');
    expect(normalizePanelUrl('http://192.168.1.5:8095/')).toBe('http://192.168.1.5:8095');
    expect(normalizePanelUrl('')).toBe('');
  });
});

describe('settingsFromEnv', () => {
  it('valores por defecto', () => expect(settingsFromEnv({})).toEqual({ printerName: '', printerHost: '', panelUrl: '', trustedProxies: [], pushContact: '' }));
  it('nombre desde el entorno', () => expect(settingsFromEnv({ PRINTER_NAME: '  Mi   K2 SE ' }).printerName).toBe('Mi K2 SE'));
  it('correo de contacto', () => expect(settingsFromEnv({ PUSH_CONTACT_EMAIL: ' yo@ejemplo.com ' }).pushContact).toBe('yo@ejemplo.com'));
});

describe('validateSettings', () => {
  it('limpia y acepta valores buenos', () => {
    expect(validateSettings({ printerHost: ' 192.168.1.50 ', panelUrl: 'https://k2.ejemplo.com/', trustedProxies: '192.168.1.10 10.0.0.0/8', pushContact: 'mailto:yo@ejemplo.com' })).toEqual({
      settings: { printerName: '', printerHost: '192.168.1.50', panelUrl: 'https://k2.ejemplo.com', trustedProxies: ['192.168.1.10', '10.0.0.0/8'], pushContact: 'yo@ejemplo.com' },
    });
  });
  it('marca cada campo malo', () => {
    const { errors } = validateSettings({ printerName: 'x'.repeat(41), printerHost: 'http://x:7125', panelUrl: 'ftp://x', trustedProxies: 'proxy.local', pushContact: 'no-es-correo' });
    expect(Object.keys(errors).sort()).toEqual(['panelUrl', 'printerHost', 'printerName', 'pushContact', 'trustedProxies']);
  });
  it('nombre de la impresora: limpia espacios, acepta tildes y emojis, rechaza < >', () => {
    expect(validateSettings({ printerName: '  Impresora   de Billy 🖨️ ' }).settings.printerName).toBe('Impresora de Billy 🖨️');
    expect(validateSettings({ printerName: 'Señora Ñandú' }).settings.printerName).toBe('Señora Ñandú');
    expect(validateSettings({ printerName: '<script>' }).errors.printerName).toBeTruthy();
  });
  it('no deja inyectar directivas de nginx', () => {
    expect(validateSettings({ printerHost: '1.2.3.4"; include /etc/passwd; #' }).errors?.printerHost).toBeTruthy();
    expect(validateSettings({ trustedProxies: '1.2.3.4; allow all' }).errors?.trustedProxies).toBeTruthy();
  });
});

describe('validateCredentials', () => {
  it('acepta un usuario y contraseña razonables', () => expect(validateCredentials('usuario', 'una-clave-larga', 'una-clave-larga')).toEqual({ user: 'usuario', password: 'una-clave-larga' }));
  it('rechaza cortas, la de fábrica y si no coinciden', () => {
    expect(validateCredentials('ab', 'corta', 'otra').errors).toMatchObject({ user: expect.any(String), password: expect.any(String), confirm: expect.any(String) });
    expect(validateCredentials('admin', 'changeme').errors.password).toBeTruthy();
    expect(validateCredentials('usuario123', 'usuario123').errors.password).toBeTruthy();
  });
});

describe('nginxIncludes', () => {
  it('impresora y proxies', () => {
    const inc = nginxIncludes({ printerHost: '192.168.1.50', trustedProxies: ['192.168.1.10'] });
    expect(inc['printer.conf']).toContain('set $k2_host "192.168.1.50";');
    expect(inc['realip.conf']).toContain('set_real_ip_from 192.168.1.10;');
    expect(inc['realip.conf']).toContain('real_ip_header X-Forwarded-For;');
  });
  it('sin configurar sigue siendo válido', () => {
    const inc = nginxIncludes({ printerHost: '', trustedProxies: [] });
    expect(inc['printer.conf']).toContain('"127.0.0.1"');
    expect(inc['realip.conf']).not.toContain('set_real_ip_from');
  });
});

describe('publicView', () => {
  it('nunca expone el hash ni el secreto', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'k2cfg-'));
    const view = JSON.stringify(publicView(await loadConfig(dir, {})));
    expect(view).not.toContain('scrypt');
    expect(view).not.toContain('secret');
    expect(view).not.toContain('privateJwk');
  });

  it('migra el config.json antiguo a los archivos nuevos (y quita ntfy)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'k2cfg-'));
    const old = {
      version: 1,
      auth: { user: 'pepe', hash: 'scrypt$aaa$bbb', mustChange: false, secret: 'x'.repeat(43) },
      settings: { printerHost: '10.0.0.5', panelUrl: 'k2.ejemplo.com', trustedProxies: [], ntfyUrl: 'https://ntfy.sh', ntfyTopic: 'secreto' },
    };
    await writeFile(join(dir, 'config.json'), JSON.stringify(old));
    const cfg = await loadConfig(dir, {});
    expect(cfg.auth).toEqual(old.auth);
    expect(cfg.settings).toEqual({ printerName: '', printerHost: '10.0.0.5', panelUrl: 'https://k2.ejemplo.com', trustedProxies: [], pushContact: '' });
    expect(cfg.push.vapid.publicKey).toBeTruthy();
    const files = await readdir(dir);
    expect(files).toContain('config.json.migrado');
    expect(files).not.toContain('config.json');
    // y al volver a cargar sale lo mismo
    expect((await loadConfig(dir, {})).auth.user).toBe('pepe');
  });

});
