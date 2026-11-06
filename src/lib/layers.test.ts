import { describe, expect, it } from 'vitest';
import { printedLayerIndex } from './layers';

describe('printedLayerIndex', () => {
  it('usa la capa que informa la K2', () => {
    expect(printedLayerIndex({ layer: 1, layer_count: 67, progress: 0.02 }, 68)).toBe(1);
    expect(printedLayerIndex({ layer: 67, layer_count: 67, progress: 1 }, 68)).toBe(68);
  });
  it('sin capas de la K2 usa el progreso', () => {
    expect(printedLayerIndex({ progress: 0.5 }, 100)).toBe(50);
  });
  it('nunca se sale del rango', () => {
    expect(printedLayerIndex({ layer: 90, layer_count: 67 }, 68)).toBe(68);
    expect(printedLayerIndex({ progress: -1 }, 68)).toBe(0);
    expect(printedLayerIndex({}, 0)).toBe(0);
  });
});
