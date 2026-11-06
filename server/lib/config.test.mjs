import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyPassword } from './auth.mjs';
import { loadConfig, nginxIncludes, publicView, saveConfig, settingsFromEnv, validateCredentials, validateSettings } from './config.mjs';

describe('primer arranque', () => {
  it('crea admin/changeme, obliga a cambiarlos y toma los ajustes del entorno', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'k2cfg-'));
    const cfg = await loadConfig(dir, { PRINTER_HOST: '10.0.0.5', TRUSTED_PROXIES: '10.0.0.1, 10.0.0.2' });
    expect(cfg.auth.user).toBe('admin');
    expect(cfg.auth.mustChange).toBe(true);
    expect(await verifyPassword('changeme', cfg.auth.hash)).toBe(true);
    expect(cfg.auth.secret.length).toBeGreaterThanOrEqual(32);
    expect(cfg.settings).toMatchObject({ printerHost: '10.0.0.5', trustedProxies: ['10.0.0.1', '10.0.0.2'], ntfyUrl: 'https://ntfy.sh' });
    expect((await stat(join(dir, 'config.json'))).mode & 0o777).toBe(0o600);
  });

  it('después manda el archivo, no el entorno', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'k2cfg-'));
    const cfg = await loadConfig(dir, { PRINTER_HOST: '10.0.0.5' });
    cfg.settings.printerHost = '10.0.0.9';
    await saveConfig(dir, cfg);
    expect((await loadConfig(dir, { PRINTER_HOST: '10.0.0.5' })).settings.printerHost).toBe('10.0.0.9');
    expect(JSON.parse(await readFile(join(dir, 'config.json'), 'utf8')).settings.printerHost).toBe('10.0.0.9');
  });
});

describe('settingsFromEnv', () => {
  it('valores por defecto', () => expect(settingsFromEnv({})).toEqual({ printerHost: '', panelUrl: '', trustedProxies: [], ntfyUrl: 'https://ntfy.sh', ntfyTopic: '' }));
});

describe('validateSettings', () => {
  it('limpia y acepta valores buenos', () => {
    expect(validateSettings({ printerHost: ' 192.168.1.50 ', panelUrl: 'https://k2.ejemplo.com/', trustedProxies: '192.168.1.10 10.0.0.0/8', ntfyUrl: '', ntfyTopic: 'k2-abc_1' })).toEqual({
      settings: { printerHost: '192.168.1.50', panelUrl: 'https://k2.ejemplo.com', trustedProxies: ['192.168.1.10', '10.0.0.0/8'], ntfyUrl: 'https://ntfy.sh', ntfyTopic: 'k2-abc_1' },
    });
  });
  it('marca cada campo malo', () => {
    const { errors } = validateSettings({ printerHost: 'http://x:7125', panelUrl: 'ftp://x', trustedProxies: 'proxy.local', ntfyUrl: 'nada', ntfyTopic: 'con espacios' });
    expect(Object.keys(errors).sort()).toEqual(['ntfyTopic', 'ntfyUrl', 'panelUrl', 'printerHost', 'trustedProxies']);
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
  });
});
