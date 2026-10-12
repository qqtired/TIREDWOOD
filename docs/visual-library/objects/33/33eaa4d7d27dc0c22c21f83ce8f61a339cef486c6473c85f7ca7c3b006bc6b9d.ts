import { h } from '../lab/dom.ts';

export { h };
let fieldId = 0;
export function button(label: string, action: () => void, className = '', disabled = false): HTMLButtonElement {
  return h('button', { type: 'button', class: `fr-button ${className}`, onclick: action, disabled }, label);
}
export function field(label: string, control: HTMLElement): HTMLLabelElement {
  const caption = h('span', { id: `fr-field-${++fieldId}` }, label);
  control.setAttribute('aria-labelledby', caption.id);
  return h('label', { class: 'fr-field' }, caption, control);
}
export function select(options: Array<[string, string]>, value: string, on: (value: string) => void): HTMLSelectElement {
  const control = h('select', { onchange: (event) => on((event.target as HTMLSelectElement).value) });
  control.append(...options.map(([key, label]) => h('option', { value: key }, label)));
  control.value = value;
  return control;
}
export function input(value: string, on: (value: string) => void, type = 'text'): HTMLInputElement {
  const control = h('input', { type, onchange: (event) => on((event.target as HTMLInputElement).value) });
  control.value = value;
  return control;
}
export function dialog(title: string, ...children: HTMLElement[]): HTMLDialogElement {
  const root = h('dialog', { class: 'fr-dialog', onclick: (event) => { if (event.target === root) root.close(); } });
  const close = button('Закрыть', () => root.close(), 'fr-quiet');
  root.append(h('div', { class: 'fr-dialog-head' }, h('h2', {}, title), close), ...children);
  root.addEventListener('close', () => root.remove());
  document.body.append(root);
  root.showModal();
  return root;
}
export function icon(name: 'camera' | 'download' | 'upload' | 'arrow' | 'jelly'): SVGSVGElement {
  const shapes = {
    camera: '<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 17v4h16v-4"/>',
    arrow: '<path d="m14 5-7 7 7 7M7 12h14"/>',
    jelly: '<path d="M12 3C5 3 3 13 3 17c0 4 18 4 18 0 0-4-2-14-9-14Z"/><path d="M8 11v2m8-2v2m-6 3c1 1 3 1 4 0"/>',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = shapes[name];
  return svg;
}
