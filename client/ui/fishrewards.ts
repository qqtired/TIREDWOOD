// Журнал рыбака, вкладка «Награды»: лестница наград коллекции (shared/fishstyle.ts) как сезонный пропуск — пороги, вещи,
// что уже есть и сколько видов до следующей. Сверху — снасти: удочка, поплавок, окно вываживания, значок у ника.
// Полученная снасть надевается сама; любую полученную раньше выбирают тут одним кликом — сервер меняет снасти где
// угодно на набережной. Одежда и питомцы — в примерочной.
import './fishstyle.css';
import type { FishAlbum } from '../../shared/fishing.ts';
import { collectionCount } from '../../shared/fishrules.ts';
import { ALL, GEAR_SLOTS, LADDER, REWARD_INFO, fishTotal, needOf, nextStep, rewardLabel, stepLabel, stepNeed } from '../../shared/fishstyle.ts';
import { ITEMS, SLOT_NAMES, isOwned, itemById, slotKey, type Outfit, type Slot } from '../../shared/outfit.ts';
import { el } from '../lobby/fish2.ts';
import { FISH_ICONS } from './fishicons.ts';

/** «вид», «вида», «видов» */
export function species(n: number): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return `${n} вид`;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return `${n} вида`;
  return `${n} видов`;
}

/** Окно вываживания в миниатюре — та же рамка и вода, что у настоящего (fish2.css + тема из fishstyle.css) */
export function miniWindow(key: string): HTMLElement {
  const w = el('span', 'frw-win');
  w.dataset.frTheme = key;
  const bar = w.appendChild(el('span', 'fr-bar'));
  bar.appendChild(el('span', 'fr-water'));
  bar.appendChild(el('span', 'fr-zone'));
  return w;
}

/**
 * Строка карточки улова (fishcard2.ts): что выдали за этот улов (rw) — снасти уже в руках, одежда в примерочной, —
 * или сколько видов до следующей награды; null — показывать нечего.
 */
export function catchRewardNote(m: { got: number; full: boolean; rw?: readonly string[] }): HTMLElement | null {
  const rw = m.rw ?? [];
  if (rw.length > 0) {
    const gear = rw.filter((id) => GEAR_SLOTS.includes(id[0] as Slot));
    const wear = rw.filter((id) => !GEAR_SLOTS.includes(id[0] as Slot));
    const set = LADDER.find((s) => s.set && s.items.every((id) => rw.includes(id)))?.set;
    const parts = [
      set ? `сет «${set}» — в примерочной` : wear.length ? `${wear.map(rewardLabel).join(', ')} — в примерочной` : '',
      gear.map(rewardLabel).join(', '),
    ].filter(Boolean);
    const box = el('div', m.full ? 'frw-catch full' : 'frw-catch', `${m.full ? '🏆 Вся коллекция!' : '🎁 Награда:'} ${parts.join('; ')}`);
    box.appendChild(el('small', '', gear.length ? 'Новая снасть уже у тебя · сменить — журнал (J), «Награды»' : 'Журнал (J) → «Награды»'));
    return box;
  }
  const next = nextStep(m.got);
  if (!next) return null;
  return el('div', 'frw-next', `До награды (${stepLabel(next)}) — ещё ${species(stepNeed(next) - m.got)}`);
}

/** Где искать вещь: снасти — тут, одежда и питомцы — в примерочной */
function where(id: string): string {
  return GEAR_SLOTS.includes(id[0] as Slot) ? 'снасти — выше' : 'в примерочной';
}

export class FishRewards {
  /** Выбрал снасть (Fish2Hud шлёт наряд серверу) */
  onEquip: (slot: Slot, key: string) => void = () => {};
  /** Что надето — из профиля (Fish2Hud.onMe) */
  outfit: Outfit | null = null;

  view(album: FishAlbum, owned: readonly string[]): HTMLElement {
    const got = collectionCount(album);
    const total = fishTotal();
    const root = el('div', 'frw');
    root.appendChild(this.gear(owned, total));
    root.appendChild(el('div', 'frw-h', `Награды коллекции · ${got} из ${total}`));
    const next = nextStep(got, total);
    const ladder = root.appendChild(el('div', 'frw-ladder'));
    for (const step of LADDER) {
      const need = stepNeed(step, total);
      const done = got >= need;
      const card = ladder.appendChild(el('div', 'frw-step'));
      card.classList.toggle('got', done);
      card.classList.toggle('next', step === next);
      card.classList.toggle('set', step.set !== undefined);
      card.classList.toggle('final', step.need === ALL);
      const head = card.appendChild(el('div', 'frw-need'));
      head.appendChild(el('b', '', step.need === ALL ? `Все ${need}` : String(need)));
      head.appendChild(el('span', '', species(need).replace(/^\d+ /, '')));
      if (step.set) card.appendChild(el('div', 'frw-set', `Сет «${step.set}»`));
      const items = card.appendChild(el('div', 'frw-items'));
      for (const id of step.items) {
        const it = itemById(id);
        if (!it) continue;
        const tag = items.appendChild(el('span', 'frw-item'));
        tag.innerHTML = FISH_ICONS[id] ?? '';
        tag.appendChild(el('span', '', it.name));
        tag.title = `${it.name} — ${REWARD_INFO[id]?.text ?? ''} (${where(id)})`;
      }
      card.appendChild(el('div', 'frw-state', done ? '✓ есть' : step === next ? `ещё ${species(need - got)}` : `🔒 ещё ${species(need - got)}`));
    }
    root.appendChild(el('div', 'frw-note', 'Полученное остаётся навсегда. Одежда и питомцы — в примерочной, снасти — здесь.'));
    return root;
  }

  /** Снасти: по строке на слот — всё, что бывает, полученное можно взять */
  private gear(owned: readonly string[], total: number): HTMLElement {
    const box = el('div', 'frw-gear');
    for (const slot of GEAR_SLOTS) {
      const row = box.appendChild(el('div', 'frw-row'));
      row.appendChild(el('div', 'frw-row-h', SLOT_NAMES[slot]));
      const chips = row.appendChild(el('div', 'frw-chips'));
      const on = this.outfit ? slotKey(this.outfit, slot) : null;
      for (const it of ITEMS.filter((i) => i.slot === slot)) {
        const have = isOwned(owned, it);
        const chip = chips.appendChild(el('button', 'frw-chip'));
        chip.type = 'button';
        chip.dataset.id = it.id;
        chip.classList.toggle('on', it.key === on);
        chip.classList.toggle('locked', !have);
        chip.disabled = !have;
        if (slot === 'w') chip.appendChild(miniWindow(it.key));
        else if (it.key === 'none') chip.appendChild(el('span', 'frw-ic empty', '∅'));
        else chip.appendChild(el('span', 'frw-ic')).innerHTML = FISH_ICONS[it.id] ?? '';
        chip.appendChild(el('span', 'frw-chip-name', it.name));
        const need = needOf(it.id, total);
        chip.appendChild(el('small', '', it.key === on ? '✓ взято' : have ? 'взять' : `🔒 ${need === null ? '' : species(need)}`));
        chip.title = REWARD_INFO[it.id]?.text ?? it.name;
        if (have) chip.addEventListener('click', () => {
          if (it.key !== (this.outfit ? slotKey(this.outfit, slot) : null)) this.onEquip(slot, it.key);
        });
      }
    }
    return box;
  }
}
