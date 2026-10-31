// Рыбацкая доска на площади перед входом на пирс: четыре прежних рейтинга («Сегодня» и «За всё время» — по числу рыб и
// по весу) и «Коллекция» (у кого сколько видов закрыто), деревянная рама и отдельная скульптура мифической гренландской
// акулы на крыше. День и места считает сервер.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { FISH_BOARD } from '../../shared/fishplaces.ts';
import { COLLECTION_SIZE, fmtKg, type FishTop, type FishTopRow } from '../../shared/fishrules.ts';
import { PLAZA3 } from '../../shared/layout.ts';
import { onShowcase } from './plaza3/mounts.ts';
import { mergeColored, paint, place } from '../render/kit.ts';
import { SIGNS3, V3, v3Font, v3Path, v3Rule, v3Star } from '../ui/signs3.ts';

/** Единые координаты с серверной коллизией. */
export const FISH_BOARD_AT = FISH_BOARD;
/** Щит, м */
const BW = FISH_BOARD.w;
const BH = FISH_BOARD.h - FISH_BOARD.panelY;
const BOTTOM = FISH_BOARD.panelY;
/** Холст */
const W = 1024;
const H = Math.round((W * BH) / BW);
const FONT = 'Rubik, system-ui, sans-serif';
const PAD = 22;
/** Три раздела подряд: ширина списка «Рыб», «Вес» и «Коллекция» и промежутки, px (вместе — вся ширина холста) */
const COUNT_W = 160;
const WEIGHT_W = 192;
const COLUMN_GAP = 8;
const SECTION_GAP = 22;
const COLL_W = W - 2 * PAD - 2 * (COUNT_W + WEIGHT_W + COLUMN_GAP) - 2 * SECTION_GAP;
const MEDALS = SIGNS3 ? ['#ffd35a', '#dfe3ea', '#e0a06a'] : ['#f5c542', '#d3d8e2', '#d98c4f'];
const PAINT = '#1f4a5e';
const CREAM = SIGNS3 ? V3.cream : '#f6ead2';
/** Цвета строк: старые — краска по доске, v3 — «Веранда» (слива, золото, крем; ?ui3) */
const INK = SIGNS3
  ? { gold: V3.goldHi, mine: V3.goldHi, mineBg: 'rgba(255, 211, 90, 0.16)', dim: V3.dim, head: 'rgba(236, 216, 182, 0.78)', track: 'rgba(255, 243, 222, 0.14)', fill: V3.teal, medalInk: V3.ink, sep: V3.goldDim }
  : { gold: '#ffd36a', mine: '#ffe39a', mineBg: 'rgba(255, 211, 106, 0.2)', dim: 'rgba(246, 234, 210, 0.55)', head: 'rgba(246, 234, 210, 0.6)', track: 'rgba(246, 234, 210, 0.14)', fill: '#5fd0bf', medalInk: '#2a1708', sep: 'rgba(246, 234, 210, 0.35)' };

export class FishBoard3D {
  readonly group = new THREE.Group();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private key = '';

  constructor(scene: THREE.Scene) {
    this.group.name = 'fish-records-board';
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const wood = 0x8a5a36;
    const dark = 0x5e3a22;
    const yc = BOTTOM + BH / 2;
    const postX = BW / 2 + 0.09;
    // сваи — от дна (под водой) до козырька
    const postLow = WATER_Y - 0.6;
    const postH = BOTTOM + BH + 0.45 - postLow;
    const frame = new THREE.Mesh(
      mergeColored([
        // столбы, рама, козырёк, перекладина-«полочка»
        place(paint(new THREE.BoxGeometry(0.15, postH, 0.15), dark), -postX, postLow + postH / 2, 0),
        place(paint(new THREE.BoxGeometry(0.15, postH, 0.15), dark), postX, postLow + postH / 2, 0),
        // распорка между сваями над водой
        place(paint(new THREE.BoxGeometry(BW + 0.3, 0.12, 0.1), dark), 0, -0.35, 0.08),
        place(paint(new THREE.BoxGeometry(BW + 0.16, BH + 0.16, 0.07), wood), 0, yc, -0.02),
        place(paint(new THREE.BoxGeometry(BW + 0.24, 0.07, 0.16), dark), 0, BOTTOM - 0.06, 0.03),
        place(paint(new THREE.BoxGeometry(BW + 0.5, 0.05, 0.62), 0x9a6a42), 0, BOTTOM + BH + 0.34, 0.04, 0, 0.32),
        place(paint(new THREE.BoxGeometry(BW + 0.5, 0.05, 0.62), 0x8e6038), 0, BOTTOM + BH + 0.34, -0.12, 0, -0.32),
      ]),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    );
    frame.castShadow = true;
    frame.receiveShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.75 }));
    face.position.set(0, yc, 0.02);
    // A carved Greenland shark on roof saddles, separate from all four leaderboard columns.
    const shark = makeRoofShark();
    shark.position.set(0, BOTTOM + BH + 1.07, 0);
    this.group.add(frame, face, shark);
    this.group.position.set(FISH_BOARD_AT.x, FISH_BOARD_AT.y, FISH_BOARD_AT.z);
    // лицом на север (−Z), к мосткам
    this.group.rotation.y = Math.PI + FISH_BOARD_AT.yaw;
    this.group.visible = false;
    scene.add(this.group);
    this.draw(null, 0);
    // plaza3: встала «Рыбная витрина» (WP9) — рама у неё своя, щит уже на поле live_board_records (FISH_BOARD), акула — на
    // гребень вывески (anchor_records_roof): низ её подставок (−0,65 от центра) — на гребне
    if (PLAZA3) {
      onShowcase((m) => {
        frame.visible = false;
        this.group.updateMatrixWorld(true);
        const at = new THREE.Vector3().setFromMatrixPosition(m.roof);
        at.y += 0.66;
        shark.position.copy(this.group.worldToLocal(at));
      });
    }
  }

  /** Доска с сервера (null — ещё нет); myPid — свой профиль. */
  set(top: FishTop | null, myPid: number): void {
    const key = JSON.stringify([top, myPid]);
    if (key === this.key) return;
    this.key = key;
    this.draw(top, myPid);
  }

  private draw(top: FishTop | null, myPid: number): void {
    const c = this.ctx;
    if (SIGNS3) drawFrameV3(c);
    else {
      c.fillStyle = PAINT;
      c.fillRect(0, 0, W, H);
      // краска неровная: светлее к середине, мазки кистью
      const g = c.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H / 2, W * 0.7);
      g.addColorStop(0, 'rgba(255,255,255,0.07)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,0.025)';
      for (let y = 6; y < H; y += 23) c.fillRect(0, y, W, 2);
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      c.fillStyle = '#ffd36a';
      fit(c, '🎣 РЕКОРДЫ РЫБАКОВ', 900, 46, W - 2 * PAD);
      c.fillText('🎣 РЕКОРДЫ РЫБАКОВ', W / 2, 42);
      c.fillStyle = 'rgba(246, 234, 210, 0.35)';
      c.fillRect(PAD, 76, W - 2 * PAD, 3);
    }
    // три раздела подряд: «Сегодня» и «За всё время» (рыб и вес) и «Коллекция» (сколько видов закрыто из всех)
    let x = PAD;
    const part = (w: number): number => { const at = x; x += w + SECTION_GAP; return at; };
    const dayW = COUNT_W + WEIGHT_W + COLUMN_GAP;
    const today = part(dayW);
    const all = part(dayW);
    const coll = part(COLL_W);
    for (const sep of [today + dayW + SECTION_GAP / 2, all + dayW + SECTION_GAP / 2]) {
      if (SIGNS3) {
        // вертикальная золотая линия, тающая к краям (как разделители в карточках HUD)
        const g = c.createLinearGradient(0, 92, 0, H - 16);
        g.addColorStop(0, 'rgba(212, 165, 82, 0)'); g.addColorStop(0.15, INK.sep); g.addColorStop(0.85, INK.sep); g.addColorStop(1, 'rgba(212, 165, 82, 0)');
        c.fillStyle = g;
        c.fillRect(sep - 1, 92, 2, H - 92 - 16);
      } else c.fillRect(sep - 1.5, 92, 3, H - 92 - 16);
    }
    this.section(c, today, 'СЕГОДНЯ', [['Рыб', COUNT_W, top?.dn ?? [], (v) => `${v}`], ['Вес', WEIGHT_W, top?.dg ?? [], fmtKg]], myPid, 'Сегодня ещё никто — будь первым!');
    this.section(c, all, 'ЗА ВСЁ ВРЕМЯ', [['Рыб', COUNT_W, top?.an ?? [], (v) => `${v}`], ['Вес', WEIGHT_W, top?.ag ?? [], fmtKg]], myPid, 'Пока пусто — закидывай удочку!');
    this.section(c, coll, 'КОЛЛЕКЦИЯ', [['закрыто видов', COLL_W, top?.cl ?? [], (v) => `${v}`, ` из ${COLLECTION_SIZE}`]], myPid, 'Закрой первый вид — лови!');
    this.tex.needsUpdate = true;
  }

  /** Раздел доски: заголовок и один или два списка рядом; все пусты — одна подпись по центру. */
  private section(c: CanvasRenderingContext2D, x: number, title: string, cols: ReadonlyArray<readonly [string, number, readonly FishTopRow[], (v: number) => string, string?]>, myPid: number, empty: string): void {
    const w = cols.reduce((s, col) => s + col[1], 0) + COLUMN_GAP * (cols.length - 1);
    c.textAlign = 'center';
    c.fillStyle = CREAM;
    c.font = SIGNS3 ? v3Font(800, 28) : `900 28px ${FONT}`;
    c.fillText(title, x + w / 2, 108);
    const top = 168;
    if (cols.every((col) => col[2].length === 0)) {
      c.fillStyle = INK.dim;
      fit(c, empty, 700, 24, w - 20);
      c.fillText(empty, x + w / 2, top + 150);
      return;
    }
    let cx = x;
    for (const [head, cw, rows, fmt, suffix] of cols) {
      this.column(c, cx, cw, head, rows, top, myPid, fmt, suffix);
      cx += cw + COLUMN_GAP;
    }
  }

  private column(c: CanvasRenderingContext2D, x: number, w: number, head: string, rows: readonly FishTopRow[], top: number, myPid: number, fmt: (v: number) => string, suffix = ''): void {
    c.textAlign = 'center';
    c.fillStyle = INK.head;
    c.font = `700 20px ${FONT}`;
    c.fillText(head, x + w / 2, top - 22);
    const rowH = (H - top - 18) / 10;
    for (let i = 0; i < 10; i++) {
      const r = rows[i];
      const y = top + rowH * (i + 0.5);
      if (!r) continue;
      const mine = myPid > 0 && r.pid === myPid;
      if (mine) {
        c.fillStyle = INK.mineBg;
        c.fillRect(x - 4, y - rowH / 2 + 2, w + 8, rowH - 4);
        if (SIGNS3) {
          c.strokeStyle = V3.gold;
          c.lineWidth = 1.5;
          v3Path(c, x - 4, y - rowH / 2 + 2, w + 8, rowH - 4, 5);
          c.stroke();
        }
      }
      // место: медали у первых трёх
      c.textAlign = 'center';
      if (i < 3) {
        if (SIGNS3) {
          // медаль — маленький медальон: тёмный контур и металл
          c.beginPath();
          c.arc(x + 12, y, 13, 0, Math.PI * 2);
          c.fillStyle = V3.ink;
          c.fill();
        }
        c.beginPath();
        c.arc(x + 12, y, 11.5, 0, Math.PI * 2);
        c.fillStyle = MEDALS[i];
        c.fill();
        c.fillStyle = INK.medalInk;
      } else {
        c.fillStyle = INK.dim;
      }
      c.font = `900 15px ${FONT}`;
      c.fillText(String(i + 1), x + 12, y + 1);
      // число золотом; у коллекции «из 52» — тише, а под строкой полоса «сколько закрыто»
      c.textAlign = 'right';
      let vw = 0;
      if (suffix) {
        c.fillStyle = SIGNS3 ? V3.dim : 'rgba(246, 234, 210, 0.62)';
        c.font = `700 16px ${FONT}`;
        c.fillText(suffix, x + w, y + 1);
        vw = c.measureText(suffix).width;
        c.fillStyle = INK.track;
        c.fillRect(x + 28, y + rowH / 2 - 5, w - 28, 3);
        c.fillStyle = mine ? INK.gold : INK.fill;
        c.fillRect(x + 28, y + rowH / 2 - 5, (w - 28) * Math.min(1, r.v / COLLECTION_SIZE), 3);
      }
      const val = fmt(r.v);
      c.fillStyle = INK.gold;
      c.font = SIGNS3 ? v3Font(800, 21) : `900 20px ${FONT}`;
      c.fillText(val, x + w - vw, y + 1);
      vw += c.measureText(val).width;
      c.textAlign = 'left';
      c.fillStyle = mine ? INK.mine : CREAM;
      fit(c, r.nick, mine ? 900 : 700, 19, w - 28 - vw - 8, 13);
      c.fillText(ellipsis(c, r.nick, w - 28 - vw - 8), x + 28, y + (suffix ? -2 : 1));
    }
  }
}

/** Доска v3: слива с лёгким переходом, тёмный контур, золотая кайма со скосами и звёздочками, заголовок кремом между
 * звёздочками (эмодзи-удочка убрана: эмодзи как иконки не используем) и тающая золотая линия под ним. */
function drawFrameV3(c: CanvasRenderingContext2D): void {
  const g = c.createLinearGradient(0, 0, 0, H);
  // доска освещается светом сцены (не как вывески без света) — слива светлее, чтобы в тени не уходила в чёрное
  g.addColorStop(0, '#553646');
  g.addColorStop(1, '#3e2733');
  c.fillStyle = V3.ink;
  c.fillRect(0, 0, W, H);
  v3Path(c, 5, 5, W - 10, H - 10, 26);
  c.fillStyle = g;
  c.fill();
  v3Path(c, 11, 11, W - 22, H - 22, 22);
  c.strokeStyle = V3.gold;
  c.lineWidth = 3;
  c.stroke();
  for (const [sx, sy] of [[27, 27], [W - 27, 27], [27, H - 27], [W - 27, H - 27]]) v3Star(c, sx, sy, 8);
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  const t = 'РЕКОРДЫ РЫБАКОВ';
  c.font = v3Font(800, 44);
  c.letterSpacing = '2px';
  const tw = c.measureText(t).width;
  c.fillStyle = V3.cream;
  c.fillText(t, W / 2, 44);
  c.letterSpacing = '0px';
  v3Star(c, W / 2 - tw / 2 - 26, 44, 11, V3.goldHi);
  v3Star(c, W / 2 + tw / 2 + 26, 44, 11, V3.goldHi);
  v3Rule(c, PAD + 20, 78, W - 2 * PAD - 40, 3, V3.gold);
}

/** Ник, обрезанный многоточием, если и в самом мелком шрифте (fit) не помещается в maxW. */
function ellipsis(c: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (c.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && c.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

/** Шрифт размера size, уменьшенный (не меньше min), чтобы текст влез в maxW. */
function fit(c: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number, min = 10): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${weight} ${Math.max(min, Math.floor((size * maxW) / w))}px ${FONT}`;
}

/** Solid carved shark silhouette, muted mythic bronze/sea-green patina; no image texture. */
export function makeRoofShark(): THREE.Group {
  const group=new THREE.Group(); group.name='mythic-greenland-shark';
  group.userData.p3keep=true;
  const parts: THREE.BufferGeometry[]=[];
  const profile: [number,number][]=[[.012,-1.15],[.06,-.98],[.16,-.69],[.26,-.25],[.29,.12],[.25,.58],[.17,.92],[.07,1.15],[.015,1.2]];
  const body=paint(new THREE.LatheGeometry(profile.map(([r,x])=>new THREE.Vector2(r,x)),24).rotateZ(-Math.PI/2).scale(1,.88,1),0x64736a);
  const pos=body.getAttribute('position'),colors=body.getAttribute('color');
  for(let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const c=new THREE.Color(y<-.08 ? 0xadb49c : y>.12 ? 0x465a55 : 0x728376);
    c.multiplyScalar(.94+.09*Math.sin(x*91+y*53+z*127));colors.setXYZ(i,c.r,c.g,c.b);
  }
  parts.push(body);
  const fin=(xy: [number,number][],color:number,z=0) => {
    const shape=new THREE.Shape(); shape.moveTo(...xy[0]);for(const v of xy.slice(1))shape.lineTo(...v);shape.closePath();
    return place(paint(new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:false,steps:1}),color),0,0,z-.0175);
  };
  parts.push(fin([[-1.14,.035],[-1.7,.47],[-1.45,.025],[-1.61,-.29],[-1.03,-.03]],0x596b61));
  parts.push(fin([[-.34,.20],[-.40,.64],[.23,.22]],0x4b625a));
  parts.push(fin([[-.82,.10],[-.91,.29],[-.54,.15]],0x53685e));
  for(const side of [-1,1]) {
    const pectoral=fin([[.39,-.11],[-.27,-.46],[-.05,-.10]],0x62786b);
    pectoral.rotateX(side*Math.PI*.29).translate(0,0,side*.16);parts.push(pectoral);
    parts.push(place(paint(new THREE.SphereGeometry(.045,12,8),0xcabf7c),.91,.048,side*.139));
    parts.push(place(paint(new THREE.SphereGeometry(.024,10,7),0x132c2b),.925,.049,side*.17));
    parts.push(place(paint(new THREE.SphereGeometry(.009,7,5),0xf5efc4),.934,.062,side*.19));
    // Gill slits and subtle mouth line on both sides make the head legible.
    for(let i=0;i<5;i++)parts.push(place(paint(new THREE.BoxGeometry(.012,.13,.013).rotateZ(-.13),0x3b534b),.45+i*.052,-.006,side*(.247-i*.012)));
    parts.push(place(paint(new THREE.BoxGeometry(.22,.012,.014).rotateZ(.09),0x46584c),.96,-.07,side*.123));
  }
  // Two steel saddles are bolted to a weathered timber roof plinth.
  parts.push(place(paint(new THREE.BoxGeometry(1.72,.075,.43),0x645746),-.08,-.485,0));
  for(const x of [-.43,.43]) {
    parts.push(place(paint(new THREE.BoxGeometry(.065,.26,.065),0x55625a),x,-.355,0));
    parts.push(place(paint(new THREE.BoxGeometry(.24,.04,.28),0x8b8c6c),x,-.236,0));
    for(const z of [-.14,.14])parts.push(place(paint(new THREE.CylinderGeometry(.019,.019,.02,7),0xb8ab78),x,-.438,z));
    parts.push(place(paint(new THREE.BoxGeometry(.1,.14,.32),0x746044),x,-.585,0));
  }
  const mesh=new THREE.Mesh(mergeColored(parts.map(g=>g.index ? g.toNonIndexed() : g)),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.7,metalness:.12}));
  mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return group;
}
