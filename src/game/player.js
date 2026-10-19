import * as THREE from 'three';
import { LuckyModel } from '../actors/lucky.js';
import { blobShadow } from '../util/shapes.js';
import { clamp, damp, wrapAngle, smoothstep } from '../util/math.js';
import { ease } from '../util/tween.js';
import { PLAY_RADIUS, SOFT_RADIUS, MAX_ALT } from '../world/world.js';

const BASE_SPEED = 8.5; // moderate top speed, easy to steer
const TURN_RATE = 1.7; // radians per second at full turn
const VERT = 5; // same speed going up or down
const HOVER = 2.4; // lowest he flies above ground or water

/**
 * Lucky's flight: always flying forward and always hovering (he never sinks on his own).
 * Up/Down change height at the same speed, Left/Right turn.
 * Easy-mode assists: soft edges, speed cap, auto-level, slow-down near targets.
 */
export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.model = new LuckyModel();
    this.root = this.model.root;
    this.pos = this.root.position;
    this.shadow = blobShadow(1.8);
    ctx.scene.add(this.shadow);

    this.yaw = 0;
    this.turn = 0;
    this.edgeTurn = 0;
    this.vSpeed = 0;
    this.speed = BASE_SPEED;
    this.push = new THREE.Vector3();
    this.assist = false;
    this.dive = 0;
    this.divePitch = 0;
    this.stunting = false;
    this.stuntCooldown = 0;
    this.fwd = new THREE.Vector3();
    this.flapCount = 0;
    this.extraFloor = -Infinity; // set by the game, e.g. to hop over a dinosaur
    this.hold = null; // { face: Vector3 } while he stops in mid-air to watch something
    this.carrying = false;
  }

  /** Stop in mid-air (still flapping) and turn to face `face` until release(). */
  holdAt(face) {
    this.hold = { face: face.clone() };
  }

  release() {
    this.hold = null;
  }

  reset(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.turn = 0;
    this.vSpeed = 0;
    this.push.set(0, 0, 0);
    this.root.rotation.y = yaw;
  }

  forward(out = this.fwd) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** World position of the tip of the beak. */
  beakPos(out) {
    return this.model.head.localToWorld(out.set(0, -0.08, 0.62));
  }

  update(dt, t, held) {
    const world = this.ctx.world;
    const pos = this.pos;

    // turning, eased in and out
    const turnIn = this.hold ? 0 : (held.left ? 1 : 0) - (held.right ? 1 : 0);
    this.turn = damp(this.turn, turnIn, 5, dt);
    this.yaw += this.turn * TURN_RATE * dt;
    if (this.hold) {
      // swing round to face what he's watching
      const f = this.hold.face;
      const want = Math.atan2(f.x - pos.x, f.z - pos.z);
      const before = this.yaw;
      this.yaw += wrapAngle(want - this.yaw) * (1 - Math.exp(-4 * dt));
      this.turn = clamp(wrapAngle(this.yaw - before) / (dt * TURN_RATE + 1e-6), -1, 1) * 0.5;
    }

    // soft edges: gently steer back toward the middle
    const d = Math.hypot(pos.x, pos.z);
    this.edgeTurn = 0;
    if (d > SOFT_RADIUS) {
      const k = smoothstep(SOFT_RADIUS, PLAY_RADIUS, d);
      const diff = wrapAngle(Math.atan2(-pos.x, -pos.z) - this.yaw);
      this.yaw += diff * clamp(k * 2.4 * dt, 0, 1);
      this.edgeTurn = Math.sign(diff) * k;
    }

    // up and down at the same speed; let go and he simply hovers where he is
    const fwd = this.forward();
    const floor = Math.max(world.floorAt(pos.x, pos.z), world.floorAt(pos.x + fwd.x * 4, pos.z + fwd.z * 4)) + HOVER;
    const minY = Math.max(floor, this.extraFloor);
    const vIn = this.hold ? 0 : (held.fly ? 1 : 0) - (held.down ? 1 : 0);
    let target = vIn * VERT;
    if (target > 0 && pos.y >= MAX_ALT) target = 0;
    if (target < 0 && pos.y <= minY + 0.05) target = 0;
    this.vSpeed = damp(this.vSpeed, target, 8, dt);
    pos.y += this.vSpeed * dt;
    if (pos.y < minY) {
      pos.y = damp(pos.y, minY, 6, dt);
      if (this.vSpeed < 0) this.vSpeed = damp(this.vSpeed, 0, 8, dt);
    }
    if (pos.y > MAX_ALT) pos.y = damp(pos.y, MAX_ALT, 4, dt);

    // forward speed: a bit slower near something to feed or catch, a tiny bit slower
    // while carrying babies, and a quick stop when he pauses to watch
    let want = BASE_SPEED * (this.assist ? 0.55 : 1) * (this.carrying ? 0.92 : 1);
    if (this.hold) want = 0;
    this.speed = damp(this.speed, want, this.hold ? 6 : 2.5, dt);
    pos.addScaledVector(fwd, this.speed * dt).addScaledVector(this.push, dt);
    this.push.multiplyScalar(Math.exp(-2.2 * dt));
    const d2 = Math.hypot(pos.x, pos.z);
    if (d2 > PLAY_RADIUS) {
      pos.x *= PLAY_RADIUS / d2;
      pos.z *= PLAY_RADIUS / d2;
    }

    // body pose: bank into turns, pitch with climb; always eases back to level
    this.root.rotation.y = this.yaw;
    const visTurn = clamp(this.turn + this.edgeTurn * 0.6, -1, 1);
    const tilt = this.model.tilt;
    tilt.rotation.z = damp(tilt.rotation.z, -visTurn * 0.55, 6, dt);
    tilt.rotation.x = damp(tilt.rotation.x, clamp(-this.vSpeed * 0.07, -0.4, 0.3) + this.divePitch, 6, dt);
    tilt.position.y = this.dive;

    // hovering in place needs busy wings, so flap harder when stopped
    const climb = clamp(this.vSpeed / VERT, -1, 1);
    const hovering = 1 - clamp(this.speed / BASE_SPEED, 0, 1);
    const glide = smoothstep(-0.2, -1, this.vSpeed) * (1 - hovering);
    this.model.update(dt, t, { climb: Math.max(climb, hovering * 0.6), turn: visTurn, glide });

    // soft flap sound on each wing beat while climbing or hovering
    const beats = Math.floor(this.model.phase / (Math.PI * 2));
    if (beats !== this.flapCount) {
      this.flapCount = beats;
      if (held.fly || hovering > 0.5) this.ctx.sound.flap();
    }

    this.stuntCooldown -= dt;
    this.updateShadow();
  }

  updateShadow() {
    const ground = Math.max(this.ctx.world.heightAt(this.pos.x, this.pos.z), 0);
    this.shadow.position.set(this.pos.x, ground + 0.08, this.pos.z);
    const h = this.pos.y - ground;
    const s = clamp(2.2 - h * 0.045, 0.7, 2.2);
    this.shadow.scale.set(s, 1, s);
  }

  // ---------- moves ----------

  async doStunt(kind) {
    if (this.stunting) return false;
    this.stunting = true;
    this.stuntCooldown = 1.4;
    const A = this.ctx.anim, st = this.model.stunt, a = this.model.a;
    this.ctx.sound.whoosh();
    A.to(a, { crest: 1 }, 0.2, ease.outBack);
    if (kind === 'roll') {
      const dir = Math.random() < 0.5 ? 1 : -1;
      await A.play(0.95, (e) => (st.rotation.z = dir * e * Math.PI * 2), ease.inOutCubic);
      st.rotation.z = 0;
    } else if (kind === 'flip') {
      // half a backflip: he ends up upside down, facing the camera with a silly grin
      await A.play(0.5, (e) => {
        st.rotation.x = -e * Math.PI;
        st.position.y = Math.sin((e * Math.PI) / 2) * 1.3;
      }, ease.inOutCubic);
      A.to(a, { dangle: 1, gobble: 0.55, headTilt: 0.25 }, 0.25, ease.outBack);
      this.ctx.sound.chirp();
      await A.play(0.8, (_, k) => (st.position.y = 1.3 + Math.sin(k * Math.PI * 2) * 0.12));
      A.to(a, { dangle: 0, gobble: 0, headTilt: 0 }, 0.3);
      await A.play(0.5, (e) => {
        st.rotation.x = -Math.PI * (1 + e);
        st.position.y = Math.cos((e * Math.PI) / 2) * 1.3;
      }, ease.inOutCubic);
      st.rotation.x = 0;
      st.position.y = 0;
    } else if (kind === 'loop') {
      const R = 1.8;
      await A.play(1.15, (e) => {
        const ang = e * Math.PI * 2;
        st.rotation.x = -ang;
        st.position.set(0, R * (1 - Math.cos(ang)), R * Math.sin(ang));
      }, ease.inOutSine);
      st.rotation.x = 0;
      st.position.set(0, 0, 0);
    }
    A.to(a, { crest: 0.35 }, 0.6, ease.inOutSine);
    this.stunting = false;
    return true;
  }

  async feedDive() {
    const A = this.ctx.anim;
    await A.play(0.2, (e) => {
      this.dive = -0.7 * e;
      this.divePitch = 0.35 * e;
    }, ease.outQuad);
    await A.play(0.5, (e) => {
      this.dive = -0.7 * (1 - e);
      this.divePitch = 0.35 * (1 - e) - 0.25 * Math.sin(e * Math.PI);
    }, ease.outBack);
    this.dive = 0;
    this.divePitch = 0;
  }

  async gobble() {
    const A = this.ctx.anim, a = this.model.a;
    await A.to(a, { gobble: 1 }, 0.12, ease.outQuad);
    await A.wait(0.1);
    await A.to(a, { gobble: 0 }, 0.14);
    A.wobble(a, 'squash', 0.15, 0.45);
  }

  async happy(big = false) {
    const A = this.ctx.anim, a = this.model.a;
    a.shake = big ? 1.3 : 0.9;
    A.wobble(a, 'squash', 0.12, 0.4);
    await A.to(a, { crest: 1.05 }, 0.18, ease.outBack);
    await A.wait(big ? 1.4 : 0.8);
    if (!this.stunting) await A.to(a, { crest: 0.35 }, 0.5, ease.inOutSine);
  }

  /** Blown backward by a sneeze, with a silly somersault. */
  knockback(dir) {
    this.push.copy(dir).setY(0);
    if (this.push.lengthSq() < 0.001) this.push.copy(this.forward()).multiplyScalar(-1);
    this.push.normalize().multiplyScalar(16);
    this.vSpeed = 3;
    const A = this.ctx.anim, a = this.model.a;
    a.shake = 1.4;
    A.to(a, { crest: 1.1 }, 0.15);
    if (!this.stunting) {
      this.stunting = true;
      const st = this.model.stunt;
      A.play(0.8, (e) => (st.rotation.x = -e * Math.PI * 2), ease.outCubic).then(() => {
        st.rotation.x = 0;
        this.stunting = false;
        A.to(a, { crest: 0.35 }, 0.6);
      });
    }
  }
}
