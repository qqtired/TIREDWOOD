// «Огородное пугало» — шаркун-пугало: тыква-фонарь с вырезанным лицом (светится сиреневым), набекрень соломенная шляпа,
// лоскутная рубаха с соломой из-под подола и рукавов, скачет на шесте в одном сапоге. Бьёт, хлопая рукавами,
// гибнет — тыква отваливается и катится, фонарь гаснет, само пугало падает плашмя.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_HOP } from '../../../shared/fort.ts';
import { Z_WALKER } from '../../../shared/fortkinds.ts';
import { ARMY, colored, merge, setBone, setChild, setChildS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { blob, jolt, lathe, legAt, mirrorX, newLeg, smooth, splat, stepLen, walkAmount } from './set-a-shapes.ts';

/** Шест: от земли до рубахи (бедро), длина */
const HIP = 0.62;
const POLE = 0.62;
/** Шея — где сидит тыква, над бедром */
const NECK = 1.12 - HIP;
const SHIRT = 0xb4533c;
const STRAW = 0xe8c35a;
const WOOD = 0x8a6239;
const PUMPKIN = 0xf08a24;

function straw(x: number, y: number, z: number, len: number, rx: number, rz: number): THREE.BufferGeometry {
  return colored(new THREE.ConeGeometry(0.035, len, 4).translate(0, -len / 2, 0).rotateX(rx).rotateZ(rz).translate(x, y, z), STRAW);
}

function bodyGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    lathe([[0.17, 0.5], [0.28, 0.55], [0.265, 0.74], [0.245, 0.93], [0.2, 1.06], [0.07, 1.12]], 10, SHIRT),
    // верёвочный пояс, заплатки, солома из-под подола и ворота
    colored(new THREE.TorusGeometry(0.262, 0.024, 3, 10).rotateX(Math.PI / 2).translate(0, 0.72, 0), 0xc9a46a),
    colored(new THREE.BoxGeometry(0.13, 0.13, 0.03).rotateZ(0.2).translate(0.11, 0.86, 0.235), 0x4f7fb8),
    colored(new THREE.BoxGeometry(0.11, 0.1, 0.03).rotateZ(-0.35).rotateY(-0.9).translate(-0.2, 0.62, 0.17), 0xc8c457),
    splat(-0.08, 0.95, 0.225, 0.065, -0.2, 0.2, 0.95),
    splat(0.2, 0.62, -0.18, 0.08, 0.7, 0, -0.7, ARMY.jamLight),
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    parts.push(straw(Math.sin(a) * 0.25, 0.56, Math.cos(a) * 0.25, 0.16 + (i % 3) * 0.04, Math.cos(a) * 0.35, -Math.sin(a) * 0.35));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    parts.push(straw(Math.sin(a) * 0.08, 1.16, Math.cos(a) * 0.08, 0.1, Math.PI - Math.cos(a) * 0.6, Math.sin(a) * 0.6));
  }
  return merge(parts).translate(0, -HIP, 0);
}

/** Тыква с рёбрами, хвостик, листок и шляпа набекрень; начало координат — шея */
function headGeo(): THREE.BufferGeometry {
  const pumpkin = new THREE.SphereGeometry(0.23, 16, 8);
  const pos = pumpkin.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const k = 1 - 0.07 * (1 - Math.cos(8 * Math.atan2(z, x))) * 0.5;
    pos.setXYZ(i, x * k * 1.12, pos.getY(i) * 0.88, z * k * 1.05);
  }
  pumpkin.computeVertexNormals();
  const hat = merge([
    colored(new THREE.CylinderGeometry(0.31, 0.31, 0.02, 12), 0xd9b25a),
    colored(new THREE.CylinderGeometry(0.13, 0.155, 0.14, 10).translate(0, 0.08, 0), 0xd9b25a),
    colored(new THREE.CylinderGeometry(0.158, 0.158, 0.035, 10, 1, true).translate(0, 0.03, 0), 0x8a3fb0),
  ]).rotateZ(0.32).rotateX(-0.12).translate(0.05, 0.42, -0.02);
  return merge([
    colored(pumpkin, PUMPKIN).translate(0, 0.2, 0),
    colored(new THREE.CylinderGeometry(0.025, 0.035, 0.09, 5).translate(0, 0.42, 0), 0x5b7a2e),
    blob(0.07, 0.012, 0.04, 0x6f9a3a, 6, 3).rotateZ(0.4).translate(-0.07, 0.4, 0.02),
    hat,
    // варенье на макушке
    splat(-0.12, 0.33, 0.12, 0.06, -0.4, 0.75, 0.5),
  ]);
}

/** Вырезанное лицо-фонарь: треугольные глаза, нос, рот зубцами — плоско поверх тыквы, светится */
function faceGeo(): THREE.BufferGeometry {
  const tri = (x: number, y: number, w: number, h: number, flip = 1) => {
    const s = new THREE.Shape();
    s.moveTo(x - w / 2, y - (h / 2) * flip);
    s.lineTo(x + w / 2, y - (h / 2) * flip);
    s.lineTo(x, y + (h / 2) * flip);
    s.closePath();
    return s;
  };
  const mouth = new THREE.Shape();
  const mw = 0.24;
  mouth.moveTo(-mw / 2, 0.12);
  for (let i = 1; i <= 6; i++) mouth.lineTo(-mw / 2 + (i * mw) / 6, i % 2 ? 0.095 : 0.12);
  mouth.lineTo(mw / 2 - 0.03, 0.055);
  mouth.lineTo(0, 0.035);
  mouth.lineTo(-mw / 2 + 0.03, 0.055);
  mouth.closePath();
  const shapes = [tri(-0.085, 0.235, 0.09, 0.08), tri(0.085, 0.235, 0.09, 0.08), tri(0, 0.165, 0.045, 0.04, -1), mouth];
  const geo = new THREE.ShapeGeometry(shapes, 1);
  // чуть выгнуть по тыкве и вынести на поверхность спереди
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, 0.248 - x * x * 1.6);
  }
  geo.computeVertexNormals();
  return colored(geo, ARMY.eye);
}

/** Рукав с соломой из манжеты: вдоль +X от плеча (правый — зеркально) */
function armGeo(side: 1 | -1): THREE.BufferGeometry {
  const parts = [
    colored(new THREE.CylinderGeometry(0.075, 0.09, 0.4, 7, 1, true).rotateZ(Math.PI / 2).translate(0.2, 0, 0), SHIRT),
    colored(new THREE.BoxGeometry(0.1, 0.09, 0.03).translate(0.24, 0.02, 0.08), side > 0 ? 0xc8c457 : 0x4f7fb8),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(colored(new THREE.ConeGeometry(0.03, 0.15, 4).rotateZ(-Math.PI / 2).rotateX(a * 0.3).translate(0.45, Math.sin(a) * 0.04, Math.cos(a) * 0.04), STRAW));
  }
  const g = merge(parts);
  return side > 0 ? g : mirrorX(g);
}

/** Шест в старом сапоге; начало — бедро, вниз до земли */
function poleGeo(): THREE.BufferGeometry {
  return merge([
    colored(new THREE.CylinderGeometry(0.035, 0.04, POLE - 0.06, 6, 1, true).translate(0, -(POLE - 0.06) / 2, 0), WOOD),
    blob(0.075, 0.08, 0.075, 0x5a3a24, 7, 5).translate(0, -POLE + 0.1, 0),
    blob(0.075, 0.05, 0.14, 0x4a2f1d, 7, 4).translate(0, -POLE + 0.045, 0.05),
  ]);
}

const _m0 = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const pole = newLeg();
/** Центр тыквы над шеей (в осях головы) и радиус — катится вокруг центра */
const PUMP_C = 0.2;
const PUMP_R = 0.21;

export const WALKER_SCARECROW: MobDef = {
  id: 'walker-scarecrow',
  name: 'Огородное пугало',
  kinds: [Z_WALKER],
  weight: 1,
  height: 1.68,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: headGeo() },
    { bone: 'extra', geo: faceGeo(), glow: true },
    { bone: 'armL', geo: armGeo(1) },
    { bone: 'armR', geo: armGeo(-1) },
    { bone: 'legL', geo: poleGeo() },
  ],
  pose(a: MobAnim, out: MobPose) {
    const seed = a.seed;
    const s = 0.92 + seed * 0.16;
    const w = walkAmount(a.speed, 0.6);
    // прыжок на шесте за период походки: на земле 32 %, остальное — в воздухе по дуге
    const duty = 0.32;
    const p = a.gait;
    legAt(p, duty, stepLen(1, duty, s), POLE, 0, pole);
    const fly = p >= duty ? (p - duty) / (1 - duty) : 0;
    const land = p < duty ? Math.sin((p / duty) * Math.PI) : 0;
    let hipY = HIP + (pole.hip - POLE) * w + 4 * fly * (1 - fly) * 0.24 * w;
    let lean = 0.1 * w;
    let roll = Math.sin(a.t * 1.3 + seed * 6) * 0.06 * (1 - w);
    const squash = land * 0.12 * w;
    // рукава болтаются: в полёте вверх, на приземлении шлёп вниз
    let droop = 0.28 + (land * 0.35 - fly * (1 - fly) * 1.0) * w + Math.sin(a.t * 2.2 + seed * 4) * 0.05;
    let swing = Math.sin(a.t * 1.7 + seed * 3) * 0.12;
    let swingR = swing;
    let poleX = pole.rx * w;
    let head = 0;
    const tiltHead = (seed - 0.5) * 0.5;

    if (a.st === ZS_ATTACK) {
      // хлопает рукавами по воротам: развёл назад-вверх — хлоп вперёд — обратно
      const k = a.stT;
      const back = k < 0.15 ? smooth(k / 0.15) : k < 0.24 ? 1 - smooth((k - 0.15) / 0.09) : 0;
      const clap = k < 0.15 ? 0 : k < 0.24 ? smooth((k - 0.15) / 0.09) : 1 - smooth((k - 0.24) / 0.3);
      swing = 0.65 * back - 1.42 * clap;
      swingR = swing;
      droop = 0.2 - 0.75 * back + 0.35 * clap;
      lean = 0.05 - 0.15 * back + 0.4 * clap;
      head = 0.3 * clap;
      poleX = 0;
      hipY = HIP;
      roll = 0;
    } else if (a.st === ZS_HOP) {
      droop = -0.6;
      lean = -0.1;
      poleX = -0.3;
    }
    const j = jolt(a.hit);
    lean -= 0.28 * j;
    droop -= 0.4 * j;

    // гибель: валится плашмя назад, тыква отлетает вперёд и катится, фонарь гаснет, всё уходит в землю
    const d = a.die;
    const fall = smooth(d / 0.45);
    const sink = smooth((d - 0.62) / 0.38);
    setBone(_m0, 0, -0.3 * sink, 0, -1.45 * fall, 0, 0, s);
    setChildS(out.body, _m0, 0, hipY, 0, lean, 0, roll, 1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
    if (d <= 0.12) {
      setChild(out.head, out.body, 0, NECK, 0, head - 0.3 * j, (seed - 0.5) * 0.6 + Math.sin(a.t * 0.8 + seed * 9) * 0.15, tiltHead * 0.3 + roll);
    } else {
      // своя траектория в осях корня: подлетела, упала вперёд, подскочила и покатилась (вокруг своего центра)
      const u = (d - 0.12) / 0.88;
      const t = Math.min(1, u / 0.35);
      const top = HIP + NECK + PUMP_C;
      let yc = PUMP_R + (top - PUMP_R) * (1 - t * t) + 0.4 * t * (1 - t);
      if (u > 0.35 && u < 0.55) yc += 0.12 * Math.sin(((u - 0.35) / 0.2) * Math.PI);
      const z = 0.75 * t + 0.45 * smooth((u - 0.35) / 0.4);
      setBone(out.head, 0, yc * s - 0.4 * sink, z * s, z / PUMP_R, 0.4, tiltHead, s * (1 - 0.5 * sink));
      out.head.multiply(_t.makeTranslation(0, -PUMP_C, 0));
    }
    // фонарь гаснет: лицо втягивается в тыкву
    const lit = Math.max(0.02, 1 - smooth((d - 0.4) / 0.25));
    out.extra.copy(out.head);
    if (lit < 1) out.extra.multiply(_t.makeScale(lit, lit, lit));
    setChild(out.armL, out.body, 0.22, 0.98 - HIP, 0, 0, swing, -droop);
    setChild(out.armR, out.body, -0.22, 0.98 - HIP, 0, 0, -swingR, droop);
    setChildS(out.legL, out.body, 0, 0, 0, poleX - lean, 0, -roll, 1 / (1 + squash * 0.6), 1 / (1 - squash), 1 / (1 + squash * 0.6));
  },
};
