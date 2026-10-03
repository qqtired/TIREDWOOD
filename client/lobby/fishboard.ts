// Рыбацкая доска на площади перед входом на пирс: четыре прежних рейтинга, деревянная рама
// и отдельная скульптура мифической гренландской акулы на крыше. День считает сервер.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { FISH_BOARD } from '../../shared/fishplaces.ts';
import { fmtKg, type FishTop, type FishTopRow } from '../../shared/fishrules.ts';
import { mergeColored, paint, place } from '../render/kit.ts';

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
const PAD = 26;
const MEDALS = ['#f5c542', '#d3d8e2', '#d98c4f'];
const PAINT = '#1f4a5e';
const CREAM = '#f6ead2';

export class FishBoard3D {
  readonly group = new THREE.Group();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private key = '';

  constructor(scene: THREE.Scene) {
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
    c.fillRect(W / 2 - 1.5, 92, 3, H - 92 - 16);
    const half = (W - 2 * PAD) / 2;
    this.half(c, PAD, half - 14, 'СЕГОДНЯ', top?.dn ?? [], top?.dg ?? [], myPid, 'Сегодня ещё никто — будь первым!');
    this.half(c, PAD + half + 14, half - 14, 'ЗА ВСЁ ВРЕМЯ', top?.an ?? [], top?.ag ?? [], myPid, 'Пока пусто — закидывай удочку!');
    this.tex.needsUpdate = true;
  }

  private half(c: CanvasRenderingContext2D, x: number, w: number, title: string, byN: readonly FishTopRow[], byG: readonly FishTopRow[], myPid: number, empty: string): void {
    c.textAlign = 'center';
    c.fillStyle = CREAM;
    c.font = `900 30px ${FONT}`;
    c.fillText(title, x + w / 2, 108);
    const colW = (w - 12) / 2;
    const top = 168;
    if (byN.length === 0) {
      c.fillStyle = 'rgba(246, 234, 210, 0.55)';
      fit(c, empty, 700, 24, w - 20);
      c.fillText(empty, x + w / 2, top + 150);
      return;
    }
    this.column(c, x, colW, 'Рыб', byN, top, myPid, (v) => `${v}`);
    this.column(c, x + colW + 12, colW, 'Вес', byG, top, myPid, (v) => fmtKg(v));
  }

  private column(c: CanvasRenderingContext2D, x: number, w: number, head: string, rows: readonly FishTopRow[], top: number, myPid: number, fmt: (v: number) => string): void {
    c.textAlign = 'center';
    c.fillStyle = 'rgba(246, 234, 210, 0.6)';
    c.font = `700 20px ${FONT}`;
    c.fillText(head, x + w / 2, top - 22);
    const rowH = (H - top - 18) / 10;
    for (let i = 0; i < 10; i++) {
      const r = rows[i];
      const y = top + rowH * (i + 0.5);
      if (!r) continue;
      const mine = myPid > 0 && r.pid === myPid;
      if (mine) {
        c.fillStyle = 'rgba(255, 211, 106, 0.2)';
        c.fillRect(x - 4, y - rowH / 2 + 2, w + 8, rowH - 4);
      }
      // место: медали у первых трёх
      c.textAlign = 'center';
      if (i < 3) {
        c.beginPath();
        c.arc(x + 14, y, 13, 0, Math.PI * 2);
        c.fillStyle = MEDALS[i];
        c.fill();
        c.fillStyle = '#2a1708';
      } else {
        c.fillStyle = 'rgba(246, 234, 210, 0.55)';
      }
      c.font = `900 17px ${FONT}`;
      c.fillText(String(i + 1), x + 14, y + 1);
      const val = fmt(r.v);
      c.textAlign = 'right';
      c.fillStyle = '#ffd36a';
      c.font = `900 21px ${FONT}`;
      c.fillText(val, x + w, y + 1);
      const vw = c.measureText(val).width;
      c.textAlign = 'left';
      c.fillStyle = mine ? '#ffe39a' : CREAM;
      fit(c, r.nick, mine ? 900 : 700, 21, w - 36 - vw - 10);
      c.fillText(r.nick, x + 34, y + 1);
    }
  }
}

/** Шрифт размера size, уменьшенный, чтобы текст влез в maxW. */
function fit(c: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${weight} ${Math.max(10, Math.floor((size * maxW) / w))}px ${FONT}`;
}

/** Solid carved shark silhouette, muted mythic bronze/sea-green patina; no image texture. */
export function makeRoofShark(): THREE.Group {
  const group=new THREE.Group(); group.name='mythic-greenland-shark';
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
