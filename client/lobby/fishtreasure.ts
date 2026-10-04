// «Сокровища Посейдона»: клад в 3 % сундуков (shared/fishrules.ts POSEIDON_COINS) — своя картинка (сундук с трезубцем и
// сиянием, нарисована Codex CLI, см. client/assets/poseidon/PROVENANCE.md) и подписи карточки улова (fishcard2.ts).
import { POSEIDON_COINS } from '../../shared/fishrules.ts';
import poseidonUrl from '../assets/poseidon/poseidon.webp';
import './fishtreasure.css';

/** Картинка клада для карточки сундука (класс — как у картинки обычного сундука) */
export function poseidonPic(cls: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls;
  img.src = poseidonUrl;
  img.alt = 'Сокровища Посейдона';
  img.draggable = false;
  img.decoding = 'async';
  return img;
}

/** Подписи карточки клада */
export const POSEIDON_TEXT = {
  tier: 'сундук · клад Посейдона',
  title: 'Сокровища Посейдона!',
  sub: `${POSEIDON_COINS.toLocaleString('ru-RU')} жетонов — клад морского владыки, он бывает в 3 сундуках из 100. Весь сервер уже знает!`,
} as const;
