// Калитка фермы на площади (флаг FARM, docs/farm/level/level.md §9, design-v11 §16.3–16.4): дуга «ФЕРМА» в парапете на
// восточном конце Улицы Аттракционов, указатель и телега с сеном за парапетом — склейка по материалу. Створки
// открываются за 0,3 с, когда подходишь, и закрываются, когда отошёл. У калитки — Фермерша Галя в соломенной шляпе и
// комбинезоне (вещи из каталога фермы): смотрит на подошедшего, машет и зовёт. Здесь же ходячие питомцы фермы на
// набережной (3d/pets.ts). Без флага ничего не грузится и не рисуется (кроме питомцев — их без фермы ни у кого нет).
// Подсказка у калитки — сколько фермеров и не полна ли ферма.
import * as THREE from 'three';
import { FARM_PLOTS } from '../../shared/farmdata.ts';
import { FARM_LAYOUT } from '../../shared/farmlayout.ts';
import type { FarmStatus } from '../../shared/farmnet.ts';
import { ACT_NONE, ACT_WAVE } from '../../shared/lobby.ts';
import { DEFAULT_OUTFIT } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import { Avatar, type AvatarPose } from '../render/avatar.ts';
import { LOCAL_WALKER } from '../render/outfitfarm.ts';
import { WalkPets } from './3d/pets.ts';
import { StaticBatch, loadModel, type Part } from './models.ts';

const G = FARM_LAYOUT.plazaGate;
/** Створки открываются, когда ближе этого (м), за 0,3 с */
const OPEN_R = 4.5;
const OPEN_S = 0.3;
const OPEN_ANGLE = 1.25;
/** Галя машет и зовёт, когда подошли ближе */
const TOUT_R = 7;
const TOUT_LINES = ['На ферму? Заходи, грядка ждёт!', 'Свежая редиска сама себя не вырастит!', 'Семечкин уже приготовил семена!'];

function at(x: number, y: number, z: number, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
}

/** Надпись «ФЕРМА» на доске дуги: своя текстура из canvas (не картинка генератора — без ошибок в буквах) */
function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f3e3c0';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#8a5a2e';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = '#7a3b16';
  ctx.font = 'bold 88px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ФЕРМА', 256, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function leaf(parts: readonly Part[] | undefined): THREE.Group {
  const g = new THREE.Group();
  for (const p of parts ?? []) {
    const m = new THREE.Mesh(p.geo, p.mat);
    m.matrixAutoUpdate = false;
    m.matrix.copy(p.matrix);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

export class FarmGate {
  private readonly refresh: () => void;
  private readonly scene: THREE.Scene;
  private st: FarmStatus | null = null;
  private built = false;
  /** Всё, что калитка добавила на площадь (для замера «до и после») */
  readonly group = new THREE.Group();
  /** Ходячие питомцы фермы на набережной */
  readonly pets: WalkPets;
  private readonly leaves: [THREE.Group, number][] = [];
  private open = 0;
  private tout: Avatar | null = null;
  private readonly toutPose: AvatarPose = { x: G.current.tout.x, y: 0, z: G.current.tout.z, yaw: G.anchor.yaw + Math.PI, pitch: 0, flags: E_ALIVE | E_GROUNDED };
  private toutNear = false;
  private toutLine = 0;
  private time = 0;
  private readonly ground = { groundBelow: () => 0 };

  constructor(scene: THREE.Scene, refreshShadows: () => void) {
    this.refresh = refreshShadows;
    this.scene = scene;
    this.group.name = 'farm-gate';
    scene.add(this.group);
    this.pets = new WalkPets(scene);
  }

  /** Режим включён флагом сервера (в приветствии площади есть статус фермы) */
  get on(): boolean {
    return this.st !== null;
  }

  status(st: FarmStatus | null): void {
    this.st = st;
    if (st && !this.built) {
      this.built = true;
      void this.build();
    }
  }

  /** Подсказка у калитки: ключи и текст */
  hint(): [string[], string] {
    const st = this.st;
    if (!st) return [[], ''];
    if (st.n >= (st.max || FARM_PLOTS)) return [[], `Ферма полна: ${st.n} из ${st.max}`];
    return [['E'], `на ферму · ${st.n} из ${st.max} фермеров`];
  }

  private async build(): Promise<void> {
    const m = await loadModel('plaza_gate');
    const a = G.anchor;
    const c = G.current;
    const b = new StaticBatch();
    const node = (n: string) => m.nodes.get(n);
    b.add(node('plaza_gate'), at(a.x, 0, a.z, a.yaw));
    b.add(node('signpost'), at(c.signpost.x, 0, c.signpost.z, a.yaw));
    b.add(node('plaza_cart'), at(c.cart.x, c.cart.y, c.cart.z, a.yaw));
    for (const mesh of b.build()) this.group.add(mesh);
    // створки на петлях ±0,7: отдельные узлы, поворачиваются
    const cos = Math.cos(a.yaw);
    const sin = Math.sin(a.yaw);
    for (const [lx, n, dir] of [[-0.7, 'plaza_gate_leaf_l', -1], [0.7, 'plaza_gate_leaf_r', 1]] as const) {
      const g = leaf(node(n));
      g.position.set(a.x + lx * cos, 0, a.z - lx * sin);
      g.rotation.y = a.yaw;
      this.group.add(g);
      this.leaves.push([g, dir]);
    }
    // надпись на доске дуги (доска — между столбами на 2,35–2,9 м, лицом к площади)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.37), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    sign.position.set(a.x + 0.097 * sin, G.local.arch.boardY, a.z + 0.097 * cos);
    sign.rotation.y = a.yaw;
    this.group.add(sign);
    // Фермерша Галя
    const tout = new Avatar(-31, { gun: false, voice: false });
    tout.setOutfit({ ...DEFAULT_OUTFIT, c: 13, c2: 15, h: 'straw', u: 'workshirt', l: 'overalls', a: 'none' });
    tout.setInfo('Фермерша Галя', null, false);
    tout.addTo(this.scene);
    this.tout = tout;
    this.refresh();
  }

  /** Кадр площади: створки, Галя, питомцы фермы. camPos — камера (для дальности питомцев и ника Гали) */
  update(dt: number, camPos: THREE.Vector3): void {
    this.time += dt;
    this.pets.update(dt, camPos);
    if (!this.built) return;
    const me = LOCAL_WALKER.get(this.scene);
    const here = me && performance.now() - me.at < 500 ? me : null;
    const gx = G.current.use.x;
    const gz = G.current.use.z;
    const near = here !== null && Math.hypot(here.x - gx, here.z - gz) < OPEN_R;
    this.open = THREE.MathUtils.clamp(this.open + (near ? dt : -dt) / OPEN_S, 0, 1);
    const k = this.open * this.open * (3 - 2 * this.open);
    for (const [g, dir] of this.leaves) g.rotation.y = G.anchor.yaw + dir * OPEN_ANGLE * k;
    const t = this.tout;
    if (!t) return;
    const p = this.toutPose;
    let close = false;
    if (here) {
      const d = Math.hypot(here.x - p.x, here.z - p.z);
      close = d < TOUT_R;
      if (close) p.yaw = Math.atan2(-(here.x - p.x), -(here.z - p.z));
    }
    if (close && !this.toutNear) {
      t.setAction(ACT_WAVE, 0);
      t.say(TOUT_LINES[this.toutLine++ % TOUT_LINES.length]);
      setTimeout(() => t.setAction(ACT_NONE, 0), 2200);
    }
    this.toutNear = close;
    t.update(p, dt, this.time, this.ground, camPos, false);
  }
}
