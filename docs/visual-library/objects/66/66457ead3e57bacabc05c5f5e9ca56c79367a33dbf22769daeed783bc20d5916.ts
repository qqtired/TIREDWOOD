// Альбом рыбака в профиле: клетка на каждый вид — картинка, имя, рекорд и сколько положено в альбом; кого ещё не
// ловили — тёмный силуэт со знаком вопроса. Рамка клетки — цвета редкости. С рыбалкой 2.0 — коллекция из 30 видов
// (та же сетка, что в журнале рыбака, client/ui/fishbook.ts); старые записи альбома на месте.
import type { Stats } from '../../shared/economy.ts';
import { FISH, RARITY_CSS, fmtWeight, type FishAlbum } from '../../shared/fishing.ts';
import { COLLECTION_SIZE, collectionCount } from '../../shared/fishrules.ts';
import { drawFishIcon, fishCanvas } from '../lobby/fishart.ts';
import { FISH2 } from '../lobby/fish2.ts';
import { collectionGrid } from './fishbook.ts';

/** Виды старой рыбалки (у рыбалки 2.0 — своя коллекция, w = 0) */
const OLD = FISH.filter((f) => f.w > 0);

export function albumBlock(album: FishAlbum, stats: Stats): HTMLElement {
  if (FISH2.on) return collectionBlock(album, stats);
  const b = el('div', 'prof-block prof-album');
  const caught = OLD.filter((f) => album[f.id]).length;
  b.appendChild(el('b', '')).textContent = `🎣 Альбом рыбака · ${caught} из ${OLD.length}`;
  b.appendChild(el('div', 'alb-sub')).textContent =
    stats.fsCaught > 0 ? `поймано ${stats.fsCaught} · продано ${stats.fsSold}` : 'Удочки — на мостках к маяку: подойди к краю и нажми E';
  const grid = b.appendChild(el('div', 'alb-grid'));
  FISH.forEach((f, sp) => {
    if (f.w === 0) return;
    const e = album[f.id];
    const cell = grid.appendChild(el('div', e ? 'alb-cell' : 'alb-cell unknown'));
    cell.style.setProperty('--rar', RARITY_CSS[f.rarity]);
    const pic = cell.appendChild(fishCanvas('alb-pic', 58, 32));
    drawFishIcon(pic, sp, !!e);
    cell.appendChild(el('span', 'alb-name')).textContent = e ? f.name : '???';
    cell.appendChild(el('span', 'alb-rec')).textContent = e ? `${fmtWeight(e[0])}${e[1] > 1 ? ` · ×${e[1]}` : ''}` : '';
    cell.title = e ? `${f.name}: рекорд ${fmtWeight(e[0])}, в альбоме ${e[1]}` : 'Ещё не попадалась';
  });
  return b;
}

/** Рыбалка 2.0: коллекция из 30 видов */
function collectionBlock(album: FishAlbum, stats: Stats): HTMLElement {
  const b = el('div', 'prof-block prof-album');
  b.appendChild(el('b', '')).textContent = `🎣 Коллекция рыбака · ${collectionCount(album)} из ${COLLECTION_SIZE}`;
  b.appendChild(el('div', 'alb-sub')).textContent = stats.fsFish > 0 || stats.fsCaught > 0
    ? `поймано рыб ${stats.fsFish} · сундуков ${stats.fsChests} · журнал на набережной — клавиша J`
    : 'Удочки — на мостках к маяку: подойди к краю и нажми E';
  b.appendChild(collectionGrid(album, true));
  return b;
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
