// Меню Esc: «На набережную» всегда на виду. Кнопка стоит в закреплённом блоке над разделами (рядом с «Продолжить»), а
// прокручивается только список разделов — раньше кнопка лежала в самом низу прокручиваемой панели и пряталась.
// Проверяем разметку и стили как есть: настоящего браузера в тестах нет.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const menu = readFileSync(new URL('../client/ui/menu/menu.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../client/ui/menu/menu.css', import.meta.url), 'utf8');
const kit = readFileSync(new URL('../client/ui/kit/kit.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../client/app.ts', import.meta.url), 'utf8');

/** Тело правила CSS по селектору (первое, верхнего уровня) */
function rule(source: string, selector: string): string {
  const at = source.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `нет правила ${selector}`);
  return source.slice(at, source.indexOf('}', at));
}

test('«На набережную» стоит в закреплённом блоке над разделами, а не в прокручиваемом списке и не внизу', () => {
  const html = menu.slice(menu.indexOf('<aside class="k-win-side">'), menu.indexOf('</aside>'));
  assert.match(html, /mn-resume/);
  assert.match(html, /mn-lobby/, 'кнопка рядом с «Продолжить»');
  assert.ok(html.indexOf('mn-resume') < html.indexOf('mn-lobby'), '«Продолжить» выше «На набережную»');
  assert.ok(html.indexOf('mn-lobby') < html.indexOf('class="k-nav mn-nav"'), 'выше списка разделов');
  const exit = html.slice(html.indexOf('class="k-btn k-btn--ghost'));
  assert.ok(!exit.includes('mn-lobby'), 'не в нижнем блоке');
  assert.match(exit, /mn-leave/, '«Выйти из игры» — внизу');
});

test('прокручивается только список разделов: сама панель — нет', () => {
  // у панели кита нет прокрутки, у списка разделов — есть и он может сжиматься
  const nav = kit.slice(kit.indexOf('.k-win-side > .k-nav {'), kit.indexOf('}', kit.indexOf('.k-win-side > .k-nav {')));
  assert.match(nav, /overflow:\s*auto/);
  assert.match(nav, /min-height:\s*0/);
  assert.ok(!/overflow[^;]*auto/.test(rule(css, '.mn-window .k-win-side')), 'панель не листается целиком');
  assert.match(rule(css, '.mn-lobby'), /flex:\s*none/, 'закреплённая кнопка не сжимается');
  assert.match(rule(css, '.mn-leave'), /flex:\s*none/);
});

test('у кнопки своё оформление кита, подпись меняется текстом', () => {
  assert.match(menu, /k-btn--info[^"]*mn-lobby/, 'информационная кнопка кита, не серая «призрачная»');
  // App меняет только textContent кнопки («Сойти на берег» в катере) и вызывает toLobby без подтверждения
  assert.match(app, /toLobbyBtn\.textContent = racing \? 'Сойти на берег' : 'На набережную'/);
  assert.match(menu, /this\.toLobbyBtn\.addEventListener\('click', \(\) => actions\.toLobby\(\)\)/);
});

test('телефон: обе кнопки в верхней полосе, видны без прокрутки разделов', () => {
  const phone = css.slice(css.indexOf('@media (max-width: 760px), (max-height: 520px)'));
  assert.match(phone, /\.mn-window \.k-win-side\s*\{[^}]*flex-direction:\s*row/);
  assert.match(phone, /\.mn-window \.k-win-side > \.k-btn--wide\s*\{[^}]*width:\s*auto/);
});
