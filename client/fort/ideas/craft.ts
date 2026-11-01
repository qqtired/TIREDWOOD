// Т-4 «Ремесло на забег»: вешалка во дворе (RACK), окно выбора, значок ремесла у плашки золота и «Полный расчёт».
// Окно — тот же прилавок кита (stall.ts, второй экземпляр): четыре ремесла и «Без ремесла», своё отмечено золотом, в волну
// строки заперты с причиной. Мышь на время окна свободна (клик по строке, ✕), клавиши — 1–5, E и Esc закрывают. Шапку на
// желейке рисует сервер через наряд в составе (shared/outfit.ts, client/render/outfit3d.ts) — здесь её нет.
import * as THREE from 'three';
import { FT_BREAK, FT_GATHER } from '../../../shared/fort.ts';
import { CRAFTS, CRAFT_NONE, RACK, USE_CRAFT } from '../../../shared/fortideas.ts';
import { NOPE_CRAFT_PHASE } from '../../../shared/fortarsenal.ts';
import { TOUCH } from '../../touch.ts';
import { StallPanel } from '../stall.ts';
import { el } from '../ui/dom.ts';
import { fortImg } from '../ui/icons.ts';
import type { IdeasDeps } from './deps.ts';
import { CRAFT_ICON, craftName, craftRows, digitCard, nearRack, type IdeasState } from './logic.ts';

/** Вешалку рисует модель Opus (client/fort/ideas/models/rack3d.ts); пока файла нет — временный ящик того же места */
const MODELS = import.meta.glob('./models/rack3d.ts', { eager: true }) as Record<string, { createCraftRack?: () => THREE.Group }>;

const HAT_COLORS = [0xc9b79a, 0x7a2b3a, 0xc0662c, 0x6f7f4a];

function placeholderRack(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.85 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.9, 0.22), wood);
  board.position.y = 0.95;
  board.castShadow = true;
  g.add(board);
  CRAFTS.forEach((c, i) => {
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: HAT_COLORS[i], roughness: 0.7 }));
    hat.position.set(-0.66 + i * 0.44, 1.35, 0.15);
    g.add(hat);
  });
  return g;
}

/** Вешалка в мире: модель Opus или временный ящик; ноги в 0, лицом к +Z */
function makeRack(): THREE.Group {
  const mod = Object.values(MODELS)[0];
  return mod?.createCraftRack ? mod.createCraftRack() : placeholderRack();
}

export class CraftPart {
  private readonly d: IdeasDeps;
  private readonly rack: THREE.Group;
  private readonly panel: StallPanel;
  private readonly craftTile: HTMLElement;
  private readonly fullTile: HTMLElement;
  private st: IdeasState | null = null;
  private pending: number | null = null;
  private pendingAt = 0;
  private opened = false;
  private rowsAt = 0;
  private time = 0;
  private tileKey = '';
  /** Esc у открытого окна: закрыть только его (меню игры не звать) */
  private readonly escCapture = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || !this.opened) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.close(true);
  };

  constructor(d: IdeasDeps) {
    this.d = d;
    this.rack = makeRack();
    this.rack.position.set(RACK.x, 0, RACK.z);
    d.scene.add(this.rack);
    this.panel = new StallPanel(d.hudLayer);
    this.panel.wrap.classList.add('ft-only', 'ft-craft');
    this.panel.onBuy = (id) => this.choose(id);
    this.panel.onClose = () => this.close(true);
    this.craftTile = this.tile('ft-craft-tile');
    this.fullTile = this.tile('ft-full-tile');
    this.fullTile.firstElementChild!.innerHTML = fortImg('medal-gold');
    this.fullTile.lastElementChild!.textContent = '+10 % золота';
    this.fullTile.title = 'Полный расчёт: в команде все четыре ремесла — золото забега +10 % всем';
    this.fullTile.hidden = true;
    this.craftTile.hidden = true;
  }

  private tile(cls: string): HTMLElement {
    const t = el('div', `ft-chip ${cls}`, this.d.row);
    el('span', 'ft-chip-ic', t);
    el('span', 'ft-chip-tx', t);
    return t;
  }

  get shown(): boolean {
    return this.opened;
  }

  private get calm(): boolean {
    const p = this.d.phase();
    return p === FT_GATHER || p === FT_BREAK;
  }

  private get own(): number {
    return this.st?.crafts.get(this.d.myId()) ?? CRAFT_NONE;
  }

  // ------------------------------------------------------------ состояние

  setState(st: IdeasState): void {
    const prev = this.own;
    this.st = st;
    if (this.pending !== null && this.own !== prev) this.pending = null;
    this.paintTiles();
    if (this.opened) this.render(true);
  }

  /** Значки у плашки золота: моё ремесло и «Полный расчёт» */
  private paintTiles(): void {
    const own = this.own;
    const full = this.st?.full === true;
    const key = `${own}|${full}`;
    if (key === this.tileKey) return;
    this.tileKey = key;
    const def = CRAFTS.find((c) => c.id === own);
    this.craftTile.hidden = !def;
    if (def) {
      this.craftTile.firstElementChild!.innerHTML = fortImg(CRAFT_ICON[own] ?? 'level');
      this.craftTile.lastElementChild!.textContent = def.name;
      this.craftTile.title = `${def.name}: ${def.text}`;
    }
    this.fullTile.hidden = !full;
  }

  // ------------------------------------------------------------ вешалка и окно

  /** Подсказка у вешалки: [текст, цена, сработает ли E]; null — не у вешалки */
  hint(): [string, number, boolean] | null {
    if (this.opened) return null;
    const p = this.d.pos();
    if (!nearRack(p.x, p.y, p.z)) return null;
    return [this.calm ? 'ремесло · шапка и умение на забег' : 'ремесло · сменить можно в передышке', 0, true];
  }

  /** E: у вешалки открыть окно, у открытого — закрыть. true — клавишу забрали */
  use(): boolean {
    if (this.opened) {
      this.close(true);
      return true;
    }
    const p = this.d.pos();
    if (!this.d.alive() || !nearRack(p.x, p.y, p.z) || this.d.hud.stall.shown) return false;
    this.open();
    return true;
  }

  private open(): void {
    this.opened = true;
    this.pending = null;
    this.panel.open('craft', 'Ремесло', this.sub());
    this.render(true);
    window.addEventListener('keydown', this.escCapture, true);
    // мышь свободна, пока окно открыто (match.cursorFree): клик по строке и ✕ работают; в игру вернётся при закрытии
    if (!TOUCH) this.d.input.unlock();
    this.d.sound.once('craft-open', 0.2);
  }

  /** grab — закрыли жестом (клавиша, ✕): мышь сразу обратно в игру */
  close(grab = false): void {
    if (!this.opened) return;
    this.opened = false;
    window.removeEventListener('keydown', this.escCapture, true);
    this.panel.close();
    if (TOUCH) return;
    // закрыли жестом (клавиша, ✕) — мышь сразу в игру; нет (отошёл, Esc не жест) — подсказка «кликни — обратно в бой»
    if (grab) void this.d.input.lock().catch(() => {});
    this.d.releaseCursor();
  }

  private sub(): string {
    return this.calm ? 'Шапка и умение — до конца забега' : 'Сменить ремесло можно в передышке';
  }

  private render(force = false): void {
    if (!force && this.time - this.rowsAt < 0.1) return;
    this.rowsAt = this.time;
    if (this.pending !== null && this.time - this.pendingAt > 2.5) {
      this.pending = null;
      this.panel.message('Ответ задерживается — попробуй ещё раз', true);
    }
    this.panel.setSub(this.sub());
    this.panel.render(craftRows(this.own, this.calm), 0, this.pending);
    const rows = this.panel.wrap.querySelectorAll('.ft-row');
    rows.forEach((r, i) => r.classList.toggle('is-own', (i < CRAFTS.length ? CRAFTS[i].id : CRAFT_NONE) === this.own));
  }

  private choose(id: number): void {
    if (!this.opened || (this.pending !== null && this.time - this.pendingAt < 0.6)) return;
    const craft = id - USE_CRAFT;
    if (craft === this.own) {
      this.panel.flash(id, false);
      this.panel.message(craft === CRAFT_NONE ? 'Ремесла и так нет' : `${craftName(craft)} уже на тебе`, true);
      this.d.deny();
      return;
    }
    if (!this.calm) {
      this.panel.flash(id, false);
      this.panel.message('Сменить ремесло можно в передышке', true);
      this.d.deny();
      return;
    }
    this.pending = id;
    this.pendingAt = this.time;
    this.d.send({ t: 'use', id });
    this.render(true);
  }

  /** Клавиши окна: 1–5 — строка, E и Esc — закрыть. true — забрали */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (!this.opened) return false;
    if (!down) return code === 'KeyE';
    if (code === 'Escape' || code === 'KeyE') {
      e.preventDefault();
      if (!e.repeat) this.close(true);
      return true;
    }
    const n = digitCard(code, CRAFTS.length + 1);
    if (n < 0) return false;
    e.preventDefault();
    if (!e.repeat) this.choose(USE_CRAFT + (n < CRAFTS.length ? CRAFTS[n].id : CRAFT_NONE));
    return true;
  }

  // ------------------------------------------------------------ события

  /** ['craft', pid, craft] — сменил ремесло; ['anope', pid, id, why] — отказ. true — наше */
  onEvent(e: readonly unknown[]): boolean {
    if (e[0] === 'craft') {
      const pid = e[1] as number;
      const craft = e[2] as number;
      const me = pid === this.d.myId();
      const name = this.d.nameOf(pid);
      if (me) {
        if (this.opened) {
          this.panel.flash(USE_CRAFT + craft, true);
          this.panel.message(craft === CRAFT_NONE ? 'Шапка снята' : `Надето: ${craftName(craft)}`);
        }
        this.pending = null;
        this.d.bought(false);
      } else {
        const def = CRAFTS.find((c) => c.id === craft);
        this.d.hud.ui.push(def
          ? { key: `craft-${pid}`, icon: CRAFT_ICON[craft] ?? 'level', tone: 'info', title: `${name} — ${def.name}`, ms: 3200 }
          : { key: `craft-${pid}`, icon: 'release', tone: 'info', title: `${name} снял ремесло`, ms: 2200 });
      }
      return true;
    }
    if (e[0] === 'anope' && e[1] === this.d.myId() && typeof e[2] === 'number' && e[2] >= USE_CRAFT && e[2] < USE_CRAFT + 10) {
      this.pending = null;
      if (this.opened) {
        this.panel.flash(e[2], false);
        this.panel.message(e[3] === NOPE_CRAFT_PHASE ? 'Сменить ремесло можно в передышке' : 'Сейчас нельзя', true);
      }
      this.d.deny();
      return true;
    }
    return false;
  }

  /** Раз в кадр: окно закрывается, если отошёл, повален или началась волна без окна */
  frame(dt: number): void {
    this.time += dt;
    if (!this.opened) return;
    const p = this.d.pos();
    if (!this.d.alive() || !nearRack(p.x, p.y, p.z) || this.d.hud.stall.shown || this.d.hud.endShown) {
      this.close(false);
      return;
    }
    this.render();
  }

  dispose(): void {
    this.close(false);
    this.panel.wrap.remove();
    this.craftTile.remove();
    this.fullTile.remove();
    this.rack.removeFromParent();
    this.rack.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      }
    });
  }
}
