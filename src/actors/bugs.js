import * as THREE from 'three';
import { mesh, group, basic, glowTex } from '../util/shapes.js';
import { rand, pick } from '../util/math.js';
import { DINO_SPOTS, PLAY_RADIUS } from '../world/world.js';

const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
const wingGeo = new THREE.CircleGeometry(1, 12);
const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff36b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

/**
 * Big, slow, glowing bugs that drift around. Catching them is a bonus, never required.
 */
export class Bugs {
  constructor(scene, world, count = 16) {
    this.world = world;
    this.list = [];
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const body = group(g);
      mesh('sphere', basic(0xd4ff4a), { s: [0.24, 0.24, 0.32], p: [0, 0, -0.08], parent: body });
      mesh('sphere', 0x3a2f4a, { s: 0.16, p: [0, 0.04, 0.24], parent: body });
      for (const sx of [-1, 1]) mesh('sphere', basic(0xffffff), { s: 0.05, p: [sx * 0.08, 0.1, 0.36], parent: body });
      const wings = [];
      for (const sx of [-1, 1]) {
        const w = group(body, [sx * 0.08, 0.16, 0]);
        const wm = new THREE.Mesh(wingGeo, wingMat);
        wm.scale.set(0.32, 0.18, 1);
        wm.position.x = sx * 0.3;
        wm.rotation.x = -Math.PI / 2;
        w.add(wm);
        wings.push({ w, sx });
      }
      const glow = new THREE.Sprite(glowMat.clone());
      glow.scale.setScalar(2.2);
      g.add(glow);
      g.scale.setScalar(1.35);
      scene.add(g);
      const b = { g, body, wings, glow, home: new THREE.Vector3(), phase: rand(0, 10), speed: rand(0.7, 1.1), state: 'alive', timer: 0, prev: new THREE.Vector3() };
      this.placeHome(b);
      this.list.push(b);
    }
  }

  placeHome(b) {
    let x, z, y;
    if (Math.random() < 0.65) {
      const [sx, sz] = pick(DINO_SPOTS);
      const a = rand(0, Math.PI * 2), d = rand(4, 9);
      x = sx + Math.cos(a) * d;
      z = sz + Math.sin(a) * d;
    } else {
      const a = rand(0, Math.PI * 2), d = rand(10, PLAY_RADIUS * 0.7);
      x = Math.cos(a) * d;
      z = Math.sin(a) * d;
    }
    y = this.world.floorAt(x, z) + rand(3.5, 8);
    b.home.set(x, y, z);
  }

  update(dt, t) {
    for (const b of this.list) {
      if (b.state === 'gone') {
        b.timer -= dt;
        if (b.timer <= 0) {
          this.placeHome(b);
          b.state = 'alive';
          b.g.visible = true;
          b.g.scale.setScalar(0.01);
          b.grow = 0;
        }
        continue;
      }
      if (b.state === 'caught') continue;
      if (b.grow !== undefined && b.grow < 1) {
        b.grow = Math.min(1, b.grow + dt * 2);
        b.g.scale.setScalar(1.35 * b.grow);
      }
      const s = b.speed, ph = b.phase;
      b.prev.copy(b.g.position);
      b.g.position.set(
        b.home.x + Math.sin(t * 0.35 * s + ph) * 2.6,
        b.home.y + Math.sin(t * 0.8 * s + ph * 2) * 0.9,
        b.home.z + Math.cos(t * 0.45 * s + ph) * 2.6,
      );
      const dx = b.g.position.x - b.prev.x, dz = b.g.position.z - b.prev.z;
      if (dx * dx + dz * dz > 1e-6) b.g.rotation.y = Math.atan2(dx, dz);
      this.flap(b, t);
    }
  }

  flap(b, t) {
    const f = Math.sin(t * 40 + b.phase) * 0.7;
    for (const { w, sx } of b.wings) w.rotation.z = sx * f;
    b.glow.material.opacity = 0.75 + Math.sin(t * 5 + b.phase) * 0.25;
    // at dusk the bugs glow bigger and brighter
    b.glow.scale.setScalar((2.0 + Math.sin(t * 5 + b.phase) * 0.3) * (1 + this.glowBoost * 1.2));
  }

  glowBoost = 0;

  nearest(pos, range) {
    let best = null, bd = range * range;
    for (const b of this.list) {
      if (b.state !== 'alive') continue;
      const d = b.g.position.distanceToSquared(pos);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  /** Mark a bug as caught; the game animates it into Lucky's beak. */
  catch(b) {
    b.state = 'caught';
  }

  finish(b) {
    b.state = 'gone';
    b.g.visible = false;
    b.timer = rand(6, 12);
  }
}
