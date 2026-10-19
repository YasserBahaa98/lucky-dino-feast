import * as THREE from 'three';

const geo = new THREE.IcosahedronGeometry(1, 1);

/** Pooled puffs for sneezes, pop-ins, sparkles and crumbs. */
export class Particles {
  constructor(scene, size = 80) {
    this.pool = [];
    for (let i = 0; i < size; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, vel: new THREE.Vector3(), life: 0, max: 1, size: 1, grav: 0 });
    }
    this.next = 0;
  }

  /**
   * opts: count, color, speed, size, life, gravity, dir (bias direction)
   */
  puff(pos, { count = 8, color = 0xffffff, speed = 3, size = 0.5, life = 0.8, gravity = 0, dir = null } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      p.m.visible = true;
      p.m.position.copy(pos);
      p.m.material.color.setHex(Array.isArray(color) ? color[i % color.length] : color);
      p.vel.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.6));
      if (dir) p.vel.addScaledVector(dir, speed);
      p.life = p.max = life * (0.7 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.7);
      p.grav = gravity;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.m.visible = false;
        continue;
      }
      const k = 1 - p.life / p.max;
      p.vel.multiplyScalar(Math.exp(-2.5 * dt));
      p.vel.y -= p.grav * dt;
      p.m.position.addScaledVector(p.vel, dt);
      p.m.scale.setScalar(p.size * (0.6 + k * 0.8) * (k < 0.15 ? k / 0.15 : 1));
      p.m.material.opacity = 1 - k * k;
    }
  }
}
