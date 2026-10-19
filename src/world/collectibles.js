import * as THREE from 'three';
import { mesh, group, basic, glowTex } from '../util/shapes.js';
import { MAX_ALT } from './world.js';

// Hidden eggs: one tucked away on each kind of island, plus one way up in the clouds.
// [x, z, height above ground]
const EGG_SPOTS = [
  [-46, -61, 1.4], // top of the snowy hill
  [48, 66, 1.0], // behind the volcano
  [-64, 44, 1.0], // deep in the jungle
  [89, 16, 1.0], // little beach island
  [11, -82, 1.0], // far meadow
  [0, 0, null], // high above the middle island
];

const RING_COUNT = 8;
const ringGeo = new THREE.TorusGeometry(2.4, 0.28, 8, 28);
const eggSpots = ['#ffb3d1', '#8fd3ff', '#9be38a', '#ffd23f'];

/**
 * Things to find while flying around: hidden eggs (kept forever) and a loop of
 * rings to swoop through. Both are collected just by flying into them.
 */
export class Collectibles {
  constructor(scene, world, foundEggs) {
    this.world = world;
    this.eggs = EGG_SPOTS.map(([x, z, h], i) => {
      const g = new THREE.Group();
      const y = h === null ? MAX_ALT - 3 : world.heightAt(x, z) + h;
      g.position.set(x, y, z);
      const inner = group(g);
      mesh('sphere', 0xfff7d6, { s: [0.55, 0.72, 0.55], parent: inner });
      for (let k = 0; k < 6; k++) {
        const a = k * 1.9, yy = Math.sin(k * 2.3) * 0.35;
        const c = new THREE.Color(eggSpots[k % eggSpots.length]).getHex();
        mesh('sphere', c, { s: [0.13, 0.13, 0.06], p: [Math.cos(a) * 0.5, yy, Math.sin(a) * 0.5], r: [0, -a + Math.PI / 2, 0], parent: inner });
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(3.2);
      g.add(glow);
      const found = foundEggs.includes(i);
      g.visible = !found;
      scene.add(g);
      return { g, inner, i, found, base: y };
    });

    // a loop of rings out over the water, rising and dipping
    this.rings = [];
    const pts = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const a = (i / RING_COUNT) * Math.PI * 2 + 0.4;
      const r = 40;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pts.push(new THREE.Vector3(x, Math.max(world.floorAt(x, z), 0) + 9 + Math.sin(i * 1.3) * 3, z));
    }
    pts.forEach((p, i) => {
      const g = new THREE.Group();
      g.position.copy(p);
      const color = i % 2 ? 0xff7eb6 : 0xffd23f;
      const m = new THREE.Mesh(ringGeo, basic(color));
      g.add(m);
      g.lookAt(pts[(i + 1) % RING_COUNT]);
      scene.add(g);
      this.rings.push({ g, alive: true, timer: 0, pop: 0 });
    });
    this.chain = 0;
    this.chainTimer = 0;
  }

  get eggCount() {
    return this.eggs.filter((e) => e.found).length;
  }

  /** Returns { egg, ring } events for this frame. */
  update(dt, t, pos) {
    const out = { egg: null, ring: null };
    for (const e of this.eggs) {
      if (e.found) continue;
      e.g.position.y = e.base + Math.sin(t * 2 + e.i) * 0.25;
      e.inner.rotation.y = t * 1.2 + e.i;
      e.inner.rotation.z = Math.sin(t * 3 + e.i) * 0.15;
      if (e.g.position.distanceTo(pos) < 2.8) {
        e.found = true;
        out.egg = e;
      }
    }
    this.chainTimer -= dt;
    if (this.chainTimer <= 0) this.chain = 0;
    for (const r of this.rings) {
      if (r.alive) {
        const s = 1 + Math.sin(t * 3 + r.g.position.x) * 0.05;
        r.g.scale.setScalar(s);
        if (r.g.position.distanceTo(pos) < 2.9) {
          r.alive = false;
          r.pop = 1;
          r.timer = 25;
          this.chain++;
          this.chainTimer = 6;
          out.ring = { ring: r, chain: this.chain };
        }
      } else {
        if (r.pop > 0) {
          r.pop = Math.max(0, r.pop - dt * 3);
          r.g.scale.setScalar(1 + (1 - r.pop) * 0.8);
          r.g.visible = r.pop > 0;
        }
        r.timer -= dt;
        if (r.timer <= 0) {
          r.alive = true;
          r.g.visible = true;
          r.g.scale.setScalar(0.01);
        }
      }
    }
    return out;
  }

  hideEgg(e) {
    e.g.visible = false;
  }
}
