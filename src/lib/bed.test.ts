import { describe, expect, it } from 'vitest';
import { bedFromGcode, K2_SE_BED } from './bed';

describe('bedFromGcode', () => {
  it('lee el área imprimible y la altura que escribe Creality Print', () => {
    const g = 'G1 X10\n; CONFIG_BLOCK_START\n; printable_area = 0x0,220x0,220x215,0x215\n; printable_height = 245\n';
    expect(bedFromGcode(g)).toEqual({ x: 220, y: 215, z: 245, minX: 0, minY: 0 });
  });
  it('respeta un origen que no está en 0,0', () => {
    expect(bedFromGcode('; printable_area = -5x-5,295x-5,295x295,-5x295')).toEqual({ x: 300, y: 300, z: 245, minX: -5, minY: -5 });
  });
  it('sin datos del slicer (Cura) usa la cama de la K2 SE', () => {
    expect(bedFromGcode(';FLAVOR:Marlin\nG1 X1 Y1\n')).toEqual(K2_SE_BED);
  });
  it('ignora valores rotos', () => {
    expect(bedFromGcode('; printable_area = basura\n; printable_height = 0')).toEqual(K2_SE_BED);
  });
  it('encuentra los datos al final de un archivo grande', () => {
    const big = 'G1 X1 Y1 E1\n'.repeat(60_000) + '; printable_area = 0x0,300x0,300x300,0x300\n';
    expect(bedFromGcode(big).x).toBe(300);
  });
});
