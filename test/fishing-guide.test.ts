import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// Минимальная DOM-среда: исполняем готовый app.js и его обработчики формы, а не только FishCalc.odds.
class Element {
  textContent = '';
  value = '';
  children: Element[] = [];
  style = { setProperty() {} };
  handlers = new Map<string, () => void>();
  private html = '';
  get innerHTML(): string { return this.html; }
  set innerHTML(html: string) {
    this.html = html;
    this.children = Array.from(html.matchAll(/<\w+\b[^>]*>/g), () => new Element());
  }
  get firstChild(): Element | undefined { return this.children[0]; }
  appendChild(child: Element): Element { this.children.push(child); return child; }
  addEventListener(event: string, handler: () => void): void { this.handlers.set(event, handler); }
}

test('справочник: выбор водки и достижение потолка обновляют пояснения калькулятора без ошибки', () => {
  const ids = ['calc', 'calc-bar', 'calc-rows', 'calc-hint', 'calc-level', 'calc-level-v'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  const values: Record<string, string> = { zone: 'pier', weather: '0', level: '0', rod: '0', lure: '0', drink: '0' };
  runInNewContext(readFileSync(new URL('../public/fishing/app.js', import.meta.url), 'utf8'), {
    document: { getElementById: (id: string) => elements[id], createElement: () => new Element() },
    FormData: class { get(name: string): string | null { return values[name] ?? null; } },
  });
  const form = elements.calc;
  const hint = elements['calc-hint'];
  assert.equal(elements['calc-rows'].children.length, 8);
  values.drink = '4';
  form.handlers.get('change')!();
  assert.match(hint.innerHTML, /20 % меньше/);
  assert.match(hint.innerHTML, /Водка/);
  values.weather = '2';
  values.level = '15';
  values.rod = '4';
  values.lure = '4';
  form.handlers.get('input')!();
  assert.equal(elements['calc-level-v'].textContent, '15');
  assert.match(hint.innerHTML, /Потолок/);
  assert.match(hint.innerHTML, /95 % рыбы/);
  Object.assign(values, { weather: '0', level: '0', rod: '0', lure: '0', drink: '0' });
  form.handlers.get('change')!();
  assert.equal(hint.innerHTML, '', 'после сброса настроек старые пояснения исчезают');
});
