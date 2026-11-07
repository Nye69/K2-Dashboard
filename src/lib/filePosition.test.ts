import { describe, expect, it } from 'vitest';
import { layerAtFilePosition, lineByteOffsets } from './filePosition';

describe('lineByteOffsets', () => {
  it('cuenta bytes UTF-8, no caracteres', () => {
    // "ñ" ocupa 2 bytes: la línea 2 empieza en el byte 4, no en el 3
    expect([...lineByteOffsets('añ\nb\nc')]).toEqual([0, 4, 6]);
  });
  it('archivo de una línea', () => expect([...lineByteOffsets('G1 X1')]).toEqual([0]));
});

describe('layerAtFilePosition', () => {
  const text = ['; inicio', 'G28', ';LAYER 0', 'G1 X1', ';LAYER 1', 'G1 X2', ';LAYER 2', 'G1 X3'].join('\n');
  const off = lineByteOffsets(text);
  const starts = [2, 4, 6]; // líneas donde empieza cada capa

  it('antes de la primera capa: 0', () => expect(layerAtFilePosition(starts, off, 0)).toBe(0));
  it('en mitad de la capa 1: 1', () => expect(layerAtFilePosition(starts, off, off[5])).toBe(1));
  it('justo al empezar la capa 2: 2', () => expect(layerAtFilePosition(starts, off, off[6])).toBe(2));
  it('pasado el final: la última', () => expect(layerAtFilePosition(starts, off, 1e9)).toBe(2));
  it('miles de capas: búsqueda rápida y correcta', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `;L${i}\nG1 X${i}`).join('\n');
    const o = lineByteOffsets(big);
    const st = Array.from({ length: 5000 }, (_, i) => i * 2);
    expect(layerAtFilePosition(st, o, o[2 * 4713 + 1])).toBe(4713);
  });
});
