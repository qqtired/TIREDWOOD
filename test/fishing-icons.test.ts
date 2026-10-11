// new URL() оставляет отсутствующий ассет до рантайма — проверяем, что вся таблица картинок действительно упакована.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FISH_ICONS } from '../client/ui/fishicons.ts';
import { LADDER, ISLE_LADDER } from '../shared/fishstyle.ts';

test('все снасти и награды рыбалки используют существующие растровые картинки', () => {
  const ids = new Set(['r:basic', 'b:classic', 'w:wood', ...LADDER.flatMap((s) => s.items), ...ISLE_LADDER.flatMap((s) => s.items)]);
  for (const id of ids) {
    const html = FISH_ICONS[id];
    assert.ok(html && !html.includes('<svg'), `${id}: растровая картинка`);
    const src = /<img\s+[^>]*src="([^"]+)"/.exec(html)?.[1];
    assert.ok(src, `${id}: адрес картинки`);
    const bytes = readFileSync(new URL(src));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${id}: WebP`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `${id}: WebP`);
  }
});
