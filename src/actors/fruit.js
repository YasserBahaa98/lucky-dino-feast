import * as THREE from 'three';
import { mesh, group, basic } from '../util/shapes.js';

export const FRUITS = ['apple', 'banana', 'grapes', 'orange'];

const ARC = Math.PI * 0.75;
const bananaGeo = new THREE.TorusGeometry(0.42, 0.12, 8, 18, ARC);

/** A small fruit model, about 0.75 units across, centered on its origin. */
export function makeFruit(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'apple':
      mesh('sphere', 0xff4d4d, { s: [0.36, 0.33, 0.36], parent: g });
      mesh('cyl', 0x7a4b2a, { s: [0.03, 0.16, 0.03], p: [0, 0.36, 0], parent: g });
      mesh('sphere', 0x5cc95c, { s: [0.13, 0.03, 0.07], p: [0.11, 0.38, 0], r: [0, 0, 0.5], parent: g });
      break;
    case 'orange':
      mesh('sphere', 0xffa024, { s: 0.35, parent: g });
      mesh('sphere', 0x7a4b2a, { s: 0.04, p: [0, 0.34, 0], parent: g });
      mesh('sphere', 0x5cc95c, { s: [0.13, 0.03, 0.07], p: [0.1, 0.36, 0], r: [0, 0, 0.4], parent: g });
      break;
    case 'banana': {
      const b = mesh(bananaGeo, 0xffe14d, { r: [0, 0, -Math.PI / 2 - ARC / 2], p: [0, 0.3, 0], parent: g });
      for (const ang of [-Math.PI / 2 - ARC / 2, -Math.PI / 2 + ARC / 2]) {
        mesh('sphere', 0x7a4b2a, { s: 0.075, p: [Math.cos(ang) * 0.42, 0.3 + Math.sin(ang) * 0.42, 0], parent: g });
      }
      b.scale.z = 1.1;
      break;
    }
    case 'grapes': {
      const pts = [[-0.17, 0.15], [0, 0.17], [0.17, 0.15], [-0.09, -0.02], [0.09, -0.02], [0, -0.19]];
      for (const [x, y] of pts) mesh('sphere', 0x9b5de5, { s: 0.13, p: [x, y, (Math.abs(x) < 0.05 ? 0.05 : 0)], parent: g });
      mesh('cyl', 0x7a4b2a, { s: [0.03, 0.14, 0.03], p: [0, 0.3, 0], parent: g });
      mesh('sphere', 0x5cc95c, { s: [0.12, 0.03, 0.07], p: [0.1, 0.33, 0], r: [0, 0, 0.4], parent: g });
      break;
    }
  }
  return g;
}

/** A heart shape for "I'm full!" */
export function makeHeart() {
  const g = new THREE.Group();
  const pink = 0xff5f8f;
  mesh('sphere', pink, { s: 0.22, p: [-0.15, 0.08, 0], parent: g });
  mesh('sphere', pink, { s: 0.22, p: [0.15, 0.08, 0], parent: g });
  mesh('cone', pink, { s: [0.34, 0.42, 0.2], p: [0, -0.16, 0], r: [Math.PI, 0, 0], parent: g });
  return g;
}

/**
 * Cartoon thought bubble that always faces the camera.
 * Shows the fruit a dinosaur wants, with one dot per fruit still needed.
 */
export class ThoughtBubble {
  constructor() {
    this.group = new THREE.Group();
    this.inner = group(this.group);
    const rim = basic(0xc9d9ea);
    const white = basic(0xffffff);
    mesh('circle', rim, { s: 1.1, p: [0, 0, -0.02], parent: this.inner });
    mesh('circle', white, { s: 1.0, parent: this.inner });
    for (const [x, y, r] of [[-0.55, -1.2, 0.24], [-0.85, -1.65, 0.14]]) {
      mesh('circle', rim, { s: r + 0.05, p: [x, y, -0.02], parent: this.inner });
      mesh('circle', white, { s: r, p: [x, y, 0], parent: this.inner });
    }
    this.icon = group(this.inner, [0, 0.18, 0.35]);
    this.pips = group(this.inner, [0, -0.6, 0.05]);
    this.pipMeshes = [];
    this.scale = 0;
    this.distScale = 1;
    this.group.scale.setScalar(0.0001);
  }

  setFruit(type) {
    this.icon.clear();
    const f = type === 'heart' ? makeHeart() : makeFruit(type);
    f.scale.setScalar(1.25);
    this.icon.add(f);
  }

  setPips(n) {
    this.pips.clear();
    this.pipMeshes = [];
    const gap = 0.3;
    for (let i = 0; i < n; i++) {
      const m = mesh('circle', basic(0xff9f1c), { s: 0.11, p: [(i - (n - 1) / 2) * gap, 0, 0], parent: this.pips });
      this.pipMeshes.push(m);
    }
  }

  /** Light up pips that are done (green). */
  markEaten(eatenCount) {
    this.pipMeshes.forEach((m, i) => {
      m.material = basic(i < eatenCount ? 0x5cc95c : 0xff9f1c);
    });
  }

  update(t, camera, worldPos) {
    this.group.position.copy(worldPos);
    this.group.quaternion.copy(camera.quaternion);
    const d = camera.position.distanceTo(worldPos);
    this.distScale = Math.min(Math.max(d / 16, 1), 2.6);
    // shrink away when the camera is right next to it, so it never fills the screen
    const near = Math.min(Math.max((d - 4) / 5, 0), 1);
    const s = Math.max(this.scale * this.distScale * near, 0.0001);
    this.group.scale.setScalar(s);
    this.group.position.y += 1.9 * this.distScale;
    this.inner.position.y = Math.sin(t * 2.2) * 0.08;
    this.icon.rotation.y = Math.sin(t * 1.7) * 0.5;
    this.icon.rotation.z = Math.sin(t * 2.3) * 0.1;
  }
}
