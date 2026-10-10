// «Подземелье»: иконки интерфейса (картинки через Codex CLI imagegen, источник — client/assets/dungeon/icons/PROVENANCE.md).
// Файл `client/assets/dungeon/icons/<вид>-<id>.webp` (или .png): weapon-lantern, evo-lantern_evo, passive-might,
// pickup-gem, poi-altar, active-dash, mob-rat, ui-reroll … id — как в docs/survivors/design-data.json.
// Нет файла — null: интерфейс показывает прежний значок.
const FILES = import.meta.glob('../assets/dungeon/icons/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const BY_NAME = new Map<string, string>();
for (const [path, url] of Object.entries(FILES)) BY_NAME.set(path.slice(path.lastIndexOf('/') + 1).replace(/\.(webp|png)$/, ''), url);

export type DgIconKind = 'weapon' | 'evo' | 'passive' | 'pickup' | 'poi' | 'active' | 'mob' | 'ui';

export function dgIcon(kind: DgIconKind, id: string): string | null {
  return BY_NAME.get(`${kind}-${id}`) ?? null;
}
