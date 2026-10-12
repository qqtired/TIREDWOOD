// Общее окно-подробности: слева 3D-просмотрщик или картинка, справа описание. Один <dialog> на страницу.
import { h, mdBlock, state } from './lib.js';

const cleanups = [];

export function openDialog({ title, chips = [], left = null, right = null, onClose } = {}) {
  const d = document.getElementById('dlg');
  d.innerHTML = '';
  const head = h('div.dlg-head', h('h3#dlg-title', title), h('div.row', chips), h('button.x', { type: 'button', 'aria-label': 'Закрыть', title: 'Закрыть (Esc)', onclick: () => d.close() }, '✕'));
  const body = h('div.dlg-body' + (left ? '' : '.single'), left ? h('div.dlg-left', left) : null, h('div.dlg-right', right));
  d.append(head, body);
  d.onclose = () => {
    cleanups.splice(0).forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
    d.innerHTML = '';
    onClose?.();
  };
  d.onclick = (e) => { if (e.target === d) d.close(); };
  if (!d.open) d.showModal();
  body.scrollTop = 0;
  return { close: () => d.close(), onClose: (f) => cleanups.push(f), body };
}

/** Левая колонка с 3D: возвращает {host, dispose, viewer(promise)} */
export function modelPane(sources, opts = {}) {
  const host = h('div.viewer-host');
  const api = { host, disposed: false, viewer: null, ready: null };
  api.ready = (async () => {
    try {
      const { ModelViewer } = await import('./viewer.js');
      if (api.disposed) return null;
      const v = new ModelViewer(host, opts);
      api.viewer = v;
      await v.setSources(sources, opts.index || 0);
      return v;
    } catch (e) {
      console.warn('viewer', e);
      host.appendChild(h('div.v-msg', h('div', 'Не удалось запустить 3D-просмотрщик.', h('div.tiny', String(e?.message || e)))));
      return null;
    }
  })();
  api.dispose = () => { api.disposed = true; api.viewer?.dispose(); };
  return api;
}

/** Заглушка вместо модели: иконка и описание, что ожидается */
export function placeholderPane({ img, title, text }) {
  return h('div.ph-model', h('div', img ? h('img', { src: img, alt: '' }) : h('div', { style: 'font-size:3rem' }, '🧊'), h('b', title || 'Модели пока нет'), h('div.small', text || '')));
}

export function openDoc(num) {
  const d = state.data.docs[num];
  if (!d) return;
  openDialog({ title: `§${num} · ${d.title}`, chips: [h('span.chip', 'design-v11.md')], right: mdBlock(d.body) });
}
export function openMd(title, md, chip = 'из документа') {
  openDialog({ title, chips: [h('span.chip', chip)], right: mdBlock(md) });
}
