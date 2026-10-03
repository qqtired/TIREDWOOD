// Меню Esc: «На набережную» всегда на виду. Кнопка стоит в закреплённом блоке над разделами (рядом с «Продолжить»), а
// прокручивается только список разделов — раньше кнопка лежала в самом низу прокручиваемой панели и пряталась.
// Проверяем разметку и стили как есть: настоящего браузера в тестах нет.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const menu = readFileSync(new URL('../client/ui/menu/menu.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../client/ui/menu/menu.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../client/app.ts', import.meta.url), 'utf8');

/** Тело правила CSS по селектору (первое, верхнего уровня) */
function rule(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `в menu.css нет правила ${selector}`);
  return css.slice(at, css.indexOf('}', at));
}

test('«На набережную» стоит в закреплённом блоке над разделами, а не в прокручиваемом списке и не внизу', () => {
  const html = menu.slice(menu.indexOf('<aside class="mn-side">'), menu.indexOf('</aside>'));
  const go = html.slice(html.indexOf('class="mn-go"'), html.indexOf('class="mn-hint"'));
  assert.match(go, /mn-resume/);
  assert.match(go, /mn-lobby/, 'кнопка рядом с «Продолжить»');
  assert.ok(html.indexOf('mn-lobby') < html.indexOf('class="mn-nav"'), 'выше списка разделов');
  const exit = html.slice(html.indexOf('class="mn-exit"'));
  assert.ok(!exit.includes('mn-lobby'), 'не в нижнем блоке');
  assert.match(exit, /mn-leave/, '«Выйти из игры» — внизу');
  assert.ok(!/class="[^"]*\bghost\b[^"]*mn-lobby/.test(html), 'у кнопки своё оформление, не серое «призрачное»');
});

test('прокручивается только список разделов: сама панель — нет', () => {
  const side = rule('.mn-side');
  assert.ok(/overflow:\s*hidden/.test(side), 'панель не листается целиком');
  assert.ok(!/overflow-y:\s*auto/.test(side));
  const nav = rule('.mn-nav');
  assert.match(nav, /overflow-y:\s*auto/);
  assert.match(nav, /min-height:\s*0/);
  assert.match(rule('.mn-go'), /flex:\s*none/, 'закреплённый блок не сжимается');
  assert.match(rule('.mn-exit'), /flex:\s*none/);
});

test('у кнопки своё оформление и значок, который не пропадает при смене подписи', () => {
  const lobby = rule('.mn-side .mn-lobby');
  assert.match(lobby, /background:/);
  assert.match(css, /\.mn-side \.mn-lobby::before/);
  // App меняет только textContent кнопки («Сойти на берег» в катере): значок в CSS, а не в тексте
  assert.match(app, /toLobbyBtn\.textContent = racing \? 'Сойти на берег' : 'На набережную'/);
  // и подтверждения у кнопки не было: нажатие сразу уходит в toLobby
  assert.match(menu, /this\.toLobbyBtn\.addEventListener\('click', \(\) => actions\.toLobby\(\)\)/);
});

test('телефон: обе кнопки в верхней полосе, видны без прокрутки разделов', () => {
  const phone = css.slice(css.indexOf('@media (max-width: 760px), (max-height: 520px)'));
  assert.match(phone, /\.mn-go\s*\{[^}]*flex-direction:\s*row/);
  assert.match(phone, /\.mn-side \.mn-lobby\s*\{/);
});
