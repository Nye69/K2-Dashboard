import { describe, expect, it } from 'vitest';
import { renameTarget, splitName } from './rename';

describe('splitName', () => {
  it('separa carpeta, nombre y extensión', () => {
    expect(splitName('CK2SE_Poop basket.gcode')).toEqual({ dir: '', base: 'CK2SE_Poop basket', ext: '.gcode' });
    expect(splitName('llaveros/a.b.GCO')).toEqual({ dir: 'llaveros/', base: 'a.b', ext: '.GCO' });
  });
});

describe('renameTarget', () => {
  const existing = ['pieza.gcode', 'otra.gcode', 'sub/pieza.gcode'];

  it('añade la extensión que tenía si no se escribe', () => {
    expect(renameTarget('CK2SE_marco.gcode', 'Marco hosyond')).toEqual({ path: 'Marco hosyond.gcode' });
  });
  it('respeta la extensión si se escribe', () => {
    expect(renameTarget('a.gcode', 'b.gcode')).toEqual({ path: 'b.gcode' });
  });
  it('se queda en la misma carpeta', () => {
    expect(renameTarget('sub/pieza.gcode', 'nueva', existing)).toEqual({ path: 'sub/nueva.gcode' });
  });
  it('limpia espacios', () => {
    expect(renameTarget('a.gcode', '  tapa   presión  ')).toEqual({ path: 'tapa presión.gcode' });
  });
  it('rechaza vacío, barras, punto inicial y caracteres raros', () => {
    for (const bad of ['', '   ', 'a/b', 'a\\b', '.oculto', 'a?b', 'a:b'])
      expect(renameTarget('a.gcode', bad), bad).toHaveProperty('error');
  });
  it('rechaza el mismo nombre y los repetidos (sin importar mayúsculas)', () => {
    expect(renameTarget('pieza.gcode', 'pieza')).toEqual({ error: 'Es el mismo nombre.' });
    expect(renameTarget('pieza.gcode', 'OTRA', existing)).toEqual({ error: 'Ya hay un archivo con ese nombre.' });
    // cambiar solo mayúsculas del propio archivo sí se puede
    expect(renameTarget('pieza.gcode', 'Pieza', existing)).toEqual({ path: 'Pieza.gcode' });
  });
  it('rechaza nombres larguísimos', () => {
    expect(renameTarget('a.gcode', 'x'.repeat(200))).toHaveProperty('error');
  });
});
