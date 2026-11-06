// Utilidades de red sin E/S: direcciones privadas, CIDR y si una petición viene de la red local.
import { isIP } from 'node:net';

/** Quita el prefijo IPv4-mapeado ("::ffff:192.168.1.5" → "192.168.1.5"). */
export function normalizeIp(ip) {
  const s = String(ip ?? '').trim();
  return s.toLowerCase().startsWith('::ffff:') && isIP(s.slice(7)) === 4 ? s.slice(7) : s;
}

const v4ToInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;

function inV4Cidr(ip, base, bits) {
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}

const PRIVATE_V4 = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['100.64.0.0', 10], // CGNAT / Tailscale
];

/** ¿Dirección de red local (privada, loopback o enlace local)? */
export function isPrivateIp(raw) {
  const ip = normalizeIp(raw);
  const v = isIP(ip);
  if (v === 4) return PRIVATE_V4.some(([b, n]) => inV4Cidr(ip, b, n));
  if (v === 6) {
    const s = ip.toLowerCase();
    return s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s);
  }
  return false;
}

/** IP o CIDR válidos ("192.168.1.10", "10.0.0.0/8", "fd00::/8"). */
export function isIpOrCidr(value) {
  const [ip, bits, extra] = String(value).trim().split('/');
  if (extra !== undefined) return false;
  const v = isIP(ip);
  if (!v) return false;
  if (bits === undefined) return true;
  if (!/^\d{1,3}$/.test(bits)) return false;
  return Number(bits) <= (v === 4 ? 32 : 128);
}

/** "a, b c" → ['a','b','c'] (acepta comas, espacios y saltos de línea). */
export function parseList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value ?? '')
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** IP o nombre de host, sin esquema ni puerto (va dentro de la configuración de nginx). */
export function isHost(value) {
  const s = String(value).trim();
  if (isIP(s)) return true;
  return s.length <= 253 && /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(s);
}

/**
 * ¿La petición viene de la red local?
 * nginx pasa: clientIp ($remote_addr, ya corregido por real_ip si el proxy es de confianza),
 * peerIp ($realip_remote_addr, quien abrió la conexión) y forwarded (cabeceras X-Forwarded-For / X-Real-IP).
 * Si llegó reenviada por un proxy que NO es de confianza, no se sabe de dónde viene: se trata como externa.
 * Así, detrás de Nginx Proxy Manager sin configurar, nadie desde Internet pasa por "red local".
 */
export function isLanRequest({ clientIp, peerIp, forwarded }) {
  const client = normalizeIp(clientIp);
  const peer = normalizeIp(peerIp || clientIp);
  if (forwarded && client === peer) return false;
  return isPrivateIp(client);
}
