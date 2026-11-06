import { describe, expect, it } from 'vitest';
import { isHost, isIpOrCidr, isLanRequest, isPrivateIp, normalizeIp, parseList } from './net.mjs';

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
  it('cliente directo en la LAN', () => expect(isLanRequest({ clientIp: '192.168.1.20', peerIp: '192.168.1.20', forwarded: '' })).toBe(true));
  it('cliente directo desde Internet', () => expect(isLanRequest({ clientIp: '203.0.113.7', peerIp: '203.0.113.7', forwarded: '' })).toBe(false));
  it('reenviada por un proxy NO configurado: nunca cuenta como LAN aunque el proxy sea local', () =>
    expect(isLanRequest({ clientIp: '192.168.1.10', peerIp: '192.168.1.10', forwarded: '203.0.113.7' })).toBe(false));
  it('proxy de confianza con cliente externo', () =>
    expect(isLanRequest({ clientIp: '203.0.113.7', peerIp: '192.168.1.10', forwarded: '203.0.113.7' })).toBe(false));
  it('proxy de confianza con cliente de la LAN', () =>
    expect(isLanRequest({ clientIp: '192.168.1.20', peerIp: '192.168.1.10', forwarded: '192.168.1.20' })).toBe(true));
});
