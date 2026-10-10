// A tiny procedural photo studio for the PBR plates (hbm, key): a dark room with a few emissive
// softboxes, pre-filtered into an environment map for metal reflections. Palette only: bone key
// boxes, one amber strip, ink everywhere else.
import * as THREE from 'three';

export interface StudioOpts {
  /** [x,y,z, w,h, intensity, 0 bone | 1 amber] for every softbox, looking at the origin */
  boxes?: [number, number, number, number, number, number, number][];
}

const DEFAULT_BOXES: NonNullable<StudioOpts['boxes']> = [
  [-4.5, 0.5, 9, 0.55, 14, 22, 0], //  narrow bone strip: sweeps across the front faces as the camera orbits
  [-4.5, 0.5, 9, 7, 14, 0.5, 0], //    its soft skirt
  [-8.5, 0.5, 5.5, 0.4, 14, 14, 0], // second thin bone strip further left
  [4.6, 0.5, -9, 0.6, 14, 16, 1], //   thin amber strip: lights the right faces
  [4.6, 0.5, -9, 7, 14, 0.5, 1],
  [0, 11, 1, 12, 6, 3.5, 0], //        overhead softbox (top faces)
  [-10, 3, -4, 2, 9, 2, 1], //         back amber strip
  [11, 1, 7, 0.8, 10, 6, 0], //        right bone strip (far glints)
];

export function makeStudioEnv(renderer: THREE.WebGLRenderer, o: StudioOpts = {}): THREE.Texture {
  const sc = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(60, 60, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.004, 0.004, 0.005, THREE.LinearSRGBColorSpace), side: THREE.BackSide }));
  sc.add(room);
  for (const [x, y, z, w, h, I, amber] of o.boxes ?? DEFAULT_BOXES) {
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    if (amber) m.color.setRGB(1.0 * I, 0.42 * I, 0.02 * I, THREE.LinearSRGBColorSpace);
    else m.color.setRGB(0.85 * I, 0.8 * I, 0.7 * I, THREE.LinearSRGBColorSpace);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(x, y, z);
    p.lookAt(0, 0, 0);
    sc.add(p);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.03);
  pm.dispose();
  return rt.texture;
}

/** A linear colour from palette-style linear triplets. */
export const lin = (c: [number, number, number], k = 1) => new THREE.Color().setRGB(c[0] * k, c[1] * k, c[2] * k, THREE.LinearSRGBColorSpace);
