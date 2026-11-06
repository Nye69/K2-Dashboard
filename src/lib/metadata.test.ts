import { describe, expect, it } from 'vitest';
import { infoFromMetadata, thumbUrl } from './metadata';

describe('thumbUrl', () => {
  it('ruta relativa a la carpeta del archivo y con espacios codificados', () => {
    expect(thumbUrl('CK2SE_Poop basket.gcode', '.thumbs/CK2SE_Poop basket-300x300.png')).toBe(
      '/server/files/gcodes/.thumbs/CK2SE_Poop%20basket-300x300.png',
    );
    expect(thumbUrl('carpeta/a.gcode', '.thumbs/a-32x32.png')).toBe('/server/files/gcodes/carpeta/.thumbs/a-32x32.png');
  });
});

describe('infoFromMetadata', () => {
  it('Cura: tiempo, capas, filamento y la miniatura más grande', () => {
    const info = infoFromMetadata('pieza.gcode', {
      estimated_time: 5890,
      layer_count: 304,
      filament_total: 19674.6,
      thumbnails: [
        { width: 32, height: 32, relative_path: '.thumbs/pieza-32x32.png' },
        { width: 300, height: 300, relative_path: '.thumbs/pieza-300x300.png' },
      ],
    });
    expect(info).toEqual({
      estimatedSeconds: 5890,
      layers: 304,
      filamentMeters: expect.closeTo(19.6746, 6),
      thumbnail: '/server/files/gcodes/.thumbs/pieza-300x300.png',
    });
  });
  it('gramos y material cuando los hay', () => {
    expect(infoFromMetadata('a.gcode', { filament_weight_total: 18.7, filament_type: 'PLA' })).toEqual({ filamentGrams: 18.7, filamentType: 'PLA' });
  });
  it('metadatos vacíos o raros', () => {
    expect(infoFromMetadata('a.gcode', { slicer: 'Unknown', estimated_time: null, thumbnails: null })).toEqual({});
    expect(infoFromMetadata('a.gcode', null)).toEqual({});
  });
  it('necesita leer el propio archivo solo si falta la miniatura o el tiempo', async () => {
    const { needsFileScan } = await import('./metadata');
    expect(needsFileScan({ thumbnail: 'x', estimatedSeconds: 1 })).toBe(false);
    expect(needsFileScan({ thumbnail: 'x' })).toBe(true);
    expect(needsFileScan({ estimatedSeconds: 1 })).toBe(true);
  });
});
