// Tiny game-time animation runner. Every animation is a promise, so silly
// moments can be written as plain async sequences:  await anim.to(a, {jaw: 1}, 0.2)
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

export class Animator {
  constructor() {
    this.items = [];
  }

  update(dt) {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.t += dt;
      const k = Math.min(it.t / it.dur, 1);
      it.fn(it.ease(k), k);
      if (k >= 1) {
        items.splice(i, 1);
        it.resolve();
      }
    }
  }

  /** Run fn(easedProgress, rawProgress) every frame for dur seconds. */
  play(dur, fn, easing = ease.linear) {
    return new Promise((resolve) => {
      if (dur <= 0) {
        fn(1, 1);
        resolve();
        return;
      }
      this.items.push({ t: 0, dur, fn, ease: easing, resolve });
    });
  }

  wait(dur) {
    return this.play(dur, () => {});
  }

  /** Tween numeric fields of obj to the given values. */
  to(obj, props, dur, easing = ease.outCubic) {
    const from = {};
    for (const k in props) from[k] = obj[k];
    return this.play(dur, (e) => {
      for (const k in props) obj[k] = from[k] + (props[k] - from[k]) * e;
    }, easing);
  }

  /** Squash-and-stretch wobble on obj[key] that settles back to 1. */
  wobble(obj, key, amount = 0.2, dur = 0.5, waves = 2.5) {
    return this.play(dur, (_, k) => {
      obj[key] = 1 + Math.sin(k * Math.PI * waves) * amount * (1 - k);
    });
  }
}
