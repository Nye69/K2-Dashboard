import { describe, expect, it } from 'vitest';
import { extrudeScript } from './extrude';

describe('extrudeScript', () => {
  it('extruye en relativo y deja el modo como estaba', () => {
    expect(extrudeScript(10, 5)).toBe('SAVE_GCODE_STATE NAME=k2panel_extrude\nM83\nG1 E10 F300\nRESTORE_GCODE_STATE NAME=k2panel_extrude');
  });
  it('retraer es una cantidad negativa', () => {
    expect(extrudeScript(-25, 5)).toContain('G1 E-25 F300');
  });
  it('limita la cantidad a 100 mm por pulsación', () => {
    expect(extrudeScript(500, 5)).toContain('G1 E100 ');
    expect(extrudeScript(-500, 5)).toContain('G1 E-100 ');
  });
});
