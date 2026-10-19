import * as THREE from 'three';

// Three-step toon ramp gives everything a soft, cartoon look.
const gradientMap = (() => {
  const t = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const cache = new Map();

/** Shared toon material per color. Pass opts for a unique (non-shared) material. */
export function toon(color, opts) {
  if (!opts) {
    let m = cache.get(color);
    if (!m) {
      m = new THREE.MeshToonMaterial({ color, gradientMap });
      cache.set(color, m);
    }
    return m;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap, ...opts });
}

const basicCache = new Map();
export function basic(color) {
  let m = basicCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    basicCache.set(color, m);
  }
  return m;
}

export const GEO = {
  sphere: new THREE.SphereGeometry(1, 18, 13),
  low: new THREE.SphereGeometry(1, 12, 9),
  cone: new THREE.ConeGeometry(1, 1, 16),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  circle: new THREE.CircleGeometry(1, 32),
};

/** Make a mesh from a shared geometry name (or geometry) and a color (or material). */
export function mesh(geo, mat, { s = 1, p, r, parent } = {}) {
  const m = new THREE.Mesh(typeof geo === 'string' ? GEO[geo] : geo, typeof mat === 'number' ? toon(mat) : mat);
  if (Array.isArray(s)) m.scale.set(s[0], s[1], s[2]);
  else m.scale.setScalar(s);
  if (p) m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (parent) parent.add(m);
  return m;
}

export function group(parent, p, r) {
  const g = new THREE.Group();
  if (p) g.position.set(p[0], p[1], p[2]);
  if (r) g.rotation.set(r[0], r[1], r[2]);
  if (parent) parent.add(g);
  return g;
}

/** A big cartoon eye: white, dark pupil, shiny highlight. Returns the eye group. */
export function cuteEye(parent, p, size, outward) {
  const g = group(parent, p, [0, outward, 0]);
  mesh('sphere', 0xffffff, { s: size, parent: g });
  mesh('sphere', 0x1d1d2b, { s: size * 0.62, p: [0, size * 0.05, size * 0.48], parent: g });
  mesh('sphere', basic(0xffffff), { s: size * 0.2, p: [size * 0.18, size * 0.28, size * 0.98], parent: g });
  return g;
}

/** Soft round shadow blob that sits on the ground. */
const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(20,40,60,0.45)');
  grd.addColorStop(1, 'rgba(20,40,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export function blobShadow(size) {
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.scale.set(size, 1, size);
  m.renderOrder = 1;
  return m;
}

/** Radial glow texture used for bugs and sparkles. */
export const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,200,0.6)');
  grd.addColorStop(1, 'rgba(255,255,150,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
