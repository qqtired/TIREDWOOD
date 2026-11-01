// Т-16 «Золотой краб»: сам краб — моб с моделью (client/fort/mobs), здесь — всё вокруг него. Выбежал — крупный баннер и тост
// «стреляй — золото всем»; попадание (crabgold) — у всех «+N» золотом над крабом, брызги монет из пула, тихий звон; пойман —
// баннер и салют монет; ушёл — тост. Золото начисляет сервер (событие gold приходит каждому само).
import { CRAB_HITS, CRAB_JACKPOT } from '../../../shared/fortideas.ts';
import * as THREE from 'three';
import { PRIO } from '../../ui/kit/topcenter.ts';
import { el } from '../ui/dom.ts';
import { fortImg } from '../ui/icons.ts';
import type { IdeasDeps } from './deps.ts';

/** Не чаще: брызги монет и звон при очереди попаданий, с */
const COIN_GAP = 0.12;
const SFX_GAP = 0.18;
const _v = new THREE.Vector3();

export class CrabPart {
  private readonly d: IdeasDeps;
  private readonly tile: HTMLElement;
  private readonly cap: HTMLElement;
  private running = false;
  private lastGold = 0;
  private hits = 0;
  private last = new THREE.Vector3();
  private time = 0;
  private coinAt = -9;
  private sfxAt = -9;

  constructor(d: IdeasDeps) {
    this.d = d;
    this.tile = el('div', 'fti-chip ft-crab-tile', d.row);
    this.tile.hidden = true;
    el('span', 'fti-chip-ic', this.tile).innerHTML = fortImg('gold-crab');
    this.cap = el('span', 'fti-chip-tx', this.tile);
    this.tile.title = `Золотой краб: попадай — золото всем; ${CRAB_HITS} попаданий — джекпот`;
  }

  frame(dt: number): void {
    this.time += dt;
  }

  private paint(): void {
    this.tile.hidden = !this.running;
    if (this.running) this.cap.textContent = `${this.hits}/${CRAB_HITS}`;
  }

  /** ['crab', 'run' | 'caught' | 'gone', zid], ['crabgold', zid, gold, hits]. true — наше */
  onEvent(e: readonly unknown[]): boolean {
    const { hud, sound } = this.d;
    if (e[0] === 'crab') {
      const what = e[1];
      if (what === 'run') {
        this.running = true;
        this.hits = 0;
        this.lastGold = 0;
        hud.ui.push({ key: 'crab-run', hero: true, tone: 'gold', prio: PRIO.boss, ms: 3300, title: 'Золотой краб!', sub: 'Стреляй — монеты всем' });
        sound.horn(0.18);
      } else if (what === 'caught') {
        this.running = false;
        const total = this.lastGold * CRAB_JACKPOT;
        hud.ui.banners.drop('crab-run');
        hud.ui.push({ key: 'crab-caught', hero: true, tone: 'win', prio: PRIO.boss, ms: 3300, title: 'Краб пойман!', sub: total > 0 ? `+${total} золота всем` : 'золото всем' });
        this.burst(this.last.x, this.last.y, this.last.z, true);
        sound.fanfare(null);
      } else if (what === 'gone') {
        this.running = false;
        hud.ui.banners.drop('crab-run');
        hud.ui.push({ key: 'crab-gone', icon: 'gold-crab', tone: 'info', title: 'Краб ушёл в море', sub: this.hits > 0 ? `поймано попаданий: ${this.hits}` : undefined, ms: 3600 });
      } else return false;
      this.paint();
      return true;
    }
    if (e[0] === 'crabgold') {
      const zid = e[1] as number;
      const gold = e[2] as number;
      this.hits = Math.max(this.hits, (e[3] as number) | 0);
      this.lastGold = gold;
      if (this.d.zombies.where(zid, _v)) {
        this.last.copy(_v);
        hud.floaters.gold(_v.x, _v.y + 0.9, _v.z, gold);
        this.burst(_v.x, _v.y, _v.z, false);
      }
      this.paint();
      return true;
    }
    return false;
  }

  private burst(x: number, y: number, z: number, big: boolean): void {
    if (this.time - this.coinAt > COIN_GAP || big) {
      this.coinAt = this.time;
      this.d.eventFx?.coins(x, y + 0.5, z, big);
    }
    if (this.time - this.sfxAt > SFX_GAP || big) {
      this.sfxAt = this.time;
      this.d.sound.coin([x, y + 0.8, z]);
    }
  }

  dispose(): void {
    this.tile.remove();
    this.d.hud.ui.banners.drop('crab-run');
  }
}
