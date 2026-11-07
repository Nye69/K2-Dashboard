import { describe, expect, it } from 'vitest';
import { calibrateThenPrintScript } from './calibration';

describe('calibrateThenPrintScript', () => {
  it('calibra y después lanza el archivo (con espacios y carpetas)', () => {
    expect(calibrateThenPrintScript('llaveros/02 cuerpo.gcode')).toBe('G29\nSDCARD_PRINT_FILE FILENAME="llaveros/02 cuerpo.gcode"');
  });
  it('no deja colar comillas ni saltos de línea (otras órdenes)', () => {
    expect(calibrateThenPrintScript('a"\nM112.gcode')).toBe('G29\nSDCARD_PRINT_FILE FILENAME="aM112.gcode"');
  });
});
