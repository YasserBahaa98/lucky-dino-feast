import * as THREE from 'three';
import { Animator, ease } from '../util/tween.js';
import { rand, chance, pick, shuffle, clamp, damp } from '../util/math.js';
import { mesh, group, toon } from '../util/shapes.js';
import { World, DINO_SPOTS } from '../world/world.js';
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
const SPAWN = { x: 0, y: 9, z: -30, yaw: 0 };

// Snack rewards: reasons to catch bugs, never required.
const UNLOCKS = [
  { at: 10, crest: 'pink' },
  { at: 25, stunt: 'loop' },
  { at: 40, crest: 'blue' },
];

const FRUIT_COLORS = { apple: 0xff4d4d, banana: 0xffe14d, grapes: 0x9b5de5, orange: 0xffa024 };

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

export class Game {
  constructor(canvas) {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(0xcdeeff, 130, 420);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1300);
    scene.add(new THREE.HemisphereLight(0xe4f5ff, 0x9c8a62, 1.5));
    const sun = new THREE.DirectionalLight(0xfff4dc, 2.2);
    sun.position.set(60, 100, 40);
    scene.add(sun);

    this.anim = new Animator();
    this.sound = new Sound();
    this.world = new World(scene);
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
    this.hud = new Hud(this);
    this.player.model.setCrestColor(CREST_COLORS[this.save.crest] ?? CREST_COLORS.yellow);
    this.hud.setCrest(CREST_COLORS[this.save.crest], this.save.crests.length > 1);
    this.hud.setSnacks(this.save.snacks);
    this.hud.setMuted(this.save.muted);

    this.dinos = [];
    this.level = 0;
    this.state = 'title';
    this.time = 0;
    this.cool = { fastooka: 0, sneeze: 8, tongue: 10 };
    this.stuntCount = 0;
    this.feedTarget = null;
    this.catchTarget = null;
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
    this.bugs.update(dt, t);
    this.world.update(dt, t);
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

    // what can Lucky feed or catch right now?
    let feed = null, best = Infinity;
    for (const d of this.dinos) {
      if (d.full || d.busy || d.leaving) continue;
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
    const bug = this.bugs.nearest(p.pos, CATCH_RANGE);
    this.feedTarget = feed;
    this.catchTarget = bug;
    p.assist = !!feed || !!bug;
    this.hud.setFeed(feed);
    this.hud.setCatch(!!bug);

    if (input.consume('feed') && feed) this.feed(feed);
    if (input.consume('catch') && bug) this.catchBug(bug);
    if (input.consume('stunt')) this.stunt();
    input.clearTaps();

    // glide up and over any dinosaur in the way
    p.extraFloor = -Infinity;
    for (const d of this.dinos) {
      const dp = d.root.position;
      const dh = Math.hypot(dp.x - p.pos.x, dp.z - p.pos.z);
      if (dh < d.radius + 1.2) p.extraFloor = Math.max(p.extraFloor, dp.y + d.height * d.a.scale + 0.6);
    }
    p.update(dt, t, input.held);
    this.cam.update(dt, p);
    this.hud.updateHints(dt, input.held, !!feed, !!bug);
    this.updateSilly(dt);
    this.updateArrow(dt, t);
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

  pickSpots(count, first) {
    if (first) return DINO_SPOTS.slice(0, count);
    const spots = shuffle(DINO_SPOTS.slice());
    const out = [];
    for (const s of spots) {
      if (out.every((o) => Math.hypot(o[0] - s[0], o[1] - s[1]) > 14)) out.push(s);
      if (out.length === count) break;
    }
    return out;
  }

  async startLevel(n) {
    this.level = n;
    const count = Math.min(2 + n, 6);
    const spots = this.pickSpots(count, n === 1);
    const types = shuffle(DINO_TYPES.slice());
    const fruits = shuffle(FRUITS.slice());
    const pops = [];
    spots.forEach(([x, z], i) => {
      const d = new Dino(types[i % types.length], this.ctx);
      const faceSpawn = Math.atan2(SPAWN.x - x, SPAWN.z - z);
      d.place(x, z, n === 1 ? faceSpawn : rand(0, Math.PI * 2));
      d.wants = fruits[i % fruits.length];
      d.need = n === 1 ? 2 : chance(0.5) ? 2 : 3;
      d.eaten = 0;
      d.bubble.setFruit(d.wants);
      d.bubble.setPips(d.need);
      this.scene.add(d.root);
      this.scene.add(d.bubble.group);
      this.dinos.push(d);
      pops.push(d.act(() => d.popIn(0.3 + i * 0.35)));
    });
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
    this.dinos.forEach((d, i) => A.wait(0.2 + i * 0.12).then(() => d.act(() => d.jump(1.1, Math.PI * 2, 0.55))));
    await A.wait(3.4);
    await Promise.all(this.dinos.map((d, i) => A.wait(i * 0.15).then(() => d.act(() => d.leave()))));
    for (const d of this.dinos) {
      this.scene.remove(d.root);
      this.scene.remove(d.bubble.group);
    }
    this.dinos = [];
    await A.wait(0.6);
    this.state = 'playing';
    await this.startLevel(this.level + 1);
  }

  // ---------- feeding ----------

  async feed(d) {
    d.busy = true;
    const A = this.anim;
    this.player.feedDive();
    this.sound.toss();
    this.hud.hintDone('feed');
    const bounce = d.eaten > 0 && chance(0.28);
    const worm = !bounce && d.eaten > 0 && chance(0.25);
    d.act(() => d.openMouth());

    const fruit = makeFruit(d.wants);
    fruit.scale.setScalar(0.01);
    this.scene.add(fruit);
    const from = this.player.beakPos(new THREE.Vector3());

    if (bounce) {
      await this.fruitBounce(d, fruit, from);
      return;
    }
    await this.throwArc(fruit, from, (o) => d.mouthPos(o), 0.6, 3);
    this.scene.remove(fruit);
    await this.dinoAte(d, worm);
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

  async dinoAte(d, worm) {
    const A = this.anim;
    d.eaten++;
    d.bubble.markEaten(d.eaten);
    this.sound.gulp();
    d.mouthPos(v1);
    this.particles.puff(v1, { count: 7, color: FRUIT_COLORS[d.wants], speed: 3, size: 0.18, gravity: 8, life: 0.7 });
    await d.act(() => d.chew(3));
    if (worm) await this.sillyWorm(d);
    this.player.happy();
    if (d.eaten >= d.need) {
      await this.dinoFull(d);
    } else {
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
    const allFull = this.dinos.every((x) => x.full);
    await d.act(() => d.dance());
    await A.to(d.bubble, { scale: 0 }, 0.35, ease.inBack);
    if (allFull && this.state === 'playing') this.levelComplete();
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
    this.sound.gulp();
    this.particles.puff(this.player.beakPos(v1), { count: 8, color: [0xfff36b, 0xd4ff4a, 0xffffff], speed: 3, size: 0.18, life: 0.6 });
    this.bugs.finish(b);
    this.player.happy();
    this.addSnack();
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
    if (this.state !== 'playing') return;
    const p = this.player;
    for (const d of this.dinos) {
      if (d.full) continue;
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
      if (o === d || o.busy || o.acting > 0) continue;
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
    await this.dinoAte(d, false);
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

  // ---------- guide arrow toward the nearest hungry dinosaur ----------

  buildArrow() {
    const g = new THREE.Group();
    const inner = group(g);
    const mat = toon(0xff8a00, {});
    mesh('cone', mat, { s: [0.38, 0.7, 0.38], p: [0, 0, 0.75], r: [Math.PI / 2, 0, 0], parent: inner });
    mesh('cyl', mat, { s: [0.15, 0.8, 0.15], p: [0, 0, 0.05], r: [Math.PI / 2, 0, 0], parent: inner });
    g.scale.setScalar(0.001);
    this.arrowScale = 0;
    this.scene.add(g);
    return g;
  }

  updateArrow(dt, t) {
    const p = this.player.pos;
    let target = null, best = Infinity;
    for (const d of this.dinos) {
      if (d.full) continue;
      const dd = Math.hypot(d.root.position.x - p.x, d.root.position.z - p.z);
      if (dd < best) {
        best = dd;
        target = d;
      }
    }
    const show = target && best > 24 && this.state === 'playing';
    this.arrowScale = damp(this.arrowScale, show ? 1 : 0, 6, dt);
    this.arrow.scale.setScalar(Math.max(this.arrowScale, 0.001));
    this.arrow.visible = this.arrowScale > 0.01;
    if (!target) return;
    this.arrow.position.set(p.x, p.y + 1.7 + Math.sin(t * 4) * 0.12, p.z);
    const tp = target.root.position;
    this.arrow.rotation.order = 'YXZ';
    this.arrow.rotation.y = Math.atan2(tp.x - p.x, tp.z - p.z);
    this.arrow.rotation.x = -clamp(Math.atan2(tp.y + 2 - p.y, best), -0.6, 0.6);
    this.arrow.children[0].position.z = Math.sin(t * 6) * 0.15;
  }
}
