// Social scenes share the lab stage; no renderer, listeners, RAF or timers here.
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const mix = (a, b, v) => a + (b - a) * v;
export const smooth = v => v * v * (3 - 2 * v);

export function base(ctx, opts = {}) {
  const d = ctx.kit.diorama({ radius: 6.7, cam: [6.5, 5.5, 9], look: [0, 1.3, 0], rail: true, ...opts });
  const keys = new Set();
  const objects = [];
  const jellies = [];
  const jelly = o => { const j = d.jelly(o); jellies.push(j); return j; };
  const ring = (x, z, r = .6, color = 0xe8aa37, y = .035) => {
    const m = new ctx.THREE.Mesh(new ctx.THREE.RingGeometry(r, r + .075, 40), new ctx.THREE.MeshBasicMaterial({ color, side: ctx.THREE.DoubleSide, transparent: true, opacity: .85, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); d.scene.add(m); objects.push(m); return m;
  };
  const bar = (a, b, radius = .018, color = 0xe6d7b2) => {
    const delta = new ctx.THREE.Vector3().subVectors(b, a);
    const m = new ctx.THREE.Mesh(new ctx.THREE.CylinderGeometry(radius, radius, delta.length(), 8), d.mat(color));
    m.position.copy(a).add(b).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new ctx.THREE.Vector3(0, 1, 0), delta.normalize()); d.scene.add(m); return m;
  };
  const button = (label, fn, primary = false) => ctx.ui.button(label, fn, primary);
  const hold = (label, code) => ctx.ui.hold(label, () => keys.add(code), () => keys.delete(code));
  const key = (code, down) => { down ? keys.add(code) : keys.delete(code); return true; };
  const axis = (a = 'KeyA', b = 'KeyD') => Number(keys.has(b)) - Number(keys.has(a));
  const floorAt = (nx, ny, y = 0) => { const ray = new ctx.THREE.Raycaster(); ray.setFromCamera(new ctx.THREE.Vector2(nx, ny), d.camera); return ray.ray.intersectPlane(new ctx.THREE.Plane(new ctx.THREE.Vector3(0, 1, 0), -y), new ctx.THREE.Vector3()); };
  const update = (dt, t) => {
    if (d.update) d.update(dt, t);
    else for (const j of jellies) j.update?.(dt, t, d.camera.position);
  };
  const celebrate = (j, win) => { j.action?.(ctx.kit.ACT[win ? 'dance' : 'laugh']); win ? ctx.sound.fanfare?.() : ctx.sound.splat?.(); };
  const result = ctx.ui.stat('Попытка', 'Готово к старту');
  const note = v => ctx.ui.note(v);
  const cancelInput = () => keys.clear();
  return { d, keys, objects, jellies, jelly, ring, bar, button, hold, key, axis, floorAt, update, celebrate, result, note, cancelInput,
    scene: d.scene, camera: d.camera, target: d.target,
    dispose() { keys.clear(); d.dispose(); }
  };
}

export async function loadKit(ctx, id) {
  const root = await ctx.assets.clone(id);
  if (!root) throw new Error(`Не загрузился набор ${id}`);
  return root;
}

export function part(root, name) {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`В Blender-наборе отсутствует ${name}`);
  const clone = o.clone(true);
  clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0);
  return clone;
}

export function focus(s, j, x, z) {
  j.pos.x = x; j.pos.z = z; j.face(0, 0); s.ring(x, z, .57);
}

export function localLabel(ctx, text) {
  ctx.ui.stat('Партнёр', `${text} — локальная имитация`);
}

// Always read the current authored object's transform, including parent tilt.
export function contactPoint(ctx, object, name, localPoint, offset = [0, 0, 0]) {
  object.updateWorldMatrix(true, true);
  let anchor = name ? object.getObjectByName(name) : null;
  if (!anchor && name) object.traverse(o => { if (!anchor && o.userData?.anchor === name) anchor = o; });
  const delta = new ctx.THREE.Vector3(...offset);
  const point = anchor ? anchor.localToWorld(delta) : object.localToWorld(new ctx.THREE.Vector3(...localPoint).add(delta));
  const suffix = offset.some(v => v !== 0) ? `+${offset.join(',')}` : '';
  return { point, source: (anchor ? `GLB:${anchor.name}` : `geometry:${localPoint.join(',')}`) + suffix };
}

export function worldGrip(ctx, actor, contacts) {
  if (typeof ctx.kit.gripWorld !== 'function') throw new Error('Стенд не поддерживает хват настоящего Avatar');
  const errors = ctx.kit.gripWorld(actor, contacts.map(c => c.point));
  if (!Array.isArray(errors) || errors.length !== 2 || errors.some(v => !Number.isFinite(v))) throw new Error('Не измерен контакт варежек с предметом');
  return { active: true, errors: [...errors], maxError: Math.max(...errors), sources: contacts.map(c => c.source), targets: contacts.map(c => c.point.toArray()) };
}
