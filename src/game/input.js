/**
 * On-screen buttons (multi-touch) plus keyboard for testing on a computer.
 * held.* is true while a button is down; taps queue up for consume().
 */
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'fly', KeyW: 'fly', Space: 'fly',
  ArrowDown: 'down', KeyS: 'down',
  KeyE: 'feed', Enter: 'feed',
  KeyC: 'catch', KeyQ: 'catch',
  KeyX: 'stunt', ShiftLeft: 'stunt',
};

export class Input {
  constructor(root) {
    this.held = { left: false, right: false, fly: false, down: false, feed: false, catch: false, stunt: false };
    this.taps = new Set();
    this.pointers = new Map(); // pointerId -> button name
    this.listeners = [];
    this.enabled = false;

    root.querySelectorAll('[data-btn]').forEach((el) => {
      const name = el.dataset.btn;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!this.enabled) return;
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        this.pointers.set(e.pointerId, { name, el });
        this.press(name);
        el.classList.add('down');
      });
      const up = (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        this.pointers.delete(e.pointerId);
        p.el.classList.remove('down');
        // still held by another finger?
        for (const q of this.pointers.values()) if (q.name === p.name) return;
        this.held[p.name] = false;
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    window.addEventListener('keydown', (e) => {
      const name = KEYS[e.code];
      if (!name || !this.enabled) return;
      e.preventDefault();
      if (!e.repeat) this.press(name);
    });
    window.addEventListener('keyup', (e) => {
      const name = KEYS[e.code];
      if (name) this.held[name] = false;
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  press(name) {
    this.held[name] = true;
    this.taps.add(name);
    for (const fn of this.listeners) fn(name);
  }

  onPress(fn) {
    this.listeners.push(fn);
  }

  consume(name) {
    const had = this.taps.has(name);
    this.taps.delete(name);
    return had;
  }

  clearTaps() {
    this.taps.clear();
  }

  releaseAll() {
    for (const k in this.held) this.held[k] = false;
    this.pointers.clear();
    document.querySelectorAll('.ctl.down').forEach((el) => el.classList.remove('down'));
  }
}
