// Дворовый стол для дурака: клеёнка в клетку со свисающим краем, тарелка семечек с шелухой, эмалированный чайник,
// стаканы в подстаканниках — и плавающая табличка «ДУРАК» над каждым столом (места, ставка, идёт игра / свободно).
// Только украшение: карты, стулья и боты остаются в durak3d.ts, правила и столы — на сервере.
import * as THREE from 'three';
import { MODE_NAMES } from '../../shared/durak.ts';
import type { DurakTableView } from '../../shared/messages.ts';
import { TableSign, type SignModel } from './tablesign.ts';

/** Верх столешницы — 0,775 (см. world.ts); клеёнка лежит на 2 мм выше, карты — ещё на 1,5 мм */
const CLOTH_Y = 0.7775;
const TABLE_R = 0.66;
/** Высота таблички над полом */
const SIGN_Y = 1.62;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function repeatTex(c: HTMLCanvasElement, rx: number, ry: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

/** Клеёнка: красно-белая «шотландка», потёртая — полосы чуть неровные, поверх мелкое зерно. */
function clothCanvas(): HTMLCanvasElement {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#fdf3e6';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(214, 62, 60, 0.62)';
  ctx.fillRect(0, 0, S / 2, S);
  ctx.fillRect(0, 0, S, S / 2);
  // пересечение полос темнее — как у настоящей ткани
  ctx.fillStyle = 'rgba(170, 30, 36, 0.38)';
  ctx.fillRect(0, 0, S / 2, S / 2);
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(80,30,20,0.07)';
    ctx.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), 1 + Math.floor(rnd() * 2), 1);
  }
  return c;
}

/** Семечки: серо-чёрная россыпь с белыми полосками на зёрнышках. */
function seedsTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#2a2724';
  ctx.fillRect(0, 0, S, S);
  let seed = 11;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 520; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const a = rnd() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = rnd() < 0.5 ? '#3a3631' : '#201d1b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rnd() < 0.7 ? '#d9d4c9' : '#9a948a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const mat = (color: number, rough = 0.6, metal = 0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

/** Тело вращения по профилю [радиус, высота] (низ → верх). */
function lathe(points: Array<[number, number]>, seg = 22): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** Всё, что стоит и лежит на одном столе: собирается один раз и клонируется на столы. */
function buildProps(): THREE.Group {
  const g = new THREE.Group();
  const at = (deg: number, r: number): [number, number] => [Math.sin((deg * Math.PI) / 180) * r, Math.cos((deg * Math.PI) / 180) * r];

  // клеёнка: верх и свисающий край с валиком
  const topTex = repeatTex(clothCanvas(), 11, 11);
  const clothMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.5, metalness: 0, emissive: 0xffffff, emissiveMap: topTex, emissiveIntensity: 0.1 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(TABLE_R + 0.025, 56), clothMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = CLOTH_Y;
  g.add(top);
  const skirtTex = repeatTex(clothCanvas(), 27, 1);
  const skirtMat = new THREE.MeshStandardMaterial({ map: skirtTex, roughness: 0.6, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: skirtTex, emissiveIntensity: 0.06 });
  // края тяжело свисают: чуть шире стола, длиной в ладонь
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R + 0.03, TABLE_R + 0.045, 0.13, 56, 1, true), skirtMat);
  skirt.position.y = CLOTH_Y - 0.065;
  g.add(skirt);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R + 0.029, 0.008, 6, 56), mat(0xc83a3c, 0.5));
  hem.rotation.x = Math.PI / 2;
  hem.position.y = CLOTH_Y - 0.002;
  g.add(hem);

  // тарелка семечек (120°): эмалированное блюдце с синей каймой и горка
  {
    const [x, z] = at(120, 0.59);
    const plate = new THREE.Group();
    plate.position.set(x, CLOTH_Y, z);
    plate.scale.setScalar(0.92);
    plate.add(new THREE.Mesh(lathe([[0, 0.002], [0.05, 0.002], [0.066, 0.011], [0.075, 0.019], [0.071, 0.02], [0.06, 0.012], [0, 0.009]], 24), mat(0xf6efe0, 0.45)));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.073, 0.0035, 6, 28), mat(0x2f6fb3, 0.4));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.0195;
    plate.add(rim);
    const heapGeo = new THREE.SphereGeometry(0.052, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    heapGeo.scale(1, 0.55, 1);
    const heap = new THREE.Mesh(heapGeo, new THREE.MeshStandardMaterial({ map: seedsTexture(), roughness: 0.8 }));
    heap.position.y = 0.011;
    plate.add(heap);
    g.add(plate);
  }

  // шелуха россыпью у блюдца и на краю стола
  {
    const n = 22;
    const husk = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 5, 4), new THREE.MeshStandardMaterial({ roughness: 0.9 }), n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    let seed = 3;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const [px, pz] = at(120, 0.59);
    for (let i = 0; i < n; i++) {
      const near = i < 14;
      const a = rnd() * Math.PI * 2;
      const d = near ? 0.085 + rnd() * 0.07 : 0;
      let x = px + Math.cos(a) * d;
      let z = pz + Math.sin(a) * d;
      if (!near) {
        const [ex, ez] = at(95 + rnd() * 55, 0.5 + rnd() * 0.12);
        x = ex;
        z = ez;
      }
      e.set(0, rnd() * Math.PI * 2, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, CLOTH_Y + 0.003, z), q, new THREE.Vector3(0.017, 0.005, 0.009));
      husk.setMatrixAt(i, m);
      col.setHSL(0.09, 0.05 + rnd() * 0.1, 0.25 + rnd() * 0.5);
      husk.setColorAt(i, col);
    }
    g.add(husk);
  }

  // эмалированный чайник со свистком (180°): синий, кремовая крышка, чёрная дужка
  {
    const [x, z] = at(180, 0.6);
    const k = new THREE.Group();
    k.position.set(x, CLOTH_Y, z);
    k.rotation.y = Math.PI * 0.62;
    k.scale.setScalar(0.88);
    const blue = mat(0x2d6db5, 0.35);
    k.add(new THREE.Mesh(lathe([[0, 0.001], [0.058, 0.001], [0.067, 0.014], [0.07, 0.04], [0.064, 0.07], [0.05, 0.092], [0.036, 0.104], [0.034, 0.108]], 22), blue));
    const lid = new THREE.Mesh(lathe([[0, 0.108], [0.034, 0.108], [0.03, 0.114], [0.013, 0.12], [0.009, 0.128], [0.012, 0.134], [0, 0.136]], 14), mat(0xf6efe0, 0.4));
    k.add(lid);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.02, 0.085, 10), blue);
    spout.position.set(0.082, 0.07, 0);
    spout.rotation.z = -0.95;
    k.add(spout);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.0055, 6, 18, Math.PI), mat(0x1c1a19, 0.6));
    handle.rotation.y = Math.PI / 2;
    handle.position.y = 0.088;
    k.add(handle);
    // белые «горошины» на эмали
    const dotMat = mat(0xf6efe0, 0.4);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 6), dotMat);
      dot.scale.z = 0.35;
      dot.position.set(Math.cos(a) * 0.069, 0.044, Math.sin(a) * 0.069);
      dot.rotation.y = -a + Math.PI / 2;
      k.add(dot);
    }
    g.add(k);
  }

  // два стакана чая в подстаканниках (60° и 240°)
  const silver = mat(0xd8dde0, 0.28, 0.35);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.32, roughness: 0.05 });
  const teaMat = new THREE.MeshStandardMaterial({ color: 0xb8561b, roughness: 0.2, transparent: true, opacity: 0.92 });
  [[60, 0.6], [240, 0.6]].forEach(([deg, r], i) => {
    const [x, z] = at(deg, r);
    const s = new THREE.Group();
    s.position.set(x, CLOTH_Y, z);
    s.add(new THREE.Mesh(lathe([[0, 0.001], [0.035, 0.001], [0.035, 0.005], [0.03, 0.011], [0.0295, 0.058], [0.033, 0.066], [0.0315, 0.068], [0.0285, 0.06], [0.0285, 0.014], [0, 0.01]], 20), silver));
    const hand = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0035, 5, 12, Math.PI), silver);
    hand.position.set(0.034, 0.04, 0);
    hand.rotation.z = -Math.PI / 2;
    s.add(hand);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.0235, 0.088, 16, 1, true), glassMat);
    glass.position.y = 0.054;
    s.add(glass);
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.0255, 0.0225, 0.062, 16), teaMat);
    tea.position.y = 0.045;
    s.add(tea);
    const spoon = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.11, 5), silver);
    spoon.position.set(0.012, 0.085, 0);
    spoon.rotation.z = i ? -0.28 : 0.3;
    s.add(spoon);
    g.add(s);
  });
  return g;
}

/** Что написать на табличке по виду стола. */
export function durakSignModel(t: number, v: DurakTableView | null): SignModel {
  const seats = v?.seats ?? [];
  const seated = seats.filter((s) => s.k !== 0).length;
  const anyStake = seats.some((s) => s.k === 1 && s.stake);
  let state: string;
  let tone: SignModel['tone'];
  if (!v || (v.phase === 'wait' && seated === 0)) {
    state = 'свободно';
    tone = 'free';
  } else if (v.phase === 'play') {
    state = 'идёт игра';
    tone = 'busy';
  } else if (v.phase === 'result') {
    state = 'партия окончена';
    tone = 'busy';
  } else if (v.phase === 'count') {
    state = 'сейчас начнём';
    tone = 'wait';
  } else {
    state = 'набор игроков';
    tone = 'wait';
  }
  let stake: string;
  if (!v || seated === 0) stake = 'со ставкой или без';
  else if (anyStake) stake = `🪙 ставка ${v.ante ?? 10}${v.bank ? ` · банк ${v.bank}` : ''}`;
  else stake = 'играют без ставки';
  return { title: 'ДУРАК', sub: `${MODE_NAMES[v?.mode ?? 'throw']} · стол ${t + 1}`, stake, seated, seats: 6, state, tone };
}

export class DurakDecor {
  private readonly root = new THREE.Group();
  private readonly signs = new Map<number, TableSign>();
  private me = -1;

  constructor(scene: THREE.Scene, tables: ReadonlyArray<{ x: number; z: number }>, allowed: readonly number[]) {
    const props = buildProps();
    for (const t of allowed) {
      const tb = tables[t];
      if (!tb) continue;
      const g = props.clone(true);
      // второй стол — со стаканами и чайником на других местах
      g.rotation.y = t % 2 ? Math.PI / 3 : 0;
      g.position.set(tb.x, 0, tb.z);
      this.root.add(g);
      const sign = new TableSign('durak', t * 1.9);
      sign.place(tb.x, SIGN_Y, tb.z);
      sign.set(durakSignModel(t, null));
      scene.add(sign.sprite);
      this.signs.set(t, sign);
    }
    scene.add(this.root);
  }

  /** Новый вид стола t — обновить табличку. */
  setView(t: number, v: DurakTableView): void {
    this.signs.get(t)?.set(durakSignModel(t, v));
  }

  /** Я сел за стол t (−1 — встал): над своим столом табличка не нужна, всё есть на панели. */
  setMe(t: number): void {
    this.me = t;
    for (const [i, s] of this.signs) s.sprite.visible = i !== t;
  }

  /** Ушли с набережной. */
  reset(): void {
    this.setMe(-1);
    for (const [t, s] of this.signs) s.set(durakSignModel(t, null));
  }

  update(_dt: number, time: number, camPos: THREE.Vector3): void {
    for (const s of this.signs.values()) s.update(time, camPos);
  }

  get seatedAt(): number {
    return this.me;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) m.dispose();
      }
    });
    for (const s of this.signs.values()) s.dispose();
    this.signs.clear();
  }
}
