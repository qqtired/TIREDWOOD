// Интерфейс поверх игры (DOM). Обновляем только то, что изменилось, — без лишней работы в кадре.
import * as THREE from 'three';
import { TEAM_CSS, TEAM_NAMES } from '../../shared/constants.ts';
import { SLOT_SYMBOLS, type RosterEntry, type SlotBonus } from '../../shared/messages.ts';
import { TOUCH } from '../touch.ts';
import { setCoinText } from '../ui/coin.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

interface Floater {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  life: number;
  vy: number;
}

const _v = new THREE.Vector3();

const AMMO_HINT = 'R — перезарядка · Q — плечо';
const AWP_HINT = 'ПКМ — оптика · без перезарядки';

export class Hud {
  readonly root: HTMLElement;
  private readonly scoreEls: HTMLElement[] = [];
  private readonly scoreFill: HTMLElement[] = [];
  private readonly phaseEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly cross: HTMLElement;
  /** Крестик блокировки: куда на самом деле попадёт шарик, если путь из глаз перекрыт */
  private readonly block: HTMLElement;
  private readonly hit: HTMLElement;
  /** Оптический прицел AWP: всё тёмное, кроме круга с перекрестьем */
  private readonly scope: HTMLElement;
  private readonly vitals: HTMLElement;
  private readonly hpNum: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpGhost: HTMLElement;
  private readonly armorRow: HTMLElement;
  private readonly armorFill: HTMLElement;
  private readonly armorNum: HTMLElement;
  private readonly bonusEl: HTMLElement;
  private readonly ammoCard: HTMLElement;
  private readonly ammoHint: HTMLElement | null;
  private readonly ammoNum: HTMLElement;
  private readonly ammoMax: HTMLElement;
  private readonly reloadBar: HTMLElement;
  private readonly reloadFill: HTMLElement;
  private readonly dashEl: HTMLElement;
  private readonly dashFill: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly center: HTMLElement;
  private readonly centerSub: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly death: HTMLElement;
  private readonly deathBy: HTMLElement;
  private readonly deathTimer: HTMLElement;
  private readonly board: HTMLElement;
  private readonly endScreen: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly paintLayer: HTMLElement;
  private readonly arcs: HTMLElement[] = [];
  private arcNext = 0;
  private readonly floaterLayer: HTMLElement;
  private readonly floaters: Floater[] = [];
  private floaterNext = 0;
  private readonly stats: HTMLElement;
  private readonly spawnShield: HTMLElement;
  private last: Record<string, string | number | boolean> = {};
  private centerTimer = 0;
  private bannerTimer = 0;
  private ghostHp = 100;
  /** До какого времени (performance.now) подсвечивать отхил */
  private regenUntil = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = '';

    // оптика AWP — самым нижним слоем оболочки: над миром, но под кнопками телефона,
    // счётом, карточками и метками попаданий (внутри root она закрыла бы кнопки — они под интерфейсом сцен)
    this.scope = el('div', 'scope');
    const lens = el('div', 'scope-lens', this.scope);
    el('i', 'sc-h', lens);
    el('i', 'sc-v', lens);
    el('b', 'sc-dot', lens);
    const shell = root.parentElement ?? root;
    shell.insertBefore(this.scope, shell.firstChild);

    // --- счёт и время
    const top = el('div', 'scorebar', root);
    const teamBox = (t: 0 | 1) => {
      const team = el('div', `team t${t}`);
      const name = el('span', 'tname', undefined, TEAM_NAMES[t]);
      const score = el('b', 'tscore', undefined, '0');
      const bar = el('i', 'tbar');
      const fill = el('i', 'tfill', bar);
      if (t === 0) team.append(name, score);
      else team.append(score, name);
      team.appendChild(bar);
      this.scoreEls.push(score);
      this.scoreFill.push(fill);
      return team;
    };
    const clock = el('div', 'clock');
    this.phaseEl = el('span', 'phase', clock, 'РАЗМИНКА');
    this.timeEl = el('b', 'time', clock, '0:00');
    top.append(teamBox(0), clock, teamBox(1));

    // --- прицел и маркер попадания
    this.cross = el('div', 'cross', root);
    for (const c of ['l', 'r', 'u', 'd']) el('i', `c-${c}`, this.cross);
    el('b', 'c-dot', this.cross);
    this.block = el('div', 'cross-block', root);
    this.hit = el('div', 'hitmark', root);
    for (let i = 0; i < 4; i++) el('i', '', this.hit);
    for (let i = 0; i < 4; i++) this.arcs.push(el('div', 'dmg-arc', root));

    this.vignette = el('div', 'vignette', root);
    this.paintLayer = el('div', 'paint-layer', root);
    this.floaterLayer = el('div', 'floaters', root);
    for (let i = 0; i < 24; i++) {
      const f = el('div', 'floater', this.floaterLayer);
      this.floaters.push({ el: f, pos: new THREE.Vector3(), life: 0, vy: 0 });
    }

    // --- здоровье, броня, бонусы
    const vit = el('div', 'card vitals', root);
    this.vitals = vit;
    const hpRow = el('div', 'hp-row', vit);
    el('span', 'hp-icon', hpRow, '❤');
    this.hpNum = el('b', 'hp-num', hpRow, '100');
    const hpBar = el('div', 'bar hp-bar', vit);
    this.hpGhost = el('i', 'ghost', hpBar);
    this.hpFill = el('i', 'fill', hpBar);
    this.armorRow = el('div', 'armor-row', vit);
    el('span', 'armor-icon', this.armorRow, '🛡');
    const armorBar = el('div', 'bar armor-bar', this.armorRow);
    this.armorFill = el('i', 'fill', armorBar);
    this.armorNum = el('b', 'armor-num', this.armorRow, '0');
    this.bonusEl = el('div', 'bonus', vit);

    // --- боезапас и рывок
    const ammo = el('div', 'card ammo', root);
    this.ammoCard = ammo;
    const ammoRow = el('div', 'ammo-row', ammo);
    // с AWP в руках вместо «30 / 30» — «AWP · 3»
    el('span', 'ammo-awp', ammoRow, 'AWP ·');
    this.ammoNum = el('b', 'ammo-num', ammoRow, '30');
    this.ammoMax = el('span', 'ammo-max', ammoRow, '/ 30');
    this.reloadBar = el('div', 'bar reload-bar', ammo);
    this.reloadFill = el('i', 'fill', this.reloadBar);
    // на телефоне у кнопок свои подписи
    this.ammoHint = TOUCH ? null : el('div', 'ammo-hint', ammo, AMMO_HINT);
    this.dashEl = el('div', 'dash', ammo);
    el('span', 'dash-label', this.dashEl, TOUCH ? 'Рывок' : 'Рывок · Shift');
    const dashBar = el('div', 'bar dash-bar', this.dashEl);
    this.dashFill = el('i', 'fill', dashBar);

    this.feed = el('div', 'killfeed', root);
    this.center = el('div', 'center-msg', root);
    this.centerSub = el('div', 'center-sub', root);
    this.banner = el('div', 'banner', root);
    this.spawnShield = el('div', 'shield-note', root, 'Защита после появления — выстрел её снимет');

    this.death = el('div', 'death', root);
    el('div', 'death-title', this.death, 'Тебя залили краской!');
    this.deathBy = el('div', 'death-by', this.death);
    this.deathTimer = el('div', 'death-timer', this.death);

    this.board = el('div', 'board overlay-card', root);
    this.endScreen = el('div', 'endscreen', root);
    this.stats = el('div', 'stats', root);
  }

  private set(key: string, value: string | number | boolean): boolean {
    if (this.last[key] === value) return false;
    this.last[key] = value;
    return true;
  }

  // ------------------------------------------------------------ счёт

  setScores(a: number, b: number, limit: number): void {
    if (this.set('sa', a)) {
      this.scoreEls[0].textContent = String(a);
      this.scoreFill[0].style.width = `${Math.min(100, (a / limit) * 100)}%`;
      this.pulse(this.scoreEls[0]);
    }
    if (this.set('sb', b)) {
      this.scoreEls[1].textContent = String(b);
      this.scoreFill[1].style.width = `${Math.min(100, (b / limit) * 100)}%`;
      this.pulse(this.scoreEls[1]);
    }
  }

  setClock(phaseText: string, seconds: number, urgent: boolean): void {
    if (this.set('phase', phaseText)) this.phaseEl.textContent = phaseText;
    const t = fmtTime(seconds);
    if (this.set('time', t)) this.timeEl.textContent = t;
    if (this.set('urgent', urgent)) this.timeEl.classList.toggle('urgent', urgent);
  }

  private pulse(e: HTMLElement): void {
    e.classList.remove('pulse');
    void e.offsetWidth;
    e.classList.add('pulse');
  }

  // ------------------------------------------------------------ прицел

  setCrosshair(gap: number, visible: boolean, ads: boolean): void {
    const g = Math.round(gap * 2) / 2;
    if (this.set('gap', g)) this.cross.style.setProperty('--gap', `${g}px`);
    if (this.set('cvis', visible)) this.cross.style.display = visible ? '' : 'none';
    if (this.set('cads', ads)) this.cross.classList.toggle('ads', ads);
  }

  /** Крестик блокировки в точке экрана (px); on = false — спрятать. */
  setBlocked(x: number, y: number, on: boolean): void {
    if (this.set('block', on)) this.block.classList.toggle('show', on);
    if (!on) return;
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (this.set('blockAt', key)) this.block.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  hitmarker(head: boolean, kill: boolean): void {
    this.hit.className = 'hitmark';
    void this.hit.offsetWidth;
    this.hit.className = `hitmark show${head ? ' head' : ''}${kill ? ' kill' : ''}`;
  }

  /** Индикатор направления урона: angle — угол на атакующего относительно взгляда (рад, по часовой). */
  damageFrom(angle: number, strong: boolean): void {
    const a = this.arcs[this.arcNext];
    this.arcNext = (this.arcNext + 1) % this.arcs.length;
    a.style.setProperty('--rot', `${angle}rad`);
    a.className = 'dmg-arc';
    void a.offsetWidth;
    a.className = `dmg-arc show${strong ? ' strong' : ''}`;
  }

  /** Краска на «маске»: клякса у края экрана со стороны выстрела. */
  paintSplat(color: string, angle: number, head: boolean): void {
    const s = el('div', `mask-splat${head ? ' big' : ''}`, this.paintLayer);
    const r = 38 + Math.random() * 8;
    const x = 50 + Math.sin(angle) * r;
    const y = 50 - Math.cos(angle) * r * 0.9;
    s.style.left = `${Math.max(4, Math.min(96, x))}%`;
    s.style.top = `${Math.max(6, Math.min(94, y))}%`;
    s.style.setProperty('--c', color);
    s.style.setProperty('--r', `${Math.random() * 360}deg`);
    setTimeout(() => s.remove(), 1300);
    while (this.paintLayer.childElementCount > 6) this.paintLayer.firstElementChild?.remove();
  }

  // ------------------------------------------------------------ жизнь и патроны

  setVitals(hp: number, maxHp: number, armor: number, maxArmor: number, protectedNow: boolean): void {
    const h = Math.max(0, Math.ceil(hp));
    if (this.set('hp', h)) {
      this.hpNum.textContent = String(h);
      const pct = Math.min(100, (h / Math.max(1, maxHp)) * 100);
      this.hpFill.style.width = `${pct}%`;
      this.hpNum.classList.toggle('low', pct <= 30);
      this.vignette.classList.toggle('low', pct <= 30 && h > 0);
      if (h < this.ghostHp) {
        // «призрак» потерянного здоровья тает с задержкой
        this.hpGhost.style.transition = 'none';
        this.hpGhost.style.width = `${Math.min(100, (this.ghostHp / Math.max(1, maxHp)) * 100)}%`;
        void this.hpGhost.offsetWidth;
        this.hpGhost.style.transition = '';
      }
      this.hpGhost.style.width = `${pct}%`;
      if (h > this.ghostHp) {
        // по единице — отхил (подсвечиваем полоску), рывком — варенье или появление (число «подпрыгивает»)
        if (h - this.ghostHp <= 2 && this.ghostHp > 0) this.regenUntil = performance.now() + 700;
        else this.pulse(this.hpNum);
      }
      this.ghostHp = h;
    }
    const regen = h > 0 && performance.now() < this.regenUntil;
    if (this.set('regen', regen)) this.vitals.classList.toggle('regen', regen);
    const a = Math.max(0, Math.ceil(armor));
    if (this.set('armor', a) || this.set('marmor', maxArmor)) {
      this.armorRow.style.display = maxArmor > 0 ? '' : 'none';
      this.armorNum.textContent = String(a);
      this.armorFill.style.width = `${maxArmor > 0 ? Math.min(100, (a / maxArmor) * 100) : 0}%`;
    }
    if (this.set('prot', protectedNow)) this.spawnShield.classList.toggle('show', protectedNow);
  }

  setBonus(b: SlotBonus | null, reels: number[]): void {
    const key = b ? `${reels.join('')}|${b.hp}|${b.armor}|${b.dmg}` : '';
    if (!this.set('bonus', key)) return;
    this.bonusEl.innerHTML = '';
    if (!b) return;
    el('span', 'reels', this.bonusEl, reels.map((r) => SLOT_SYMBOLS[r]).join(''));
    if (b.hp) el('span', 'chip hp', this.bonusEl, `+${b.hp} HP`);
    if (b.armor) el('span', 'chip armor', this.bonusEl, `+${b.armor} 🛡`);
    if (b.dmg) el('span', 'chip dmg', this.bonusEl, `+${Math.round(b.dmg * 100)}% 💥`);
  }

  /** Патроны; reload — полоска перезарядки 0…1 (null — нет), low — с какого остатка число мигает. */
  setAmmo(ammo: number, max: number, reload: number | null, low = 6): void {
    if (this.set('ammo', ammo)) {
      this.ammoNum.textContent = String(ammo);
      this.ammoNum.classList.toggle('low', ammo <= low);
    }
    if (this.set('amax', max)) this.ammoMax.textContent = `/ ${max}`;
    const r = reload === null ? -1 : Math.round(reload * 50) / 50;
    if (this.set('reload', r)) {
      this.reloadBar.classList.toggle('show', r >= 0);
      if (r >= 0) this.reloadFill.style.width = `${r * 100}%`;
    }
  }

  /** В руках AWP: карточка патронов — «AWP · N» (числа даёт setAmmo), подсказка — про оптику. */
  setAwp(on: boolean): void {
    if (!this.set('awp', on)) return;
    this.ammoCard.classList.toggle('awp', on);
    if (this.ammoHint) this.ammoHint.textContent = on ? AWP_HINT : AMMO_HINT;
    // магазин маркера и выстрелы AWP пишутся в одни и те же поля — после смены перерисовать всё
    delete this.last.ammo;
    delete this.last.amax;
    delete this.last.reload;
  }

  /** Оптика AWP (тёмный круг с перекрестьем). */
  setScope(on: boolean): void {
    if (this.set('scope', on)) this.scope.classList.toggle('show', on);
  }

  setDash(ready: number): void {
    const r = Math.round(ready * 40) / 40;
    if (this.set('dash', r)) {
      this.dashFill.style.width = `${r * 100}%`;
      this.dashEl.classList.toggle('ready', r >= 1);
    }
  }

  // ------------------------------------------------------------ сообщения

  killfeed(killer: string, kTeam: number, victim: string, vTeam: number, head: boolean, how: string, mine: boolean): void {
    const row = el('div', `kf${mine ? ' mine' : ''}`, this.feed);
    let icon = head ? '🎯' : '🎨';
    if (how === 'drown') icon = '🌊';
    if (how === 'self') icon = '💤';
    if (killer) {
      const k = el('span', 'kf-name', row, killer);
      k.style.color = TEAM_CSS[kTeam] ?? '#fff';
    }
    if (how === 'awp') {
      // снят из AWP — золотой ярлык вместо значка
      row.classList.add('awp');
      el('span', 'kf-awp', row, head ? 'AWP 🎯' : 'AWP');
    } else {
      el('span', 'kf-icon', row, icon);
    }
    const v = el('span', 'kf-name', row, victim);
    v.style.color = TEAM_CSS[vTeam] ?? '#fff';
    setTimeout(() => row.classList.add('fade'), 5500);
    setTimeout(() => row.remove(), 6200);
    while (this.feed.childElementCount > 6) this.feed.firstElementChild?.remove();
  }

  centerMessage(text: string, sub = '', color = '', ms = 1800): void {
    this.center.textContent = text;
    this.center.style.color = color;
    this.centerSub.textContent = sub;
    this.center.className = 'center-msg show';
    this.centerSub.className = 'center-sub show';
    clearTimeout(this.centerTimer);
    this.centerTimer = window.setTimeout(() => {
      this.center.className = 'center-msg';
      this.centerSub.className = 'center-sub';
    }, ms);
  }

  /** Крупная плашка (серии, «ты сбил …»). */
  bannerMessage(html: string, ms = 1600): void {
    this.banner.innerHTML = html;
    this.banner.className = 'banner';
    void this.banner.offsetWidth;
    this.banner.className = 'banner show';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.banner.className = 'banner'), ms);
  }

  showDeath(killer: string | null, kTeam: number, how: string): void {
    this.death.classList.add('show');
    if (how === 'drown') this.deathBy.innerHTML = killer ? `Столкнул в воду: <b style="color:${TEAM_CSS[kTeam]}">${escapeHtml(killer)}</b>` : 'Искупался в море 🌊';
    else if (!killer) this.deathBy.textContent = 'Самоустранился';
    else if (how === 'awp') this.deathBy.innerHTML = `Снял из AWP: <b style="color:${TEAM_CSS[kTeam]}">${escapeHtml(killer)}</b>`;
    else this.deathBy.innerHTML = `Попал: <b style="color:${TEAM_CSS[kTeam]}">${escapeHtml(killer)}</b>`;
  }

  setRespawn(sec: number): void {
    const t = sec > 0 ? `Снова в бой через ${sec.toFixed(1)}` : 'Появляемся…';
    if (this.set('resp', t)) this.deathTimer.textContent = t;
  }

  hideDeath(): void {
    this.death.classList.remove('show');
  }

  // ------------------------------------------------------------ таблицы

  private table(rows: RosterEntry[], myId: number): string {
    const teams = [0, 1].map((t) => rows.filter((r) => r.team === t).sort((a, b) => b.k - a.k || a.d - b.d));
    return teams
      .map((list, t) => {
        const body = list
          .map((r) => {
            const reels = r.reels.length ? r.reels.map((x) => SLOT_SYMBOLS[x]).join('') : '—';
            return `<tr class="${r.id === myId ? 'me' : ''}"><td class="n">${escapeHtml(r.name)}${r.bot ? ' <i>бот</i>' : ''}</td><td>${r.k}</td><td>${r.d}</td><td>${r.a}</td><td class="reels">${reels}</td><td class="ping">${r.bot ? '' : r.ping}</td></tr>`;
          })
          .join('');
        return `<div class="board-team t${t}"><h3>${TEAM_NAMES[t]}</h3><table><thead><tr><th class="n">Игрок</th><th>У</th><th>С</th><th>П</th><th>🎰</th><th>мс</th></tr></thead><tbody>${body}</tbody></table></div>`;
      })
      .join('');
  }

  showBoard(show: boolean, rows: RosterEntry[], myId: number): void {
    if (show) {
      const html = `<div class="board-grid">${this.table(rows, myId)}</div><div class="board-hint">У — убил · С — сбит · П — помог</div>`;
      if (this.set('boardHtml', html)) this.board.innerHTML = html;
    }
    if (this.set('board', show)) this.board.classList.toggle('show', show);
  }

  showEnd(winner: number, mvp: RosterEntry | null, scores: [number, number], rows: RosterEntry[], myId: number, myTeam: number): void {
    const title = winner < 0 ? 'Ничья!' : winner === myTeam ? 'Победа!' : 'Поражение';
    const who = winner < 0 ? 'Счёт равный' : `Побеждает «${TEAM_NAMES[winner]}»`;
    const mvpHtml = mvp ? `<div class="mvp">⭐ Лучший игрок: <b style="color:${TEAM_CSS[mvp.team]}">${escapeHtml(mvp.name)}</b> — ${mvp.k} / ${mvp.d}</div>` : '';
    this.endScreen.innerHTML = `<div class="overlay-card end-card"><div class="end-title ${winner === myTeam ? 'win' : winner < 0 ? 'draw' : 'lose'}">${title}</div><div class="end-sub">${who} · <span style="color:${TEAM_CSS[0]}">${scores[0]}</span> : <span style="color:${TEAM_CSS[1]}">${scores[1]}</span></div>${mvpHtml}<div class="board-grid">${this.table(rows, myId)}</div><div class="board-hint">Новый раунд начнётся сам через несколько секунд</div></div>`;
    this.endScreen.classList.add('show');
  }

  /** Жетоны за раунд — строкой в финальном окне (приходят сразу после него). */
  showReward(text: string): void {
    const card = this.endScreen.querySelector('.end-card');
    if (!card) return;
    let line = card.querySelector<HTMLElement>('.end-reward');
    if (!line) {
      line = el('div', 'end-reward');
      const grid = card.querySelector('.board-grid');
      if (grid) grid.before(line);
      else card.appendChild(line);
    }
    setCoinText(line, `🪙 ${text}`);
  }

  hideEnd(): void {
    this.endScreen.classList.remove('show');
  }

  get endShown(): boolean {
    return this.endScreen.classList.contains('show');
  }

  // ------------------------------------------------------------ всплывающие цифры урона

  damageNumber(x: number, y: number, z: number, amount: number, head: boolean): void {
    const f = this.floaters[this.floaterNext];
    this.floaterNext = (this.floaterNext + 1) % this.floaters.length;
    f.pos.set(x + (Math.random() - 0.5) * 0.3, y + 0.25, z + (Math.random() - 0.5) * 0.3);
    f.life = 0.9;
    f.vy = 1.2;
    f.el.textContent = String(amount);
    f.el.className = `floater show${head ? ' head' : ''}`;
  }

  updateFloaters(dt: number, camera: THREE.Camera, w: number, h: number): void {
    for (const f of this.floaters) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.el.className = 'floater';
        continue;
      }
      f.pos.y += f.vy * dt;
      f.vy *= Math.exp(-dt * 2.5);
      _v.copy(f.pos).project(camera);
      if (_v.z > 1) {
        f.el.style.opacity = '0';
        continue;
      }
      const sx = (_v.x * 0.5 + 0.5) * w;
      const sy = (-_v.y * 0.5 + 0.5) * h;
      f.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${(0.8 + Math.min(0.4, f.life)).toFixed(2)})`;
      f.el.style.opacity = String(Math.min(1, f.life * 2.5));
    }
  }

  setStats(text: string | null): void {
    const t = text ?? '';
    if (this.set('stats', t)) {
      this.stats.textContent = t;
      this.stats.style.display = text ? '' : 'none';
    }
  }

  setVisible(v: boolean): void {
    if (this.set('vis', v)) this.root.classList.toggle('hidden', !v);
    // оптика живёт вне root — прячем её вместе с интерфейсом
    if (!v) this.setScope(false);
  }

  /** Во время смерти/меню прячем то, что относится к живому игроку. */
  setAliveUi(alive: boolean): void {
    if (this.set('aliveUi', alive)) this.root.classList.toggle('dead', !alive);
  }
}
