import * as THREE from 'three';
import { Animator, ease } from '../util/tween.js';
import { rand, chance, pick, shuffle, clamp, damp } from '../util/math.js';
import { mesh, group, toon } from '../util/shapes.js';
import { World, DINO_SPOTS, islandAt } from '../world/world.js';
import { Weather } from '../world/weather.js';
import { Collectibles } from '../world/collectibles.js';
import { Particles } from '../world/particles.js';
import { Dino, DINO_TYPES } from '../actors/dino.js';
import { FRUITS, makeFruit } from '../actors/fruit.js';
import { Bugs } from '../actors/bugs.js';
import { CREST_COLORS } from '../actors/lucky.js';
import { Sound } from '../audio/sound.js';
import { Fx } from '../ui/fx.js';
import { Confetti } from '../ui/confetti.js';
import { Hud } from '../ui/hud.js';
import { ICONS } from '../ui/icons.js';
import { Player } from './player.js';
import { FollowCam } from './camera.js';
import { Input } from './input.js';
import { loadSave, storeSave } from './save.js';

const FEED_RANGE = 9; // how close (sideways) Lucky must be for the Feed button
const CATCH_RANGE = 4.8;
const BABY_RANGE = 6.5; // babies are on the ground, so be generous
const WAKE_RANGE = 10;
const HOME_RANGE = 10; // bring the babies this close to their parent
const SPAWN = { x: 0, y: 9, z: -30, yaw: 0 };
// babies are about Lucky's size (the long-neck is long, so a bit smaller)
const BABY_SIZE = { rex: 0.23, trike: 0.24, longneck: 0.18 };
// how high each dino's back is (at full size), so Lucky's feet can hold a baby by its back
const BACK_HEIGHT = { rex: 2.6, longneck: 2.9, trike: 2.2 };

// Snack rewards: reasons to catch bugs, never required.
const UNLOCKS = [
  { at: 10, crest: 'pink' },
  { at: 25, stunt: 'loop' },
  { at: 40, crest: 'blue' },
];

const FRUIT_COLORS = { apple: 0xff4d4d, banana: 0xffe14d, grapes: 0x9b5de5, orange: 0xffa024, bug: 0xd4ff4a };

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();

export class Game {
  constructor(canvas) {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(0xcdeeff, 130, 420);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1300);
    const hemi = new THREE.HemisphereLight(0xe4f5ff, 0x9c8a62, 1.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4dc, 2.2);
    sun.position.set(60, 100, 40);
    scene.add(sun);

    this.anim = new Animator();
    this.sound = new Sound();
    this.world = new World(scene);
    this.weather = new Weather(scene, this.world, { hemi, sun });
    this.particles = new Particles(scene);
    this.fx = new Fx(document.getElementById('fx'), this.camera);
    this.confetti = new Confetti(document.getElementById('confetti'));
    this.input = new Input(document.getElementById('controls'));
    this.ctx = { anim: this.anim, sound: this.sound, world: this.world, particles: this.particles, fx: this.fx, scene };

    this.player = new Player(this.ctx);
    scene.add(this.player.root);
    this.cam = new FollowCam(this.camera, this.world);
    this.bugs = new Bugs(scene, this.world);
    this.arrow = this.buildArrow();

    this.save = loadSave();
    this.collect = new Collectibles(scene, this.world, this.save.eggs);
    this.hud = new Hud(this);
    this.player.model.setCrestColor(CREST_COLORS[this.save.crest] ?? CREST_COLORS.yellow);
    this.hud.setCrest(CREST_COLORS[this.save.crest] ?? CREST_COLORS.yellow, this.save.crests.length > 1);
    this.hud.setSnacks(this.save.snacks);
    this.hud.setEggs(this.save.eggs.length);
    this.hud.setMuted(this.save.muted);

    this.dinos = [];
    this.babies = [];
    this.rescue = null;
    this.hasBug = false;
    this.lastSpots = [];
    this.level = 0;
    this.state = 'title';
    this.time = 0;
    this.cool = { fastooka: 0, sneeze: 8, tongue: 10 };
    this.stuntCount = 0;
    this.feedTarget = null;
    this.catchTarget = null;
    this.rainAt = Infinity;
    this.watchId = 0;
    this.perf = { t: 0, frames: 0 };

    this.player.reset(0, 10, -10, 0);
    window.addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ---------- main loop ----------

  frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    const t = this.time;
    this.anim.update(dt);

    if (this.state === 'title') this.updateTitle(dt, t);
    else this.updatePlay(dt, t);

    for (const d of this.dinos) d.update(dt, t, this.player.pos, this.camera);
    for (const b of this.babies) b.update(dt, t, this.player.pos, this.camera);
    this.bugs.update(dt, t);
    this.world.update(dt, t);
    this.weather.update(dt, t, this.player.pos, this.camera, this.state === 'title' ? null : this.sound);
    this.bugs.glowBoost = this.weather.dusk;
    this.particles.update(dt);
    this.fx.update(dt);
    this.adaptQuality(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateTitle(dt, t) {
    // Lucky hovers and shows off while the camera drifts around his front
    const p = this.player;
    p.pos.set(0, 10 + Math.sin(t * 1.3) * 0.35, -10);
    p.root.rotation.y = Math.sin(t * 0.4) * 0.25;
    p.model.tilt.rotation.z = Math.sin(t * 0.8) * 0.12;
    p.model.update(dt, t, { climb: 0.2, turn: Math.sin(t * 0.5) * 0.3, glide: 0 });
    p.updateShadow();
    if (!this.titleBlink || t > this.titleBlink) {
      this.titleBlink = t + rand(3, 5);
      p.happy();
    }
    const a = Math.sin(t * 0.25) * 0.9;
    this.camera.position.set(p.pos.x + Math.sin(a) * 5.2, p.pos.y + 0.9, p.pos.z + Math.cos(a) * 5.2);
    this.camera.lookAt(p.pos.x, p.pos.y + 0.3, p.pos.z);
  }

  updatePlay(dt, t) {
    const p = this.player;
    const input = this.input;
    for (const k in this.cool) this.cool[k] -= dt;

    // what can Lucky feed right now?
    let feed = null, best = Infinity;
    for (const d of this.dinos) {
      if (d.full || d.busy || d.leaving || d.sleepy || d.parentOf) continue;
      if (d.wants === 'bug' && !this.hasBug) continue;
      d.mouthPos(v1);
      const dh = Math.hypot(v1.x - p.pos.x, v1.z - p.pos.z);
      const dy = p.pos.y - v1.y;
      if (dh < FEED_RANGE && dy > -4 && dy < 14) {
        const score = dh + Math.abs(dy) * 0.3;
        if (score < best) {
          best = score;
          feed = d;
        }
      }
    }

    // sleepy dinosaurs wake up when Lucky flies by
    if (this.state === 'playing') {
      for (const d of this.dinos) {
        if (!d.sleepy || d.busy || d.acting > 0) continue;
        const dp = d.root.position;
        if (Math.hypot(dp.x - p.pos.x, dp.z - p.pos.z) < WAKE_RANGE && p.pos.y - dp.y < 16) this.wakeDino(d);
      }
    }

    // catch: the lost babies, or else a bug
    const babies = this.babiesInReach();
    const bug = babies ? null : this.bugs.nearest(p.pos, CATCH_RANGE);
    this.feedTarget = feed;
    this.catchTarget = bug;
    p.assist = !!feed || !!bug || babies;
    this.hud.setFeed(feed);
    this.hud.setCatch(babies ? 'baby' : bug ? 'bug' : null);

    if (input.consume('feed') && feed) this.feed(feed);
    if (input.consume('catch')) {
      if (babies) this.grabBabies();
      else if (bug) this.catchBug(bug);
    }
    if (input.consume('stunt')) this.stunt();
    input.clearTaps();

    // glide up and over any dinosaur in the way
    p.extraFloor = -Infinity;
    for (const d of this.dinos) {
      const dp = d.root.position;
      const dh = Math.hypot(dp.x - p.pos.x, dp.z - p.pos.z);
      if (dh < d.radius + 1.2) p.extraFloor = Math.max(p.extraFloor, dp.y + d.height * d.a.scale + 0.6);
    }
    if (p.carrying) p.extraFloor = Math.max(p.extraFloor, this.world.floorAt(p.pos.x, p.pos.z) + 3.2); // room for the dangling baby
    p.update(dt, t, input.held);
    this.cam.update(dt, p);
    this.hud.updateHints(dt, input.held, !!feed, !!bug);
    p.model.beakBug.visible = this.hasBug;

    this.updateSilly(dt);
    this.updateWander(dt);
    this.updateSleepers(dt);
    this.updateRescue(dt, t);
    this.updateCollectibles(dt, t);
    this.updateArrow(dt, t);

    if (this.time > this.rainAt) {
      this.rainAt = Infinity;
      this.weather.startRain(rand(18, 26));
    }
  }

  adaptQuality(dt) {
    // drop resolution a little if the tablet struggles
    if (this.state === 'title') return;
    const pf = this.perf;
    pf.t += dt;
    pf.frames++;
    if (pf.t > 3) {
      const avg = pf.t / pf.frames;
      if (avg > 1 / 40 && this.pixelRatio > 1) {
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
      }
      pf.t = 0;
      pf.frames = 0;
    }
  }

  // ---------- start / levels ----------

  async play() {
    if (this.state !== 'title') return;
    this.state = 'playing';
    this.sound.unlock();
    this.sound.setMuted(this.save.muted);
    this.sound.startMusic();
    this.goFullscreen();
    this.hud.showGame();
    this.input.enabled = true;
    this.player.reset(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN.yaw);
    this.player.model.a.crest = 0.35;
    this.cam.snap(this.player);
    this.sound.fastooka();
    this.fx.fastooka(this.player.model.head);
    await this.startLevel(1);
    this.hud.startHints();
  }

  async goFullscreen() {
    const installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
    if (installed || !matchMedia('(pointer: coarse)').matches) return;
    try {
      await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape');
    } catch {
      /* not allowed; that's fine */
    }
  }

  /**
   * Choose where this level's dinosaurs stand. Islands open up as levels go by;
   * a newly opened island always gets a dinosaur, and last level's spots are avoided.
   */
  pickSpots(count, level) {
    const unlockOf = (s) => islandAt(s[0], s[1])?.unlock ?? 1;
    const open = DINO_SPOTS.filter((s) => unlockOf(s) <= level);
    if (level === 1) return open.slice(0, count);
    const fresh = shuffle(open.filter((s) => unlockOf(s) === level));
    const others = shuffle(open.filter((s) => unlockOf(s) !== level && !this.lastSpots.includes(s)));
    const used = shuffle(open.filter((s) => this.lastSpots.includes(s)));
    const out = [];
    for (const minGap of [14, 9]) {
      for (const s of [...fresh.slice(0, 1), ...others, ...fresh.slice(1), ...used]) {
        if (out.length === count) break;
        if (!out.includes(s) && out.every((o) => Math.hypot(o[0] - s[0], o[1] - s[1]) > minGap)) out.push(s);
      }
    }
    return out;
  }

  /** What a dinosaur asks for: one fruit a few times, a fruit order, or a bug. */
  makeRequest(level, fruit) {
    if (level === 1) return [fruit, fruit];
    const r = Math.random();
    if (r < 0.28) return shuffle(FRUITS.slice()).slice(0, level >= 4 && chance(0.5) ? 3 : 2);
    if (r < 0.45) return [fruit, 'bug'];
    return Array(chance(0.5) ? 2 : 3).fill(fruit);
  }

  setRequest(d, order) {
    d.order = order;
    d.need = order.length;
    d.eaten = 0;
    d.wants = order[0];
    d.bubble.setFruit(d.wants);
    const mixed = order.some((f) => f !== order[0]);
    d.bubble.setPips(d.need, mixed ? order.map((f) => FRUIT_COLORS[f]) : null);
  }

  async startLevel(n) {
    this.level = n;
    const count = Math.min(2 + n, 6);
    const spots = this.pickSpots(count, n);
    this.lastSpots = spots;
    const types = shuffle(DINO_TYPES.slice());
    const fruits = shuffle(FRUITS.slice());
    const rescueLevel = n >= 2 && n % 2 === 0;
    const sleepyIdx = n >= 2 && chance(0.6) ? 1 + Math.floor(Math.random() * (spots.length - 1)) : -1;
    const herd = n >= 3 && spots.length >= 3;
    const pops = [];

    spots.forEach(([x, z], i) => {
      const isl = islandAt(x, z);
      const isParent = rescueLevel && i === 0;
      const isLeader = herd && i === spots.length - 1 && !isParent;
      const d = new Dino(types[i % types.length], this.ctx, {
        size: isParent ? 1.15 : isLeader ? 1.2 : 1,
        variant: isl?.kind === 'snow' ? 'snow' : null,
      });
      const faceSpawn = Math.atan2(SPAWN.x - x, SPAWN.z - z);
      d.place(x, z, n === 1 ? faceSpawn : rand(0, Math.PI * 2));
      d.home = new THREE.Vector3(x, 0, z);
      d.wanderT = rand(2, 6);
      if (isParent) {
        d.bubble.setFruit('baby');
        d.bubble.setPips(2, [0xff7eb6, 0xff7eb6]);
      } else {
        this.setRequest(d, this.makeRequest(n, fruits[i % fruits.length]));
        d.wander = n >= 2 && !isLeader && chance(0.35);
      }
      if (i === sleepyIdx && !isParent) {
        d.sleepy = true;
        d.a.sleep = 1;
        d.wander = false;
      }
      this.scene.add(d.root);
      this.scene.add(d.bubble.group);
      this.dinos.push(d);
      pops.push(d.act(() => d.popIn(0.3 + i * 0.35)));
      if (isParent) this.setupRescue(d, spots, n);
      if (isLeader) {
        // a grown-up leads a little herd of followers around the island
        d.wander = true;
        d.wanderT = rand(1, 3);
        for (let k = 0; k < 2; k++) {
          const f = new Dino(d.type, this.ctx, { size: 0.62, variant: isl?.kind === 'snow' ? 'snow' : null });
          let a = d.yaw + Math.PI + (k ? 0.6 : -0.6);
          for (let tries = 0; tries < 8 && this.world.heightAt(x + Math.sin(a) * 3.5, z + Math.cos(a) * 3.5) < 0.8; tries++) a += 0.8;
          f.place(x + Math.sin(a) * 3.5, z + Math.cos(a) * 3.5, d.yaw);
          f.leader = d;
          f.slot = k;
          f.wanderT = Infinity;
          f.home = new THREE.Vector3(f.root.position.x, 0, f.root.position.z);
          this.setRequest(f, [pick(FRUITS)]);
          this.scene.add(f.root);
          this.scene.add(f.bubble.group);
          this.dinos.push(f);
          pops.push(f.act(() => f.popIn(0.5 + i * 0.35 + k * 0.2)));
        }
      }
    });

    // gentle surprises: a cosy dusk now and then, and a soft rain shower
    this.weather.setDusk(n % 4 === 3);
    this.rainAt = n % 3 === 2 ? this.time + rand(15, 30) : Infinity;

    this.hud.setProgress(this.dinos);
    await Promise.all(pops);
  }

  async levelComplete() {
    this.state = 'celebrate';
    const A = this.anim;
    await A.wait(0.4);
    this.confetti.burst();
    this.sound.fanfare();
    this.fastooka(true);
    this.player.doStunt('roll');
    this.player.happy(true);
    const everyone = [...this.dinos, ...this.babies];
    everyone.forEach((d, i) => A.wait(0.2 + i * 0.12).then(() => d.act(() => d.jump(1.1 * Math.min(1, d.size + 0.3), Math.PI * 2, 0.55))));
    await A.wait(3.4);
    await Promise.all(everyone.map((d, i) => A.wait(i * 0.15).then(() => d.act(() => d.leave()))));
    for (const d of everyone) {
      this.scene.remove(d.root);
      this.scene.remove(d.bubble.group);
    }
    this.dinos = [];
    this.babies = [];
    this.rescue = null;
    this.hasBug = false;
    await A.wait(0.6);
    this.state = 'playing';
    await this.startLevel(this.level + 1);
  }

  // ---------- watching: stop in mid-air and frame the moment ----------

  /**
   * Lucky stops and hovers facing `face`, and the camera swings to a side view that
   * keeps him and every point from getPoints() in frame. Returns a function that ends it.
   */
  watch(face, getPoints, maxTime = 3) {
    const id = ++this.watchId;
    this.player.holdAt(face);
    this.cam.focus(getPoints);
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      if (this.watchId === id) {
        this.player.release();
        this.cam.unfocus();
      }
    };
    this.anim.wait(maxTime).then(end);
    return end;
  }

  watchDino(d, maxTime) {
    const pts = [new THREE.Vector3(), new THREE.Vector3()];
    return this.watch(d.root.position, () => {
      d.topPos(pts[0]);
      d.root.getWorldPosition(pts[1]);
      return pts;
    }, maxTime);
  }

  // ---------- feeding ----------

  async feed(d) {
    d.busy = true;
    const A = this.anim;
    const wants = d.wants;
    const endWatch = this.watchDino(d, 3);
    this.player.feedDive();
    this.sound.toss();
    this.hud.hintDone('feed');
    if (wants === 'bug') this.hasBug = false;
    const bounce = wants !== 'bug' && d.eaten > 0 && chance(0.28);
    const worm = !bounce && wants !== 'bug' && d.eaten > 0 && chance(0.25);
    d.act(() => d.openMouth());

    const fruit = makeFruit(wants);
    fruit.scale.setScalar(0.01);
    this.scene.add(fruit);
    const from = this.player.beakPos(new THREE.Vector3());

    if (bounce) {
      // the chase is fun to watch, but don't keep Lucky waiting for all of it
      A.wait(1.6).then(endWatch);
      await this.fruitBounce(d, fruit, from);
      return;
    }
    await this.throwArc(fruit, from, (o) => d.mouthPos(o), 0.6, 3);
    this.scene.remove(fruit);
    await this.dinoAte(d, worm, wants, endWatch);
    if (chance(0.3) && !this.player.stunting) {
      await A.wait(0.15);
      this.player.doStunt(pick(this.save.stunts));
    }
  }

  /** Move obj along a hop-shaped arc from `from` to wherever toFn says (it can move). */
  throwArc(obj, from, toFn, dur, arcH, spin = true) {
    const start = from.clone();
    const end = new THREE.Vector3();
    const s0 = obj.scale.x;
    return this.anim.play(dur, (_, k) => {
      toFn(end);
      obj.position.lerpVectors(start, end, k);
      obj.position.y += Math.sin(k * Math.PI) * arcH;
      if (spin) {
        obj.rotation.x = k * 7;
        obj.rotation.z = k * 4;
      }
      if (s0 < 1) obj.scale.setScalar(Math.min(1, s0 + k * 6));
    });
  }

  async dinoAte(d, worm, wants = d.wants, endWatch = null) {
    const A = this.anim;
    d.eaten++;
    d.bubble.markEaten(d.eaten);
    this.sound.gulp();
    d.mouthPos(v1);
    this.particles.puff(v1, { count: 7, color: FRUIT_COLORS[wants], speed: 3, size: 0.18, gravity: 8, life: 0.7 });
    await d.act(() => d.chew(3));
    if (worm) await this.sillyWorm(d);
    this.player.happy();
    A.wait(0.25).then(() => endWatch?.());
    if (d.eaten >= d.need) {
      await this.dinoFull(d);
    } else {
      // next thing on the list
      const next = d.order[d.eaten];
      if (next !== d.wants) {
        d.wants = next;
        d.bubble.setFruit(next);
      }
      d.busy = false;
      d.act(() => d.happyBounce());
    }
  }

  async dinoFull(d) {
    const A = this.anim;
    d.full = true;
    d.busy = false;
    d.bubble.setFruit('heart');
    d.bubble.setPips(0);
    this.hud.setProgress(this.dinos);
    this.sound.happy();
    if (chance(0.5)) this.fastooka();
    await d.act(() => d.dance());
    await A.to(d.bubble, { scale: 0 }, 0.35, ease.inBack);
    this.checkLevelDone();
  }

  checkLevelDone() {
    if (this.state === 'playing' && this.dinos.length && this.dinos.every((x) => x.full)) this.levelComplete();
  }

  async wakeDino(d) {
    d.busy = true;
    d.sleepy = false;
    this.fx.emote(d.headTop, '!');
    await d.act(() => d.wake());
    this.player.happy();
    this.sound.chirp();
    await this.anim.to(d.bubble, { scale: 1 }, 0.4, ease.outBack);
    d.busy = false;
    d.act(() => d.jump(0.6));
  }

  // ---------- moving dinosaurs ----------

  updateWander(dt) {
    if (this.state !== 'playing') return;
    const p = this.player.pos;
    for (const d of this.dinos) {
      if (!d.wander || d.full || d.busy || d.acting > 0 || d.sleepy) continue;
      d.wanderT -= dt;
      if (d.wanderT > 0) continue;
      d.wanderT = rand(4, 8);
      const dp = d.root.position;
      if (Math.hypot(dp.x - p.x, dp.z - p.z) < 14) continue; // stay put while Lucky is close
      // a short stroll near home, on land, not bumping into anyone
      for (let i = 0; i < 8; i++) {
        const a = rand(0, Math.PI * 2), r = rand(2.5, 7);
        const x = d.home.x + Math.cos(a) * r, z = d.home.z + Math.sin(a) * r;
        if (this.world.heightAt(x, z) < 1 || this.world.heightAt(x, z) > 6) continue;
        if (this.dinos.some((o) => o !== d && !o.leader && Math.hypot(o.root.position.x - x, o.root.position.z - z) < 5)) continue;
        this.dinoStroll(d, x, z);
        break;
      }
    }
  }

  dinoStroll(d, x, z) {
    const dp = d.root.position;
    const dir = v1.set(x - dp.x, 0, z - dp.z).normalize();
    d.act(() => d.walkTo(x, z, d.leader ? 3 : 2.4));
    // followers trot along behind their leader
    for (const f of this.dinos) {
      if (f.leader !== d || f.full || f.busy || f.acting > 0) continue;
      const side = f.slot ? 1 : -1;
      const fx = x - dir.x * 3.2 + dir.z * side * 1.8;
      const fz = z - dir.z * 3.2 - dir.x * side * 1.8;
      if (this.world.heightAt(fx, fz) < 0.8) continue;
      f.home.set(fx, 0, fz);
      f.act(() => this.anim.wait(0.3 + f.slot * 0.2).then(() => f.walkTo(fx, fz, 3.4)));
    }
  }

  /** Snoring z's (and a little snore sound when Lucky is near). */
  updateSleepers(dt) {
    const p = this.player.pos;
    for (const d of [...this.dinos, ...this.babies]) {
      if (d.a.sleep < 0.6) continue;
      d.nextZ -= dt;
      if (d.nextZ > 0) continue;
      d.nextZ = rand(1.3, 1.9);
      d.root.getWorldPosition(v1);
      const dist = v1.distanceTo(p);
      if (dist > 70) continue;
      this.fx.zzz(d.headTop);
      if (dist < 18) this.sound.snore(d.size < 0.6);
    }
  }

  // ---------- lost baby rescue ----------

  setupRescue(parent, spots, level) {
    // the babies are somewhere far from their parent
    const pp = parent.root.position;
    const unlockOf = (s) => islandAt(s[0], s[1])?.unlock ?? 1;
    const candidates = shuffle(DINO_SPOTS.filter((s) => !spots.includes(s) && unlockOf(s) <= level));
    let spot = candidates.find((s) => Math.hypot(s[0] - pp.x, s[1] - pp.z) > 45) ?? candidates.find((s) => Math.hypot(s[0] - pp.x, s[1] - pp.z) > 25) ?? candidates[0];
    const [x, z] = spot;
    const yaw = rand(0, Math.PI * 2);
    const babies = [0, 1].map((k) => {
      const b = new Dino(parent.type, this.ctx, { size: BABY_SIZE[parent.type], variant: parent.pal ? 'snow' : null });
      const sx = Math.cos(yaw) * (k ? 0.9 : -0.9), sz = -Math.sin(yaw) * (k ? 0.9 : -0.9);
      b.place(x + sx, z + sz, yaw + (k ? -0.4 : 0.4));
      b.noChomp = true;
      b.noHop = true;
      b.noBubble = true;
      b.full = true; // babies don't eat; they just need to get home
      b.isBaby = true;
      b.playful = k === 1;
      if (!b.playful) b.a.sleep = 1;
      b.scaredT = rand(2, 5);
      b.playT = rand(1, 3);
      b.scaredTarget = 0;
      this.scene.add(b.root);
      b.act(() => b.popIn(0.6 + k * 0.3));
      return b;
    });
    this.babies = babies;
    parent.parentOf = true;
    parent.noHop = true;
    this.rescue = { parent, babies, state: 'lost', spot: new THREE.Vector3(x, this.world.heightAt(x, z), z) };
  }

  babiesInReach() {
    const r = this.rescue;
    if (!r || r.state !== 'lost' || this.state !== 'playing') return false;
    const p = this.player.pos;
    const s = r.spot;
    const dh = Math.hypot(s.x - p.x, s.z - p.z);
    const dy = p.y - s.y;
    return dh < BABY_RANGE && dy > -1 && dy < 9;
  }

  async grabBabies() {
    const r = this.rescue;
    r.state = 'grabbing';
    const A = this.anim, p = this.player, model = p.model;
    this.hud.hintDone('catch');
    this.sound.chirp();
    this.fastooka(true);
    p.happy(true);
    p.carrying = true;
    A.to(model.a, { dangle: 1 }, 0.3, ease.outBack);

    // the sleepy one goes in his feet, the playful one hops onto his back
    const ordered = [r.babies.find((b) => !b.playful), r.babies.find((b) => b.playful)];
    await Promise.all(ordered.map(async (b, k) => {
      const mount = k === 0 ? model.feetMount : model.backMount;
      b.busy = true;
      b.a.scared = 0;
      b.scaredTarget = 0;
      if (b.playful) {
        this.fx.emote(b.headTop, 'heart');
        this.sound.dinoHappy(b.type);
      }
      await A.wait(k * 0.25);
      const from = b.root.position.clone();
      await this.throwArc(b.root, from, (o) => mount.getWorldPosition(o), 0.5, 2.2, false);
      mount.add(b.root);
      b.carried = true;
      b.root.rotation.set(0, 0, 0);
      b.yaw = 0;
      b.a.spin = 0;
      // the feet hold the sleepy baby by its back, hanging just below Lucky;
      // the other one sits snugly on his back
      const back = BACK_HEIGHT[b.type] * b.size;
      b.root.position.set(0, k === 0 ? -back + 0.08 : -0.12, 0);
      if (k === 1) b.a.squash = 0.82; // sitting down
      this.sound.pop(1.4);
      b.busy = false;
    }));
    r.state = 'carried';
  }

  updateRescue(dt, t) {
    const r = this.rescue;
    if (!r) return;
    const p = this.player;
    const model = p.model;
    for (const b of r.babies) {
      const a = b.a;
      a.scared = damp(a.scared, b.scaredTarget, 3, dt);
      if (r.state === 'lost') {
        b.root.getWorldPosition(v1);
        const near = v1.distanceTo(p.pos) < 14;
        // now and then they get a little worried... until Lucky shows up
        b.scaredT -= dt;
        if (near) {
          if (b.scaredTarget > 0 || !b.metLucky) {
            b.metLucky = true;
            b.scaredTarget = 0;
            if (b.playful && b.acting === 0) {
              this.fx.emote(b.headTop, 'heart');
              b.act(() => b.jump(0.5));
            }
          }
        } else if (b.scaredT <= 0) {
          b.scaredT = rand(6, 10);
          b.scaredTarget = b.scaredTarget > 0 ? 0 : b.playful ? 1 : 0.5;
          if (b.scaredTarget > 0 && v1.distanceTo(p.pos) < 40) this.sound.whimper();
        }
        // the awake one plays: little hops and a happy wag
        if (b.playful && b.scaredTarget === 0 && b.acting === 0) {
          b.playT -= dt;
          a.wag = 0.7;
          if (b.playT <= 0) {
            b.playT = rand(1.2, 2.6);
            b.act(() => b.jump(0.35, chance(0.3) ? Math.PI * 2 : 0, 0.35));
          }
        }
      } else if (r.state === 'carried' && b.carried) {
        if (b.playful) {
          // riding on his back, wiggling and bouncing to the wing beats
          a.wag = 1;
          a.lean = Math.sin(t * 3) * 0.12;
          a.headTilt = Math.sin(t * 2.2) * 0.18;
          b.root.position.y = -0.12 + Math.max(0, Math.sin(model.phase)) * 0.06;
          // a stunt is a bit scary... then fun
          b.scaredTarget = p.stunting ? 0.8 : 0;
        } else {
          a.lean = Math.sin(t * 1.4) * 0.06;
        }
      }
    }

    if (r.state === 'carried') {
      if (!p.stunting) model.a.dangle = damp(model.a.dangle, 1, 6, dt);
      const pp = r.parent.root.position;
      if (Math.hypot(pp.x - p.pos.x, pp.z - p.pos.z) < HOME_RANGE && p.pos.y - pp.y < 18) this.reunion();
    }
  }

  async reunion() {
    const r = this.rescue;
    r.state = 'home';
    const A = this.anim, p = this.player, parent = r.parent;
    const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const endWatch = this.watch(parent.root.position, () => {
      parent.topPos(pts[0]);
      parent.root.getWorldPosition(pts[1]);
      r.babies[0].root.getWorldPosition(pts[2]);
      r.babies[1].root.getWorldPosition(pts[3]);
      return pts;
    }, 5.5);
    parent.busy = true;
    this.fx.emote(parent.headTop, '!');
    this.sound.surprise();

    // drop down beside the parent
    const pp = parent.root.position;
    const fwd = parent.forward(v1).clone();
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    await A.wait(0.5);
    await Promise.all(r.babies.map(async (b, k) => {
      await A.wait(k * 0.2);
      this.scene.attach(b.root);
      b.carried = false;
      b.root.rotation.set(0, 0, 0);
      b.yaw = p.yaw;
      b.a.squash = 1;
      b.a.lean = 0;
      let x = pp.x + fwd.x * 2.6 * parent.size + side.x * (k ? 1.4 : -1.4);
      let z = pp.z + fwd.z * 2.6 * parent.size + side.z * (k ? 1.4 : -1.4);
      if (this.world.heightAt(x, z) < 0.8) {
        x = pp.x + side.x * (k ? 2.6 : -2.6);
        z = pp.z + side.z * (k ? 2.6 : -2.6);
      }
      const land = new THREE.Vector3(x, this.world.heightAt(x, z), z);
      await this.throwArc(b.root, b.root.position.clone(), (o) => o.copy(land), 0.7, 2.5, false);
      b.root.position.copy(land);
      b.yaw = Math.atan2(pp.x - x, pp.z - z);
      this.sound.pop(1.2);
      this.particles.puff(v2.copy(land).setY(land.y + 0.3), { count: 6, color: 0xffffff, speed: 2, size: 0.4 });
    }));
    p.carrying = false;
    A.to(p.model.a, { dangle: 0 }, 0.4);

    // the sleepy one wakes up, everyone bounces, and the parent gives them a cuddle
    const sleepy = r.babies.find((b) => !b.playful);
    await sleepy.act(() => sleepy.wake());
    parent.bubble.markEaten(2);
    for (const b of r.babies) {
      b.a.wag = 1;
      b.act(() => b.jump(0.5, Math.PI * 2, 0.4));
      this.fx.emote(b.headTop, 'heart');
    }
    this.sound.dinoHappy(parent.type);
    await A.wait(0.5);
    const between = r.babies[0].root.position.clone().add(r.babies[1].root.position).multiplyScalar(0.5);
    await parent.act(() => parent.nuzzle(between));
    endWatch();
    this.fastooka(true);
    p.happy(true);
    parent.busy = false;
    this.dinoFull(parent);
    // babies stay close and keep bouncing
    for (const b of r.babies) {
      b.act(async () => {
        for (let i = 0; i < 3; i++) {
          await A.wait(rand(0.3, 0.8));
          await b.jump(0.4);
        }
      });
    }
  }

  // ---------- eggs and rings ----------

  updateCollectibles(dt, t) {
    const ev = this.collect.update(dt, t, this.player.pos);
    if (ev.egg) {
      const e = ev.egg;
      this.collect.hideEgg(e);
      this.save.eggs.push(e.i);
      storeSave(this.save);
      this.sound.egg();
      this.particles.puff(e.g.position, { count: 16, color: [0xffb3d1, 0x8fd3ff, 0x9be38a, 0xffd23f], speed: 5, size: 0.3, life: 0.9 });
      this.hud.setEggs(this.save.eggs.length, true);
      this.fastooka(true);
      this.player.happy(true);
      if (this.save.eggs.length >= this.collect.eggs.length && !this.save.crests.includes('purple')) {
        this.anim.wait(1).then(() => this.unlock({ crest: 'purple' }));
      }
    }
    if (ev.ring) {
      const { ring, chain } = ev.ring;
      this.sound.ring(chain - 1);
      this.particles.puff(ring.g.position, { count: 10, color: [0xffd23f, 0xff7eb6, 0xffffff], speed: 4, size: 0.25, life: 0.6 });
      this.player.push.addScaledVector(this.player.forward(v1), 7); // whoosh!
      this.player.model.a.shake = 0.8;
      if (chain === this.collect.rings.length) {
        this.fastooka(true);
        this.player.doStunt('roll');
      }
    }
  }

  // ---------- bugs and snacks ----------

  async catchBug(b) {
    const A = this.anim;
    this.bugs.catch(b);
    this.hud.hintDone('catch');
    this.player.gobble();
    this.sound.chirp();
    const start = b.g.position.clone();
    await A.play(0.16, (e) => b.g.position.lerpVectors(start, this.player.beakPos(v2), e), ease.inQuad);
    await A.play(0.4, (_, k) => {
      b.g.position.copy(this.player.beakPos(v2));
      b.g.rotation.z = Math.sin(k * 40) * 0.7;
      b.g.scale.setScalar(1.35 * (1 - k * 0.7));
      this.bugs.flap(b, this.time);
    });
    b.g.rotation.z = 0;
    b.g.scale.setScalar(1.35);
    this.bugs.finish(b);
    this.player.happy();
    this.addSnack();
    // someone asked for a bug? keep this one in his beak to share
    if (this.dinos.some((d) => !d.full && d.order?.includes('bug') && d.wants === 'bug')) {
      this.hasBug = true;
      this.sound.pop(1.6);
    } else {
      this.sound.gulp();
      this.particles.puff(this.player.beakPos(v1), { count: 8, color: [0xfff36b, 0xd4ff4a, 0xffffff], speed: 3, size: 0.18, life: 0.6 });
    }
    if (chance(0.3)) this.fastooka();
  }

  addSnack() {
    const s = this.save;
    s.snacks++;
    this.hud.setSnacks(s.snacks, true);
    const u = UNLOCKS.find((x) => x.at === s.snacks);
    if (u) this.unlock(u);
    storeSave(s);
  }

  unlock(u) {
    const s = this.save;
    if (u.crest && !s.crests.includes(u.crest)) {
      s.crests.push(u.crest);
      this.setCrest(u.crest);
      this.hud.showUnlock(ICONS.crest.replace('var(--crest, #ffd23f)', '#' + CREST_COLORS[u.crest].toString(16).padStart(6, '0')));
    }
    if (u.stunt && !s.stunts.includes(u.stunt)) {
      s.stunts.push(u.stunt);
      this.hud.showUnlock(ICONS.stunt.replaceAll('#fff', '#9b5de5'));
      setTimeout(() => this.player.doStunt(u.stunt), 600);
    }
    this.sound.unlockJingle();
    this.fastooka(true);
    this.player.happy(true);
    storeSave(s);
  }

  setCrest(name) {
    this.save.crest = name;
    this.player.model.setCrestColor(CREST_COLORS[name]);
    this.hud.setCrest(CREST_COLORS[name], this.save.crests.length > 1);
    storeSave(this.save);
  }

  cycleCrest() {
    const list = this.save.crests;
    const next = list[(list.indexOf(this.save.crest) + 1) % list.length];
    this.setCrest(next);
    this.player.happy();
    this.sound.chirp();
  }

  toggleMute() {
    this.save.muted = !this.save.muted;
    this.sound.setMuted(this.save.muted);
    this.hud.setMuted(this.save.muted);
    storeSave(this.save);
  }

  // ---------- stunts and Fastooka ----------

  stunt() {
    const p = this.player;
    if (p.stuntCooldown > 0 || p.stunting) return;
    const list = this.save.stunts;
    const kind = list[this.stuntCount % list.length];
    this.stuntCount++;
    p.doStunt(kind);
    this.hud.stuntCooling(1.4);
    if (chance(0.2)) this.fastooka();
  }

  fastooka(force = false) {
    if (!force && this.cool.fastooka > 0) return;
    this.cool.fastooka = 3.5;
    this.fx.fastooka(this.player.model.head);
    this.sound.fastooka();
    this.player.model.a.shake = 1.2;
  }

  // ---------- silly moments ----------

  updateSilly(dt) {
    if (this.state !== 'playing' || this.player.hold) return;
    const p = this.player;
    for (const d of this.dinos) {
      if (d.full || d.sleepy || d.parentOf) continue;
      d.mouthPos(v1);
      const dist = v1.distanceTo(p.pos);
      const near = dist < 3.8;
      const idle = !d.busy && d.acting === 0;
      // flew too close: sneeze!
      if (near && !d.wasNear && idle && this.cool.sneeze <= 0 && chance(0.6)) {
        this.cool.sneeze = 14;
        this.sillySneeze(d);
      }
      d.wasNear = near;
      // hovering nearby: try to grab him with a tongue (and miss)
      if (dist > 4.5 && dist < 10 && idle && this.cool.tongue <= 0 && chance(dt * 0.35)) {
        this.cool.tongue = 16;
        this.sillyTongue(d);
      }
    }
  }

  async sillySneeze(d) {
    d.busy = true;
    await d.act(() =>
      d.sneeze(() => {
        d.mouthPos(v1);
        if (v1.distanceTo(this.player.pos) < 9) {
          this.player.knockback(v2.copy(this.player.pos).sub(v1));
          this.fastooka(true);
        }
      }),
    );
    d.busy = false;
  }

  async sillyTongue(d) {
    d.busy = true;
    const p = this.player;
    // aim where he's going, but a little off, so it always misses
    const side = new THREE.Vector3(p.fwd.z, 0, -p.fwd.x).multiplyScalar(chance(0.5) ? 1.4 : -1.4);
    const target = p.pos.clone().addScaledVector(p.fwd, p.speed * 0.3).add(side).add(new THREE.Vector3(0, 0.6, 0));
    this.anim.wait(0.3).then(() => {
      p.happy();
      this.sound.chirp();
      p.vSpeed += 2.5;
    });
    await d.act(() => d.tongueGrab(target));
    d.busy = false;
    if (chance(0.5)) this.fastooka();
  }

  /** The fruit bonks off the dino's head and rolls away; everyone chases it. */
  async fruitBounce(d, fruit, from) {
    const A = this.anim, world = this.world;
    const wants = d.wants;
    await this.throwArc(fruit, from, (o) => d.headTop.getWorldPosition(o).add(v2.set(0, -0.4, 0)), 0.6, 3);
    this.sound.boing();
    d.act(async () => {
      await A.to(d.a, { squash: 0.72, eyes: 1.5, jaw: 0 }, 0.08);
      await A.play(0.5, (_, k) => (d.a.squash = 1 - 0.28 * (1 - ease.outElastic(k))));
      await A.to(d.a, { eyes: 1 }, 0.3);
    });
    this.fx.emote(d.headTop, '!');

    // find a landing spot on the same island
    const dp = d.root.position;
    let land = null;
    for (let i = 0; i < 12 && !land; i++) {
      const a = rand(0, Math.PI * 2), r = rand(5, 7);
      const x = dp.x + Math.cos(a) * r, z = dp.z + Math.sin(a) * r;
      if (world.heightAt(x, z) > 0.8) land = new THREE.Vector3(x, world.heightAt(x, z) + 0.35, z);
    }
    if (!land) land = new THREE.Vector3(dp.x + 2, world.heightAt(dp.x + 2, dp.z) + 0.35, dp.z);
    await this.throwArc(fruit, fruit.position, (o) => o.copy(land), 0.7, 2.5);
    this.sound.pop(0.7);

    // roll a little further
    const dir = v2.copy(land).sub(dp).setY(0).normalize();
    const rollEnd = land.clone().addScaledVector(dir, 2);
    if (world.heightAt(rollEnd.x, rollEnd.z) < 0.8) rollEnd.copy(land);
    const r0 = land.clone();
    await A.play(0.7, (e, k) => {
      fruit.position.lerpVectors(r0, rollEnd, e);
      fruit.position.y = world.heightAt(fruit.position.x, fruit.position.z) + 0.35 + Math.abs(Math.sin(k * Math.PI * 2)) * 0.35 * (1 - k);
      fruit.rotation.x += 0.25;
    }, ease.outQuad);
    this.fastooka(true);

    // everybody nearby hurries over to look
    for (const o of this.dinos) {
      if (o === d || o.busy || o.acting > 0 || o.sleepy) continue;
      const op = o.root.position;
      const dist = Math.hypot(op.x - rollEnd.x, op.z - rollEnd.z);
      if (dist > 26) continue;
      const k = Math.min(3, dist - 4) / dist;
      if (k <= 0) continue;
      o.busy = true;
      o.act(async () => {
        await o.walkTo(op.x + (rollEnd.x - op.x) * k, op.z + (rollEnd.z - op.z) * k, 4);
        await o.jump(0.5);
        o.busy = false;
      });
    }

    // the hungry one gets there first
    const toDino = v2.copy(dp).sub(rollEnd).setY(0).normalize();
    const stop = rollEnd.clone().addScaledVector(toDino, d.type === 'longneck' ? 2.4 : 1.8);
    if (world.heightAt(stop.x, stop.z) < 0.8) stop.copy(dp);
    await d.act(() => d.walkTo(stop.x, stop.z, 4.5));
    await d.act(async () => {
      d.yaw = Math.atan2(rollEnd.x - d.root.position.x, rollEnd.z - d.root.position.z);
      await A.to(d.a, { headLift: -0.45, jaw: 1.2 }, 0.2);
      await this.throwArc(fruit, fruit.position, (o) => d.mouthPos(o), 0.25, 0.4, false);
      await A.to(d.a, { headLift: 0 }, 0.3);
    });
    this.scene.remove(fruit);
    d.home.set(d.root.position.x, 0, d.root.position.z);
    await this.dinoAte(d, false, wants);
  }

  /** Something in the fruit wiggles! A silly worm pops out and wriggles off. */
  async sillyWorm(d) {
    const A = this.anim;
    const worm = new THREE.Group();
    const segs = [];
    for (let i = 0; i < 4; i++) segs.push(mesh('sphere', 0xff8fb1, { s: 0.17 - i * 0.015, p: [0, 0, -i * 0.2], parent: worm }));
    for (const sx of [-1, 1]) {
      mesh('sphere', 0xffffff, { s: 0.07, p: [sx * 0.07, 0.1, 0.1], parent: worm });
      mesh('sphere', 0x1d1d2b, { s: 0.035, p: [sx * 0.07, 0.11, 0.16], parent: worm });
    }
    worm.scale.setScalar(0.01);
    this.scene.add(worm);
    d.act(() => d.surprised());
    await A.play(1.1, (_, k) => {
      d.mouthPos(v1);
      worm.position.copy(v1).add(v2.set(0, 0.15 + Math.sin(k * Math.PI) * 0.5, 0));
      worm.lookAt(this.camera.position);
      worm.scale.setScalar(Math.min(1.6, k * 8));
      segs.forEach((s, i) => (s.position.x = Math.sin(this.time * 18 + i * 1.2) * 0.12));
    });
    this.fastooka(true);
    const dp = d.root.position;
    const a = rand(0, Math.PI * 2);
    const gx = dp.x + Math.cos(a) * 3, gz = dp.z + Math.sin(a) * 3;
    const land = new THREE.Vector3(gx, Math.max(this.world.heightAt(gx, gz), 0) + 0.2, gz);
    await this.throwArc(worm, worm.position, (o) => o.copy(land), 0.6, 2, false);
    this.sound.pop(1.3);
    const from = land.clone();
    await A.play(1.2, (_, k) => {
      worm.position.copy(from).addScaledVector(v2.set(Math.cos(a), 0, Math.sin(a)), k * 2);
      worm.position.y = Math.max(this.world.heightAt(worm.position.x, worm.position.z), 0) + 0.2 + Math.abs(Math.sin(k * 12)) * 0.1;
      worm.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
      segs.forEach((s, i) => (s.position.y = Math.abs(Math.sin(this.time * 12 + i)) * 0.1));
      worm.scale.setScalar(1.6 * (1 - k * k));
    });
    this.scene.remove(worm);
  }

  // ---------- guide arrow: hungry dinosaurs, lost babies, or home to their parent ----------

  buildArrow() {
    const g = new THREE.Group();
    const inner = group(g);
    const mat = toon(0xff8a00, {});
    mesh('cone', mat, { s: [0.38, 0.7, 0.38], p: [0, 0, 0.75], r: [Math.PI / 2, 0, 0], parent: inner });
    mesh('cyl', mat, { s: [0.15, 0.8, 0.15], p: [0, 0, 0.05], r: [Math.PI / 2, 0, 0], parent: inner });
    g.scale.setScalar(0.001);
    this.arrowScale = 0;
    this.arrowMat = mat;
    this.scene.add(g);
    return g;
  }

  updateArrow(dt, t) {
    const p = this.player.pos;
    let target = null, best = Infinity;
    const r = this.rescue;
    const consider = (pos) => {
      const dd = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (dd < best) {
        best = dd;
        target = pos;
      }
    };
    if (r && (r.state === 'carried' || r.state === 'grabbing')) {
      consider(r.parent.root.position); // babies on board: straight home
    } else {
      for (const d of this.dinos) {
        if (d.full) continue;
        if (d.parentOf) {
          if (r?.state === 'lost') consider(r.spot);
          continue;
        }
        consider(d.root.position);
      }
    }
    const carrying = this.player.carrying;
    const show = target && best > (carrying ? 14 : 24) && this.state === 'playing' && !this.player.hold;
    this.arrowScale = damp(this.arrowScale, show ? 1 : 0, 6, dt);
    this.arrow.scale.setScalar(Math.max(this.arrowScale, 0.001));
    this.arrow.visible = this.arrowScale > 0.01;
    this.arrowMat.color.setHex(carrying ? 0xff5fa2 : 0xff8a00);
    if (!target) return;
    this.arrow.position.set(p.x, p.y + 1.7 + (carrying ? 0.6 : 0) + Math.sin(t * 4) * 0.12, p.z);
    this.arrow.rotation.order = 'YXZ';
    this.arrow.rotation.y = Math.atan2(target.x - p.x, target.z - p.z);
    this.arrow.rotation.x = -clamp(Math.atan2(target.y + 2 - p.y, best), -0.6, 0.6);
    this.arrow.children[0].position.z = Math.sin(t * 6) * 0.15;
  }
}
