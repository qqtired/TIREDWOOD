// Всплывающие цифры арсенала: урон по зомби (свой), «+N 💰» за сбитых и общак. При 60 зомби и пулемёте их сотни в
// секунду — поэтому пул из FLOATERS элементов (не больше никогда), цифры по одному зомби за 0,3 с складываются в одну,
// монетки рядом — тоже; лишнее вытесняет самое старое. DOM трогаем только у живых.
import * as THREE from 'three';

const FLOATERS = 28;
/** Окно слияния: урон по одному зомби, золото рядом */
const MERGE_DMG = 0.3;
const MERGE_GOLD = 0.35;
const _v = new THREE.Vector3();

interface Floater {
  el: HTMLElement;
  /** Чей: номер зомби (урон), −1 — золото, −2 — надпись */
  key: number;
  pos: THREE.Vector3;
  born: number;
  life: number;
  max: number;
  vy: number;
  value: number;
  cls: string;
  shownText: string;
  shownCls: string;
}

export class FortFloaters {
  private readonly layer: HTMLElement;
  private readonly pool: Floater[] = [];
  private time = 0;

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'ars-floaters';
    root.appendChild(this.layer);
    for (let i = 0; i < FLOATERS; i++) {
      const el = document.createElement('div');
      el.className = 'ars-fl';
      this.layer.appendChild(el);
      this.pool.push({ el, key: -3, pos: new THREE.Vector3(), born: -9, life: 0, max: 1, vy: 0, value: 0, cls: '', shownText: '', shownCls: '' });
    }
  }

  /** Свободный или самый старый */
  private take(): Floater {
    let best = this.pool[0];
    for (const f of this.pool) {
      if (f.life <= 0) return f;
      if (f.born < best.born) best = f;
    }
    return best;
  }

  /** Урон по зомби zid: за 0,3 с цифры складываются; голова и крит — крупнее и другим цветом */
  damage(zid: number, x: number, y: number, z: number, amount: number, head: boolean, crit: boolean): void {
    for (const f of this.pool) {
      if (f.life > 0 && f.key === zid && this.time - f.born < MERGE_DMG) {
        f.value += amount;
        f.life = f.max;
        if (crit) f.cls = 'crit';
        else if (head && f.cls !== 'crit') f.cls = 'head';
        f.pos.lerp(_v.set(x, y + 0.3, z), 0.5);
        return;
      }
    }
    const f = this.take();
    this.start(f, zid, x + (Math.random() - 0.5) * 0.3, y + 0.3, z + (Math.random() - 0.5) * 0.3, amount, crit ? 'crit' : head ? 'head' : 'dmg', 0.85, 1.3);
  }

  /** «+N 💰» у сбитого; рядом и почти одновременно — одной цифрой */
  gold(x: number, y: number, z: number, amount: number): void {
    for (const f of this.pool) {
      if (f.life > 0 && f.key === -1 && this.time - f.born < MERGE_GOLD && f.pos.distanceTo(_v.set(x, y, z)) < 3) {
        f.value += amount;
        f.life = f.max;
        return;
      }
    }
    this.start(this.take(), -1, x, y + 0.7, z, amount, 'gold', 1.25, 1.5);
  }

  private start(f: Floater, key: number, x: number, y: number, z: number, value: number, cls: string, life: number, vy: number): void {
    f.key = key;
    f.pos.set(x, y, z);
    f.born = this.time;
    f.life = life;
    f.max = life;
    f.vy = vy;
    f.value = value;
    f.cls = cls;
    f.shownText = '';
    f.shownCls = '';
  }

  clear(): void {
    for (const f of this.pool) {
      f.life = 0;
      f.el.className = 'ars-fl';
      f.shownCls = '';
    }
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number): void {
    this.time += dt;
    for (const f of this.pool) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.el.className = 'ars-fl';
        f.shownCls = '';
        continue;
      }
      f.pos.y += f.vy * dt;
      f.vy *= Math.exp(-dt * 2.4);
      const text = f.key === -1 ? `+${Math.round(f.value)} 💰` : String(Math.round(f.value));
      if (text !== f.shownText) {
        f.el.textContent = text;
        f.shownText = text;
      }
      const cls = `ars-fl show ${f.cls}`;
      if (cls !== f.shownCls) {
        f.el.className = cls;
        f.shownCls = cls;
      }
      _v.copy(f.pos).project(camera);
      if (_v.z > 1 || _v.x < -1.2 || _v.x > 1.2 || _v.y < -1.2 || _v.y > 1.2) {
        f.el.style.opacity = '0';
        continue;
      }
      const sx = (_v.x * 0.5 + 0.5) * w;
      const sy = (-_v.y * 0.5 + 0.5) * h;
      const age = f.max - f.life;
      const pop = age < 0.12 ? 1 + (0.12 - age) * 4 : 1;
      f.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
      f.el.style.opacity = String(Math.min(1, f.life * 3));
    }
  }

  /** Сколько элементов сейчас видно (для теста нагрузки) */
  get active(): number {
    let n = 0;
    for (const f of this.pool) if (f.life > 0) n++;
    return n;
  }

  get size(): number {
    return this.pool.length;
  }
}
