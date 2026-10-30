// «Ракушка» у пирса (флаг QUIZ, решение владельца 30.10.2026): на месте ворот «Ласточки» — площадка, катера нет.
// Всё «Ласточкино» на площади прячется на ходу, без пересборки мешей и шейдеров: ворота (схлопнуты в склейке «port»),
// вывеска на воротах, капитан Сева, катер у причала со швартовами, столбик с табличкой. Твёрдое, подсказку E, кракена
// и строку афиши выключает сцена (client/lobby/scene.ts). Без QUIZ — всё как было.

/** Что прятать: павильон, вывеска и житель — по id из раскладки (pavdata.ts, signstyle.ts, npcdata.ts) */
export const SWALLOW = { pav: 'swallow_gate', sign: 'lastochka', npc: 'seva' } as const;

export interface SwallowParts {
  /** Модели павильонов (client/lobby/plaza3/pavilions.ts); ещё грузятся — спрячут, когда встанут */
  pavilions: { setPavHidden(id: string, hidden: boolean): void } | null;
  signs: { setHidden(id: string, hidden: boolean): void } | null;
  npc: { setAway(id: string, hidden: boolean): void } | null;
  /** Катер у причала со швартовами (client/lobby/boats.ts) */
  boat: { setLaunchShown(on: boolean): void };
  /** Столбик с табличкой у причала (client/lobby/boatsign.ts) */
  post: { setShown(on: boolean): void };
}

/** off — «Ракушка» у пирса: «Ласточки» нет; false — вернуть как было */
export function hideSwallow(p: SwallowParts, off: boolean): void {
  p.pavilions?.setPavHidden(SWALLOW.pav, off);
  p.signs?.setHidden(SWALLOW.sign, off);
  p.npc?.setAway(SWALLOW.npc, off);
  p.boat.setLaunchShown(!off);
  p.post.setShown(!off);
}
