import { describe, expect, it } from 'vitest';
import { isHost, isIpOrCidr, isLanRequest, isPrivateIp, lastForwarded, normalizeIp, originIp, parseList } from './net.mjs';

describe('isPrivateIp', () => {
  it('reconoce rangos privados, loopback y mapeados', () => {
    for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.50', '127.0.0.1', '::1', 'fd12::1', 'fe80::1', '::ffff:192.168.1.5', '100.100.1.1'])
      expect(isPrivateIp(ip), ip).toBe(true);
  });
  it('rechaza públicas y basura', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '203.0.113.7', '2001:db8::1', '', 'hola', undefined]) expect(isPrivateIp(ip), String(ip)).toBe(false);
  });
});

describe('normalizeIp', () => {
  it('quita ::ffff:', () => expect(normalizeIp('::ffff:10.0.0.1')).toBe('10.0.0.1'));
});

describe('isIpOrCidr', () => {
  it('acepta IP y CIDR válidos', () => {
    for (const v of ['192.168.1.10', '10.0.0.0/8', '0.0.0.0/0', 'fd00::/8', '::1']) expect(isIpOrCidr(v), v).toBe(true);
  });
  it('rechaza lo demás', () => {
    for (const v of ['10.0.0.0/33', '10.0.0.0/8/1', 'proxy.local', '1.2.3.4; evil', '']) expect(isIpOrCidr(v), v).toBe(false);
  });
});

describe('isHost', () => {
  it('IP o nombre sin esquema ni puerto', () => {
    expect(isHost('192.168.1.50')).toBe(true);
    expect(isHost('k2.local')).toBe(true);
    expect(isHost('http://k2.local')).toBe(false);
    expect(isHost('k2.local:7125')).toBe(false);
    expect(isHost('a;b')).toBe(false);
    expect(isHost('a b')).toBe(false);
  });
});

describe('parseList', () => {
  it('separa por comas y espacios', () => expect(parseList('a, b\nc  d,')).toEqual(['a', 'b', 'c', 'd']));
  it('acepta arrays', () => expect(parseList([' x ', ''])).toEqual(['x']));
});

describe('isLanRequest', () => {
  const lan = (o) => isLanRequest(o);
  it('cliente directo en la LAN', () => expect(lan({ clientIp: '192.168.1.20', peerIp: '192.168.1.20' })).toBe(true));
  it('cliente directo desde Internet', () => expect(lan({ clientIp: '203.0.113.7', peerIp: '203.0.113.7' })).toBe(false));
  it('por un proxy de la LAN sin configurar, visitante de la LAN: sí', () =>
    expect(lan({ clientIp: '192.168.1.10', peerIp: '192.168.1.10', forwardedFor: '192.168.1.20', realIp: '192.168.1.20' })).toBe(true));
  it('por un proxy de la LAN sin configurar, visitante de Internet: no', () =>
    expect(lan({ clientIp: '192.168.1.10', peerIp: '192.168.1.10', forwardedFor: '203.0.113.7', realIp: '203.0.113.7' })).toBe(false));
  it('no se puede falsificar metiendo una IP local delante en X-Forwarded-For', () =>
    expect(lan({ clientIp: '192.168.1.10', peerIp: '192.168.1.10', forwardedFor: '192.168.1.20, 203.0.113.7', realIp: '203.0.113.7' })).toBe(false));
  it('proxy con IP pública sin configurar: nunca LAN', () =>
    expect(lan({ clientIp: '198.51.100.4', peerIp: '198.51.100.4', forwardedFor: '192.168.1.20' })).toBe(false));
  it('proxy de confianza con cliente externo', () => expect(lan({ clientIp: '203.0.113.7', peerIp: '192.168.1.10', forwardedFor: '203.0.113.7' })).toBe(false));
  it('proxy de confianza con cliente de la LAN', () => expect(lan({ clientIp: '192.168.1.20', peerIp: '192.168.1.10', forwardedFor: '192.168.1.20' })).toBe(true));
});

describe('originIp', () => {
  it('IP real para el límite de intentos', () => {
    expect(originIp({ clientIp: '192.168.1.10', peerIp: '192.168.1.10', forwardedFor: '1.1.1.1, 203.0.113.7' })).toBe('203.0.113.7');
    expect(originIp({ clientIp: '192.168.1.20', peerIp: '192.168.1.20' })).toBe('192.168.1.20');
    expect(originIp({ clientIp: '198.51.100.4', peerIp: '198.51.100.4', forwardedFor: '203.0.113.7' })).toBe('198.51.100.4');
  });
  it('lastForwarded', () => {
    expect(lastForwarded('a, b ,c')).toBe('c');
    expect(lastForwarded('')).toBe('');
  });
});
