import { describe, expect, it } from 'vitest';
import { objectOutline } from './objectFocus';

describe('objectOutline', () => {
  it('usa el polígono de Klipper', () => {
    const polygon = [[10, 10], [20, 10], [20, 20], [10, 20]];
    expect(objectOutline({ name: 'a', polygon })).toEqual(polygon);
  });
  it('sin polígono, un cuadrado de 10 mm alrededor del centro', () => {
    expect(objectOutline({ name: 'a', center: [100, 50] })).toEqual([[95, 45], [105, 45], [105, 55], [95, 55]]);
  });
  it('sin datos, nada', () => {
    expect(objectOutline({ name: 'a' })).toBeNull();
    expect(objectOutline({ name: 'a', polygon: [[1, 2]] })).toBeNull();
  });
});
