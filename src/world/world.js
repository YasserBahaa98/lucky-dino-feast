import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lerp, smoothstep, rand } from '../util/math.js';

export const PLAY_RADIUS = 105; // Lucky can't go past this
export const SOFT_RADIUS = 80; // starts gently turning back here
export const MAX_ALT = 30;

// Hand-placed islands so the world always looks the same.
const ISLANDS = [
  { x: 0, z: 0, r: 24, h: 3.5, kind: 'meadow' },
  { x: -52, z: 30, r: 28, h: 4.5, kind: 'jungle' },
  { x: 48, z: 52, r: 34, h: 4, kind: 'volcano', volcano: { h: 24, r: 14 } },
  { x: 56, z: -34, r: 22, h: 3, kind: 'beach' },
  { x: -40, z: -52, r: 24, h: 4, kind: 'jungle' },
  { x: 6, z: -78, r: 12, h: 2.5, kind: 'meadow' },
  { x: -86, z: -8, r: 13, h: 3, kind: 'meadow' },
  { x: 86, z: 12, r: 11, h: 2.5, kind: 'beach' },
  { x: -6, z: 82, r: 14, h: 3, kind: 'jungle' },
];

// Places where dinosaurs can stand.
export const DINO_SPOTS = [
  [0, 7], [-9, -6], [9, -5],
  [-47, 38], [-60, 22], [-44, 22],
  [30, 48], [56, 34], [36, 66],
  [52, -29], [62, -40],
  [-35, -46], [-46, -58],
  [6, -78], [-86, -8], [-6, 82], [86, 12],
];

const GROUND_COLORS = {
  meadow: [0x8ad65a, 0x7ccc52],
  jungle: [0x5cbf4a, 0x4fb244],
  beach: [0x9bdc63, 0x8fd35c],
  volcano: [0x86c95a, 0x7abf52],
};

function islandHeight(isl, x, z) {
  const dx = x - isl.x, dz = z - isl.z;
  const dist = Math.hypot(dx, dz);
  const d = dist / isl.r;
  if (d > 1.15) return -Infinity;
  const t = smoothstep(0.45, 1.05, d);
  const bumps = Math.sin(x * 0.16 + isl.r) * Math.cos(z * 0.13) * 0.6;
  let y = lerp(isl.h + bumps, -1.4, t);
  if (isl.volcano) {
    const v = isl.volcano;
    const k = Math.max(0, 1 - dist / v.r);
    let cone = v.h * Math.pow(k, 1.25);
    if (dist < 3.2) cone -= (3.2 - dist) * 1.6; // crater
    y += cone;
  }
  return y;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;

    this.buildSky();
    this.buildWater();
    this.buildIslands();
    this.buildClouds();
    this.buildVolcanoFx();
  }

  /** Ground height at a point (water is at 0). */
  heightAt(x, z) {
    let y = -3;
    for (const isl of ISLANDS) {
      const h = islandHeight(isl, x, z);
      if (h > y) y = h;
    }
    return y;
  }

  /** Height that's safe for flying (never below water level). */
  floorAt(x, z) {
    return Math.max(this.heightAt(x, z), 0);
  }

  isLand(x, z) {
    return this.heightAt(x, z) > 0.6;
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x4fb8ff) },
        mid: { value: new THREE.Color(0x9fdcff) },
        bottom: { value: new THREE.Color(0xd9f3ff) },
      },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vPos;
        void main(){ float h = normalize(vPos).y;
          vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : bottom;
          c = mix(bottom, c, smoothstep(-0.02, 0.12, h));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  buildWater() {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(700, 64).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x3fc1e8 }),
    );
    this.group.add(water);

    // white foam rings around each island
    this.foam = [];
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    for (const isl of ISLANDS) {
      // find the shoreline radius
      let lo = 0, hi = isl.r * 1.2;
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (islandHeight(isl, isl.x + mid, isl.z) > 0) lo = mid;
        else hi = mid;
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(lo - 0.2, lo + 1.3, 48).rotateX(-Math.PI / 2), foamMat);
      ring.position.set(isl.x, 0.04, isl.z);
      ring.renderOrder = 1;
      this.group.add(ring);
      this.foam.push(ring);
    }
  }

  buildIslands() {
    const parts = [];
    const color = new THREE.Color();

    const push = (geo, hex, jitter = 0.05) => {
      let g = geo.index ? geo.toNonIndexed() : geo;
      g.deleteAttribute('uv');
      const n = g.attributes.position.count;
      const cols = new Float32Array(n * 3);
      for (let f = 0; f < n; f += 3) {
        color.setHex(hex).offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
        for (let v = 0; v < 3; v++) color.toArray(cols, (f + v) * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.computeVertexNormals();
      parts.push(g);
    };

    // terrain: a polar grid per island that follows heightAt exactly
    for (const isl of ISLANDS) {
      const rings = isl.volcano ? 34 : 20;
      const segs = isl.volcano ? 64 : 44;
      const R = isl.r * 1.15;
      const pos = [];
      const idx = [];
      pos.push(isl.x, this.heightAt(isl.x, isl.z), isl.z);
      for (let i = 1; i <= rings; i++) {
        const rr = R * Math.pow(i / rings, 0.9);
        for (let j = 0; j < segs; j++) {
          const a = (j / segs) * Math.PI * 2 + (i % 2) * (Math.PI / segs);
          const x = isl.x + Math.cos(a) * rr, z = isl.z + Math.sin(a) * rr;
          pos.push(x, this.heightAt(x, z), z);
        }
      }
      for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
      for (let i = 1; i < rings; i++) {
        const a0 = 1 + (i - 1) * segs, a1 = 1 + i * segs;
        for (let j = 0; j < segs; j++) {
          const j1 = (j + 1) % segs;
          idx.push(a0 + j, a0 + j1, a1 + j);
          idx.push(a0 + j1, a1 + j1, a1 + j);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const flat = g.toNonIndexed();
      // color each triangle by its height
      const p = flat.attributes.position;
      const cols = new Float32Array(p.count * 3);
      const [g1, g2] = GROUND_COLORS[isl.kind];
      for (let f = 0; f < p.count; f += 3) {
        const y = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
        let hex;
        if (y < 0.7) hex = 0xf5dc95;
        else if (isl.volcano && y > isl.h + 15) hex = 0x6f5a4f;
        else if (isl.volcano && y > isl.h + 3) hex = 0x9a7b66;
        else hex = Math.random() < 0.5 ? g1 : g2;
        color.setHex(hex).offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
        for (let v = 0; v < 3; v++) color.toArray(cols, (f + v) * 3);
      }
      flat.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      flat.computeVertexNormals();
      parts.push(flat);
    }

    // decorations, merged into a single mesh so the tablet draws them in one go
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const place = (geo, hex, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
      const g = geo.clone();
      e.set(rx, ry, rz);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
      g.applyMatrix4(m);
      push(g, hex);
    };
    const ball = new THREE.IcosahedronGeometry(1, 1);
    const ballLow = new THREE.IcosahedronGeometry(1, 0);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 7);
    const cone = new THREE.ConeGeometry(1, 1, 7);
    const rock = new THREE.DodecahedronGeometry(1, 0);

    const blocked = (x, z, r) => DINO_SPOTS.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < r);

    const up = new THREE.Vector3(0, 1, 0);
    const placeQ = (geo, hex, x, y, z, sx, sy, sz, quat) => {
      const g = geo.clone();
      m.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(sx, sy, sz));
      g.applyMatrix4(m);
      push(g, hex);
    };
    const palm = (x, z) => {
      const y0 = this.heightAt(x, z) - 0.2;
      const lean = rand(0, Math.PI * 2);
      const bend = rand(0.06, 0.14);
      const lx = Math.cos(lean), lz = Math.sin(lean);
      const segs = 5, segH = 1.05;
      // trunk follows a gentle curve; each segment is aimed along it so they join up
      const pt = (i) => new THREE.Vector3(x + lx * bend * i * i, y0 + i * segH, z + lz * bend * i * i);
      for (let i = 0; i < segs; i++) {
        const p0 = pt(i), p1 = pt(i + 1);
        const dir = p1.clone().sub(p0);
        const len = dir.length();
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
        const mid = p0.add(p1).multiplyScalar(0.5);
        const r = 0.36 - i * 0.035;
        placeQ(cyl, i % 2 ? 0xa0703f : 0x8f6234, mid.x, mid.y, mid.z, r, len + 0.15, r, quat);
      }
      const top = pt(segs);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rand(-0.2, 0.2);
        const droop = rand(0.35, 0.6);
        place(ball, i % 2 ? 0x3fae49 : 0x58c45a, top.x + Math.cos(a) * 1.3, top.y + 0.1, top.z + Math.sin(a) * 1.3, 1.6, 0.12, 0.45, 0, -a, -droop);
      }
      for (let i = 0; i < 3; i++) place(ball, 0x6b4a2b, top.x + rand(-0.3, 0.3), top.y - 0.25, top.z + rand(-0.3, 0.3), 0.22, 0.22, 0.22);
    };
    const roundTree = (x, z) => {
      const y0 = this.heightAt(x, z);
      const h = rand(2.2, 3.4);
      place(cyl, 0x8f6234, x, y0 + h / 2, z, 0.3, h, 0.3);
      const c = Math.random() < 0.5 ? 0x3e9e44 : 0x4cae4a;
      place(ball, c, x, y0 + h + 1.1, z, 1.9, 1.6, 1.9, 0, rand(0, 3), 0);
      place(ball, c, x + 1.1, y0 + h + 0.5, z + 0.4, 1.2, 1.1, 1.2);
      place(ball, c, x - 0.9, y0 + h + 0.6, z - 0.6, 1.3, 1.1, 1.3);
    };
    const bush = (x, z) => {
      const y0 = this.heightAt(x, z);
      const c = Math.random() < 0.5 ? 0x4fb348 : 0x5ec254;
      for (let i = 0; i < 3; i++) {
        const s = rand(0.6, 1.0);
        place(ballLow, c, x + rand(-0.8, 0.8), y0 + s * 0.6, z + rand(-0.8, 0.8), s, s * 0.8, s, 0, rand(0, 3), 0);
      }
      if (Math.random() < 0.6) {
        const fc = [0xff6fa8, 0xffd23f, 0xffffff][Math.floor(Math.random() * 3)];
        for (let i = 0; i < 4; i++) place(ballLow, fc, x + rand(-0.9, 0.9), y0 + rand(0.9, 1.4), z + rand(-0.9, 0.9), 0.16, 0.16, 0.16);
      }
    };
    const mushroom = (x, z) => {
      const y0 = this.heightAt(x, z);
      place(cyl, 0xfff4dc, x, y0 + 0.35, z, 0.16, 0.7, 0.16);
      place(ball, 0xff5a5a, x, y0 + 0.75, z, 0.55, 0.32, 0.55);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.6;
        place(ballLow, 0xffffff, x + Math.cos(a) * 0.3, y0 + 0.92, z + Math.sin(a) * 0.3, 0.08, 0.05, 0.08);
      }
    };
    const stone = (x, z) => {
      const y0 = this.heightAt(x, z);
      const s = rand(0.5, 1.3);
      place(rock, 0xb8b2a6, x, y0 + s * 0.3, z, s, s * 0.7, s, rand(0, 3), rand(0, 3), 0);
    };

    for (const isl of ISLANDS) {
      const area = isl.r * isl.r;
      const count = Math.floor(area / (isl.kind === 'jungle' ? 22 : 40));
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const d = Math.sqrt(Math.random()) * isl.r * 0.82;
        const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
        const y = this.heightAt(x, z);
        if (y < 0.8) continue;
        if (isl.volcano && Math.hypot(x - isl.x, z - isl.z) < isl.volcano.r + 1) continue;
        if (blocked(x, z, 8)) continue;
        const roll = Math.random();
        if (isl.kind === 'jungle') {
          if (roll < 0.45) palm(x, z);
          else if (roll < 0.75) roundTree(x, z);
          else if (roll < 0.95) bush(x, z);
          else mushroom(x, z);
        } else if (isl.kind === 'beach') {
          if (roll < 0.45) palm(x, z);
          else if (roll < 0.7) stone(x, z);
          else bush(x, z);
        } else {
          if (roll < 0.25) palm(x, z);
          else if (roll < 0.45) roundTree(x, z);
          else if (roll < 0.75) bush(x, z);
          else if (roll < 0.88) mushroom(x, z);
          else stone(x, z);
        }
      }
    }

    // far-away mountains on the horizon (outside the play area)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand(-0.15, 0.15);
      const d = rand(230, 300);
      const h = rand(30, 70);
      place(cone, i % 2 ? 0x7fbf8f : 0x8fc9a0, Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d, rand(35, 60), h, rand(35, 60), 0, rand(0, 3), 0);
    }

    const merged = mergeGeometries(parts);
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.group.add(mesh);
  }

  buildClouds() {
    const puffs = [];
    for (let c = 0; c < 18; c++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(20, 190);
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      const cy = rand(42, 62);
      const n = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const s = rand(3, 6);
        puffs.push({ x: cx + (i - n / 2) * 3.4 + rand(-1, 1), y: cy + rand(-1, 1.5), z: cz + rand(-2, 2), s, sy: s * 0.75 });
      }
    }
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xbfd8ee, emissiveIntensity: 0.55 });
    this.clouds = new THREE.InstancedMesh(geo, mat, puffs.length);
    this.cloudPuffs = puffs;
    this.cloudMatrix = new THREE.Matrix4();
    this.updateClouds(0);
    this.group.add(this.clouds);
  }

  updateClouds(t) {
    const m = this.cloudMatrix;
    const drift = t * 1.2;
    this.cloudPuffs.forEach((p, i) => {
      let x = p.x + drift;
      x = ((x + 220) % 440 + 440) % 440 - 220;
      m.makeScale(p.s, p.sy, p.s);
      m.setPosition(x, p.y, p.z);
      this.clouds.setMatrixAt(i, m);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  buildVolcanoFx() {
    const isl = ISLANDS.find((i) => i.volcano);
    const top = this.heightAt(isl.x + 2.5, isl.z);
    this.lavaMat = new THREE.MeshBasicMaterial({ color: 0xff7a2f });
    const lava = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24).rotateX(-Math.PI / 2), this.lavaMat);
    lava.position.set(isl.x, top - 1.0, isl.z);
    this.group.add(lava);

    this.smoke = [];
    const smokeGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xd9d4ce, transparent: true, opacity: 0.8, depthWrite: false });
      const m = new THREE.Mesh(smokeGeo, mat);
      this.group.add(m);
      this.smoke.push({ m, t: i / 7 });
    }
    this.smokeOrigin = new THREE.Vector3(isl.x, top, isl.z);
  }

  update(dt, t) {
    this.updateClouds(t);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    this.lavaMat.color.setRGB(1, 0.42 + pulse * 0.2, 0.15);
    for (const s of this.smoke) {
      s.t = (s.t + dt * 0.12) % 1;
      const k = s.t;
      s.m.position.set(this.smokeOrigin.x + Math.sin(k * 6 + s.t) * 1.5 + k * 6, this.smokeOrigin.y + k * 18, this.smokeOrigin.z + k * 3);
      s.m.scale.setScalar(1.2 + k * 4);
      s.m.material.opacity = 0.75 * Math.sin(k * Math.PI);
    }
    for (let i = 0; i < this.foam.length; i++) {
      const s = 1 + Math.sin(t * 1.4 + i) * 0.025;
      this.foam[i].scale.set(s, 1, s);
    }
  }
}
