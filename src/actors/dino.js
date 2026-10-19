import * as THREE from 'three';
import { mesh, group, cuteEye, blobShadow, toon } from '../util/shapes.js';
import { ease } from '../util/tween.js';
import { clamp, damp, dampAngle, wrapAngle, rand } from '../util/math.js';
import { ThoughtBubble } from './fruit.js';

export const DINO_TYPES = ['rex', 'longneck', 'trike'];

// Island colour variants (body, belly, spots). The snowy island has fluffy pale dinos.
const PALETTES = {
  snow: {
    rex: [0xf4f8ff, 0xffffff, 0x9cc8ff],
    longneck: [0xe6f0ff, 0xffffff, 0xa9c4ff],
    trike: [0xfff4f8, 0xffffff, 0xb6d6ff],
  },
};

const BLUSH = 0xff9bb3;
const MOUTH = 0x8a2f3a;
const tongueGeo = new THREE.CapsuleGeometry(0.16, 1, 4, 10).translate(0, 0.5, 0).rotateX(Math.PI / 2);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

/**
 * A friendly baby dinosaur. Built from simple shapes, facing +Z.
 * Procedural idle motion (breathing, tail wag, blinking, looking at Lucky)
 * runs every frame; scripted moments tween the values in `this.a`.
 */
export class Dino {
  constructor(type, ctx, { size = 1, variant = null } = {}) {
    this.type = type;
    this.ctx = ctx;
    this.anim = ctx.anim;
    this.size = size; // babies are small, parents a little bigger
    this.pal = PALETTES[variant]?.[type] ?? null;
    this.root = new THREE.Group();
    this.rig = group(this.root);
    this.a = { hop: 0, squash: 1, spin: 0, jaw: 0, eyes: 1, tongue: 0, headLift: 0, headTilt: 0, lean: 0, wag: 0, scale: 1, sleep: 0, scared: 0 };
    this.legs = [];
    this.tail = [];
    this.neck = [];
    this.arms = [];
    this.eyes = [];
    this.seed = Math.random() * 10;

    if (type === 'rex') this.buildRex();
    else if (type === 'longneck') this.buildLongneck();
    else this.buildTrike();

    // Lucky glides over dinosaurs instead of through them
    this.height = { rex: 4.4, longneck: 6.2, trike: 3.5 }[type] * size;
    this.radius = (type === 'longneck' ? 2.6 : 2.2) * size;
    this.shadowSize = (type === 'longneck' ? 4.6 : 3.6) * size;

    this.shadow = blobShadow(this.shadowSize);
    this.shadow.position.y = 0.06;
    this.root.add(this.shadow);

    this.tongue = new THREE.Mesh(tongueGeo, toon(0xff6f91));
    this.tongue.visible = false;
    this.mouth.add(this.tongue);
    this.tongueAim = new THREE.Vector3();

    this.bubble = new ThoughtBubble();

    this.yaw = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.walking = false;
    this.walkPhase = 0;
    this.acting = 0;
    this.blinkT = rand(1, 4);
    this.blink = 0;
    this.chompT = 0;
    this.nextChomp = rand(2, 5);
    this.nextHop = rand(3, 7);

    // feeding state
    this.wants = 'apple';
    this.need = 2;
    this.eaten = 0;
    this.busy = false;
    this.full = false;
    this.wasNear = false;
    this.carried = false; // riding on Lucky (lost babies)
    this.nextZ = rand(0.5, 2);
  }

  /** Top of the head, in world space: what the camera needs to keep in frame. */
  topPos(out) {
    this.root.getWorldPosition(out);
    out.y += this.height * this.a.scale;
    return out;
  }

  centerPos(out) {
    this.root.getWorldPosition(out);
    out.y += this.height * this.a.scale * 0.5;
    return out;
  }


  get hungry() {
    return !this.full;
  }

  // ---------- builders ----------

  buildRex() {
    const [C, B, S] = this.pal ?? [0x74d46c, 0xe6f8b4, 0x4fb04c];
    const r = this.rig;
    mesh('sphere', C, { s: [1.0, 1.12, 1.05], p: [0, 1.65, 0], parent: r });
    mesh('sphere', B, { s: [0.72, 0.88, 0.5], p: [0, 1.5, 0.58], parent: r });
    for (const [x, y, z, s] of [[0.45, 2.3, -0.45, 0.24], [-0.4, 2.0, -0.7, 0.2], [0.1, 2.55, -0.25, 0.18]]) {
      mesh('sphere', S, { s: [s, s * 0.5, s], p: [x, y, z], parent: r });
    }
    for (const sx of [-1, 1]) {
      const leg = group(r, [sx * 0.58, 1.05, 0.05]);
      mesh('sphere', C, { s: [0.42, 0.55, 0.5], p: [0, -0.12, 0], parent: leg });
      mesh('sphere', C, { s: [0.32, 0.2, 0.5], p: [0, -0.88, 0.16], parent: leg });
      this.legs.push({ g: leg, phase: sx > 0 ? 0 : Math.PI });
      const arm = group(r, [sx * 0.62, 1.9, 0.72], [0.9, 0, 0]);
      mesh('sphere', C, { s: [0.12, 0.26, 0.12], p: [0, -0.18, 0], parent: arm });
      this.arms.push({ g: arm, sx });
    }
    this.buildTail(r, [0, 1.25, -0.85], C, [0.62, 0.55, 0.8], 3);

    const head = (this.head = group(r, [0, 2.55, 0.35]));
    mesh('sphere', C, { s: [0.82, 0.74, 0.85], p: [0, 0.38, 0.32], parent: head });
    mesh('sphere', C, { s: [0.64, 0.46, 0.62], p: [0, 0.16, 0.85], parent: head });
    mesh('sphere', MOUTH, { s: [0.46, 0.14, 0.5], p: [0, 0.0, 0.85], parent: head });
    for (const sx of [-1, 1]) {
      mesh('cone', 0xffffff, { s: [0.06, 0.13, 0.06], p: [sx * 0.24, -0.06, 1.22], r: [Math.PI, 0, 0], parent: head });
      mesh('sphere', 0x2f6b2c, { s: 0.045, p: [sx * 0.16, 0.36, 1.4], parent: head });
      mesh('sphere', BLUSH, { s: [0.14, 0.09, 0.05], p: [sx * 0.6, 0.18, 0.78], r: [0, sx * 0.9, 0], parent: head });
      this.eyes.push(cuteEye(head, [sx * 0.42, 0.64, 0.6], 0.25, sx * 0.45));
    }
    this.jaw = group(head, [0, 0.0, 0.45]);
    mesh('sphere', B, { s: [0.56, 0.2, 0.62], p: [0, -0.1, 0.38], parent: this.jaw });
    this.mouth = group(head, [0, 0.05, 1.15]);
    this.headTop = group(head, [0, 1.15, 0.4]);
  }

  buildLongneck() {
    const [C, B, S] = this.pal ?? [0x8fb8ff, 0xdde9ff, 0x6d93e6];
    const r = this.rig;
    mesh('sphere', C, { s: [1.25, 1.0, 1.7], p: [0, 2.0, 0], parent: r });
    mesh('sphere', B, { s: [1.0, 0.7, 1.35], p: [0, 1.7, 0.1], parent: r });
    for (const [x, z, s] of [[0.5, -0.4, 0.3], [-0.45, 0.3, 0.26], [0.1, 0.9, 0.22], [-0.2, -0.9, 0.24]]) {
      mesh('sphere', S, { s: [s, s * 0.45, s], p: [x, 2.9, z], parent: r });
    }
    for (const [sx, sz, ph] of [[1, 1, 0], [-1, 1, Math.PI], [1, -1, Math.PI], [-1, -1, 0]]) {
      const leg = group(r, [sx * 0.72, 1.35, sz * 0.95]);
      mesh('cyl', C, { s: [0.3, 1.2, 0.3], p: [0, -0.55, 0], parent: leg });
      mesh('sphere', C, { s: [0.36, 0.2, 0.4], p: [0, -1.15, 0.05], parent: leg });
      this.legs.push({ g: leg, phase: ph });
    }
    this.buildTail(r, [0, 1.9, -1.5], C, [0.5, 0.45, 0.8], 4);

    // neck: a chain of balls so it can sway like a noodle
    let parent = (this.neckBase = group(r, [0, 2.4, 1.25], [0.55, 0, 0]));
    const sizes = [0.46, 0.4, 0.36, 0.32];
    sizes.forEach((s, i) => {
      mesh('sphere', C, { s: [s, 0.48, s], p: [0, 0.3, 0], parent });
      const next = group(parent, [0, 0.62, 0], [-0.12, 0, 0]);
      this.neck.push(parent);
      parent = next;
      if (i === sizes.length - 1) this.neck.push(next);
    });
    const head = (this.head = group(parent, [0, 0.15, 0], [-0.07, 0, 0]));
    mesh('sphere', C, { s: [0.5, 0.45, 0.62], p: [0, 0.2, 0.2], parent: head });
    mesh('sphere', MOUTH, { s: [0.3, 0.1, 0.32], p: [0, 0.06, 0.48], parent: head });
    for (const sx of [-1, 1]) {
      mesh('sphere', BLUSH, { s: [0.1, 0.07, 0.04], p: [sx * 0.36, 0.1, 0.42], r: [0, sx * 0.9, 0], parent: head });
      mesh('sphere', 0x3c5ea8, { s: 0.035, p: [sx * 0.12, 0.3, 0.78], parent: head });
      this.eyes.push(cuteEye(head, [sx * 0.3, 0.38, 0.38], 0.18, sx * 0.5));
    }
    this.jaw = group(head, [0, 0.06, 0.25]);
    mesh('sphere', B, { s: [0.36, 0.12, 0.42], p: [0, -0.06, 0.24], parent: this.jaw });
    this.mouth = group(head, [0, 0.08, 0.72]);
    this.headTop = group(head, [0, 0.9, 0.2]);
  }

  buildTrike() {
    const [C, B, S] = this.pal ?? [0xffad5c, 0xffe3bd, 0xf28a2e];
    const F = 0xff7096, H = 0xfff3d6;
    const r = this.rig;
    mesh('sphere', C, { s: [1.15, 0.92, 1.4], p: [0, 1.3, -0.1], parent: r });
    mesh('sphere', B, { s: [0.9, 0.6, 1.1], p: [0, 1.05, 0], parent: r });
    for (const [x, z, s] of [[0.45, -0.3, 0.25], [-0.4, 0.2, 0.22], [0.05, -0.85, 0.2]]) {
      mesh('sphere', S, { s: [s, s * 0.45, s], p: [x, 2.1, z], parent: r });
    }
    for (const [sx, sz, ph] of [[1, 1, 0], [-1, 1, Math.PI], [1, -1, Math.PI], [-1, -1, 0]]) {
      const leg = group(r, [sx * 0.66, 0.85, sz * 0.72 - 0.1]);
      mesh('cyl', C, { s: [0.3, 0.7, 0.3], p: [0, -0.3, 0], parent: leg });
      mesh('sphere', C, { s: [0.34, 0.18, 0.4], p: [0, -0.68, 0.05], parent: leg });
      this.legs.push({ g: leg, phase: ph });
    }
    this.buildTail(r, [0, 1.15, -1.35], C, [0.42, 0.38, 0.6], 3);

    const head = (this.head = group(r, [0, 1.5, 1.15]));
    mesh('sphere', C, { s: [0.7, 0.62, 0.72], p: [0, 0.05, 0.35], parent: head });
    mesh('sphere', 0xffc98a, { s: [0.4, 0.34, 0.45], p: [0, -0.1, 0.92], parent: head });
    mesh('sphere', MOUTH, { s: [0.32, 0.1, 0.36], p: [0, -0.2, 0.82], parent: head });
    const frill = group(head, [0, 0.55, -0.05], [-1.0, 0, 0]);
    mesh('cyl', F, { s: [1.05, 0.12, 0.88], parent: frill });
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI * (0.15 + i * 0.175);
      mesh('sphere', 0xffd166, { s: [0.13, 0.08, 0.13], p: [Math.cos(ang) * 0.82, 0.04, -Math.sin(ang) * 0.68], parent: frill });
    }
    for (const sx of [-1, 1]) {
      mesh('cone', H, { s: [0.1, 0.5, 0.1], p: [sx * 0.32, 0.55, 0.62], r: [0.85, 0, -sx * 0.15], parent: head });
      mesh('sphere', BLUSH, { s: [0.12, 0.08, 0.04], p: [sx * 0.52, -0.1, 0.68], r: [0, sx * 0.9, 0], parent: head });
      this.eyes.push(cuteEye(head, [sx * 0.38, 0.28, 0.6], 0.2, sx * 0.5));
    }
    mesh('cone', H, { s: [0.08, 0.28, 0.08], p: [0, 0.2, 1.18], r: [0.45, 0, 0], parent: head });
    this.jaw = group(head, [0, -0.24, 0.45]);
    mesh('sphere', B, { s: [0.42, 0.14, 0.5], p: [0, -0.04, 0.3], parent: this.jaw });
    this.mouth = group(head, [0, -0.18, 1.15]);
    this.headTop = group(head, [0, 1.25, 0.1]);
  }

  buildTail(parent, p, color, s, count) {
    let pivot = group(parent, p, [-0.15, 0, 0]);
    for (let i = 0; i < count; i++) {
      const k = 1 - i / (count + 0.5);
      mesh('sphere', color, { s: [s[0] * k, s[1] * k, s[2] * k], p: [0, 0, -s[2] * k * 0.6], parent: pivot });
      this.tail.push(pivot);
      pivot = group(pivot, [0, 0, -s[2] * k * 1.2], [-0.08, 0, 0]);
    }
  }

  // ---------- per-frame ----------

  place(x, z, yaw) {
    this.root.position.set(x, this.ctx.world.heightAt(x, z), z);
    this.yaw = yaw;
  }

  mouthPos(out) {
    return this.mouth.getWorldPosition(out);
  }

  update(dt, t, luckyPos, camera) {
    const a = this.a;
    const pos = this.root.position;

    // turn toward Lucky when he is close and we're hungry
    tmp.copy(luckyPos).sub(pos);
    const distH = Math.hypot(tmp.x, tmp.z);
    const awake = a.sleep < 0.5 && !this.carried;
    const near = distH < 18 && awake;
    const toLucky = Math.atan2(tmp.x, tmp.z);
    if (near && !this.walking && !this.full && this.acting === 0) {
      this.yaw = dampAngle(this.yaw, toLucky, 1.4, dt);
    }
    this.root.rotation.y = this.yaw + a.spin;

    // head follows Lucky (sleepy heads droop instead)
    let ly = Math.sin(t * 0.6 + this.seed) * 0.35 * (1 - a.sleep);
    let lp = -a.sleep * 0.45;
    if (near) {
      ly = clamp(wrapAngle(toLucky - this.yaw), -0.9, 0.9);
      this.head.getWorldPosition(tmp2);
      lp = clamp(Math.atan2(luckyPos.y - tmp2.y, Math.max(distH, 1)), -0.3, 0.7);
    }
    this.lookYaw = damp(this.lookYaw, ly, 4, dt);
    this.lookPitch = damp(this.lookPitch, lp, 4, dt);

    // hungry: snap jaws now and then (additive, never fights scripted moves)
    let chomp = 0;
    if (!this.full && !this.busy && awake && !this.noChomp) {
      this.nextChomp -= dt;
      if (this.nextChomp <= 0) {
        this.chompT = 0.7;
        this.nextChomp = rand(2.5, 5);
      }
    }
    if (this.chompT > 0) {
      this.chompT -= dt;
      chomp = Math.max(0, Math.sin((1 - this.chompT / 0.7) * Math.PI * 4)) * 0.5;
    }

    const headX = -(this.lookPitch * 0.6 + a.headLift);
    if (this.type === 'longneck') {
      this.neckBase.rotation.y = this.lookYaw * 0.6;
      this.neckBase.rotation.x = 0.55 - a.headLift * 0.5;
      this.neck.forEach((n, i) => {
        if (i > 0) n.rotation.z = Math.sin(t * 1.3 + i * 0.8 + this.seed) * 0.06;
      });
      this.head.rotation.y = this.lookYaw * 0.4;
      this.head.rotation.x = -0.07 + headX * 0.6;
    } else {
      this.head.rotation.y = this.lookYaw;
      this.head.rotation.x = headX;
    }
    this.head.rotation.z = a.headTilt;
    this.jaw.rotation.x = clamp(a.jaw + chomp, 0, 1.4) * 0.55;

    // body: breathing + squash/stretch + hop
    // sleeping: slow, deep breaths and a slightly flattened, snuggled-down body
    const breatheRate = 2.2 - a.sleep * 1.1;
    const breathe = 1 + Math.sin(t * breatheRate + this.seed) * (0.025 + a.sleep * 0.03);
    const sq = a.squash * breathe * (1 - a.sleep * 0.1);
    const inv = 1 / Math.sqrt(Math.max(sq, 0.2));
    const sc = a.scale * this.size;
    this.rig.scale.set(inv * sc, sq * sc, inv * sc);
    this.rig.position.y = a.hop;

    // waddle; a scared baby trembles a little
    if (this.walking) this.walkPhase += dt * 10;
    const walkAmt = this.walking ? 1 : 0;
    const tremble = Math.sin(t * 34 + this.seed) * 0.05 * a.scared;
    this.rig.rotation.z = Math.sin(this.walkPhase) * 0.1 * walkAmt + a.lean + tremble;
    for (const leg of this.legs) {
      leg.g.rotation.x = damp(leg.g.rotation.x, Math.sin(this.walkPhase + leg.phase) * 0.6 * walkAmt, 12, dt);
    }
    this.tail.forEach((p, i) => {
      p.rotation.y = Math.sin(t * (2.4 + a.wag * 4) + i * 0.7 + this.seed) * (0.16 + a.wag * 0.35);
    });
    for (const arm of this.arms) {
      arm.g.rotation.z = arm.sx * (0.2 + Math.sin(t * (3 + a.wag * 8)) * (0.15 + a.wag * 0.5));
    }

    // eyes
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.blinkT = rand(2, 5);
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const blinkY = (1 - Math.sin(this.blink * Math.PI) * 0.9) * (1 - a.sleep * 0.9);
    const eyes = a.eyes * (1 + a.scared * 0.25);
    for (const e of this.eyes) e.scale.set(eyes, eyes * blinkY, eyes);

    // tongue
    this.tongue.visible = a.tongue > 0.02;
    if (this.tongue.visible) {
      this.tongue.lookAt(this.tongueAim);
      this.mouth.getWorldPosition(tmp2);
      const len = tmp2.distanceTo(this.tongueAim);
      const parentScale = this.rig.scale.y;
      this.tongue.scale.set(1, 1, Math.max((len * a.tongue) / parentScale, 0.01));
    }

    // shadow shrinks when we jump
    const sh = 1 - clamp(a.hop / 4, 0, 0.5);
    this.shadow.visible = !this.carried;
    this.shadow.scale.setScalar(sh * a.scale * this.shadowSize);
    this.shadow.scale.y = 1;

    // idle "look at me!" hop when Lucky is nearby
    if (near && !this.full && this.acting === 0 && !this.busy && !this.noHop) {
      this.nextHop -= dt;
      if (this.nextHop <= 0) {
        this.nextHop = rand(3, 6);
        this.act(() => this.jump(0.5));
      }
    }

    this.headTop.getWorldPosition(tmp2);
    this.bubble.update(t, camera, tmp2);
  }

  // ---------- scripted moves ----------

  /** Wrap a scripted move so idle behaviors know we're busy. */
  async act(fn) {
    this.acting++;
    try {
      await fn();
    } finally {
      this.acting--;
    }
  }

  async jump(h = 0.9, spin = 0, airTime = 0.45) {
    const A = this.anim, a = this.a;
    await A.play(0.12, (e) => (a.squash = 1 - 0.2 * e), ease.outQuad);
    const s0 = a.spin;
    await A.play(airTime, (_, k) => {
      a.hop = 4 * h * k * (1 - k);
      a.squash = 0.98 + 0.18 * Math.abs(1 - 2 * k);
      a.spin = s0 + spin * ease.inOutCubic(k);
    });
    a.hop = 0;
    await A.play(0.35, (_, k) => (a.squash = 1 - 0.2 * (1 - ease.outElastic(k))));
  }

  async popIn(delay = 0) {
    const A = this.anim, a = this.a;
    a.scale = 0;
    this.bubble.scale = 0;
    await A.wait(delay);
    this.ctx.sound.pop(0.8 + Math.random() * 0.4);
    this.root.getWorldPosition(tmp);
    this.ctx.particles.puff(tmp.setY(tmp.y + 1), { count: 8, color: 0xffffff, speed: 3, size: 0.7 });
    await A.to(a, { scale: 1 }, 0.5, ease.outBack);
    if (a.sleep > 0.5) return; // sleepyheads stay snoozing, no bubble until they wake
    this.jump(0.6);
    if (!this.noBubble) await A.to(this.bubble, { scale: 1 }, 0.4, ease.outBack);
  }

  async leave() {
    const A = this.anim, a = this.a;
    A.to(this.bubble, { scale: 0 }, 0.25, ease.inBack);
    await this.jump(1.2, Math.PI * 2, 0.6);
    this.root.getWorldPosition(tmp);
    this.ctx.particles.puff(tmp.setY(tmp.y + 1.2), { count: 10, color: 0xffffff, speed: 4, size: 0.8 });
    this.ctx.sound.pop(0.6);
    await A.to(a, { scale: 0 }, 0.3, ease.inBack);
  }

  openMouth() {
    return this.anim.to(this.a, { jaw: 1.2, eyes: 1.15 }, 0.25, ease.outBack);
  }

  async chew(times = 3) {
    const A = this.anim, a = this.a;
    await A.to(a, { jaw: 0, eyes: 1 }, 0.08, ease.inQuad);
    for (let i = 0; i < times; i++) {
      this.ctx.sound.munch();
      await A.play(0.2, (_, k) => {
        a.jaw = Math.sin(k * Math.PI) * 0.45;
        a.squash = 1 + Math.sin(k * Math.PI) * 0.07;
        a.headTilt = Math.sin(k * Math.PI) * 0.12 * (i % 2 ? 1 : -1);
      });
    }
    a.headTilt = 0;
  }

  async happyBounce() {
    this.ctx.sound.dinoHappy(this.type);
    this.ctx.fx.emote(this.headTop, 'heart');
    await this.jump(0.8);
  }

  async dance() {
    const A = this.anim, a = this.a;
    this.ctx.sound.dinoHappy(this.type);
    A.to(a, { wag: 1 }, 0.3);
    this.ctx.fx.emote(this.headTop, 'heart');
    await this.jump(0.9, Math.PI);
    await A.play(0.5, (_, k) => {
      a.lean = Math.sin(k * Math.PI * 4) * 0.22;
      a.headTilt = Math.sin(k * Math.PI * 4) * 0.25;
    });
    this.ctx.fx.emote(this.headTop, 'heart');
    await this.jump(1.1, Math.PI);
    a.lean = 0;
    a.headTilt = 0;
    await A.to(a, { wag: 0.25 }, 0.6);
  }

  /** A random happy reaction after a snack, so it's different every time. */
  async react(big = false) {
    const pool = ['spin', 'wiggle', 'rawr', 'flop', 'stomp', 'nod'];
    let kind;
    do kind = pool[Math.floor(Math.random() * pool.length)];
    while (kind === this.lastReact);
    this.lastReact = kind;
    return this[kind](big);
  }

  /** Hop up with a full twirl in the air. */
  async spin() {
    this.ctx.sound.dinoHappy(this.type);
    this.ctx.fx.emote(this.headTop, 'heart');
    await this.jump(1.0, Math.PI * 2, 0.6);
  }

  /** Happy butt-wiggle with a fast tail wag and a little tune. */
  async wiggle() {
    const A = this.anim, a = this.a;
    this.ctx.fx.emote(this.headTop, '♪');
    this.ctx.sound.dinoHappy(this.type);
    A.to(a, { wag: 1 }, 0.2);
    await A.play(1.2, (_, k) => {
      const s = Math.sin(k * Math.PI * 8);
      a.lean = s * 0.2;
      a.headTilt = -s * 0.25;
      a.squash = 1 + Math.abs(s) * 0.06;
      a.eyes = 0.75; // happy squint
    });
    a.lean = 0;
    a.headTilt = 0;
    a.squash = 1;
    await A.to(a, { wag: 0.25, eyes: 1 }, 0.3);
  }

  /** A big, happy (not scary) "RAWR!" with a proud chest puff. */
  async rawr() {
    const A = this.anim, a = this.a;
    await A.to(a, { squash: 0.88, headLift: -0.15 }, 0.15);
    this.ctx.sound.rawr(this.type);
    this.ctx.fx.emote(this.headTop, '!');
    await A.to(a, { squash: 1.15, headLift: 0.5, jaw: 1.4, eyes: 0.6 }, 0.2, ease.outBack);
    await A.play(0.6, (_, k) => (a.headTilt = Math.sin(k * Math.PI * 6) * 0.12 * (1 - k)));
    await A.to(a, { squash: 1, headLift: 0, jaw: 0, eyes: 1, headTilt: 0 }, 0.35, ease.outBack);
    await this.jump(0.5);
  }

  /** So full it flops over onto its side, kicks its legs, and rolls back up. */
  async flop() {
    const A = this.anim, a = this.a;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lie = 0.6 * this.size;
    this.ctx.sound.boing();
    await A.play(0.45, (e) => {
      a.lean = dir * 1.25 * e;
      a.hop = Math.sin(e * Math.PI) * 0.6 + lie * e; // lift so it lies on the grass, not in it
    }, ease.outBack);
    a.hop = lie;
    this.walking = true; // legs kick in the air
    this.ctx.fx.emote(this.headTop, 'heart');
    this.ctx.sound.dinoHappy(this.type);
    await A.play(1.0, (_, k) => {
      a.lean = dir * (1.25 + Math.sin(k * Math.PI * 4) * 0.08);
      a.eyes = 0.7;
    });
    this.walking = false;
    await A.play(0.45, (e) => {
      a.lean = dir * 1.25 * (1 - e);
      a.hop = Math.sin(e * Math.PI) * 0.5 + lie * (1 - e);
    }, ease.inOutCubic);
    a.lean = 0;
    a.hop = 0;
    a.eyes = 1;
    await this.jump(0.4);
  }

  /** Three quick happy stomps with little dust puffs. */
  async stomp() {
    const A = this.anim, a = this.a;
    this.ctx.sound.dinoHappy(this.type);
    for (let i = 0; i < 3; i++) {
      await A.play(0.16, (_, k) => {
        a.hop = Math.sin(k * Math.PI) * 0.35;
        a.lean = (i % 2 ? 1 : -1) * 0.12 * Math.sin(k * Math.PI);
      });
      a.hop = 0;
      a.lean = 0;
      this.ctx.sound.munch();
      this.root.getWorldPosition(tmp);
      this.ctx.particles.puff(tmp.setY(tmp.y + 0.2), { count: 5, color: 0xf3e6c4, speed: 2.5, size: 0.35 * this.size + 0.15, life: 0.5 });
      await A.play(0.12, (_, k) => (a.squash = 1 - Math.sin(k * Math.PI) * 0.15));
    }
    a.squash = 1;
    this.ctx.fx.emote(this.headTop, 'heart');
    await this.jump(0.7);
  }

  /** "Yum yum yum!" - eager nods, then licks its lips. */
  async nod() {
    const A = this.anim, a = this.a;
    this.ctx.fx.emote(this.headTop, 'heart');
    this.ctx.sound.dinoHappy(this.type);
    await A.play(1.0, (_, k) => {
      a.headLift = Math.sin(k * Math.PI * 6) * 0.35;
      a.eyes = 0.75;
      a.wag = 0.8;
    });
    a.headLift = 0;
    // lick
    this.mouthPos(tmp);
    this.forward(tmp2);
    this.tongueAim.copy(tmp).addScaledVector(tmp2, 0.8 * this.size).add(tmp2.set(0, 0.25, 0));
    await A.to(a, { jaw: 0.6 }, 0.1);
    await A.play(0.4, (_, k) => (a.tongue = Math.sin(k * Math.PI)));
    a.tongue = 0;
    await A.to(a, { jaw: 0, eyes: 1, wag: 0.25 }, 0.25);
  }

  /** Full-belly party: one of a few bigger celebrations. */
  async party() {
    const pick = Math.floor(Math.random() * 3);
    if (pick === 0) return this.dance();
    if (pick === 1) {
      await this.spin();
      return this.flop();
    }
    await this.stomp();
    return this.wiggle();
  }

  /** "Ah... ah... CHOO!"  onChoo fires at the sneeze. */
  async sneeze(onChoo) {
    const A = this.anim, a = this.a, sound = this.ctx.sound;
    sound.sneezeIn(0);
    await A.to(a, { headLift: 0.3, eyes: 0.55 }, 0.35, ease.inOutSine);
    await A.wait(0.15);
    sound.sneezeIn(1);
    await A.to(a, { headLift: 0.6, eyes: 0.25, squash: 1.1 }, 0.4, ease.inOutSine);
    await A.wait(0.2);
    await A.to(a, { headLift: -0.35, squash: 0.82, eyes: 1.2 }, 0.08, ease.outQuad);
    sound.choo();
    this.mouthPos(tmp);
    this.ctx.particles.puff(tmp, { count: 14, color: 0xeefbff, speed: 7, size: 0.6, dir: this.forward(tmp2) });
    onChoo?.();
    await A.wait(0.15);
    await A.to(a, { headLift: 0, squash: 1, eyes: 1 }, 0.5, ease.outBack);
    await A.play(0.5, (_, k) => (a.headTilt = Math.sin(k * Math.PI * 3) * 0.2 * (1 - k)));
  }

  /** Tries to grab Lucky with a big silly tongue, and misses. */
  async tongueGrab(target) {
    const A = this.anim, a = this.a;
    this.tongueAim.copy(target);
    await A.to(a, { jaw: 1.3, eyes: 1.3 }, 0.15, ease.outBack);
    this.ctx.sound.thwip();
    await A.play(0.22, (e) => (a.tongue = e), ease.outQuad);
    await A.wait(0.12);
    await A.play(0.3, (e) => (a.tongue = 1 - e), ease.inQuad);
    a.tongue = 0;
    await A.to(a, { jaw: 0, eyes: 1.5 }, 0.15);
    this.ctx.fx.emote(this.headTop, '?');
    this.ctx.sound.huh();
    await A.play(0.6, (_, k) => (a.headTilt = Math.sin(k * Math.PI) * 0.35));
    await A.to(a, { eyes: 1 }, 0.3);
  }

  async surprised() {
    const A = this.anim, a = this.a;
    this.ctx.fx.emote(this.headTop, '!');
    this.ctx.sound.surprise();
    A.to(a, { eyes: 1.7 }, 0.12, ease.outBack);
    await this.jump(1.3, 0, 0.5);
    await A.wait(0.3);
    await A.to(a, { eyes: 1 }, 0.4);
  }

  /** Big stretchy yawn, eyes open, then a happy wiggle. */
  async wake() {
    const A = this.anim, a = this.a;
    this.ctx.sound.yawn(this.size < 0.6);
    await A.to(a, { headLift: 0.5, jaw: 1.3, sleep: 0.4, squash: 1.12 }, 0.6, ease.inOutSine);
    await A.wait(0.25);
    await A.to(a, { headLift: 0, jaw: 0, sleep: 0, squash: 1, eyes: 1.25 }, 0.3, ease.outBack);
    await A.play(0.4, (_, k) => (a.headTilt = Math.sin(k * Math.PI * 2) * 0.2));
    a.headTilt = 0;
    await A.to(a, { eyes: 1 }, 0.3);
  }

  /** Lean the head down toward a spot (a baby) for a cuddle. */
  async nuzzle(target) {
    const A = this.anim, a = this.a;
    const pos = this.root.position;
    const y0 = this.yaw, dy = wrapAngle(Math.atan2(target.x - pos.x, target.z - pos.z) - y0);
    await A.play(0.35, (e) => (this.yaw = y0 + dy * e), ease.inOutSine);
    await A.to(a, { headLift: -0.55, lean: 0.12 }, 0.35, ease.inOutSine);
    this.ctx.fx.emote(this.headTop, 'heart');
    await A.play(0.8, (_, k) => (a.headTilt = Math.sin(k * Math.PI * 3) * 0.22));
    await A.to(a, { headLift: 0, lean: 0, headTilt: 0 }, 0.4, ease.outBack);
  }

  async walkTo(x, z, speed = 3.2) {
    const A = this.anim;
    const pos = this.root.position;
    const targetYaw = Math.atan2(x - pos.x, z - pos.z);
    const y0 = this.yaw, dy = wrapAngle(targetYaw - y0);
    this.walking = true;
    await A.play(0.3, (e) => (this.yaw = y0 + dy * e), ease.inOutSine);
    const x0 = pos.x, z0 = pos.z;
    const dist = Math.hypot(x - x0, z - z0);
    await A.play(Math.max(dist / speed, 0.3), (_, k) => {
      pos.x = x0 + (x - x0) * k;
      pos.z = z0 + (z - z0) * k;
      pos.y = this.ctx.world.heightAt(pos.x, pos.z);
    });
    this.walking = false;
  }

  forward(out) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
}
