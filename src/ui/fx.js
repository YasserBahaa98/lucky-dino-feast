import * as THREE from 'three';
import { ICONS } from './icons.js';

const v = new THREE.Vector3();

/**
 * DOM effects pinned to 3D objects: the "Fastooka!" word bubble, hearts, "!" and "?".
 */
export class Fx {
  constructor(layer, camera) {
    this.layer = layer;
    this.camera = camera;
    this.items = [];
  }

  /** target: an Object3D, or a function returning a Vector3 */
  add(target, className, html, life, offsetY = 0) {
    const el = document.createElement('div');
    el.className = `fx ${className}`;
    el.innerHTML = `<div class="fx-inner">${html}</div>`;
    this.layer.appendChild(el);
    const item = { el, target, life, offsetY, age: 0 };
    this.items.push(item);
    this.place(item);
    return item;
  }

  emote(target, kind) {
    const html = kind === 'heart' ? ICONS.heart : kind;
    return this.add(target, 'fx-emote', html, 1.2, 0.4);
  }

  /** A floating "z" for sleepy dinosaurs. */
  zzz(target) {
    return this.add(target, 'fx-emote fx-zzz', 'z', 1.8, 0.3);
  }

  fastooka(target) {
    // only one Fastooka bubble at a time
    for (const it of this.items) if (it.el.classList.contains('fx-fastooka')) it.life = Math.min(it.life, it.age + 0.01);
    return this.add(target, 'fx-fastooka', 'Fastooka!', 1.6, 1.4);
  }

  place(item) {
    if (typeof item.target === 'function') v.copy(item.target());
    else item.target.getWorldPosition(v);
    v.y += item.offsetY;
    v.project(this.camera);
    const hidden = v.z > 1;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    item.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    item.el.style.visibility = hidden ? 'hidden' : 'visible';
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.age >= it.life) {
        if (!it.leaving) {
          it.leaving = true;
          it.el.classList.add('out');
          it.life += 0.3;
        } else {
          it.el.remove();
          this.items.splice(i, 1);
          continue;
        }
      }
      this.place(it);
    }
  }
}
