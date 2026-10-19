const COLORS = ['#ff5f8f', '#ffd23f', '#8ee36b', '#6fd3ff', '#9b5de5', '#ff9f1c'];

/** 2D confetti on an overlay canvas. Only runs while pieces are falling. */
export class Confetti {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.pieces = [];
    this.running = false;
  }

  burst(count = 140) {
    const w = (this.c.width = window.innerWidth);
    this.c.height = window.innerHeight;
    for (let i = 0; i < count; i++) {
      const fromLeft = i % 2 === 0;
      this.pieces.push({
        x: fromLeft ? -10 : w + 10,
        y: window.innerHeight * (0.55 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (250 + Math.random() * 500),
        vy: -(500 + Math.random() * 600),
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        w: 8 + Math.random() * 8,
        h: 12 + Math.random() * 10,
        color: COLORS[i % COLORS.length],
        life: 3 + Math.random(),
      });
    }
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(() => this.frame());
    }
  }

  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    const g = this.g;
    g.clearRect(0, 0, this.c.width, this.c.height);
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life -= dt;
      if (p.life <= 0 || p.y > this.c.height + 40) {
        this.pieces.splice(i, 1);
        continue;
      }
      p.vy += 900 * dt;
      p.vx *= Math.exp(-1.5 * dt);
      p.vy = Math.min(p.vy, 260);
      p.x += p.vx * dt + Math.sin(p.life * 6) * 0.8;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.scale(1, Math.cos(p.life * 8));
      g.fillStyle = p.color;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    if (this.pieces.length) requestAnimationFrame(() => this.frame());
    else {
      this.running = false;
      g.clearRect(0, 0, this.c.width, this.c.height);
    }
  }
}
