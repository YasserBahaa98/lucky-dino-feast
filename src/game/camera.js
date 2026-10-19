import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../util/math.js';

const box = new THREE.Box3();
const mid = new THREE.Vector3();
const side = new THREE.Vector3();
const tmp = new THREE.Vector3();
const boxSize = new THREE.Vector3();

/**
 * Third-person camera behind and above Lucky. It never rolls (stays level even
 * during stunts) and follows smoothly so the screen never spins.
 *
 * focus(points) swings it round to a side-on "two-shot" that keeps Lucky and
 * whatever he's watching (a dinosaur eating, a family reunion) in frame together.
 */
export class FollowCam {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.want = new THREE.Vector3();
    this.wantLook = new THREE.Vector3();
    this.subjects = null; // function returning Vector3[] to keep in frame
    this.sideSign = 1;
    this.focusK = 0;
  }

  desired(player, out) {
    const p = player.pos;
    const dist = 8.5 + (player.speed - 6) * 0.3;
    const height = 3.0 + clamp(-player.vSpeed * 0.15, -0.6, 0.8);
    out.set(p.x - Math.sin(this.yaw) * dist, p.y + height, p.z - Math.cos(this.yaw) * dist);
    out.y = Math.max(out.y, this.world.floorAt(out.x, out.z) + 1.5);
    return out;
  }

  /** Frame these points (plus Lucky) until unfocus(). getPoints() is called every frame. */
  focus(getPoints) {
    this.subjects = getPoints;
    this.sideSign = 0; // pick a side on the next update
  }

  unfocus() {
    this.subjects = null;
  }

  /** Side-on view that fits every point on screen. */
  twoShot(player, outPos, outLook) {
    const pts = this.subjects();
    box.makeEmpty();
    box.expandByPoint(player.pos);
    for (const p of pts) box.expandByPoint(p);
    box.getCenter(mid);
    const size = box.getSize(boxSize);

    // look across the line between Lucky and the first subject
    const a = pts[0];
    side.set(a.z - player.pos.z, 0, -(a.x - player.pos.x));
    if (side.lengthSq() < 0.01) side.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    side.normalize();
    if (this.sideSign === 0) {
      // stay on whichever side the camera is already closest to, so it doesn't whip round
      this.sideSign = side.dot(tmp.copy(this.pos).sub(mid)) >= 0 ? 1 : -1;
    }
    side.multiplyScalar(this.sideSign);

    // pull back far enough for both width and height to fit, with some room to spare
    const cam = this.camera;
    const vHalf = THREE.MathUtils.degToRad(cam.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * cam.aspect);
    const width = Math.hypot(size.x, size.z) + 3;
    const height = size.y + 3;
    let dist = Math.max(width / 2 / Math.tan(hHalf), height / 2 / Math.tan(vHalf));
    dist = clamp(dist * 1.15, 7, 30);

    outPos.copy(mid).addScaledVector(side, dist);
    // tuck slightly behind Lucky so he stays the "near" subject
    outPos.addScaledVector(tmp.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)), -dist * 0.25);
    outPos.y = mid.y + 1.5 + dist * 0.12;
    outPos.y = Math.max(outPos.y, this.world.floorAt(outPos.x, outPos.z) + 1.5);
    outLook.copy(mid);
  }

  snap(player) {
    this.yaw = player.yaw;
    this.desired(player, this.pos);
    this.look.copy(player.pos);
    this.apply();
  }

  update(dt, player) {
    // lag a little behind his turns, so the view swings gently with him
    this.yaw = dampAngle(this.yaw, player.yaw + player.turn * 0.18, 2.6, dt);
    const p = player.pos;
    this.focusK = damp(this.focusK, this.subjects ? 1 : 0, 3, dt);

    if (this.subjects) {
      this.twoShot(player, this.want, this.wantLook);
      this.pos.lerp(this.want, 1 - Math.exp(-3 * dt));
      this.look.lerp(this.wantLook, 1 - Math.exp(-4 * dt));
    } else {
      this.desired(player, this.want);
      // ease back in from a two-shot, then follow at normal speed
      const k = 1 - this.focusK * 0.6;
      this.pos.x = damp(this.pos.x, this.want.x, 6 * k, dt);
      this.pos.z = damp(this.pos.z, this.want.z, 6 * k, dt);
      this.pos.y = damp(this.pos.y, this.want.y, 4 * k, dt);
      this.look.x = damp(this.look.x, p.x + Math.sin(this.yaw) * 2, 10 * k, dt);
      this.look.y = damp(this.look.y, p.y + 0.6, 10 * k, dt);
      this.look.z = damp(this.look.z, p.z + Math.cos(this.yaw) * 2, 10 * k, dt);
    }
    this.apply();
  }

  apply() {
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
  }
}
