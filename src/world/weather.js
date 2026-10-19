import * as THREE from 'three';
import { glowTex } from '../util/shapes.js';
import { damp, rand, clamp, wrapAngle } from '../util/math.js';
import { ISLANDS, islandAt } from './world.js';

// Each island kind tints the air a little as Lucky flies over it.
const BIOME = {
  meadow: { fog: 0xcdeeff, top: 0x4fb8ff, mid: 0x9fdcff },
  jungle: { fog: 0xc6f0d8, top: 0x45b4f0, mid: 0xa6e8d0 },
  beach: { fog: 0xd6f4ff, top: 0x3fb8ff, mid: 0xa8e6ff },
  volcano: { fog: 0xffe2c8, top: 0x5aa8f0, mid: 0xffd6b0 },
  snow: { fog: 0xe8f2ff, top: 0x7cc0f0, mid: 0xdcecff },
};
const DUSK = { fog: 0xf4b8a8, top: 0x4a4aa8, mid: 0xff9e7a, bottom: 0xffd0a0 };
const RAIN = { fog: 0xb8c8d8, top: 0x7f97b0, mid: 0xb8c8d6, bottom: 0xd0dae4 };

const c1 = new THREE.Color();
const c2 = new THREE.Color();
const c1Vec = new THREE.Vector3();

function points(count, color, size, opacity = 0.9) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mat = new THREE.PointsMaterial({ color, size, map: glowTex, transparent: true, opacity, depthWrite: false, sizeAttenuation: true });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

/**
 * Island moods and gentle surprises: snowfall, volcano embers, a soft rain shower
 * that ends with a rainbow, and a cosy dusk where the bugs glow brighter.
 */
export class Weather {
  constructor(scene, world, { hemi, sun }) {
    this.scene = scene;
    this.world = world;
    this.hemi = hemi;
    this.sun = sun;
    this.sky = world.sky.material.uniforms;
    this.dusk = 0; // 0..1
    this.duskTarget = 0;
    this.rain = 0;
    this.rainTarget = 0;
    this.rainTimer = 0;
    this.rainbow = 0;
    this.rainbowTimer = 0;
    this.biome = { ...BIOME.meadow };
    this.fogCol = new THREE.Color(BIOME.meadow.fog);
    this.topCol = new THREE.Color(BIOME.meadow.top);
    this.midCol = new THREE.Color(BIOME.meadow.mid);

    // snow drifting over the snowy island
    const snowIsl = ISLANDS.find((i) => i.kind === 'snow');
    this.snowCenter = new THREE.Vector3(snowIsl.x, 0, snowIsl.z);
    this.snowR = snowIsl.r * 1.1;
    this.snow = points(500, 0xffffff, 0.55);
    this.snowData = [];
    const sp = this.snow.geometry.attributes.position.array;
    for (let i = 0; i < 500; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * this.snowR;
      sp[i * 3] = this.snowCenter.x + Math.cos(a) * r;
      sp[i * 3 + 1] = rand(0, 30);
      sp[i * 3 + 2] = this.snowCenter.z + Math.sin(a) * r;
      this.snowData.push({ speed: rand(1.2, 2.4), ph: rand(0, 10) });
    }
    scene.add(this.snow);

    // warm embers floating up out of the volcano
    this.embers = points(60, 0xffa040, 0.7);
    this.emberData = [];
    for (let i = 0; i < 60; i++) this.emberData.push({ t: Math.random(), a: rand(0, Math.PI * 2), r: rand(0.5, 2.5), s: rand(0.6, 1.2) });
    this.embers.material.blending = THREE.AdditiveBlending;
    scene.add(this.embers);

    // rain falls in a box that follows the camera, only while it's raining
    this.rainPts = points(700, 0xdff0ff, 0.35, 0);
    const rp = this.rainPts.geometry.attributes.position.array;
    for (let i = 0; i < 700; i++) {
      rp[i * 3] = rand(-30, 30);
      rp[i * 3 + 1] = rand(-5, 25);
      rp[i * 3 + 2] = rand(-30, 30);
    }
    this.rainPts.visible = false;
    scene.add(this.rainPts);

    this.buildRainbow();
  }

  buildRainbow() {
    const g = (this.rainbowGroup = new THREE.Group());
    const cols = [0xff5a5a, 0xffa53d, 0xffe14d, 0x6fdc6f, 0x5ab8ff, 0x9b6bff];
    this.rainbowMats = cols.map((c, i) => {
      const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide });
      g.add(new THREE.Mesh(new THREE.TorusGeometry(120 - i * 3.2, 1.7, 6, 64, Math.PI), m));
      return m;
    });
    g.position.set(0, -6, 0);
    g.visible = false;
    this.scene.add(g);
  }

  setDusk(on) {
    this.duskTarget = on ? 1 : 0;
  }

  /** A short, soft shower; a rainbow comes out when it stops. */
  startRain(dur = 22) {
    this.rainTarget = 1;
    this.rainTimer = dur;
    this.rainSoundT = 0;
  }

  get raining() {
    return this.rainTarget > 0;
  }

  update(dt, t, playerPos, camera, sound) {
    // which island are we over? ease the air colours toward its mood
    const isl = islandAt(playerPos.x, playerPos.z, 1.4);
    const b = BIOME[isl?.kind ?? 'meadow'];
    const k = 1 - Math.exp(-0.8 * dt);
    this.fogCol.lerp(c1.setHex(b.fog), k);
    this.topCol.lerp(c1.setHex(b.top), k);
    this.midCol.lerp(c1.setHex(b.mid), k);

    this.dusk = damp(this.dusk, this.duskTarget, 0.6, dt);

    // rain timing
    if (this.rainTarget > 0) {
      this.rainTimer -= dt;
      this.rainSoundT -= dt;
      if (this.rainSoundT <= 0 && sound) {
        sound.rain(4.5);
        this.rainSoundT = 4;
      }
      if (this.rainTimer <= 0) {
        this.rainTarget = 0;
        this.rainbowTimer = 16;
      }
    }
    this.rain = damp(this.rain, this.rainTarget, 0.7, dt);
    this.rainbowTimer -= dt;
    this.rainbow = damp(this.rainbow, this.rainbowTimer > 0 ? 1 : 0, 0.8, dt);

    // mix: island mood -> dusk -> rain
    const fog = c2.copy(this.fogCol).lerp(c1.setHex(DUSK.fog), this.dusk).lerp(c1.setHex(RAIN.fog), this.rain * 0.8);
    this.scene.fog.color.copy(fog);
    this.scene.fog.near = 130 - this.rain * 50;
    this.scene.fog.far = 420 - this.rain * 140;
    this.sky.top.value.copy(this.topCol).lerp(c1.setHex(DUSK.top), this.dusk).lerp(c1.setHex(RAIN.top), this.rain * 0.8);
    this.sky.mid.value.copy(this.midCol).lerp(c1.setHex(DUSK.mid), this.dusk).lerp(c1.setHex(RAIN.mid), this.rain * 0.8);
    this.sky.bottom.value.setHex(0xd9f3ff).lerp(c1.setHex(DUSK.bottom), this.dusk).lerp(c1.setHex(RAIN.bottom), this.rain * 0.8);
    this.hemi.intensity = 1.5 - this.dusk * 0.55 - this.rain * 0.3;
    this.sun.intensity = 2.2 - this.dusk * 1.2 - this.rain * 0.9;
    this.sun.color.setHex(0xfff4dc).lerp(c1.setHex(0xffb070), this.dusk);

    this.updateSnow(dt, t);
    this.updateEmbers(dt);
    this.updateRain(dt, camera);

    // rainbow: like a real one, it always hangs far off ahead of you
    this.rainbowGroup.visible = this.rainbow > 0.01;
    if (this.rainbowGroup.visible) {
      this.rainbowMats.forEach((m) => (m.opacity = this.rainbow * 0.5));
      camera.getWorldDirection(c1Vec);
      const yaw = Math.atan2(c1Vec.x, c1Vec.z);
      this.rainbowYaw = this.rainbowYaw === undefined ? yaw : this.rainbowYaw + wrapAngle(yaw - this.rainbowYaw) * (1 - Math.exp(-1.5 * dt));
      const g = this.rainbowGroup;
      g.position.set(camera.position.x + Math.sin(this.rainbowYaw) * 260, -12, camera.position.z + Math.cos(this.rainbowYaw) * 260);
      g.rotation.y = this.rainbowYaw;
    }
  }

  updateSnow(dt, t) {
    const p = this.snow.geometry.attributes.position.array;
    const cx = this.snowCenter.x, cz = this.snowCenter.z;
    for (let i = 0; i < this.snowData.length; i++) {
      const d = this.snowData[i];
      const j = i * 3;
      p[j + 1] -= d.speed * dt;
      p[j] += Math.sin(t * 0.8 + d.ph) * 0.4 * dt;
      p[j + 2] += Math.cos(t * 0.6 + d.ph) * 0.4 * dt;
      const ground = this.world.floorAt(p[j], p[j + 2]);
      if (p[j + 1] < ground) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * this.snowR;
        p[j] = cx + Math.cos(a) * r;
        p[j + 2] = cz + Math.sin(a) * r;
        p[j + 1] = ground + rand(22, 30);
      }
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
  }

  updateEmbers(dt) {
    const o = this.world.smokeOrigin;
    const p = this.embers.geometry.attributes.position.array;
    this.emberData.forEach((e, i) => {
      e.t = (e.t + dt * 0.18 * e.s) % 1;
      const r = e.r + e.t * 3;
      p[i * 3] = o.x + Math.cos(e.a + e.t * 3) * r;
      p[i * 3 + 1] = o.y - 0.5 + e.t * 14;
      p[i * 3 + 2] = o.z + Math.sin(e.a + e.t * 3) * r;
    });
    this.embers.geometry.attributes.position.needsUpdate = true;
  }

  updateRain(dt, camera) {
    this.rainPts.visible = this.rain > 0.02;
    if (!this.rainPts.visible) return;
    this.rainPts.material.opacity = clamp(this.rain, 0, 1) * 0.7;
    this.rainPts.position.set(camera.position.x, camera.position.y, camera.position.z);
    const p = this.rainPts.geometry.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      p[i + 1] -= 22 * dt;
      if (p[i + 1] < -8) p[i + 1] += 33;
    }
    this.rainPts.geometry.attributes.position.needsUpdate = true;
  }
}
