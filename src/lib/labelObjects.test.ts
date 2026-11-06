import { describe, expect, it } from 'vitest';
import { labelCuraObjects, objectName } from './labelObjects';

// G-code con la estructura de Cura: arranque, capas con ;MESH: por pieza, ;TIME_ELAPSED y final.
const cura = `;FLAVOR:Marlin
;Generated with Cura_SteamEngine 5.14.0
START_PRINT
;LAYER_COUNT:2
;LAYER:0
;TYPE:SKIRT
G1 X5 Y5 E1
;MESH:Llavero A.stl
G0 X10 Y10
G1 X20 Y10 E2
G1 X20 Y20 E3
;MESH:NONMESH
G0 X50 Y50
;MESH:llavero_b.stl
G1 X60 Y60 E4
G1 X70 Y65 E5
;TIME_ELAPSED:10
;LAYER:1
;MESH:Llavero A.stl
G1 X15 Y15 E6
;MESH:llavero_b.stl
G1 X65 Y62 E7
;TIME_ELAPSED:20
END_PRINT
;End of Gcode
;SETTING_3 algo`;

describe('objectName', () => {
  it('quita la extensión y los caracteres que Klipper no acepta', () => {
    expect(objectName('Llavero A.stl')).toBe('Llavero_A');
    expect(objectName('01-marco hosyond-v6.STL')).toBe('01-marco_hosyond-v6');
    expect(objectName('  "raro"  ')).toBe('raro');
    expect(objectName('***')).toBe('pieza');
  });
});

describe('labelCuraObjects', () => {
  const r = labelCuraObjects(cura)!;
  const lines = r.text.split('\n');

  it('detecta las piezas (sin NONMESH)', () => {
    expect(r.objects).toEqual(['Llavero_A', 'llavero_b']);
  });

  it('define las piezas antes de la primera capa y después del arranque, con su contorno', () => {
    const iStart = lines.indexOf('START_PRINT');
    const iLayer = lines.indexOf(';LAYER:0');
    const defs = lines.filter((l) => l.startsWith('EXCLUDE_OBJECT_DEFINE'));
    expect(defs).toEqual([
      'EXCLUDE_OBJECT_DEFINE NAME=Llavero_A CENTER=17.5,15 POLYGON=[[15,10],[20,10],[20,20],[15,20]]',
      'EXCLUDE_OBJECT_DEFINE NAME=llavero_b CENTER=65,62.5 POLYGON=[[60,60],[70,60],[70,65],[60,65]]',
    ]);
    expect(lines.indexOf(defs[0])).toBeGreaterThan(iStart);
    expect(lines.indexOf(defs[1])).toBeLessThan(iLayer);
  });

  it('abre y cierra cada pieza: en el cambio de pieza, NONMESH, fin de capa y antes del G-code final', () => {
    const marks = lines.filter((l) => l.startsWith('EXCLUDE_OBJECT_START') || l.startsWith('EXCLUDE_OBJECT_END') || l.startsWith(';LAYER:') || l === 'END_PRINT');
    expect(marks).toEqual([
      ';LAYER:0',
      'EXCLUDE_OBJECT_START NAME=Llavero_A',
      'EXCLUDE_OBJECT_END NAME=Llavero_A',
      'EXCLUDE_OBJECT_START NAME=llavero_b',
      'EXCLUDE_OBJECT_END NAME=llavero_b',
      ';LAYER:1',
      'EXCLUDE_OBJECT_START NAME=Llavero_A',
      'EXCLUDE_OBJECT_END NAME=Llavero_A',
      'EXCLUDE_OBJECT_START NAME=llavero_b',
      'EXCLUDE_OBJECT_END NAME=llavero_b',
      'END_PRINT',
    ]);
    // la falda (SKIRT) y los movimientos de NONMESH quedan fuera de las piezas
    const iSkirt = lines.indexOf('G1 X5 Y5 E1');
    expect(lines.slice(0, iSkirt).some((l) => l.startsWith('EXCLUDE_OBJECT_START'))).toBe(false);
  });

  it('no pierde ni cambia ninguna línea original', () => {
    const added = /^(EXCLUDE_OBJECT_|; --- Piezas)/;
    expect(lines.filter((l) => !added.test(l))).toEqual(cura.split('\n'));
  });

  it('no toca archivos con una sola pieza, sin marcas de Cura o ya etiquetados', () => {
    expect(labelCuraObjects(cura.replace(/llavero_b\.stl/g, 'Llavero A.stl'))).toBeNull();
    expect(labelCuraObjects('G1 X1 Y1 E1\n;LAYER:0\n')).toBeNull();
    expect(labelCuraObjects(r.text)).toBeNull();
  });

  it('nombres repetidos tras limpiar quedan únicos', () => {
    const two = cura.replace(/llavero_b\.stl/g, 'Llavero_A.stl');
    expect(labelCuraObjects(two)!.objects).toEqual(['Llavero_A', 'Llavero_A_2']);
  });

  it('respeta los finales de línea de Windows', () => {
    const crlf = labelCuraObjects(cura.replace(/\n/g, '\r\n'))!;
    expect(crlf.objects).toEqual(['Llavero_A', 'llavero_b']);
    expect(crlf.text).toContain('EXCLUDE_OBJECT_START NAME=Llavero_A');
  });
});
