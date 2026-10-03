// «Press F to pay respects» у статуи — то, что видно и слышно (решает сервер, shared/respect.ts).
// Кто отдал честь — из его руки к подножию летит тёплый огонёк и зажигает свечу в красном стекле (горит минуту),
// над головой поднимается золотая «F». Пока хоть кто-то стоит смирно, вокруг статуи поднимаются искры и она
// светлеет — чем больше людей сразу, тем ярче. Тихая мелодия — одна на всех рядом. Перед постаментом — плита
// «RESPECTS PAID» с общим счётом. Файлы статуи не трогаем: своё — в своей группе, привязанной к постаменту так же.
import * as THREE from 'three';
import { STATUE } from '../../shared/maps/lobby.ts';
import type { Sound } from '../audio.ts';
import { glowTexture, mergeColored, paint, place } from '../render/kit.ts';
import type { LobbyFx } from './fx.ts';

/** Свечи полукругом перед постаментом (в его осях: +z — к зрителю), по порядку от середины к краям */
const CANDLES = 16;
const ARC_R = 1.05;
const ARC_HALF = 1.2;
/** Свеча горит минуту, последние 6 с гаснет; зажглась — «вспыхивает» за 0,3 с */
const CANDLE_S = 60;
const FADE_S = 6;
const POP_S = 0.3;
/** Огонёк летит из руки к свече по дуге */
const MOTE_S = 1.5;
const MOTE_ARC = 1.2;
const MOTES = 8;
/** Искры вокруг статуи: цилиндр радиуса 1,5 м, от колен до макушки */
const SPARKS = 48;
const SPARK_R = 1.5;
const SPARK_Y0 = 0.3;
const SPARK_Y1 = 4.6;
/** Плита со счётом — перед прожекторами */
const PLAQUE_Z = 1.95;
const PLAQUE_TILT = 0.5;
/** Плита: ширина, высота спереди, глубина */
const PLAQUE_W = 0.74;
const PLAQUE_H = 0.16;
const PLAQUE_D = 0.3;
const FONT = 'Rubik, system-ui, sans-serif';

interface Mote {
  s: THREE.Sprite;
  t: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  slot: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Respects {
  private readonly group = new THREE.Group();
  private readonly fx: LobbyFx;
  private readonly sound: Sound;
  private readonly candles: THREE.InstancedMesh;
  /** Места свечей в осях постамента */
  private readonly slots: THREE.Vector3[] = [];
  /** Сколько ещё гореть (0 — не горит) и сколько уже горит, с */
  private readonly life = new Float32Array(CANDLES);
  private readonly age = new Float32Array(CANDLES);
  /** К свече уже летит огонёк */
  private readonly booked = new Uint8Array(CANDLES);
  private readonly flameCol: Float32Array;
  private readonly flameAttr: THREE.BufferAttribute;
  private readonly motes: Mote[] = [];
  private readonly halo: THREE.Sprite;
  private readonly sparkPos: Float32Array;
  private readonly sparkCol: Float32Array;
  private readonly sparkSpeed: Float32Array;
  private readonly sparkGeo: THREE.BufferGeometry;
  private readonly plaqueCtx: CanvasRenderingContext2D;
  private readonly plaqueTex: THREE.CanvasTexture;
  private count = -1;
  /** Насколько светло вокруг статуи сейчас (0…1, плавно) */
  private glow = 0;

  constructor(scene: THREE.Scene, fx: LobbyFx, sound: Sound) {
    this.fx = fx;
    this.sound = sound;
    const g = this.group;
    g.position.set(STATUE.x, 0, STATUE.z);
    g.rotation.y = STATUE.yaw + Math.PI;
    scene.add(g);
    g.updateMatrixWorld(true);

    // свечи: красное стекло с ободком, все горящие — одним инстансом (погасшие — нулевого размера)
    for (let i = 0; i < CANDLES; i++) {
      const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      const a = (k / ((CANDLES - 1) / 2)) * ARC_HALF;
      this.slots.push(new THREE.Vector3(Math.sin(a) * ARC_R, 0, Math.cos(a) * ARC_R));
    }
    const votive = mergeColored([
      place(paint(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 14), 0xa8231a), 0, 0.05, 0),
      place(paint(new THREE.CylinderGeometry(0.053, 0.053, 0.012, 14), 0xd9b25a), 0, 0.102, 0),
    ]);
    this.candles = new THREE.InstancedMesh(votive, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.3, emissive: 0xff5a2a, emissiveIntensity: 0.9,
    }), CANDLES);
    this.candles.frustumCulled = false;
    for (let i = 0; i < CANDLES; i++) this.candles.setMatrixAt(i, _m.makeScale(0, 0, 0));
    g.add(this.candles);
    const flamePos = new Float32Array(CANDLES * 3);
    this.slots.forEach((p, i) => flamePos.set([p.x, 0.14, p.z], i * 3));
    this.flameCol = new Float32Array(CANDLES * 3);
    this.flameAttr = new THREE.BufferAttribute(this.flameCol, 3).setUsage(THREE.DynamicDrawUsage);
    const flameGeo = new THREE.BufferGeometry();
    flameGeo.setAttribute('position', new THREE.BufferAttribute(flamePos, 3));
    flameGeo.setAttribute('color', this.flameAttr);
    const flames = new THREE.Points(flameGeo, new THREE.PointsMaterial({
      size: 0.5, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    flames.frustumCulled = false;
    g.add(flames);

    // огоньки в полёте
    for (let i = 0; i < MOTES; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xffc46a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      s.scale.setScalar(0.3);
      s.visible = false;
      scene.add(s);
      this.motes.push({ s, t: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), slot: 0 });
    }

    // свет вокруг фигуры и искры
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.halo.position.set(0, 2.5, 0.1);
    this.halo.scale.setScalar(4.4);
    g.add(this.halo);
    this.sparkPos = new Float32Array(SPARKS * 3);
    this.sparkCol = new Float32Array(SPARKS * 3);
    this.sparkSpeed = new Float32Array(SPARKS);
    for (let i = 0; i < SPARKS; i++) this.resetSpark(i, SPARK_Y0 + Math.random() * (SPARK_Y1 - SPARK_Y0));
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    const sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({
      size: 0.09, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    sparks.frustumCulled = false;
    g.add(sparks);

    // плита «RESPECTS PAID»: низкий клин полированного гранита, лицо наклонено к тому, кто подошёл
    const plaque = new THREE.Group();
    plaque.position.set(0, 0, PLAQUE_Z);
    const back = PLAQUE_H + PLAQUE_D * Math.tan(PLAQUE_TILT);
    const wedge = new THREE.Shape();
    wedge.moveTo(-PLAQUE_D / 2, 0);
    wedge.lineTo(PLAQUE_D / 2, 0);
    wedge.lineTo(PLAQUE_D / 2, PLAQUE_H);
    wedge.lineTo(-PLAQUE_D / 2, back);
    wedge.closePath();
    // профиль клина рисуется в плоскости XY и вытягивается по Z — поворачиваем, чтобы ширина легла по X
    const wedgeGeo = new THREE.ExtrudeGeometry(wedge, { depth: PLAQUE_W, bevelEnabled: false }).translate(0, 0, -PLAQUE_W / 2).rotateY(-Math.PI / 2);
    const stone = mergeColored([
      paint(wedgeGeo, 0x34363b),
      place(paint(new THREE.BoxGeometry(PLAQUE_W + 0.08, 0.03, PLAQUE_D + 0.08), 0x26282c), 0, 0.015, 0),
    ]);
    const stoneMesh = new THREE.Mesh(stone, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 }));
    stoneMesh.castShadow = true;
    stoneMesh.receiveShadow = true;
    plaque.add(stoneMesh);
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 220;
    this.plaqueCtx = c.getContext('2d')!;
    this.plaqueTex = new THREE.CanvasTexture(c);
    this.plaqueTex.colorSpace = THREE.SRGBColorSpace;
    this.plaqueTex.anisotropy = 4;
    const slope = PLAQUE_D / Math.cos(PLAQUE_TILT);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PLAQUE_W - 0.05, slope - 0.04), new THREE.MeshBasicMaterial({ map: this.plaqueTex, color: 0xd8d0c0 }));
    face.rotation.x = -Math.PI / 2 + PLAQUE_TILT;
    face.position.set(0, (PLAQUE_H + back) / 2 + 0.002, 0.001);
    plaque.add(face);
    g.add(plaque);
    this.setCount(0);
  }

  /** Сколько всего раз отдавали честь (с сервера). */
  setCount(n: number): void {
    if (n === this.count) return;
    this.count = n;
    const ctx = this.plaqueCtx;
    const w = 512;
    const h = 220;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#2c2e33');
    bg.addColorStop(1, '#17181b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, w - 44, h - 44);
    const gold = ctx.createLinearGradient(0, 40, 0, 190);
    gold.addColorStop(0, '#fff0b8');
    gold.addColorStop(1, '#d9a63a');
    ctx.fillStyle = gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 34px ${FONT}`;
    ctx.letterSpacing = '6px';
    ctx.fillText('RESPECTS PAID', w / 2 + 3, 66);
    ctx.letterSpacing = '0px';
    ctx.font = `800 84px ${FONT}`;
    ctx.fillText(n.toLocaleString('ru-RU'), w / 2, 148);
    this.plaqueTex.needsUpdate = true;
  }

  /** Кто-то отдал честь: hand — где его рука (в мире), total — счёт с сервера. */
  onRespect(hand: THREE.Vector3, head: THREE.Vector3, total: number): void {
    this.setCount(total);
    this.fx.floatText(head.x, head.y, head.z, 'F', '#ffe39a');
    this.sound.respectTheme([STATUE.x, 2, STATUE.z]);
    const mote = this.motes.find((m) => m.t < 0) ?? this.motes[0];
    const slot = this.freeSlot();
    mote.t = 0;
    mote.slot = slot;
    mote.from.copy(hand);
    mote.to.copy(this.slots[slot]).setY(0.12);
    this.group.localToWorld(mote.to);
    mote.s.visible = true;
    this.booked[slot] = 1;
  }

  /** Свеча для нового огонька: незажжённая ближе к середине, иначе — та, что догорает (к которой не летят). */
  private freeSlot(): number {
    let best = -1;
    for (let i = 0; i < CANDLES; i++) {
      if (this.booked[i]) continue;
      if (this.life[i] === 0) return i;
      if (best < 0 || this.life[i] < this.life[best]) best = i;
    }
    return best < 0 ? 0 : best;
  }

  private resetSpark(i: number, y: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.random() * (SPARK_R - 0.5);
    this.sparkPos[i * 3] = Math.sin(a) * r;
    this.sparkPos[i * 3 + 1] = y;
    this.sparkPos[i * 3 + 2] = Math.cos(a) * r;
    this.sparkSpeed[i] = 0.45 + Math.random() * 0.5;
  }

  /** Кадр: active — сколько желеек сейчас отдают честь. */
  update(dt: number, time: number, active: number): void {
    this.glow += (Math.min(1, active / 3) - this.glow) * Math.min(1, dt * 1.6);
    this.halo.material.opacity = 0.22 * this.glow;

    for (const m of this.motes) {
      if (m.t < 0) continue;
      m.t += dt / MOTE_S;
      if (m.t >= 1) {
        m.t = -1;
        m.s.visible = false;
        this.booked[m.slot] = 0;
        this.life[m.slot] = CANDLE_S;
        this.age[m.slot] = 0;
        this.fx.sparkle(m.to.x, m.to.y + 0.05, m.to.z, 8);
        continue;
      }
      const t = m.t;
      // дуга: середина выше на MOTE_ARC
      _p.lerpVectors(m.from, m.to, t);
      _p.y += Math.sin(t * Math.PI) * MOTE_ARC;
      m.s.position.copy(_p);
      m.s.scale.setScalar(0.24 + Math.sin(time * 18 + m.slot) * 0.03);
    }

    for (let i = 0; i < CANDLES; i++) {
      let k = 0;
      if (this.life[i] > 0) {
        this.life[i] = Math.max(0, this.life[i] - dt);
        this.age[i] += dt;
        const pop = Math.min(1, this.age[i] / POP_S);
        const fade = Math.min(1, this.life[i] / FADE_S);
        const flicker = 0.82 + Math.sin(time * 13 + i * 2.1) * 0.1 + Math.sin(time * 29 + i) * 0.08;
        k = pop * fade * flicker;
        // стаканчик «вырастает» вместе со вспышкой и исчезает, когда огонёк погас
        const sc = this.life[i] > 0 ? 0.6 + 0.4 * pop : 0;
        this.candles.setMatrixAt(i, _m.compose(_s.copy(this.slots[i]), _q.identity(), _p.setScalar(sc)));
      }
      this.flameCol[i * 3] = 1 * k;
      this.flameCol[i * 3 + 1] = 0.62 * k;
      this.flameCol[i * 3 + 2] = 0.26 * k;
    }
    this.candles.instanceMatrix.needsUpdate = true;
    this.flameAttr.needsUpdate = true;

    if (this.glow > 0.01) {
      for (let i = 0; i < SPARKS; i++) {
        const y = this.sparkPos[i * 3 + 1] + this.sparkSpeed[i] * dt;
        if (y > SPARK_Y1) this.resetSpark(i, SPARK_Y0);
        else this.sparkPos[i * 3 + 1] = y;
        const yy = this.sparkPos[i * 3 + 1];
        const a = Math.min(1, (yy - SPARK_Y0) / 0.6, (SPARK_Y1 - yy) / 1.2) * this.glow * (0.6 + Math.sin(time * 7 + i) * 0.4);
        this.sparkCol[i * 3] = a;
        this.sparkCol[i * 3 + 1] = 0.82 * a;
        this.sparkCol[i * 3 + 2] = 0.45 * a;
      }
      this.sparkGeo.getAttribute('position').needsUpdate = true;
      this.sparkGeo.getAttribute('color').needsUpdate = true;
    } else if (this.sparkCol[0] !== 0 || this.sparkCol[1] !== 0) {
      this.sparkCol.fill(0);
      this.sparkGeo.getAttribute('color').needsUpdate = true;
    }
  }

  debug(): Record<string, unknown> {
    return {
      count: this.count, glow: Math.round(this.glow * 100) / 100,
      lit: Array.from(this.life).filter((l) => l > 0).length, flying: this.motes.filter((m) => m.t >= 0).length,
    };
  }
}
