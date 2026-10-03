// «Кто где» (Tab на набережной): ники и комнаты всех, кто сейчас в игре.
import { frameForLevel } from '../../shared/levels.ts';
import type { OnlineEntry, RoomKind } from '../../shared/messages.ts';

const ROOM: Record<RoomKind, string> = { lobby: '🏠 Набережная', paintball: '🎯 Склад', race: '🏁 Гонка', fort: '🏰 Крепость', fight: '🥊 Подвал', skill: '☁️ Выше облаков', boatrace: '🚤 Катера', hide: '🔎 Прятки' };

export class OnlineList {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly rows: HTMLElement;
  private list: OnlineEntry[] = [];
  private me = '';
  private open = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'online-list';
    this.title = document.createElement('div');
    this.title.className = 'ol-title';
    this.rows = document.createElement('div');
    this.rows.className = 'ol-rows';
    this.root.append(this.title, this.rows);
    parent.appendChild(this.root);
  }

  get count(): number {
    return this.list.length;
  }

  set(list: OnlineEntry[], me: string): void {
    this.list = list;
    this.me = me;
    if (this.open) this.render();
  }

  show(v: boolean): void {
    if (v === this.open) return;
    this.open = v;
    if (v) this.render();
    this.root.classList.toggle('show', v);
  }

  private render(): void {
    const n = this.list.length;
    this.title.textContent = `Кто где · ${n}`;
    this.rows.textContent = '';
    for (const e of this.list) {
      const row = document.createElement('div');
      row.className = `ol-row${e.nick === this.me ? ' me' : ''}`;
      const nick = document.createElement('b');
      const level = Number.isFinite(e.level) ? Math.max(1, Math.floor(e.level!)) : 1;
      const tier = frameForLevel(level);
      const badge = document.createElement('span');
      badge.textContent = String(level);
      badge.title = `Уровень ${level} · ${tier.name}`;
      badge.setAttribute('aria-label', badge.title);
      Object.assign(badge.style, { display: 'inline-block', minWidth: '23px', marginRight: '7px', padding: '2px 5px', borderRadius: '6px', border: `1px solid ${tier.color}`, color: tier.light, fontSize: '11px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' });
      nick.append(badge, document.createTextNode(e.nick));
      const room = document.createElement('span');
      room.textContent = ROOM[e.room] ?? e.room;
      row.append(nick, room);
      this.rows.appendChild(row);
    }
    if (n === 0) this.rows.textContent = 'Пока никого';
  }
}
