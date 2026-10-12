// Небольшие пристройки рыбацкого причала. Сам настил рисует LobbyWorld из map.boxes;
// здесь — его нижняя обвязка, сваи и тумбы, совпадающие с общей физической геометрией.
// plaza3: настилы порта в карте невидимые (мол, голову, сходни рисует pav_mole.glb); здесь — доски, балки и сваи помоста
// Лавки Семёна (FISH_LAVKA_DECK) тем же деревом, что сходни модели, и накладки мест ловли на камне мола.
import * as THREE from 'three';
import { FISH_DECKS, FISH_LAVKA_DECK, FISH_MOORINGS, FISH_SPOTS, type FishPlaceBox } from '../../shared/fishplaces.ts';
import { mergeColored, paint, place, staticMesh } from '../render/kit.ts';

/** Дерево сходней pav_mole.glb (цвета вершин модели, sRGB): доски, тёмные кромки, сваи */
const PLANKS = [0xb07848, 0xb07848, 0xa07048, 0xc09860, 0x986838] as const;
const PLANK_EDGE = 0x684828;
const PILE = 0x887058;
/** Свес покрывного камня мола и головы над помостом (pav_mole: до z 46,59 и до x −61,88 при z ≤ 48,59) */
const COPING = 0.12;
/** До какого z помост примыкает к голове мола (её кромка 48,5 и свес камня) */
const HEAD_Z1 = 48.6;

/**
 * Помост Лавки: доски поперёк сходней (вдоль x) рядами по 0,21 м со щелью 2 см, стыки вразбежку; под ними балки и обвязка,
 * сваи по наружным кромкам до дна. Верх досок — настил (твёрдое — невидимый бокс карты). Доски начинаются за свесом камня
 * мола (север) и головы мола (запад, у головы) — двух плоскостей на одной высоте нет.
 */
function lavkaDeck(d: FishPlaceBox, timber: THREE.BufferGeometry[]): void {
  const top = d.y1;
  const T = 0.05;
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // доски 0,2 м с щелью 1 см; под щелями — тёмная подложка, а не вода (тонкие светлые щели мерцают издалека)
  for (let z = d.z0 + COPING; z + 0.2 <= d.z1 + 1e-6; z += 0.21) {
    // у головы мола (её восточная кромка — x0 помоста) доски начинаются за свесом камня
    const x0 = z < HEAD_Z1 ? d.x0 + COPING : d.x0;
    let x = x0;
    while (x < d.x1 - 0.05) {
      const len = Math.min(d.x1 - x, 1.6 + rnd() * 1.8);
      const c = PLANKS[Math.floor(rnd() * PLANKS.length)];
      timber.push(place(paint(new THREE.BoxGeometry(len - 0.01, T, 0.2), c), x + len / 2, top - T / 2 - rnd() * 0.004, z + 0.1));
      x += len;
    }
  }
  const under = (ux0: number, uz0: number, uz1: number): void => {
    timber.push(place(paint(new THREE.BoxGeometry(d.x1 - ux0, 0.01, uz1 - uz0), PLANK_EDGE), (ux0 + d.x1) / 2, top - T - 0.015, (uz0 + uz1) / 2));
  };
  under(d.x0 + COPING, d.z0 + COPING, HEAD_Z1);
  under(d.x0, HEAD_Z1, d.z1);
  // балки вдоль z (под досками) и обвязка по наружным кромкам: юг и запад
  for (let x = d.x0 + 0.35; x < d.x1 - 0.2; x += 1.05) timber.push(place(paint(new THREE.BoxGeometry(0.12, 0.14, d.z1 - d.z0 - COPING), PLANK_EDGE), x, top - T - 0.07, (d.z0 + COPING + d.z1) / 2));
  timber.push(place(paint(new THREE.BoxGeometry(d.x1 - d.x0, 0.22, 0.08), PLANK_EDGE), (d.x0 + d.x1) / 2, top - T - 0.11, d.z1 - 0.04));
  timber.push(place(paint(new THREE.BoxGeometry(0.08, 0.22, d.z1 - HEAD_Z1), PLANK_EDGE), d.x0 + 0.04, top - T - 0.11, (HEAD_Z1 + d.z1) / 2));
  // сваи: по южной кромке и по западной (там, где помост не у головы), до дна
  const pile = (x: number, z: number): void => {
    timber.push(place(paint(new THREE.CylinderGeometry(0.11, 0.13, 2.4, 8), PILE), x, top - T - 1.2, z));
  };
  for (let i = 0; i <= 3; i++) pile(d.x0 + 0.2 + ((d.x1 - d.x0 - 0.4) * i) / 3, d.z1 - 0.18);
  for (const k of [0.3, 0.65]) pile(d.x0 + 0.18, HEAD_Z1 + (d.z1 - HEAD_Z1) * k);
}

export function addFishPlaces3d(parent: THREE.Object3D): void {
  const timber: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];
  for (const d of FISH_DECKS) {
    // plaza3: настилы порта невидимые — мол, голову и сходни рисует pav_mole.glb (с обвязкой и сваями), помост — lavkaDeck
    if (d.mat === 'concrete' || d.mat === 'invisible') continue;
    const top = d.y1;
    const w = d.x1 - d.x0, depth = d.z1 - d.z0;
    const x = (d.x0 + d.x1) / 2, z = (d.z0 + d.z1) / 2;
    // Обвязка только ниже поверхности, без поперечного ограждения входов.
    for (const edgeX of [d.x0 + 0.04, d.x1 - 0.04]) {
      timber.push(place(paint(new THREE.BoxGeometry(0.08, 0.22, depth), 0x705035), edgeX, top - 0.19, z));
    }
    for (const edgeZ of [d.z0 + 0.04, d.z1 - 0.04]) {
      timber.push(place(paint(new THREE.BoxGeometry(w, 0.22, 0.08), 0x705035), x, top - 0.19, edgeZ));
    }
    // сваи по периметру: на углах и (у длинных настилов) не реже чем через 3,2 м
    const nz = Math.max(1, Math.ceil((depth - 0.44) / 3.2));
    const nx = Math.max(1, Math.ceil((w - 0.44) / 3.2));
    const posts = new Set<string>();
    const post = (px: number, pz: number): void => {
      const key = `${px.toFixed(2)},${pz.toFixed(2)}`;
      if (posts.has(key)) return;
      posts.add(key);
      timber.push(place(paint(new THREE.CylinderGeometry(0.1, 0.12, 1.9, 8), 0x5a4937), px, top - 1.25, pz));
    };
    for (let i = 0; i <= nz; i++) for (const edgeX of [d.x0 + 0.22, d.x1 - 0.22]) post(edgeX, d.z0 + 0.22 + ((depth - 0.44) * i) / nz);
    for (let i = 0; i <= nx; i++) for (const edgeZ of [d.z0 + 0.22, d.z1 - 0.22]) post(d.x0 + 0.22 + ((w - 0.44) * i) / nx, edgeZ);
  }
  // Every fishing station has the same flush timber inset and brass corner marks.
  // Identical local dimensions follow the cast direction; no rails/props interrupt seated exits.
  for (const s of FISH_SPOTS) {
    // места на моле острова (zone isle) — на камне мола, в 2,4 км: своих накладок там нет
    if (s.zone === 'isle') continue;
    const station: THREE.BufferGeometry[]=[];
    for (const side of [-1,1]) {
      station.push(place(paint(new THREE.BoxGeometry(1.64,.007,.032),0x9b8360),0,.006,side*.46));
      station.push(place(paint(new THREE.BoxGeometry(.032,.007,.92),0x9b8360),side*.82,.006,0));
      for(const x of [-.75,.75]) station.push(place(paint(new THREE.BoxGeometry(.115,.011,.07),0xb4a17a),x,.01,side*.4));
    }
    // на камне мола (y −0,5) плиты модели неровные до ±5 мм: накладка на 8 мм выше, чтобы вдали не тонула в них
    const inset=mergeColored(station).rotateY(s.yaw).translate(s.x,(s.y ?? 0) + ((s.y ?? 0) < 0 ? .008 : 0),s.z);
    fittings.push(inset);
  }
  if (FISH_LAVKA_DECK) lavkaDeck(FISH_LAVKA_DECK, timber);
  for (const m of FISH_MOORINGS) {
    timber.push(place(paint(new THREE.CylinderGeometry(m.r, m.r, m.h + 0.32, 10), 0x826044), m.x, (m.h - 0.32) / 2, m.z));
    fittings.push(place(paint(new THREE.CylinderGeometry(m.r * 0.94, m.r * 0.94, 0.03, 10), 0x525b61), m.x, m.h - 0.015, m.z));
    // Небольшая мотка каната не выступает за физический габарит тумбы.
    for (const dy of [0, 0.018, 0.036]) {
      fittings.push(place(paint(new THREE.TorusGeometry(m.r * 0.8, 0.013, 4, 12).rotateX(Math.PI / 2), 0xb9ab85), m.x, 0.43 + dy, m.z));
    }
  }
  const group = new THREE.Group();
  group.name = 'fishing-deck-moorings';
  group.add(staticMesh(mergeColored(timber), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }), true));
  group.add(staticMesh(mergeColored(fittings), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.1 }), true));
  parent.add(group);
}
