// Бильярд — кликабельный макет понятной ставки поверх настоящего HUD стола. Меняется только середина панели
// в фазе «стол свободен»: выбор «как играть» вместо заголовка, ставка — только в «на жетоны», кнопка говорит, что будет.
const scene = window.__SCENES.billiards;
const root = document.documentElement;
for (const [k, v] of Object.entries(scene.attrs)) if (k !== 'data-hud' && k !== 'lang') root.setAttribute(k, v);
root.dataset.scene = 'billiards';
document.querySelector('.lab-bg').src = 'img/bg-billiards.jpg';
document.body.insertAdjacentHTML('beforeend', scene.html);

const COIN = `<img class="coin" src="${document.querySelector('.bl-balance img.coin')?.getAttribute('src') ?? ''}" alt="">`;
const CHIPS = [10, 20, 50, 100];
const q = new URLSearchParams(location.hash.slice(1)); // #bal=40&path=bet&draft=20 — начальное состояние
const st = { bal: Number(q.get('bal') ?? 115), path: q.get('path') ?? 'train', draft: Number(q.get('draft') ?? 0), waiting: q.has('wait') };
const mid = document.querySelector('.bl-mid');
const keys = mid.querySelector('.bl-keys').outerHTML;
const balance = document.querySelector('.bl-balance');

function render() {
  const rich = st.bal > 0;
  if (!rich && st.path === 'bet') st.path = 'free';
  if (st.draft > st.bal) st.draft = 0;
  balance.innerHTML = `${COIN} ${st.bal}`;
  const badge = document.querySelector('.k-badge-tokens');
  if (badge) badge.innerHTML = `${badge.querySelector('img')?.outerHTML ?? ''}${st.bal}`;

  if (st.waiting) {
    const sub = st.draft ? `ставка ${st.draft} ${COIN} уже в банке · пока можно тренироваться` : 'партия без ставки · пока можно тренироваться';
    mid.innerHTML = `<div class="bl-status"><span class="bl-st-title gold">Ждём соперника</span><span class="bl-st-sub">${sub}</span></div>
      <div class="bl-act"><button class="bl-go ghost" type="button" data-cancel><span>${st.draft ? 'Забрать ставку' : 'Отменить приглашение'}</span><kbd>Enter</kbd></button></div>${keys}`;
    return;
  }

  const tab = (id, label, off = '') =>
    `<button class="blx-path${st.path === id ? ' is-on' : ''}" type="button" role="radio" aria-checked="${st.path === id}" data-path="${id}"${off ? ' disabled' : ''}>${label}${off ? `<small>${off}</small>` : ''}</button>`;
  let sub = '', act = '';
  if (st.path === 'train') sub = 'бей сколько хочешь — счёт не идёт';
  if (st.path === 'free') {
    sub = rich ? 'кто сядет напротив — сможет принять' : 'играть можно и без жетонов · жетоны дают рыбалка и режимы';
    act = `<button class="bl-go" type="button" data-go><span>Позвать сыграть без ставки</span><kbd>Enter</kbd></button>`;
  }
  if (st.path === 'bet') {
    sub = 'победителю — обе ставки';
    const short = CHIPS.some((c) => st.draft + c > st.bal);
    const chips = CHIPS.map((c) => `<button class="bj-chip c${c}" type="button" data-chip="${c}"${st.draft + c > st.bal ? ' disabled' : ''}><b>${c}</b></button>`).join('');
    act = `<div class="bl-bet"><div class="bl-chips">${chips}</div>
        <div class="bl-amount"><input class="bj-input" value="${st.draft || ''}" placeholder="сумма" readonly aria-label="Ставка"><button class="bl-reset" type="button" data-reset${st.draft ? '' : ' disabled'} aria-label="Сбросить ставку">✕</button></div>
        <small class="blx-have${short ? ' low' : ''}">у тебя ${st.bal} ${COIN}</small></div>
      <button class="bl-go" type="button" data-go${st.draft ? '' : ' disabled'}><span>${st.draft ? `Позвать на ${st.draft} ${COIN}` : 'Сначала ставка — нажми фишку'}</span><kbd>Enter</kbd></button>`;
  }
  mid.innerHTML = `<div class="blx-paths" role="radiogroup" aria-label="Как играть">${tab('train', 'Тренировка')}${tab('free', 'Партия без ставки')}${tab('bet', 'Партия на жетоны', rich ? '' : 'нет жетонов')}</div>
    <div class="bl-status"><span class="bl-st-sub">${sub}</span></div>${act ? `<div class="bl-act">${act}</div>` : ''}${keys}`;
}

mid.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.path) { st.path = b.dataset.path; st.draft = 0; }
  else if (b.dataset.chip) st.draft = Math.min(st.bal, st.draft + Number(b.dataset.chip));
  else if ('reset' in b.dataset) st.draft = 0;
  else if ('go' in b.dataset) st.waiting = true;
  else if ('cancel' in b.dataset) st.waiting = false;
  render();
});
addEventListener('keydown', (e) => { if (e.key === 'Enter') mid.querySelector('[data-go]:not(:disabled), [data-cancel]')?.click(); });
addEventListener('message', (e) => {
  if (!e.data || typeof e.data.bal !== 'number') return;
  Object.assign(st, { bal: e.data.bal, waiting: false, draft: 0, path: e.data.path ?? st.path });
  render();
});
render();
