// Стол блэкджека: сукно с надписью, мягкий бортик, зелёная юбка, фишки (текстуры и разложение ставки на номиналы),
// пульт крупье с лотком фишек и башмаком. Здесь только неподвижное «убранство»; карты, фишки ставок и подписи —
// в blackjack3d.ts. Всё считается в системе стола: центр — (0, 0), ось z вниз на карте сверху.
import * as THREE from 'three';

/** Верх столешницы (world.ts: 0,775); сукно на 1,5 мм выше, карты лежат ещё выше */
export const TABLE_TOP = 0.775;
export const FELT_Y = 0.7765;
export const FELT_R = 0.655;
/** Радиус карт игрока от центра, круга ставки и пульта крупье */
export const HAND_R = 0.42;
export const BET_R = 0.565;
export const CONSOLE_R = 0.545;
export const CHIP_R = 0.027;
export const CHIP_H = 0.0055;

/** Номиналы фишек (0 — «играем бесплатно», серая фишка без цены) */
export const DENOMS = [0, 10, 20, 50] as const;

const STYLE: Record<number, { base: string; edge: string; face: string; label: string }> = {
  0: { base: '#8f9a9d', edge: '#e5eced', face: '#a9b4b7', label: '0' },
  10: { base: '#3b7fd8', edge: '#e3efff', face: '#5b97e6', label: '10' },
  20: { base: '#d8453b', edge: '#ffe6e1', face: '#e5675c', label: '20' },
  50: { base: '#2f9d5a', edge: '#dcf7e6', face: '#4cb673', label: '50' },
};

/** Ставка → номиналы фишек снизу вверх: крупные внизу (50, 20, 10 по убыванию). */
export function chipsFor(amount: number): number[] {
  let rest = Math.max(0, Math.round(amount / 10) * 10);
  const out: number[] = [];
  for (const d of [50, 20, 10]) {
    while (rest >= d && out.length < 12) {
      out.push(d);
      rest -= d;
    }
  }
  return out;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Верх фишки: цветной диск с белой каймой-«зубцами», кольцом и ценой. */
function chipTopCanvas(den: number): HTMLCanvasElement {
  const st = STYLE[den];
  const [c, g] = canvas(128, 128);
  g.fillStyle = st.base;
  g.beginPath();
  g.arc(64, 64, 63, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = st.edge;
  g.lineWidth = 13;
  g.lineCap = 'butt';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.arc(64, 64, 55, (i * Math.PI) / 4 - 0.2, (i * Math.PI) / 4 + 0.2);
    g.stroke();
  }
  g.lineWidth = 3;
  g.beginPath();
  g.arc(64, 64, 39, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = st.face;
  g.beginPath();
  g.arc(64, 64, 36, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${st.label.length > 1 ? 34 : 40}px Rubik, system-ui, sans-serif`;
  g.fillText(st.label, 64, 67);
  return c;
}

/** Боковая полоса фишки: цвет и восемь белых «зубцов». */
function chipSideCanvas(den: number): HTMLCanvasElement {
  const st = STYLE[den];
  const [c, g] = canvas(256, 16);
  g.fillStyle = st.base;
  g.fillRect(0, 0, 256, 16);
  g.fillStyle = st.edge;
  for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 4, 0, 14, 16);
  return c;
}

const chipMats = new Map<number, THREE.MeshStandardMaterial[]>();

/** Материалы фишки номинала den: бок, верх, низ. */
export function chipMaterials(den: number): THREE.MeshStandardMaterial[] {
  const have = chipMats.get(den);
  if (have) return have;
  const top = new THREE.CanvasTexture(chipTopCanvas(den));
  top.colorSpace = THREE.SRGBColorSpace;
  top.anisotropy = 4;
  const side = new THREE.CanvasTexture(chipSideCanvas(den));
  side.colorSpace = THREE.SRGBColorSpace;
  side.wrapS = THREE.RepeatWrapping;
  const mats = [
    new THREE.MeshStandardMaterial({ map: side, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ map: top, roughness: 0.45 }),
    new THREE.MeshStandardMaterial({ map: top, roughness: 0.45 }),
  ];
  chipMats.set(den, mats);
  return mats;
}

let chipGeo: THREE.CylinderGeometry | null = null;
export function chipGeometry(): THREE.CylinderGeometry {
  return (chipGeo ??= new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 18));
}

/** Текст по дуге: центр дуги — (cx, cy), середина надписи — под углом mid (0 — вверх, по часовой), верх букв — наружу. */
function arcText(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, radius: number, mid: number, spacing: number): void {
  const widths = [...text].map((ch) => g.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let at = -total / 2;
  g.save();
  g.translate(cx, cy);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...text].forEach((ch, i) => {
    const w = widths[i] - spacing;
    const ang = mid + (at + w / 2) / radius;
    g.save();
    g.rotate(ang);
    g.translate(0, -radius);
    g.fillText(ch, 0, 0);
    g.restore();
    at += widths[i];
  });
  g.restore();
}

/**
 * Рисунок сукна. «Верх» рисунка — дальняя от сидящего сторона, внизу — его место; круги ставок стоят через 60° от него,
 * поэтому при повороте к любому из шести стульев совпадают с местами.
 */
function feltCanvas(): HTMLCanvasElement {
  const S = 1024;
  const C = S / 2;
  const R = S / 2;
  const [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(C, C, 0, C, C, R);
  grad.addColorStop(0, '#2b8c68');
  grad.addColorStop(0.65, '#207858');
  grad.addColorStop(1, '#15563e');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(C, C, R, 0, Math.PI * 2);
  g.fill();
  // ворс сукна
  let seed = 5;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 9000; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * R * 0.99;
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
    g.fillRect(C + Math.cos(a) * r, C + Math.sin(a) * r, 2, 2);
  }
  const px = R / FELT_R;
  // золотые кольца у края
  g.strokeStyle = '#e8c479';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(C, C, 0.632 * px, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(232,196,121,0.7)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(C, C, 0.617 * px, 0, Math.PI * 2);
  g.stroke();
  // круги ставок
  g.strokeStyle = 'rgba(247,232,190,0.7)';
  g.lineWidth = 3;
  g.setLineDash([10, 9]);
  for (let j = 0; j < 6; j++) {
    const a = (j * 60 * Math.PI) / 180;
    const x = C + Math.sin(a) * BET_R * px;
    const y = C + Math.cos(a) * BET_R * px;
    g.fillStyle = 'rgba(255,255,255,0.045)';
    g.beginPath();
    g.arc(x, y, 0.047 * px, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.setLineDash([]);
  // место крупье: тонкий прямоугольник для его карт
  g.strokeStyle = 'rgba(247,232,190,0.3)';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(C - 0.19 * px, C - 0.07 * px, 0.38 * px, 0.14 * px, 16);
  g.stroke();
  // надписи по дуге на дальней стороне: по-английски, как на настоящем сукне, и по-русски про 17
  g.fillStyle = '#f3d98e';
  g.font = `900 40px Rubik, system-ui, sans-serif`;
  arcText(g, 'BLACKJACK PAYS 3 TO 2', C, C, 0.455 * px, 0, 5);
  g.fillStyle = 'rgba(247,238,208,0.82)';
  g.font = `600 24px Rubik, system-ui, sans-serif`;
  arcText(g, 'ДИЛЕР БЕРЁТ ДО 17 И СТОИТ НА ЛЮБЫХ 17', C, C, 0.395 * px, 0, 3);
  return c;
}

export interface Dressing {
  group: THREE.Group;
  /** Сукно (узел с осью y): поворачивается к сидящему */
  felt: THREE.Object3D;
  /** Откуда вылетают карты (в системе стола) */
  mouth: THREE.Vector3;
  /** Лоток фишек: откуда выплата и куда уходят проигранные ставки */
  tray: THREE.Vector3;
  /** Неподвижные стопки в лотке: номинал, сколько фишек, где (центр основания) */
  trayStacks: Array<{ den: number; n: number; x: number; y: number; z: number }>;
  dispose(): void;
}

const mat = (color: number, rough = 0.6, metal = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

export function buildDressing(): Dressing {
  const g = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  // сукно
  const feltTex = new THREE.CanvasTexture(feltCanvas());
  feltTex.colorSpace = THREE.SRGBColorSpace;
  feltTex.anisotropy = 8;
  const feltMat = new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95, emissive: 0xffffff, emissiveMap: feltTex, emissiveIntensity: 0.1 });
  feltMat.polygonOffset = true;
  feltMat.polygonOffsetFactor = -1;
  feltMat.polygonOffsetUnits = -1;
  const felt = new THREE.Mesh(new THREE.CircleGeometry(FELT_R, 64), feltMat);
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = FELT_Y;
  felt.receiveShadow = true;
  // вращение вокруг вертикали при повороте к зрителю: родитель с осью y
  const feltPivot = new THREE.Group();
  feltPivot.position.y = 0;
  feltPivot.add(felt);
  g.add(feltPivot);
  disposables.push(feltTex, feltMat, felt.geometry);

  // мягкий бортик из кожи и зелёная юбка с золотым кантом
  const rail = new THREE.Mesh(new THREE.TorusGeometry(0.672, 0.027, 10, 72), mat(0x5a3623, 0.45));
  rail.rotation.x = Math.PI / 2;
  rail.position.y = TABLE_TOP + 0.006;
  g.add(rail);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.69, 0.7, 0.12, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x1b6a4d, roughness: 0.9, side: THREE.DoubleSide }));
  skirt.position.y = TABLE_TOP - 0.052;
  g.add(skirt);
  const braid = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.007, 6, 64), mat(0xe6c27a, 0.35, 0.3));
  braid.rotation.x = Math.PI / 2;
  braid.position.y = TABLE_TOP - 0.112;
  g.add(braid);
  disposables.push(rail.geometry, rail.material as THREE.Material, skirt.geometry, skirt.material as THREE.Material, braid.geometry, braid.material as THREE.Material);

  // настольная лампа банкира над свечой стола (свеча из world.ts стоит у южного края): зелёный плафон скрывает голую лампочку
  {
    const lamp = new THREE.Group();
    lamp.position.set(0, FELT_Y, 0.58);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.012, 16), mat(0xd4a64a, 0.3, 0.5));
    foot.position.y = 0.006;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), mat(0xd4a64a, 0.3, 0.5));
    stem.position.y = 0.035;
    const shadeGeo = new THREE.SphereGeometry(0.07, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const shade = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: 0x1f8a62, roughness: 0.25, emissive: 0x2fb882, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
    shade.position.y = 0.045;
    shade.scale.set(1, 0.8, 1);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.004, 6, 24), mat(0xd4a64a, 0.3, 0.5));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.045;
    lamp.add(foot, stem, shade, rim);
    g.add(lamp);
    disposables.push(foot.geometry, foot.material as THREE.Material, stem.geometry, stem.material as THREE.Material, shadeGeo, shade.material as THREE.Material, rim.geometry, rim.material as THREE.Material);
  }

  // пульт крупье на дальней (северной) стороне между двумя стульями: лоток и башмак
  const cz = -CONSOLE_R;
  const baseY = FELT_Y + 0.011;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.022, 0.105), mat(0x4b2e1b, 0.5));
  base.position.set(0, baseY, cz);
  g.add(base);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.386, 0.004, 0.006), mat(0xe6c27a, 0.35, 0.3));
  lip.position.set(0, baseY + 0.012, cz + 0.05);
  g.add(lip);
  const trayIn = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.082), mat(0x24150c, 0.8));
  trayIn.position.set(-0.088, baseY + 0.012, cz);
  g.add(trayIn);
  disposables.push(base.geometry, base.material as THREE.Material, lip.geometry, lip.material as THREE.Material, trayIn.geometry, trayIn.material as THREE.Material);
  const stackY = baseY + 0.014 + CHIP_H / 2;
  const trayStacks = [
    { den: 10, n: 8, x: -0.146, y: stackY, z: cz },
    { den: 20, n: 6, x: -0.088, y: stackY, z: cz },
    { den: 50, n: 5, x: -0.03, y: stackY, z: cz },
  ];

  // башмак: тёмный корпус, косая крышка и красная рубашка стопки карт в прорези
  const shoe = new THREE.Group();
  shoe.position.set(0.115, baseY + 0.011, cz);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.034, 0.074), mat(0x232826, 0.4, 0.1));
  body.position.y = 0.017;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.07), mat(0x2f3a35, 0.4, 0.15));
  cap.position.set(0, 0.041, -0.004);
  cap.rotation.x = 0.28;
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.016, 0.05), mat(0x8b1d2f, 0.55));
  stack.position.set(0, 0.049, 0.002);
  stack.rotation.x = 0.28;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.004, 0.004), mat(0xe6c27a, 0.35, 0.3));
  trim.position.set(0, 0.032, 0.037);
  shoe.add(body, cap, stack, trim);
  g.add(shoe);
  disposables.push(body.geometry, body.material as THREE.Material, cap.geometry, cap.material as THREE.Material, stack.geometry, stack.material as THREE.Material, trim.geometry, trim.material as THREE.Material);

  return {
    group: g,
    felt: feltPivot,
    mouth: new THREE.Vector3(0.115, baseY + 0.055, cz + 0.036),
    tray: new THREE.Vector3(-0.088, baseY + 0.03, cz),
    trayStacks,
    dispose() {
      for (const d of disposables) d.dispose();
      g.removeFromParent();
    },
  };
}
