// 3D-планировка «Ракушки» из простых объёмов в настоящем масштабе (метры plaza3). Рендер — только по запросу
// (движение камеры, кнопки) и только пока раздел виден. Табло — холст (CanvasTexture) с четырьмя видами.
import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';

const C = {
  shell: '#fbf4e6', coral: '#f0705a', teal: '#1f8f86', tealD: '#0f5e58', wood: '#c98a4f', woodD: '#8a5a32',
  cream: '#fff4dc', bench: '#2f7a5e', cyp: '#2f6b3e', trunk: '#6b4a2e', ole: '#ef7aa3', leaf: '#4f8f4a',
  land: '#efe3c6', quay: '#cdb78f', lawn: '#a9d083', walk: '#f7ecd2', yard: '#f1e2c4', grey: '#cbc4b7', sea: '#3fa3c0', bulb: '#fff1c4',
};
const FONT = 'Rubik, system-ui, sans-serif';
const MONO = '"Rubik Mono One", Rubik, system-ui, sans-serif';

export async function mount3d(frame, L, state) {
  const canvas = document.createElement('canvas');
  frame.prepend(canvas);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
  } catch (e) {
    canvas.remove();
    throw e;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a6d9ee');
  scene.fog = new THREE.Fog('#c4e7f1', 90, 260);
  const camera = new THREE.PerspectiveCamera(55, 16 / 10, 0.1, 600);

  // свет: небо + солнце с тенью над садом
  scene.add(new THREE.HemisphereLight('#dff3ff', '#c9b48e', 1.5));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.3);
  sun.position.set(62, 62, -14);
  sun.target.position.set(80, 0, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 150 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const mats = new Map();
  const mat = (color, o = {}) => {
    const k = color + JSON.stringify(o);
    if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, ...o }));
    return mats.get(k);
  };
  const add = (geo, m, x = 0, y = 0, z = 0, parent = scene, shadow = true) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    me.castShadow = shadow;
    me.receiveShadow = true;
    parent.add(me);
    return me;
  };
  /** Плоский многоугольник на земле (x, z) на высоте y */
  const flat = (pts, color, y) => {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const me = add(new THREE.ShapeGeometry(sh), mat(color), 0, y, 0, scene, false);
    me.rotation.x = -Math.PI / 2;
    return me;
  };
  /** Дорожка-полоса по точкам */
  const strip = (pts, w, color, y) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const len = Math.hypot(x1 - x0, z1 - z0) + w * 0.9;
      const me = add(new THREE.PlaneGeometry(len, w), mat(color), (x0 + x1) / 2, y + i * 0.002, (z0 + z1) / 2, scene, false);
      me.rotation.set(-Math.PI / 2, 0, -Math.atan2(z1 - z0, x1 - x0));
    }
  };

  // ------------------------------------------------------------ земля, море, соседи
  const sea = add(new THREE.PlaneGeometry(700, 700), mat(C.sea), 60, -0.9, 0, scene, false);
  sea.rotation.x = -Math.PI / 2;
  for (const [poly, top0, color] of [[L.LAND, 0, C.land], [L.BACKLOT, -0.05, '#cfd9a2']]) {
    const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: false });
    const me = add(geo, [mat(color), mat(C.quay)], 0, top0 - 1.4, 0, scene, false);
    me.rotation.x = -Math.PI / 2;
    me.receiveShadow = true;
  }
  flat([[62.9, -12], [91.8, -12], [91.8, 21.8], [62.9, 21.8]], C.lawn, 0.012);
  for (const wk of L.WALKS) strip(wk.pts, wk.w, C.walk, 0.024);
  flat(L.FENCE, C.yard, 0.03);
  flat([[81.4, -0.5], [91.5, -0.5], [91.5, 16.5], [81.4, 16.5]], '#9fc879', 0.036);
  // парапет у моря
  add(new THREE.BoxGeometry(32, 0.95, 0.2), mat('#f3efe6'), 76, 0.475, 21.9);
  add(new THREE.BoxGeometry(0.2, 0.95, 33.8), mat('#f3efe6'), 91.9, 0.475, 4.9);

  const labels = [];
  const nb = (b, hgt, name, color = C.grey) => {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    add(new THREE.BoxGeometry(w, hgt, d), mat(color), b.x0 + w / 2, hgt / 2, b.z0 + d / 2);
    if (name) labels.push(sprite(name, b.x0 + w / 2, hgt + 1.6, b.z0 + d / 2));
  };
  nb(L.NB.kurzal, 5.4, 'Курзал');
  add(new THREE.CylinderGeometry(1.2, 1.2, 11.2, 12), mat(C.grey), 53.8, 5.6, 1);
  nb(L.NB.view, 1.4, 'Смотровая');
  nb(L.NB.cafe, 6.5, 'Кафе «Чайка»');
  add(new THREE.BoxGeometry(0.12, 2.4, 4), mat(C.coral), 53.08, 2.6, 8.2); // афиша
  nb(L.NB.billiards, 4, 'Бильярдная');
  nb(L.NB.cards, 3.7, '');

  // ------------------------------------------------------------ сцена
  const S = L.SHELL;
  {
    const sh = new THREE.Shape(L.STAGE.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: L.STAGE.h, bevelEnabled: false });
    const me = add(geo, [mat(C.wood), mat('#efe4cf')], 0, 0, 0);
    me.rotation.x = -Math.PI / 2;
    for (const r of L.RAMPS) {
      const rs = new THREE.Shape([new THREE.Vector2(r.x0, 0), new THREE.Vector2(r.x1, 0), new THREE.Vector2(r.x1, L.STAGE.h)]);
      add(new THREE.ExtrudeGeometry(rs, { depth: r.z1 - r.z0, bevelEnabled: false }), [mat('#e0ad76'), mat('#efe4cf')], 0, 0, r.z0);
    }
  }
  const top = L.STAGE.h;

  // ракушка: четверть эллипсоида, рёбра сходятся к низу задней стены (как у гребешка)
  const shellG = new THREE.Group();
  shellG.position.set(S.x, top, S.z);
  scene.add(shellG);
  const sp = (al, t, k = 1) => new THREE.Vector3(S.c * Math.sin(t) * k, S.b * Math.cos(t) * Math.sin(al) * k, S.a * Math.cos(t) * Math.cos(al) * k);
  {
    const nA = 56, nT = 22, pos = [], idx = [];
    for (let i = 0; i <= nA; i++) for (let j = 0; j <= nT; j++) { const v = sp((Math.PI * i) / nA, (Math.PI / 2) * (j / nT)); pos.push(v.x, v.y, v.z); }
    for (let i = 0; i < nA; i++) for (let j = 0; j < nT; j++) {
      const a = i * (nT + 1) + j, b = (i + 1) * (nT + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    add(geo, mat(C.shell, { side: THREE.DoubleSide, emissive: '#5a4c38' }), 0, 0, 0, shellG);
    // рёбра и кромка
    const bulbs = [];
    for (let k = 1; k < 12; k++) {
      const al = (Math.PI * k) / 12;
      const pts = [];
      for (let j = 0; j <= 16; j++) pts.push(sp(al, (Math.PI / 2) * (j / 16), 0.975));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.09, 6), mat(C.coral), 0, 0, 0, shellG, false);
      for (let j = 1; j <= 7; j++) bulbs.push(sp(al, (Math.PI / 2) * (j / 9.5), 0.955));
    }
    const rim = [];
    for (let i = 0; i <= 40; i++) rim.push(sp((Math.PI * i) / 40, 0, 1.0));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 64, 0.22, 8), mat(C.teal), 0, 0, 0, shellG);
    for (let i = 1; i < 40; i++) if (i % 2) bulbs.push(sp((Math.PI * i) / 40, 0.03, 0.965));
    shellG.add(instBulbs(bulbs, 0.085));
    // задняя стена под табло
    const d = 3.2, s = Math.sqrt(1 - (d / S.c) ** 2);
    const wall = new THREE.Shape();
    for (let i = 0; i <= 40; i++) { const al = (Math.PI * i) / 40; const p = new THREE.Vector2(S.a * s * Math.cos(al), S.b * s * Math.sin(al)); i ? wall.lineTo(p.x, p.y) : wall.moveTo(p.x, p.y); }
    const wm = add(new THREE.ShapeGeometry(wall), mat('#f6ead2', { side: THREE.DoubleSide }), d, 0, 0, shellG);
    wm.rotation.y = -Math.PI / 2;
    const skirt = add(new THREE.PlaneGeometry(S.a * s * 2 - 0.4, 1.78), mat(C.tealD), d - 0.03, 0.89, 0, shellG, false);
    skirt.rotation.y = -Math.PI / 2;
  }

  // шатёр — вариант: полосатый навес на столбах и деревянный задник
  const awnG = new THREE.Group();
  scene.add(awnG);
  {
    const posts = [[81.9, 1.9], [81.9, 14.1], [87.9, 2.7], [87.9, 13.3]];
    for (const [x, z] of posts) add(new THREE.CylinderGeometry(0.13, 0.15, 7.2, 10), mat(C.teal), x, top + 3.6, z, awnG);
    const x0 = 81.2, x1 = 88.6, yF = top + 6.6, yB = top + 7.3, z0 = 1.2, z1 = 14.8, n = 13;
    const len = Math.hypot(x1 - x0, yB - yF), ang = Math.atan2(yB - yF, x1 - x0), w = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const me = add(new THREE.BoxGeometry(len, 0.08, w), mat(i % 2 ? C.cream : C.coral), (x0 + x1) / 2, (yF + yB) / 2, z0 + w * (i + 0.5), awnG);
      me.rotation.z = ang;
      const val = add(new THREE.CylinderGeometry(w / 2, w / 2, 0.06, 16, 1, false, 0, Math.PI), mat(i % 2 ? C.cream : C.coral, { side: THREE.DoubleSide }), x0 - 0.02, yF - 0.02, z0 + w * (i + 0.5), awnG, false);
      val.rotation.z = -Math.PI / 2; // ось вдоль x, полукруг свисает вниз
    }
    add(new THREE.BoxGeometry(0.3, 6.1, 10.4), mat('#9a6a3c'), 87.65, top + 3.05, 8, awnG);
    const gar = [];
    for (const [za, zb] of [[1.9, 14.1]]) for (let i = 0; i <= 26; i++) { const t = i / 26; gar.push(new THREE.Vector3(81.75, top + 6.2 - Math.sin(t * Math.PI) * 0.9, za + (zb - za) * t)); }
    for (const z of [1.9, 14.1]) for (let i = 1; i < 12; i++) { const t = i / 12; gar.push(new THREE.Vector3(81.9 + 6 * t, top + 6.3 - Math.sin(t * Math.PI) * 0.6, z + (z < 8 ? 0.8 : -0.6) * t)); }
    awnG.add(instBulbs(gar, 0.1));
  }

  // табло на задней стене + рамка с лампочками
  const B = L.BOARD;
  const yC = B.y0 + B.h / 2;
  add(new THREE.BoxGeometry(0.16, B.h + 0.5, B.w + 0.5), mat(C.woodD), B.x - 0.08, yC, B.z);
  const boardCv = document.createElement('canvas');
  boardCv.width = 1536; boardCv.height = Math.round(1536 * (B.h / B.w));
  const boardTex = new THREE.CanvasTexture(boardCv);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 4;
  const boardMesh = add(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshBasicMaterial({ map: boardTex }), B.x - 0.18, yC, B.z, scene, false);
  boardMesh.rotation.y = -Math.PI / 2;
  {
    const fb = [];
    const hw = B.w / 2 + 0.17, hh = B.h / 2 + 0.17;
    for (let t = -hw; t <= hw + 0.01; t += 0.34) { fb.push(new THREE.Vector3(B.x - 0.2, yC + hh, B.z + t), new THREE.Vector3(B.x - 0.2, yC - hh, B.z + t)); }
    for (let t = -hh + 0.34; t < hh - 0.1; t += 0.34) { fb.push(new THREE.Vector3(B.x - 0.2, yC + t, B.z - hw), new THREE.Vector3(B.x - 0.2, yC + t, B.z + hw)); }
    scene.add(instBulbs(fb, 0.07));
  }

  // пульты: корпус, арка спереди, лампа-кнопка (одна горит)
  {
    const n = L.PULTS.length;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 1.05, 0.9), mat(C.cream), n);
    const panel = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.62, 0.56), mat(C.teal), n);
    const lamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 14, 10), mat('#8d3b31'), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    L.PULTS.forEach((p, i) => {
      const yaw = Math.atan2(L.PULT_C.z - p.z, -(L.PULT_C.x - p.x));
      q.setFromAxisAngle(up, yaw);
      const off = (dx, dy) => new THREE.Vector3(p.x, top + dy, p.z).add(new THREE.Vector3(dx, 0, 0).applyQuaternion(q));
      body.setMatrixAt(i, m4.compose(off(0, 0.525), q, one));
      panel.setMatrixAt(i, m4.compose(off(-0.32, 0.5), q, one));
      lamp.setMatrixAt(i, m4.compose(off(0.05, 1.12), q, i === L.LIT ? new THREE.Vector3(0, 0, 0) : one));
      if (i === L.LIT) {
        const lit = add(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffd84a' }), 0, 0, 0, scene, false);
        lit.position.copy(off(0.05, 1.12));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffcf4a', transparent: true, depthWrite: false }));
        glow.scale.set(1.3, 1.3, 1);
        glow.position.copy(lit.position);
        scene.add(glow);
      }
    });
    for (const im of [body, panel, lamp]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
  }

  // трибуна ведущего с микрофоном
  {
    const g = new THREE.Group();
    g.position.set(L.PODIUM.x, top, L.PODIUM.z);
    g.rotation.y = Math.atan2(8 - L.PODIUM.z, -(76 - L.PODIUM.x));
    add(new THREE.BoxGeometry(0.7, 1.15, 0.95), mat('#a8703f'), 0, 0.575, 0, g);
    add(new THREE.BoxGeometry(0.04, 0.6, 0.6), mat(C.cream), -0.36, 0.62, 0, g, false);
    const tp = add(new THREE.BoxGeometry(0.8, 0.06, 1.05), mat(C.woodD), 0.02, 1.18, 0, g);
    tp.rotation.z = -0.18;
    add(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), mat('#333'), -0.15, 1.42, 0.25, g, false);
    add(new THREE.SphereGeometry(0.05, 10, 8), mat('#555'), -0.2, 1.66, 0.25, g, false);
    scene.add(g);
  }

  // мольберт «Крокодила»: за кулисами или на середине сцены
  const easelCv = document.createElement('canvas');
  easelCv.width = 640; easelCv.height = 480;
  const easelTex = new THREE.CanvasTexture(easelCv);
  easelTex.colorSpace = THREE.SRGBColorSpace;
  const easel = new THREE.Group();
  {
    const legM = mat(C.woodD);
    for (const [z, rx] of [[-0.7, 0.12], [0.7, -0.12]]) { const lg = add(new THREE.BoxGeometry(0.07, 2.7, 0.07), legM, 0, 1.33, z, easel); lg.rotation.x = rx; }
    const back = add(new THREE.BoxGeometry(0.07, 2.6, 0.07), legM, 0.55, 1.25, 0, easel); back.rotation.z = 0.22;
    add(new THREE.BoxGeometry(0.16, 0.06, 1.9), legM, -0.08, 0.95, 0, easel);
    add(new THREE.BoxGeometry(0.05, 1.45, 1.9), mat('#fffaf0'), -0.1, 1.72, 0, easel);
    const cv = add(new THREE.PlaneGeometry(1.8, 1.35), new THREE.MeshBasicMaterial({ map: easelTex }), -0.13, 1.72, 0, easel, false);
    cv.rotation.y = -Math.PI / 2;
    add(new THREE.BoxGeometry(0.9, 0.08, 2.0), mat('#e7d7b8'), 0.2, 0.06, 0, easel);
  }
  scene.add(easel);

  // скамейки (инстансы): сиденье, спинка, ножки
  {
    const list = [];
    for (const x of L.BENCH.rows) for (const z of L.BENCH.sides) list.push([x, z]);
    const seat = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.07, L.BENCH.len), mat(C.bench), list.length);
    const back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.42, L.BENCH.len), mat(C.bench), list.length);
    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.45, 0.07), mat('#3a3a36'), list.length * 2);
    const m4 = new THREE.Matrix4();
    list.forEach(([x, z], i) => {
      seat.setMatrixAt(i, m4.makeTranslation(x, 0.45, z));
      back.setMatrixAt(i, m4.makeTranslation(x - 0.24, 0.72, z));
      legs.setMatrixAt(i * 2, m4.makeTranslation(x - 0.02, 0.225, z - L.BENCH.len / 2 + 0.2));
      legs.setMatrixAt(i * 2 + 1, m4.makeTranslation(x - 0.02, 0.225, z + L.BENCH.len / 2 - 0.2));
    });
    for (const im of [seat, back, legs]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
  }

  // ограда: штакетник по контуру, арка с вывеской
  {
    const pick = [];
    const segs = [];
    const F = L.FENCE.concat([L.FENCE[0]]);
    for (let i = 1; i < F.length; i++) {
      const [x0, z0] = F[i - 1], [x1, z1] = F[i];
      if (x0 === L.ARCH.x && x1 === L.ARCH.x) { segs.push([[x0, z0], [x0, L.ARCH.z0 - 0.3]], [[x0, L.ARCH.z1 + 0.3], [x1, z1]]); continue; }
      segs.push([[x0, z0], [x1, z1]]);
    }
    const rails = [];
    for (const [[x0, z0], [x1, z1]] of segs) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.24));
      for (let k = 0; k <= n; k++) pick.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
      rails.push([x0, z0, x1, z1, len]);
    }
    const pk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.9, 0.07), mat('#fbfaf5'), pick.length);
    const m4 = new THREE.Matrix4();
    pick.forEach(([x, z], i) => pk.setMatrixAt(i, m4.makeTranslation(x, 0.45, z)));
    pk.castShadow = true;
    scene.add(pk);
    for (const [x0, z0, x1, z1, len] of rails) for (const y of [0.3, 0.78]) {
      const r = add(new THREE.BoxGeometry(len, 0.06, 0.05), mat('#fbfaf5'), (x0 + x1) / 2, y, (z0 + z1) / 2);
      r.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    }
    const A = L.ARCH, ah = 3.0, half = (A.z1 - A.z0) / 2 + 0.3, zc = (A.z0 + A.z1) / 2;
    for (const z of [A.z0 - 0.3, A.z1 + 0.3]) add(new THREE.BoxGeometry(0.55, ah, 0.55), mat(C.cream), A.x, ah / 2, z);
    const arc = add(new THREE.TorusGeometry(half, 0.17, 8, 28, Math.PI), mat(C.teal), A.x, ah, zc);
    arc.rotation.y = Math.PI / 2;
    const signCv = document.createElement('canvas');
    signCv.width = 1024; signCv.height = 300;
    drawSign(signCv);
    const signTex = new THREE.CanvasTexture(signCv);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = add(new THREE.PlaneGeometry(3.4, 1.0), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide, transparent: true, alphaTest: 0.4 }), A.x - 0.3, ah + half + 0.78, zc, scene, false);
    sign.rotation.y = -Math.PI / 2;
    sign.userData.redraw = () => { drawSign(signCv); signTex.needsUpdate = true; };
    labels.push(sign);
  }

  // сад: кипарисы, олеандры, фонари
  {
    const cyp = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 10), mat(C.cyp), L.CYPRESS.length);
    const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 6), mat(C.trunk), L.CYPRESS.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    L.CYPRESS.forEach(([x, z, hh], i) => {
      cyp.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 1 + hh / 2, z), q, new THREE.Vector3(0.85, hh, 0.85)));
      tr.setMatrixAt(i, m4.makeTranslation(x, 0.6, z));
    });
    const ole = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat('#ffffff'), L.OLEANDER.length * 3);
    let k = 0;
    const col = new THREE.Color();
    L.OLEANDER.forEach(([x, z]) => {
      for (const [dx, dy, dz, s, c] of [[0, 0.62, 0, 0.72, C.leaf], [0.18, 0.95, -0.12, 0.42, C.ole], [-0.2, 0.86, 0.2, 0.38, '#f6a3c0']]) {
        ole.setMatrixAt(k, m4.compose(new THREE.Vector3(x + dx, dy, z + dz), q, new THREE.Vector3(s, s * 0.9, s)));
        ole.setColorAt(k++, col.set(c));
      }
    });
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 8), mat('#2f3b38'), L.LAMPS.length);
    const lampHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff4cf' }), L.LAMPS.length);
    L.LAMPS.forEach(([x, z], i) => { post.setMatrixAt(i, m4.makeTranslation(x, 1.6, z)); lampHead.setMatrixAt(i, m4.makeTranslation(x, 3.3, z)); });
    for (const im of [cyp, tr, ole, post, lampHead]) { im.castShadow = im !== lampHead; im.receiveShadow = true; scene.add(im); }
  }

  // желейки для масштаба (рост 1,6 м, как в игре)
  const jelly = (color, x, y, z, yaw, hat) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const r = L.JELLY.r;
    add(new THREE.CapsuleGeometry(r, L.JELLY.h - 2 * r, 6, 16), new THREE.MeshLambertMaterial({ color }), 0, L.JELLY.h / 2, 0, g);
    for (const s of [-0.15, 0.15]) add(new THREE.SphereGeometry(0.065, 10, 8), mat('#2b1d24'), -0.39, 1.12, s, g, false);
    if (hat) {
      add(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 20), mat('#e9c27a'), 0, 1.62, 0, g);
      add(new THREE.CylinderGeometry(0.34, 0.36, 0.26, 20), mat('#f2d08d'), 0, 1.76, 0, g);
      add(new THREE.CylinderGeometry(0.365, 0.365, 0.08, 20), mat('#e2483d'), 0, 1.7, 0, g, false);
    }
    scene.add(g);
    return g;
  };
  jelly('#ff8a1c', 66.3, 0, 11.3, -0.5);
  jelly('#14b8a6', L.PULTS[L.LIT].x + 0.75, top, L.PULTS[L.LIT].z, Math.atan2(L.PULT_C.z - L.PULTS[L.LIT].z, -(L.PULT_C.x - L.PULTS[L.LIT].x)));
  jelly('#8b5cf6', L.PULTS[4].x + 0.75, top, L.PULTS[4].z, Math.atan2(L.PULT_C.z - L.PULTS[4].z, -(L.PULT_C.x - L.PULTS[4].x)));
  jelly('#6ee7b7', L.PODIUM.host.x, top, L.PODIUM.host.z, Math.atan2(8 - L.PODIUM.host.z, -(76 - L.PODIUM.host.x)), true);
  jelly('#ff5fa2', L.BENCH.rows[0] + 0.05, 0.48, 4.65, Math.PI);
  jelly('#ffe3a3', L.BENCH.rows[2] + 0.05, 0.48, 10.9, Math.PI);

  for (const s of labels) if (s.isSprite) scene.add(s);

  // ------------------------------------------------------------ табло: четыре вида
  const fontsReady = (async () => {
    try { await Promise.all([document.fonts.load(`400 60px ${MONO}`), document.fonts.load(`800 48px ${FONT}`), document.fonts.load(`700 40px ${FONT}`)]); } catch { /* шрифт не обязателен */ }
  })();
  function drawBoard() {
    const ctx = boardCv.getContext('2d');
    BOARDS[state.board]?.(ctx, boardCv.width, boardCv.height);
    boardTex.needsUpdate = true;
    drawCroc(easelCv.getContext('2d'), easelCv.width, easelCv.height, false);
    easelTex.needsUpdate = true;
  }
  function placeEasel() {
    const show = state.board === 'croc';
    const p = show ? L.EASEL.show : L.EASEL.park;
    easel.position.set(p.x, top, p.z);
    easel.rotation.y = show ? 0 : Math.PI / 2; // за кулисами стоит боком, за стенкой ракушки
  }
  function setVariant(v) {
    state.variant = v;
    shellG.visible = v !== 'awning';
    awnG.visible = v === 'awning';
  }
  drawBoard();
  placeEasel();
  setVariant(state.variant);
  fontsReady.then(() => { drawBoard(); labels.forEach((s) => s.userData.redraw?.()); request(); });

  // ------------------------------------------------------------ камера
  const CAMS = {
    corridor: { p: [L.CAFE_CAM.x, 1.6, L.CAFE_CAM.z], t: [B.x, yC - 0.3, B.z], fov: 50 },
    top: { p: [76.5, 44, 32], t: [77, 0, 6.5], fov: 50 },
    bench: { p: [L.BENCH.rows[3] + 0.1, 1.55, 5.3], t: [B.x, yC - 0.9, B.z], fov: 55 },
    pult: { p: [78.9, 3.0, 4.4], t: [85.6, 3.0, 7.6], fov: 55 },
  };
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI * 0.6; // с высоты глаз камера смотрит чуть вверх, на табло
  controls.addEventListener('change', () => { if (camera.position.y < 0.4) camera.position.y = 0.4; });
  controls.minDistance = 1;
  controls.maxDistance = 140;
  controls.zoomSpeed = 0.9;
  controls.addEventListener('change', () => request());

  let visible = true, frameReq = 0, tween = null;
  function render() {
    frameReq = 0;
    if (!visible) return;
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.t0) / tween.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0v, tween.t1, e);
      camera.fov = tween.f0 + (tween.f1 - tween.f0) * e;
      camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
      if (k >= 1) { tween = null; controls.update(); } else frameReq = requestAnimationFrame(render);
    }
    renderer.render(scene, camera);
  }
  function request() { if (!frameReq) frameReq = requestAnimationFrame(render); }
  function setCam(name, instant = false) {
    const c = CAMS[name] ?? CAMS.corridor;
    const p1 = new THREE.Vector3(...c.p), t1 = new THREE.Vector3(...c.t);
    if (instant) {
      camera.position.copy(p1); controls.target.copy(t1); camera.fov = c.fov; camera.updateProjectionMatrix(); controls.update();
      request();
      return;
    }
    tween = { t0: performance.now(), dur: 750, p0: camera.position.clone(), p1, t0v: controls.target.clone(), t1, f0: camera.fov, f1: c.fov };
    request();
  }
  function resize() {
    const w = frame.clientWidth, hgt = frame.clientHeight;
    if (!w || !hgt) return;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
    request();
  }
  new ResizeObserver(resize).observe(frame);
  resize();
  setCam(state.cam, true);

  return {
    setCam: (n) => setCam(n),
    setBoard: (n) => { state.board = n; drawBoard(); placeEasel(); request(); },
    setVariant: (v) => { setVariant(v); request(); },
    setVisible: (v) => { visible = v; if (v) request(); },
  };
}

// ------------------------------------------------------------------ мелочи

let glowCache = null;
function glowTex() {
  if (glowCache) return glowCache;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,180,1)');
  gr.addColorStop(0.35, 'rgba(255,214,90,.55)');
  gr.addColorStop(1, 'rgba(255,214,90,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowCache = new THREE.CanvasTexture(c);
  glowCache.colorSpace = THREE.SRGBColorSpace;
  return glowCache;
}

/** Лампочки-гирлянды: один инстанс-меш светлых шариков */
function instBulbs(points, r) {
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color: C.bulb }), points.length);
  const m4 = new THREE.Matrix4();
  points.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  return im;
}

/** Подпись соседа — спрайт с плашкой */
function sprite(text, x, y, z) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.font = `800 52px ${FONT}`;
    const w = Math.min(500, g.measureText(text).width + 56);
    g.fillStyle = 'rgba(8,45,43,.82)';
    rr(g, 256 - w / 2, 20, w, 88, 44);
    g.fill();
    g.fillStyle = '#fff4dc';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 66);
    tex.needsUpdate = true;
  };
  draw();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(7, 1.75, 1);
  s.position.set(x, y, z);
  s.userData.redraw = draw;
  return s;
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawSign(c) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#fff4dc';
  rr(g, 8, 8, W - 16, H - 16, 40);
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = '#1f8f86';
  g.stroke();
  g.fillStyle = '#0f5e58';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `400 112px ${MONO}`;
  g.fillText('РАКУШКА', W / 2, 118);
  g.fillStyle = '#e2483d';
  g.font = `800 54px ${FONT}`;
  g.fillText('Своя игра · идёт · 4 игрока', W / 2, 222);
}

// ------------------------------------------------------------------ виды табло

function boardBase(g, W, H) {
  g.fillStyle = '#0d4a45';
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.04)';
  for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
}
function head(g, W, left, right) {
  g.fillStyle = '#123f3b';
  g.fillRect(0, 0, W, 112);
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd665';
  g.font = `400 58px ${MONO}`;
  g.textAlign = 'left';
  g.fillText(left, 40, 58);
  g.fillStyle = '#fff4dc';
  g.font = `700 46px ${FONT}`;
  g.textAlign = 'right';
  g.fillText(right, W - 40, 58);
}
function jellyDot(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, r * 0.86, r, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.beginPath();
  g.ellipse(x - r * 0.32, y - r * 0.45, r * 0.24, r * 0.15, -0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2b1d24';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * r * 0.26, y - r * 0.02, r * 0.1, r * 0.14, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#2b1d24';
  g.lineWidth = Math.max(2, r * 0.07);
  g.beginPath();
  g.arc(x, y + r * 0.2, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
}

const BOARDS = {
  jeopardy(g, W, H) {
    boardBase(g, W, H);
    const themes = ['Набережная', 'Рыбалка', 'Кино', 'Песни', 'Кухня', 'Города'];
    const used = new Set(['0-0', '1-0', '1-1', '2-0', '3-2', '4-0', '4-1', '5-3']);
    const pad = 22, gap = 10, tw = 430;
    const rh = (H - pad * 2 - gap * 5) / 6, cw = (W - pad * 2 - tw - gap * 5) / 5;
    g.textBaseline = 'middle';
    themes.forEach((t, r) => {
      const y = pad + r * (rh + gap);
      g.fillStyle = '#1f8f86';
      rr(g, pad, y, tw, rh, 14); g.fill();
      g.fillStyle = '#fff4dc';
      g.font = `800 48px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(t, pad + 26, y + rh / 2 + 2);
      for (let c = 0; c < 5; c++) {
        const x = pad + tw + gap + c * (cw + gap);
        const off = used.has(`${r}-${c}`);
        g.fillStyle = off ? 'rgba(255,244,220,.12)' : '#fff4dc';
        rr(g, x, y, cw, rh, 14); g.fill();
        if (!off) {
          g.fillStyle = '#0f5e58';
          g.font = `400 56px ${MONO}`;
          g.textAlign = 'center';
          g.fillText(String((c + 1) * 100), x + cw / 2, y + rh / 2 + 4);
        }
      }
    });
    // выбранная клетка
    const y = pad + 2 * (rh + gap), x = pad + tw + gap + 3 * (cw + gap);
    g.lineWidth = 8;
    g.strokeStyle = '#ffd665';
    rr(g, x - 4, y - 4, cw + 8, rh + 8, 16); g.stroke();
  },
  riddle(g, W, H) {
    boardBase(g, W, H);
    head(g, W, 'ЗАГАДКА', 'загадал Барон · вещь · 2:41');
    const chain = [['бывает дома', 'тепло', '#f6b35b'], ['на кухне', 'тепло', '#f59a4f'], ['горячее', 'горячо!', '#f0705a'], ['со свистком', 'горячо!', '#e2483d']];
    // градусник
    g.fillStyle = 'rgba(255,244,220,.15)';
    rr(g, 64, 160, 46, 560, 23); g.fill();
    const grd = g.createLinearGradient(0, 720, 0, 220);
    grd.addColorStop(0, '#f6b35b'); grd.addColorStop(1, '#e2483d');
    g.fillStyle = grd;
    rr(g, 64, 260, 46, 460, 23); g.fill();
    g.beginPath(); g.arc(87, 740, 44, 0, Math.PI * 2); g.fill();
    chain.forEach(([t, w, col], i) => {
      const y = 158 + i * 142, x = 170 + i * 50;
      g.fillStyle = col;
      rr(g, x, y, 780, 112, 56); g.fill();
      g.fillStyle = '#fffaf0';
      g.font = `800 56px ${FONT}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(t, x + 44, y + 58);
      g.font = `700 40px ${FONT}`;
      g.textAlign = 'right';
      g.fillText(w, x + 750, y + 58);
      if (i < chain.length - 1) { g.fillStyle = 'rgba(255,244,220,.5)'; g.beginPath(); g.moveTo(x + 120, y + 116); g.lineTo(x + 150, y + 140); g.lineTo(x + 180, y + 116); g.fill(); }
    });
    g.fillStyle = '#fff4dc';
    g.textAlign = 'center';
    g.font = `400 150px ${MONO}`;
    g.fillText('?', 1300, 420);
    g.font = `700 36px ${FONT}`;
    g.fillStyle = 'rgba(255,244,220,.75)';
    g.fillText('догадки — в «В игру»', 1300, 560);
  },
  croc(g, W, H) {
    boardBase(g, W, H);
    head(g, W, 'КРОКОДИЛ', 'рисует Оля · 0:47');
    g.fillStyle = '#fffaf0';
    rr(g, 40, 140, W - 80, H - 290, 18); g.fill();
    g.save();
    g.translate(40, 140);
    drawCroc(g, W - 80, H - 290, true);
    g.restore();
    g.fillStyle = '#ffd665';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `400 72px ${MONO}`;
    g.fillText('_ _ _ _', W / 2, H - 76);
  },
  whoofus(g, W, H) {
    boardBase(g, W, H);
    head(g, W, 'КТО ИЗ НАС?', 'вопрос 4 из 10');
    g.fillStyle = '#fff4dc';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 66px ${FONT}`;
    g.fillText('Кто из нас первым уснёт', W / 2, 200);
    g.fillText('на рыбалке?', W / 2, 280);
    const ppl = [['Барон', '#8b5cf6', 4], ['Оля', '#ff5fa2', 1], ['Санёк', '#2fbf71', 2], ['Пломбир', '#ffe3a3', 0], ['Тёма', '#ef4444', 1]];
    const cw = 250, gap = 30, x0 = (W - (cw * 5 + gap * 4)) / 2;
    ppl.forEach(([n, col, v], i) => {
      const x = x0 + i * (cw + gap), y = 360;
      g.fillStyle = i === 0 ? '#ffd665' : '#fff4dc';
      rr(g, x, y, cw, 400, 22); g.fill();
      jellyDot(g, x + cw / 2, y + 120, 74, col);
      g.fillStyle = '#2b231c';
      g.font = `800 42px ${FONT}`;
      g.fillText(n, x + cw / 2, y + 250);
      for (let k = 0; k < 4; k++) { g.fillStyle = k < v ? '#e2483d' : 'rgba(43,35,28,.15)'; g.beginPath(); g.arc(x + cw / 2 - 66 + k * 44, y + 330, 15, 0, Math.PI * 2); g.fill(); }
    });
  },
};

/** Рисунок «Крокодила»: маяк на скале (на табло — с подписью-подсказкой, на мольберте — сам холст) */
function drawCroc(g, W, H, onBoard) {
  if (!onBoard) { g.fillStyle = '#fffaf0'; g.fillRect(0, 0, W, H); }
  const s = Math.min(W / 640, H / 480);
  g.save();
  g.translate((W - 640 * s) / 2, (H - 480 * s) / 2);
  g.scale(s, s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // волны
  g.strokeStyle = '#2f93ad';
  g.lineWidth = 9;
  for (const y of [400, 440]) { g.beginPath(); for (let x = 40; x <= 600; x += 40) g.quadraticCurveTo(x - 20, y - 18, x, y); g.stroke(); }
  // скала
  g.fillStyle = '#9d927f';
  g.beginPath(); g.moveTo(190, 395); g.quadraticCurveTo(230, 330, 320, 340); g.quadraticCurveTo(410, 330, 450, 395); g.fill();
  // башня в полоску
  g.fillStyle = '#fff';
  g.strokeStyle = '#2b231c';
  g.lineWidth = 8;
  g.beginPath(); g.moveTo(280, 345); g.lineTo(300, 140); g.lineTo(340, 140); g.lineTo(360, 345); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#e2483d';
  for (const [a, b] of [[175, 215], [255, 295]]) {
    const w1 = 20 + (a - 140) * 0.098, w2 = 20 + (b - 140) * 0.098;
    g.beginPath(); g.moveTo(320 - w1, a); g.lineTo(320 + w1, a); g.lineTo(320 + w2, b); g.lineTo(320 - w2, b); g.closePath(); g.fill();
  }
  g.strokeStyle = '#2b231c';
  g.beginPath(); g.moveTo(280, 345); g.lineTo(300, 140); g.lineTo(340, 140); g.lineTo(360, 345); g.stroke();
  // фонарь и лучи
  g.fillStyle = '#ffd665';
  g.fillRect(296, 100, 48, 40); g.strokeRect(296, 100, 48, 40);
  g.fillStyle = '#e2483d';
  g.beginPath(); g.moveTo(288, 102); g.lineTo(320, 70); g.lineTo(352, 102); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = '#f2b300';
  g.lineWidth = 10;
  for (const [x1, y1, x2, y2] of [[360, 115, 470, 85], [360, 125, 480, 140], [280, 115, 170, 85], [280, 125, 160, 140]]) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  // чайка
  g.strokeStyle = '#2b231c';
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(470, 210); g.quadraticCurveTo(490, 190, 505, 210); g.quadraticCurveTo(520, 190, 540, 210); g.stroke();
  g.restore();
}
