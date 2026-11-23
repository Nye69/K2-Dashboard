// Pieza señalada en la lista de piezas (ratón encima, foco con teclado o toque en el móvil).
// La lista la resalta en su mapa de la cama y el visor 3D en el modelo.
import { useSyncExternalStore } from 'react';

let current: string | null = null;
const listeners = new Set<() => void>();

export function setFocusedObject(name: string | null) {
  if (name === current) return;
  current = name;
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export const useFocusedObject = () => useSyncExternalStore(subscribe, () => current, () => null);

export interface BedObject {
  name: string;
  center?: number[];
  polygon?: number[][];
}

/** Contorno de una pieza; si Klipper no lo trae, un cuadrado de 10 mm alrededor del centro. */
export function objectOutline(o: BedObject): number[][] | null {
  const poly = (o.polygon ?? []).filter((p) => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite));
  if (poly.length >= 3) return poly;
  const c = o.center;
  if (c && c.length >= 2 && c.every(Number.isFinite)) {
    const [x, y] = c;
    return [
      [x - 5, y - 5],
      [x + 5, y - 5],
      [x + 5, y + 5],
      [x - 5, y + 5],
    ];
  }
  return null;
}
