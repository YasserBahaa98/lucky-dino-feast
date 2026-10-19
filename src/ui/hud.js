import { ICONS, hydrateIcons, setIcon } from './icons.js';

const $ = (id) => document.getElementById(id);

/**
 * Everything on screen that isn't 3D: title, buttons, counters, hints, install.
 */
export class Hud {
  constructor(game) {
    this.game = game;
    hydrateIcons();
    this.title = $('title');
    this.hud = $('hud');
    this.controls = $('controls');
    this.snackCount = $('snack-count');
    this.snacks = $('snacks');
    this.progress = $('progress');
    this.feedBtn = document.querySelector('[data-btn="feed"]');
    this.catchBtn = document.querySelector('[data-btn="catch"]');
    this.stuntBtn = document.querySelector('[data-btn="stunt"]');
    this.feedIcon = $('feed-icon');
    this.hint = $('hint');
    this.muteBtn = $('mute-btn');
    this.crestBtn = $('crest-btn');

    $('play-btn').addEventListener('click', () => game.play());
    this.muteBtn.addEventListener('click', () => game.toggleMute());
    this.crestBtn.addEventListener('click', () => game.cycleCrest());

    this.setupInstall();

    this.hintStage = null;
    this.hintTimer = 0;
  }

  // ---------- install (PWA) ----------

  setupInstall() {
    const buttons = [$('install-btn'), $('install-btn-hud')];
    let deferred = null;
    const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
    const show = (on) => buttons.forEach((b) => b.classList.toggle('hidden', !on));
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      if (!standalone()) show(true);
    });
    window.addEventListener('appinstalled', () => show(false));
    buttons.forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!deferred) return;
        deferred.prompt();
        try {
          await deferred.userChoice;
        } catch {
          /* ignore */
        }
        deferred = null;
        show(false);
      }),
    );
  }

  // ---------- screens ----------

  showGame() {
    this.title.classList.add('leaving');
    setTimeout(() => this.title.classList.add('hidden'), 500);
    this.hud.classList.remove('hidden');
    this.controls.classList.remove('hidden');
  }

  setMuted(m) {
    setIcon(this.muteBtn.querySelector('.ico'), m ? 'mute' : 'sound');
  }

  setCrest(hex, canCycle) {
    this.crestBtn.classList.toggle('hidden', !canCycle);
    this.crestBtn.style.setProperty('--crest', '#' + hex.toString(16).padStart(6, '0'));
  }

  setSnacks(n, bump) {
    this.snackCount.textContent = n;
    if (bump) {
      this.snacks.classList.remove('bump');
      void this.snacks.offsetWidth;
      this.snacks.classList.add('bump');
    }
  }

  setProgress(dinos) {
    this.progress.innerHTML = '';
    dinos.forEach((d) => {
      const s = document.createElement('span');
      s.className = 'ico' + (d.full ? ' full' : '');
      s.innerHTML = d.full ? ICONS.heart : ICONS.heartEmpty;
      this.progress.appendChild(s);
    });
  }

  setFeed(dino) {
    this.feedBtn.classList.toggle('show', !!dino);
    if (dino) setIcon(this.feedIcon, dino.wants);
  }

  /** kind: null (hidden), 'bug', or 'baby' (pick up the lost babies) */
  setCatch(kind) {
    this.catchBtn.classList.toggle('show', !!kind);
    if (!kind) return;
    this.catchBtn.classList.toggle('baby', kind === 'baby');
    setIcon($('catch-icon'), kind);
  }

  setEggs(n, bump) {
    const el = $('eggs');
    el.classList.toggle('hidden', n === 0);
    $('egg-count').textContent = n;
    if (bump) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  stuntCooling(sec) {
    this.stuntBtn.classList.add('cooling');
    clearTimeout(this.stuntTimer);
    this.stuntTimer = setTimeout(() => this.stuntBtn.classList.remove('cooling'), sec * 1000);
  }

  showUnlock(svg) {
    const el = $('unlock');
    $('unlock-art').innerHTML = svg;
    el.classList.remove('hidden');
    const card = el.querySelector('.unlock-card');
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
    clearTimeout(this.unlockTimer);
    this.unlockTimer = setTimeout(() => el.classList.add('hidden'), 2700);
  }

  // ---------- hints: a little pointing hand, no reading needed ----------

  startHints() {
    this.hintStage = 'fly';
    this.hintTimer = 0;
    this.hint.classList.remove('hidden');
  }

  hintDone(stage) {
    if (this.hintStage === stage) this.advanceHint();
  }

  advanceHint() {
    const order = ['fly', 'down', 'turn','wait-feed', 'feed', 'wait-catch', 'catch', null];
    this.hintStage = order[order.indexOf(this.hintStage) + 1] ?? null;
    this.hintTimer = 0;
  }

  updateHints(dt, held, feedShown, catchShown) {
    const st = this.hintStage;
    if (!st) {
      this.hint.classList.add('hidden');
      return;
    }
    let target = null;
    if (st === 'fly') {
      target = document.querySelector('[data-btn="fly"]');
      if (held.fly) this.hintTimer += dt;
      if (this.hintTimer > 0.6) this.advanceHint();
    } else if (st === 'down') {
      target = document.querySelector('[data-btn="down"]');
      if (held.down) this.hintTimer += dt;
      if (this.hintTimer > 0.4) this.advanceHint();
    } else if (st === 'turn') {
      target = document.querySelector(Math.floor(performance.now() / 1500) % 2 ? '[data-btn="right"]' : '[data-btn="left"]');
      if (held.left || held.right) this.hintTimer += dt;
      if (this.hintTimer > 0.5) this.advanceHint();
    } else if (st === 'wait-feed') {
      if (feedShown) this.advanceHint();
    } else if (st === 'feed') {
      target = feedShown ? this.feedBtn : null;
    } else if (st === 'wait-catch') {
      if (catchShown) this.advanceHint();
    } else if (st === 'catch') {
      target = catchShown ? this.catchBtn : null;
    }
    if (!target) {
      this.hint.classList.add('hidden');
      return;
    }
    const r = target.getBoundingClientRect();
    this.hint.classList.remove('hidden');
    this.hint.style.left = `${r.left + r.width * 0.55}px`;
    this.hint.style.top = `${r.top + r.height * 0.45}px`;
  }
}
