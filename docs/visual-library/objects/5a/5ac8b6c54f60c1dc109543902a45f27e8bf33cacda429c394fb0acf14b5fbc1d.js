// Local laboratory helpers. These are deliberately independent of production state and persistence.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const mix = (a, b, k) => a + (b - a) * k;
export const TAU = Math.PI * 2;
export const clockText = v => `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}`;
export const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function controls(ctx) {
  const held = new Set(), pressed = new Set();
  const aliases = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD', ShiftRight: 'ShiftLeft' };
  const code = v => aliases[v] || v;
  const onKey = (key, down) => {
    key = code(key);
    if (down) { if (!held.has(key)) pressed.add(key); held.add(key); }
    else held.delete(key);
  };
  const pulse = key => { pressed.add(key); };
  return {
    onKey, held, down: key => held.has(code(key)), take: key => { key = code(key); const v = pressed.has(key); pressed.delete(key); return v; },
    x: () => Number(held.has('KeyD')) - Number(held.has('KeyA')),
    z: () => Number(held.has('KeyS')) - Number(held.has('KeyW')),
    clear: () => { held.clear(); pressed.clear(); }, pulse,
    movement(jump = false, vehicle = false) {
      for (const [label, key] of [['↑ W', 'KeyW'], ['← A', 'KeyA'], ['S ↓', 'KeyS'], ['D →', 'KeyD']]) ctx.ui.hold(label, () => onKey(key, true), () => onKey(key, false));
      if (jump) ctx.ui.button('Прыжок · Пробел', () => pulse('Space'));
      if (vehicle) ctx.ui.hold('Снос · Shift', () => onKey('ShiftLeft', true), () => onKey('ShiftLeft', false));
    }
  };
}

export async function asset(ctx, id, parent, optional = false) {
  if (optional && (!ctx.assets?.available || !ctx.assets.available(id))) return null;
  if (!ctx.assets?.clone) { if (optional) return null; throw new Error(`Нет игрового ассета: ${id}`); }
  const root = await ctx.assets.clone(id);
  if (!root) { if (optional) return null; throw new Error(`Игровой ассет не загрузился: ${id}`); }
  root.name = `lab-${id}`;
  if (root.userData.labActor && parent.userData.labOwnActor) parent.userData.labOwnActor(root);
  else parent.add(root);
  return root;
}

// Kits contain named authored modules. The pack's catalogue layout is discarded;
// each component is placed at the gameplay anchor, so the new art participates in the mechanic.
export async function loadKit(ctx, id) {
  if (!ctx.assets?.available?.(id)) return null;
  return ctx.assets.clone(id);
}

export function component(pack, name, parent) {
  const source = pack?.getObjectByName(name);
  if (!source) return null;
  const clone = source.clone(true);
  clone.name = `lab-${name}`;
  clone.userData.labSourceName = name;
  clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.scale.set(1, 1, 1);
  parent.add(clone);
  return clone;
}

export function authoredAnimation(ctx, pack, root) {
  if (!root || !pack?.animations?.length) return { update(){}, dispose(){}, clips:[] };
  const T=ctx.THREE,names=new Set();root.traverse(o=>names.add(o.name));
  const sourceName=root.userData.labSourceName;
  const clips=pack.animations.map(c=>{
    const tracks=c.tracks.filter(track=>{
      const node=T.PropertyBinding.parseTrackName(track.name).nodeName;
      // The module's world placement is owned by the lab, not the pack's catalogue grid.
      return node!==sourceName&&node!==root.name&&names.has(node);
    }).map(track=>track.clone());
    return tracks.length ? new T.AnimationClip(c.name,c.duration,tracks) : null;
  }).filter(Boolean);
  const mixer=new T.AnimationMixer(root),clip=clips.find(c=>/action/i.test(c.name))||clips.find(c=>/idle/i.test(c.name))||clips[0];
  if(clip)mixer.clipAction(clip).play();
  return {clips:clips.map(c=>c.name),update(dt){mixer.update(dt);},dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);}};
}

export function marker(ctx, d, text, x, y, z, width = 3) {
  if (!ctx.kit.label) return null;
  const obj = ctx.kit.label(text, { x, y, z, width });
  if (obj) d.scene.add(obj);
  return obj;
}

export function ring(ctx, parent, x, y, z, radius, color = 0xf0b84c) {
  const T = ctx.THREE;
  const m = new T.Mesh(new T.RingGeometry(radius * 0.86, radius, 48), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function line(ctx, parent, pts, color = 0xffedba, opacity = 1) {
  const T = ctx.THREE;
  const obj = new T.Line(new T.BufferGeometry().setFromPoints(pts.map(p => new T.Vector3(...p))), new T.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  parent.add(obj);
  return obj;
}

export function ribbon(ctx, parent, pts, width, color) {
  const T = ctx.THREE, vertices = [], indices = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1;
    vertices.push(p[0] - dz / len * width / 2, p[1], p[2] + dx / len * width / 2, p[0] + dz / len * width / 2, p[1], p[2] - dx / len * width / 2);
    if (i) { const n = i * 2; indices.push(n - 2, n, n - 1, n - 1, n, n + 1); }
  });
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
  const obj = new T.Mesh(geo, new T.MeshStandardMaterial({ color, roughness: 0.9, side: T.DoubleSide }));
  obj.receiveShadow = true; parent.add(obj); return obj;
}

export function ellipsePoint(a, rx = 25, rz = 18) { return { x: Math.cos(a) * rx, z: Math.sin(a) * rz }; }
export function ellipseCourse(ctx, d, rx, rz, width, water = false, pack = null) {
  const pts = Array.from({ length: 129 }, (_, i) => { const p = ellipsePoint(i / 128 * TAU, rx, rz); return [p.x, water ? -0.24 : 0.02, p.z]; });
  if (!water) ribbon(ctx, d.scene, pts, width, 0x626b68);
  for (const side of [-1, 1]) {
    const marks = pts.filter((_, i) => i % 4 === 0).map(p => {
      const a = Math.atan2(p[2] / rz, p[0] / rx), k = side * width / 2;
      return [p[0] + Math.cos(a) * k, water ? -0.15 : 0.06, p[2] + Math.sin(a) * k];
    });
    line(ctx, d.scene, [...marks, marks[0]], side > 0 ? 0xf0eee3 : 0xd76747, water ? 0.5 : 0.9);
    marks.forEach((p, i) => {
      if (water) {
        const buoy = component(pack, 'course_buoy', d.scene);
        if (buoy) buoy.position.set(p[0], -0.3, p[2]);
        else d.ball(0.23, i % 2 ? 0xf8efe0 : 0xd76747).position.set(...p);
      }
      else if (i % 2 === 0) d.box(1.5, 0.08, 0.35, i % 4 ? 0xf8efe0 : 0xd76747).position.set(...p);
    });
  }
  return pts;
}

export function newVehicle(rx = 25, rz = 18) {
  return { x: rx, z: 0, vx: 0, vz: 0, yaw: Math.PI / 2, steer: 0, omega: 0, drift: false, driftDir: 0, checkpoint: 0, boost: 0, hits: 0, stall: 0, trail: [], oldX: rx, oldZ: 0 };
}

// Actual regatta baseline constants inform OLD. NEW is a tuning hypothesis, not the production simulator.
export function vehicleStep(s, k, dt, cfg = {}) {
  dt = Math.min(dt, 1 / 30);
  const old = cfg.old, top = cfg.top || 17;
  s.oldX = s.x; s.oldZ = s.z;
  const target = Number(k.down('KeyA')) - Number(k.down('KeyD'));
  s.steer += clamp(target - s.steer, -(old ? 6 : 11) * dt, (old ? 6 : 11) * dt);
  const speed0 = Math.hypot(s.vx, s.vz);
  const drift = k.down('ShiftLeft') && speed0 > 7;
  if (drift && !s.drift) s.driftDir = target || Math.sign(s.steer) || 1;
  if (!drift && s.drift) s.boost = Math.max(s.boost, 0.5);
  s.drift = drift;
  const f0 = s.vx * Math.cos(s.yaw) + s.vz * Math.sin(s.yaw);
  const plow = old ? 0.35 + 0.65 * Math.min(1, Math.abs(f0) / 7) : Math.min(1, 0.6 + Math.abs(f0) / 10);
  const wanted = old && drift ? 1.3 * (s.driftDir + 0.45 * s.steer) : s.steer * (drift ? 1.95 : 1.45) * plow;
  s.omega = old ? wanted : mix(s.omega, wanted, 1 - Math.exp(-dt * 18));
  s.yaw -= s.omega * dt;
  const hx = Math.cos(s.yaw), hz = Math.sin(s.yaw);
  let f = s.vx * hx + s.vz * hz, lat = (-s.vx * hz + s.vz * hx) * Math.pow(drift ? 0.94 : 0.88, dt * 60);
  const cap = s.boost > 0 ? top + 3 : top;
  s.boost = Math.max(0, s.boost - dt);
  s.stall = Math.max(0, s.stall - dt);
  if (!s.stall && k.down('KeyW')) f += Math.max(0, Math.min(12, (cap - speed0) * 3)) * dt;
  else if (k.down('KeyS')) f -= (f > 0 ? 14 : 5) * dt;
  else f = Math.max(0, f - (2.5 + 0.012 * f * f) * dt);
  if (drift) f *= Math.pow(0.9995, dt * 60);
  f = clamp(f, -4, cap);
  s.vx = hx * f - hz * lat; s.vz = hz * f + hx * lat;
  s.x += s.vx * dt; s.z += s.vz * dt;
}

export function ellipseBoundary(s, rx, rz, width, old = false, shortcut = false) {
  const a = Math.atan2(s.z / rz, s.x / rx), p = ellipsePoint(a, rx, rz);
  const dx = s.x - p.x, dz = s.z - p.z, dist = Math.hypot(dx, dz);
  if (shortcut && a > 0.08 && a < 1.48 && Math.hypot(s.x / rx, s.z / rz) > 0.66) return false;
  if (dist < width / 2 - 0.6) return false;
  const nx = dx / (dist || 1), nz = dz / (dist || 1), over = dist - (width / 2 - 0.6);
  s.x -= nx * over; s.z -= nz * over;
  const vn = s.vx * nx + s.vz * nz;
  if (vn > 0) { s.vx -= vn * nx; s.vz -= vn * nz; s.vx *= old ? 0.85 : 0.96; s.vz *= old ? 0.85 : 0.96; return vn > 1.2; }
  return false;
}

export function gatePass(s, rx, rz, width) {
  const a = (s.checkpoint + 1) / 4 * TAU, p = ellipsePoint(a, rx, rz);
  const tx = -Math.sin(a) * rx, tz = Math.cos(a) * rz, len = Math.hypot(tx, tz);
  const old = (s.oldX - p.x) * tx / len + (s.oldZ - p.z) * tz / len;
  const now = (s.x - p.x) * tx / len + (s.z - p.z) * tz / len;
  const lat = Math.abs((s.x - p.x) * -tz / len + (s.z - p.z) * tx / len);
  if (old < 0 && now >= 0 && lat < width) { s.checkpoint++; return true; }
  return false;
}

export function poseVehicle(root, s, y = 0, dt = 0, t = 0, camera) {
  if (root.userData.labActor) {
    root.userData.labActor.update(s, y, dt, t, camera?.position || camera);
    return;
  }
  root.position.set(s.x, y, s.z);
  root.rotation.set(s.boost > 0 ? 0.04 : 0, -s.yaw - Math.PI / 2, s.steer * (s.drift ? 0.22 : 0.07), 'YXZ');
}

export function characterStep(s, k, dt, platforms, opts = {}) {
  const oldY = s.y, oldX = s.x, oldZ = s.z;
  let dx = k.x(), dz = k.z(), len = Math.hypot(dx, dz) || 1;
  const speed = opts.speed || 6.5;
  s.x += dx / len * speed * dt; s.z += dz / len * speed * dt;
  if (dx || dz) s.yaw = Math.atan2(-dx, -dz);
  if (k.take('Space') && s.grounded) { s.vy = opts.jump || 8.6; s.grounded = false; }
  if (!s.grounded) { s.vy -= (opts.gravity || 24) * dt; s.y += s.vy * dt; }
  const inside = p => p.radius ? Math.hypot(s.x-p.x,s.z-p.z)<p.radius : Math.abs(s.x-p.x)<p.w/2&&Math.abs(s.z-p.z)<p.d/2;
  const pad = platforms.find(p => inside(p) && oldY >= p.y - 0.04 && s.y <= p.y && s.vy <= 0);
  if (pad) { s.y = pad.y; s.vy = 0; s.grounded = true; s.pad = pad.id; }
  else if (s.grounded && !platforms.some(p => inside(p) && Math.abs(s.y - p.y) < 0.08)) { s.grounded = false; }
  return { oldX, oldZ, oldY, pad };
}

export function poseJelly(j, s, dt, t, camera) {
  j.pos.set(s.x, s.y, s.z); j.yaw = s.yaw || 0; j.grounded = s.grounded !== false;
  j.update?.(dt, t, camera.position);
}

export function platforms3d(d, pads, palette = [0xe0bd78, 0xbf7251, 0x76a28a]) {
  return pads.map((p, i) => { const m = d.box(p.w, 0.25, p.d, palette[i % palette.length]); m.position.set(p.x, p.y - 0.125, p.z); return m; });
}

export function waterWake(ctx, parent) {
  const T=ctx.THREE, count=64;
  const geo=new T.PlaneGeometry(.8,1.2);geo.rotateX(-Math.PI/2);
  const mesh=new T.InstancedMesh(geo,new T.MeshBasicMaterial({color:0xf0f3e6,transparent:true,opacity:.62,depthWrite:false,side:T.DoubleSide}),count);
  mesh.frustumCulled=false;parent.add(mesh);
  const list=Array.from({length:count},()=>({x:0,z:0,age:3,yaw:0})),matrix=new T.Matrix4(),q=new T.Quaternion(),scale=new T.Vector3(),position=new T.Vector3();
  let next=0,emit=0;
  return {reset(){for(const p of list)p.age=3;},update(s,dt){const speed=Math.hypot(s.vx,s.vz);emit+=dt;if(speed>2&&emit>.045){emit=0;const p=list[next++%count];p.x=s.x-Math.cos(s.yaw)*2;p.z=s.z-Math.sin(s.yaw)*2;p.yaw=s.yaw;p.age=0;}
    for(let i=0;i<count;i++){const p=list[i];p.age+=dt;const f=Math.max(0,1-p.age/2);scale.set(f*(.6+p.age),f*(.9+p.age),1);q.setFromAxisAngle(new T.Vector3(0,1,0),-p.yaw);position.set(p.x,-.22,p.z);matrix.compose(position,q,scale);mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;}};
}
