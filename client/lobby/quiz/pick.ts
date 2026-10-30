// «Ракушка», часть 2: мышью по сцене, когда мышь свободна (сидишь, стоишь за пультом, у трибуны).
// Табло: луч → UV квада board_face → точка холста → карточка голосования, пак («Какой пак?») или клетка «Своей игры»
// у игрока с ходом. Раскладка — у Sonnet (ui/board-*.ts через boardRects), подсветка — boardUi (табло рисует её само).
// «Кто из нас?», шаг vote: клик по желейке участника (ближайшая к курсору голова на экране, не своя) → whoVote.
import * as THREE from 'three';
import type { QuizClientMsg } from '../../../shared/quiz/net.ts';
import { QUIZ_VENUE } from '../../../shared/quiz/venue.ts';
import type { Avatar } from '../../render/avatar.ts';
import type { QuizState } from './state.ts';
import { boardRects, boardUi } from './uikit.ts';

/** Голова желейки ближе стольких пикселей к курсору — клик по ней */
const JELLY_PX = 70;
/** Сдвинул мышь больше — это поворот взгляда, а не клик */
const CLICK_PX = 6;

export type PickTarget =
  | { k: 'card'; i: number }
  | { k: 'pack'; i: number }
  | { k: 'cell'; th: number; cell: number }
  | { k: 'jelly'; slot: number };

export interface PickDeps {
  camera: THREE.Camera;
  canvas: HTMLElement;
  /** Квад табло (нет — табло ещё не встало) */
  board: () => THREE.Mesh | null;
  state: QuizState;
  avatarOf: (slot: number) => Avatar | null;
  mySlot: () => number;
  /** Мышь свободна и я на месте «Ракушки» */
  active: () => boolean;
  /** Подсветка на табло поменялась — перерисовать */
  repaint: () => void;
  /** Выбрал желейку в «Кто из нас?» — значок над ней (видно только мне) */
  picked: (slot: number) => void;
}

const _v2 = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _v3 = new THREE.Vector3();

export class QuizPick {
  hover: PickTarget | null = null;
  private down: { x: number; y: number } | null = null;
  /** Где мышь сейчас — подсветку пересчитать на новом снимке, не дожидаясь движения */
  private last: { clientX: number; clientY: number } | null = null;

  private readonly d: PickDeps;

  constructor(d: PickDeps) {
    this.d = d;
    const cv = d.canvas;
    cv.addEventListener('pointermove', (e) => this.move(e));
    cv.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.down = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('pointerup', (e) => {
      const dn = this.down;
      this.down = null;
      if (!dn || e.button !== 0 || Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > CLICK_PX) return;
      const t = this.find(e);
      if (t) this.fire(t);
    });
  }

  /** Что под курсором: точка табло или желейка */
  find(e: { clientX: number; clientY: number }): PickTarget | null {
    const st = this.d.state, b = st.board;
    if (!this.d.active() || !st.inside || !b) return null;
    const me = this.d.mySlot();
    const r = this.d.canvas.getBoundingClientRect();
    // «Кто из нас?»: желейки участников
    const who = b.phase === 'game' && b.mode === 'whoofus' ? b.who : null;
    if (who?.step === 'vote' && st.me?.who?.in) {
      let best: PickTarget | null = null, bd = JELLY_PX;
      for (const p of who.players) {
        if (p.slot === me) continue;
        const av = this.d.avatarOf(p.slot);
        if (!av || !av.root.visible) continue;
        _v3.copy(av.root.position).setY(av.root.position.y + 0.8).project(this.d.camera);
        if (_v3.z > 1) continue;
        const sx = r.left + ((_v3.x + 1) / 2) * r.width, sy = r.top + ((1 - _v3.y) / 2) * r.height;
        const dd = Math.hypot(sx - e.clientX, sy - e.clientY);
        if (dd < bd) { bd = dd; best = { k: 'jelly', slot: p.slot }; }
      }
      return best;
    }
    const mesh = this.d.board();
    if (!mesh || !boardRects) return null;
    _v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_v2, this.d.camera);
    const hit = _ray.intersectObject(mesh, false)[0];
    if (!hit?.uv) return null;
    const W = QUIZ_VENUE.board.canvas[0] ?? 2048, H = QUIZ_VENUE.board.canvas[1] ?? 1024;
    const x = hit.uv.x * W, y = hit.uv.y * H;
    const inR = (q: { x: number; y: number; w: number; h: number }): boolean => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h;
    if (b.phase === 'vote' && b.vote && b.vote.win < 0 && !b.vote.spin) {
      for (let i = 0; i < b.vote.options.length; i++) if (!b.vote.options[i].off && inR(boardRects.card(i))) return { k: 'card', i };
      return null;
    }
    const jp = b.phase === 'game' && b.mode === 'jeopardy' ? b.jp : null;
    if (jp?.step === 'packvote' && jp.packs) {
      for (let i = 0; i < jp.packs.length; i++) if (inR(boardRects.pack(i))) return { k: 'pack', i };
    } else if (jp?.step === 'pick' && jp.turn === me) {
      const rows = jp.themes.length, cols = Math.max(0, ...jp.themes.map((t) => t.cells.length));
      for (let th = 0; th < rows; th++) {
        for (let c = 0; c < jp.themes[th].cells.length; c++) if (jp.themes[th].cells[c] > 0 && inR(boardRects.cell(th, c, rows, cols))) return { k: 'cell', th, cell: c };
      }
    }
    return null;
  }

  /** Новый снимок: то, что под мышью, могло стать (не)доступным */
  refresh(): void {
    if (this.last) this.move(this.last);
    else this.clear();
  }

  private move(e: { clientX: number; clientY: number }): void {
    this.last = { clientX: e.clientX, clientY: e.clientY };
    const t = this.find(e);
    if (same(t, this.hover)) return;
    this.hover = t;
    boardUi.card = t?.k === 'card' ? t.i : -1;
    boardUi.pack = t?.k === 'pack' ? t.i : -1;
    boardUi.cell = t?.k === 'cell' ? [t.th, t.cell] : null;
    this.d.canvas.style.cursor = t ? 'pointer' : '';
    this.d.repaint();
  }

  private fire(t: PickTarget): void {
    const send = (m: QuizClientMsg): void => this.d.state.send(m);
    switch (t.k) {
      case 'card': return send({ t: 'qz', a: 'vote', m: t.i });
      case 'pack': return send({ t: 'qz', a: 'jpPv', i: t.i });
      case 'cell': return send({ t: 'qz', a: 'jpPick', th: t.th, cell: t.cell });
      case 'jelly':
        send({ t: 'qz', a: 'whoVote', slot: t.slot });
        this.d.picked(t.slot);
    }
  }

  /** Ушли с места или сменился шаг — подсветки нет */
  clear(): void {
    if (!this.hover) return;
    this.hover = null;
    boardUi.card = boardUi.pack = -1;
    boardUi.cell = null;
    this.d.canvas.style.cursor = '';
    this.d.repaint();
  }
}

function same(a: PickTarget | null, b: PickTarget | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
