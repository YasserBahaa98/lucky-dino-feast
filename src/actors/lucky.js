import * as THREE from 'three';
import { mesh, group, toon, basic } from '../util/shapes.js';
import { damp, lerp, clamp } from '../util/math.js';

const WHITE = 0xffffff;
const CREAM = 0xf4f1e8;
const GREY = 0x7d838c;
const DARK = 0x1b1b24;

export const CREST_COLORS = {
  yellow: 0xffd23f,
  pink: 0xff7eb6,
  blue: 0x6fd3ff,
  purple: 0xb48cff, // found every hidden egg
};

/**
 * Lucky the cockatoo, built from simple shapes to look like the plush toy:
 * white body, yellow crest, grey beak and feet, big dark eyes.
 * The model faces +Z. Nested groups keep each motion separate:
 *   root (position + heading) > tilt (bank/pitch) > stunt (spins) > body (squash/bob)
 */
export class LuckyModel {
  constructor() {
    this.root = new THREE.Group();
    this.tilt = group(this.root);
    this.tilt.rotation.order = 'YXZ';
    this.stunt = group(this.tilt);
    this.body = group(this.stunt);

    // Animation knobs other code can tween.
    this.a = {
      crest: 0.35, // 0 = lying back, 1 = fully flared
      shake: 0, // crest shake, decays on its own
      gobble: 0, // head lunge + open beak
      squash: 1,
      headTurn: 0,
      headTilt: 0,
      dangle: 0, // feet hanging down instead of tucked
      wingsOpen: 0, // wings held out (gliding pose)
    };
    this.phase = 0;
    this.freq = 2;
    this.amp = 0.8;
    this.blinkT = 2;
    this.blink = 0;

    this.crestMat = toon(CREST_COLORS.yellow, {});

    this.buildBody();
    this.buildHead();
    this.buildWings();
    this.buildTail();
    this.buildFeet();

    // where carried babies ride: one held in each foot, two sitting on his back in a row
    this.feetMounts = [group(this.stunt, [-0.3, -0.62, 0.05]), group(this.stunt, [0.3, -0.62, 0.05])];
    this.backMounts = [group(this.stunt, [0, 0.36, -0.05]), group(this.stunt, [0, 0.24, -0.55])];

    // a bug he's saving for a dinosaur who asked for one
    this.beakBug = group(this.head, [0, -0.1, 0.62]);
    mesh('sphere', basic(0xd4ff4a), { s: [0.1, 0.1, 0.13], parent: this.beakBug });
    mesh('sphere', DARK, { s: 0.07, p: [0, 0.02, 0.1], parent: this.beakBug });
    for (const sx of [-1, 1]) mesh('sphere', basic(0xffffff), { s: [0.1, 0.015, 0.06], p: [sx * 0.11, 0.08, 0], r: [0, 0, sx * 0.4], parent: this.beakBug });
    this.beakBug.visible = false;

    this.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }

  buildBody() {
    mesh('sphere', WHITE, { s: [0.55, 0.52, 0.74], parent: this.body });
    mesh('sphere', CREAM, { s: [0.44, 0.4, 0.5], p: [0, -0.14, 0.2], parent: this.body });
  }

  buildHead() {
    const head = (this.head = group(this.body, [0, 0.42, 0.5]));
    mesh('sphere', WHITE, { s: 0.42, parent: head });

    this.eyes = [];
    for (const sx of [-1, 1]) {
      const e = group(head, [sx * 0.21, 0.08, 0.31], [0, sx * 0.42, 0]);
      mesh('sphere', 0xdde7f2, { s: [0.125, 0.125, 0.05], p: [0, 0, -0.01], parent: e });
      mesh('sphere', DARK, { s: [0.095, 0.1, 0.08], parent: e });
      mesh('sphere', basic(0xffffff), { s: 0.03, p: [0.03, 0.04, 0.07], parent: e });
      this.eyes.push(e);
    }
    // soft yellow cheek patches, like the real bird
    for (const sx of [-1, 1]) {
      mesh('sphere', 0xfff0b0, { s: [0.1, 0.075, 0.04], p: [sx * 0.29, -0.09, 0.22], r: [0, sx * 0.75, 0], parent: head });
    }

    // hooked grey beak; the lower half opens on a hinge
    mesh('cone', GREY, { s: [0.14, 0.32, 0.13], p: [0, -0.06, 0.43], r: [Math.PI / 2 + 0.6, 0, 0], parent: head });
    mesh('sphere', GREY, { s: [0.13, 0.12, 0.1], p: [0, -0.01, 0.38], parent: head });
    this.jaw = group(head, [0, -0.13, 0.36]);
    mesh('cone', 0x8d939b, { s: [0.09, 0.16, 0.08], p: [0, -0.02, 0.07], r: [Math.PI / 2 + 0.15, 0, 0], parent: this.jaw });

    // crest: a fan of feathers, each with a tip that curls forward when flared
    this.crestRoot = group(head, [0, 0.3, -0.03]);
    this.feathers = [];
    const lengths = [0.3, 0.4, 0.5, 0.54, 0.48, 0.36];
    lengths.forEach((len, i) => {
      const f = group(this.crestRoot, [0, 0, -i * 0.035]);
      mesh('sphere', this.crestMat, { s: [0.075, len / 2, 0.045], p: [0, len / 2, 0], parent: f });
      const tip = group(f, [0, len * 0.92, 0]);
      mesh('sphere', this.crestMat, { s: [0.05, len * 0.28, 0.035], p: [0, len * 0.24, 0], parent: tip });
      this.feathers.push({ f, tip, i, side: i % 2 ? 1 : -1 });
    });
  }

  buildWings() {
    this.wings = [];
    for (const sx of [-1, 1]) {
      const shoulder = group(this.body, [sx * 0.42, 0.16, 0.06]);
      mesh('sphere', WHITE, { s: [0.44, 0.075, 0.32], p: [sx * 0.36, 0, -0.04], parent: shoulder });
      const elbow = group(shoulder, [sx * 0.74, 0, -0.04]);
      mesh('sphere', WHITE, { s: [0.44, 0.06, 0.26], p: [sx * 0.34, 0, -0.08], r: [0, sx * 0.2, 0], parent: elbow });
      // long flight feathers along the trailing edge
      for (let k = 0; k < 3; k++) {
        mesh('sphere', WHITE, { s: [0.26, 0.04, 0.09], p: [sx * (0.5 + k * 0.08), 0, -0.2 - k * 0.07], r: [0, sx * (0.35 + k * 0.18), 0], parent: elbow });
      }
      // pale yellow underwing
      mesh('sphere', 0xfff1a6, { s: [0.38, 0.03, 0.2], p: [sx * 0.32, -0.04, -0.06], parent: elbow });
      this.wings.push({ shoulder, elbow, sx });
    }
  }

  buildTail() {
    this.tail = group(this.body, [0, 0.04, -0.62], [0.12, 0, 0]);
    mesh('sphere', WHITE, { s: [0.3, 0.06, 0.44], p: [0, 0, -0.32], parent: this.tail });
    mesh('sphere', 0xfff6cc, { s: [0.2, 0.05, 0.3], p: [0, -0.03, -0.4], parent: this.tail });
  }

  buildFeet() {
    this.legs = [];
    for (const sx of [-1, 1]) {
      const leg = group(this.body, [sx * 0.17, -0.38, 0.04]);
      mesh('cyl', GREY, { s: [0.05, 0.18, 0.05], p: [0, -0.09, 0], parent: leg });
      const foot = group(leg, [0, -0.19, 0]);
      for (const a of [-0.45, 0, 0.45, Math.PI]) {
        const toe = group(foot, null, [0, a, 0]);
        mesh('sphere', GREY, { s: [0.035, 0.035, a === Math.PI ? 0.06 : 0.09], p: [0, 0, a === Math.PI ? 0.05 : 0.08], parent: toe });
      }
      this.legs.push(leg);
    }
  }

  setCrestColor(hex) {
    this.crestMat.color.setHex(hex);
  }

  /**
   * motion: { climb: -1..1, turn: -1..1, glide: 0..1 }
   */
  update(dt, t, motion) {
    const a = this.a;

    // Flapping: quick and big while climbing, slow and small while gliding.
    const climb = motion.climb;
    const targetFreq = climb > 0.1 ? 2.6 + climb * 1.6 : lerp(2.0, 1.1, motion.glide);
    const targetAmp = climb > 0.1 ? 0.9 + climb * 0.25 : lerp(0.7, 0.28, motion.glide);
    this.freq = damp(this.freq, targetFreq, 4, dt);
    this.amp = damp(this.amp, targetAmp * (1 - a.wingsOpen), 4, dt);
    this.phase += dt * this.freq * Math.PI * 2;
    const s = Math.sin(this.phase);
    for (const w of this.wings) {
      w.shoulder.rotation.z = w.sx * (s * 0.85 * this.amp + 0.08 + a.wingsOpen * 0.15);
      w.elbow.rotation.z = w.sx * Math.sin(this.phase - 0.9) * this.amp * 0.55;
      w.shoulder.rotation.y = w.sx * -0.12 * this.amp * Math.cos(this.phase);
    }
    // body rises on the down-stroke
    this.body.position.y = Math.cos(this.phase) * 0.07 * this.amp;

    // squash and stretch, volume preserving
    const sq = a.squash;
    const inv = 1 / Math.sqrt(Math.max(sq, 0.2));
    this.body.scale.set(inv, sq, inv);

    // crest
    a.shake = Math.max(0, a.shake - dt * 0.9);
    const shake = a.shake * a.shake;
    const flare = clamp(a.crest, 0, 1.2);
    for (const { f, tip, i, side } of this.feathers) {
      const rest = -(1.25 + i * 0.07);
      const up = 0.35 - i * 0.3;
      f.rotation.x = lerp(rest, up, flare) + Math.sin(t * 38 + i) * 0.22 * shake;
      f.rotation.z = side * (0.06 + 0.1 * flare) + Math.sin(t * 31 + i * 2) * 0.3 * shake;
      tip.rotation.x = lerp(0.15, 0.75, flare);
    }

    // blinking
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.blinkT = 1.8 + Math.random() * 3;
    }
    this.blink = Math.max(0, this.blink - dt * 8);
    const eyeY = 1 - Math.sin(this.blink * Math.PI) * 0.9;
    for (const e of this.eyes) e.scale.y = eyeY;

    // head: gobble lunge, look direction, little tilt into turns
    const g = a.gobble;
    this.head.position.z = 0.5 + g * 0.18;
    this.head.position.y = 0.42 - g * 0.05;
    this.head.rotation.x = g * 0.3;
    this.head.rotation.y = a.headTurn + motion.turn * 0.25;
    this.head.rotation.z = a.headTilt + motion.turn * 0.15;
    this.jaw.rotation.x = g * 0.7;

    // feet tucked back while flying, dangling when told to
    for (const leg of this.legs) leg.rotation.x = lerp(1.15, 0.15, a.dangle);

    // tail steers a little
    this.tail.rotation.y = -motion.turn * 0.35;
    this.tail.rotation.x = 0.12 - climb * 0.15;
  }
}
