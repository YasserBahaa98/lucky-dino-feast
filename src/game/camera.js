import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../util/math.js';

/**
 * Third-person camera behind and above Lucky. It never rolls (stays level even
 * during stunts) and follows smoothly so the screen never spins.
 */
export class FollowCam {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.want = new THREE.Vector3();
  }

  desired(player, out) {
    const p = player.pos;
    const dist = 8.5 + (player.speed - 6) * 0.3;
    const height = 3.0 + clamp(-player.vSpeed * 0.15, -0.6, 0.8);
    out.set(p.x - Math.sin(this.yaw) * dist, p.y + height, p.z - Math.cos(this.yaw) * dist);
    out.y = Math.max(out.y, this.world.floorAt(out.x, out.z) + 1.5);
    return out;
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
    this.desired(player, this.want);
    this.pos.x = damp(this.pos.x, this.want.x, 6, dt);
    this.pos.z = damp(this.pos.z, this.want.z, 6, dt);
    this.pos.y = damp(this.pos.y, this.want.y, 4, dt);
    const p = player.pos;
    this.look.x = damp(this.look.x, p.x + Math.sin(this.yaw) * 2, 10, dt);
    this.look.y = damp(this.look.y, p.y + 0.6, 10, dt);
    this.look.z = damp(this.look.z, p.z + Math.cos(this.yaw) * 2, 10, dt);
    this.apply();
  }

  apply() {
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
  }
}
