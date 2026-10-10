// Значки наград рыбалки (shared/fishstyle.ts) для примерочной, журнала рыбака и карточки улова: простые SVG по силуэту
// 3D-вещей (outfitfish.ts, fishgear.ts) и окна вываживания по его рамке и воде (fishstyle.css).

const svg = (body: string): string =>
  `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

/** Удочка по диагонали: удилище, кончик, рукоятка, катушка; over — узор поверх удилища */
const rod = (blank: string, tip: string, handle: string, reel: string, over = '', extra = ''): string => svg(
  `<path d="M33 7Q36 17 31 25" stroke="#f4f2ec" stroke-width=".9" fill="none" opacity=".8"/>`
  + `<path d="M8 32L33 7" stroke="${blank}" stroke-width="2.6"/>${over}`
  + `<path d="M29.5 10.5L33 7" stroke="${tip}" stroke-width="2.6"/>`
  + `<path d="M5 35L12 28" stroke="${handle}" stroke-width="4.6"/>`
  + `<circle cx="14.5" cy="31" r="3.8" fill="${reel}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>${extra}`,
);

/** Окно вываживания: рамка, вода, зона */
const win = (frame: string, inner: string, water: string, zone: string, line: string, extra = ''): string => svg(
  `<rect x="11" y="3" width="18" height="34" rx="5" fill="${frame}"/><rect x="13" y="5" width="14" height="30" rx="3" fill="${inner}"/>`
  + `<rect x="14" y="6" width="12" height="28" rx="2.5" fill="${water}"/>${extra}`
  + `<rect x="15" y="17" width="10" height="9" rx="2.5" fill="${zone}" stroke="${line}" stroke-width="1.2"/>`,
);

/** Рыбка для кукана: висит головой вверх */
const hangFish = (x: number, y: number, len: number, back: string, belly: string): string =>
  `<ellipse cx="${x}" cy="${y + len * 0.45}" rx="${len * 0.22}" ry="${len * 0.45}" fill="${belly}"/>`
  + `<path d="M${x} ${y}c${len * 0.2} ${len * 0.15} ${len * 0.24} ${len * 0.5} ${len * 0.12} ${len * 0.85}" stroke="${back}" stroke-width="${len * 0.16}" fill="none"/>`
  + `<path d="M${x} ${y + len * 0.85}l${len * 0.2} ${len * 0.3}h-${len * 0.4}Z" fill="${back}"/>`;

export const FISH_ICONS: Readonly<Record<string, string>> = {
  // ---- одежда
  'h:angler': svg(
    '<path d="M4 29Q20 37 36 29L33 25Q20 30 7 25Z" fill="#a48d58"/><path d="M10 26C9 12 31 12 30 26Q20 29 10 26Z" fill="#c4ad73"/>'
    + '<path d="M9.6 22.5Q20 25.5 30.4 22.5L30.2 25.8Q20 28.6 9.8 25.8Z" fill="#4f5a2e"/>'
    + '<ellipse cx="25" cy="21" rx="1.6" ry="3.2" fill="#e2e7eb" stroke="#8a949b" stroke-width=".6"/><circle cx="25" cy="24.5" r="1" fill="#d23a2a"/>'
    + '<path d="M14 16q-2 6 0 9" stroke="#d5672a" stroke-width="1.6" fill="none"/>',
  ),
  'a:angler': svg(
    '<path d="M9 9l7-3 4 9 4-9 7 3 2 25H7Z" fill="#7d8a4c" stroke="#4a5429" stroke-width="1.2"/>'
    + '<path d="M11 18h7v6h-7zM22 18h7v6h-7z" fill="#8d9a5a" stroke="#4a5429" stroke-width=".8"/><path d="M11 17h7v2.4h-7zM22 17h7v2.4h-7z" fill="#5d6935"/>'
    + '<ellipse cx="25" cy="11.5" rx="1.3" ry="2.6" fill="#dfe4e8"/><circle cx="25" cy="14" r=".9" fill="#d23a2a"/>',
  ),
  'e:angler': svg(
    '<path d="M3 15q17-4 34 0" stroke="#1f3a2c" stroke-width="2.2" fill="none"/>'
    + '<ellipse cx="12" cy="20" rx="8" ry="6.5" fill="#e39b2d" stroke="#1f3a2c" stroke-width="2"/><ellipse cx="28" cy="20" rx="8" ry="6.5" fill="#e39b2d" stroke="#1f3a2c" stroke-width="2"/>'
    + '<path d="M19.5 19q.5-2 1 0" stroke="#1f3a2c" stroke-width="2" fill="none"/><path d="M8 17.5l4-2M24 17.5l4-2" stroke="#fff6dc" stroke-width="1.4"/>'
    + '<path d="M4 18q-1 10 4 15M36 18q1 10-4 15" stroke="#6b5526" stroke-width="1" fill="none"/>',
  ),
  'h:sou': svg(
    '<path d="M11 23C10 9 30 9 29 23Z" fill="#f2bf1d" stroke="#d09b10" stroke-width="1"/>'
    + '<path d="M5 22Q20 18 30 21Q37 25 38 33Q30 27 21 26Q11 25.5 5 22Z" fill="#e5ac16" stroke="#b9870c" stroke-width="1"/>'
    + '<path d="M20 9.5V23M14 11.5q-2 5-1.6 11M26 11.5q2 5 1.6 11" stroke="#d09b10" stroke-width=".9" fill="none"/>'
    + '<path d="M13 24q-1 7 1 11" stroke="#6b5526" stroke-width="1.2" fill="none"/>',
  ),
  'a:oilskin': svg(
    '<path d="M9 10l7-3h8l7 3 2 25H7Z" fill="#f2bf1d" stroke="#d09b10" stroke-width="1.2"/>'
    + '<path d="M13 9l7 5 7-5-1 6-6 3-6-3Z" fill="#1f2c50"/><path d="M18.5 15h3v20h-3Z" fill="#e2aa12"/>'
    + '<path d="M17 19h6M17 23.5h6M17 28h6" stroke="#1f2c50" stroke-width="1.8"/>'
    + '<path d="M9.5 26h6v6h-6zM24.5 26h6v6h-6z" fill="#f2bf1d" stroke="#d09b10" stroke-width=".9"/>',
  ),
  'h:captain': svg(
    '<ellipse cx="20" cy="14" rx="16" ry="6" fill="#f6f5f0" stroke="#1b2a4f" stroke-width="1.2"/>'
    + '<path d="M9 16h22v8H9Z" fill="#141826"/><path d="M9 24Q20 30 31 24L33 27Q20 34 7 27Z" fill="#0b0d12"/>'
    + '<path d="M10 22.5h20" stroke="#e0b030" stroke-width="1.1"/><circle cx="20" cy="19.5" r="3.4" fill="#0c0e16" stroke="#e0b030" stroke-width="1.1"/>'
    + '<path d="M20 17.6v4M18.6 18.6h2.8M18.4 20.6q1.6 1.6 3.2 0" stroke="#e0b030" stroke-width=".8" fill="none"/>',
  ),
  'a:tunic': svg(
    '<path d="M9 10l7-3h8l7 3 2 25H7Z" fill="#1b2a4f" stroke="#121c36" stroke-width="1.2"/>'
    + '<path d="M15 7l5 12 5-12Z" fill="#f4f1ea"/><path d="M19.2 11h1.6l.6 8h-2.8Z" fill="#15161c"/>'
    + '<path d="M15 7l5 12-2.5-1-5.5-8ZM25 7l-5 12 2.5-1 5.5-8Z" fill="#22345e" stroke="#121c36" stroke-width=".6"/>'
    + '<circle cx="16" cy="23" r="1.3" fill="#e0b030"/><circle cx="24" cy="23" r="1.3" fill="#e0b030"/><circle cx="16" cy="27.5" r="1.3" fill="#e0b030"/>'
    + '<circle cx="24" cy="27.5" r="1.3" fill="#e0b030"/><circle cx="16" cy="32" r="1.3" fill="#e0b030"/><circle cx="24" cy="32" r="1.3" fill="#e0b030"/>'
    + '<ellipse cx="9.5" cy="11" rx="3.4" ry="2.4" fill="#121c36" stroke="#e0b030" stroke-width="1.1"/><ellipse cx="30.5" cy="11" rx="3.4" ry="2.4" fill="#121c36" stroke="#e0b030" stroke-width="1.1"/>'
    + '<path d="M7 13.5v3M8.7 13.8v3M10.4 13.8v3M12 13.5v3M28 13.5v3M29.7 13.8v3M31.4 13.8v3M33 13.5v3" stroke="#e0b030" stroke-width=".9"/>',
  ),
  'a:kukan': svg(
    '<path d="M6 6h28" stroke="#5a3a22" stroke-width="3"/><path d="M20 7.5v4M20 11.5L12 15M20 11.5V15M20 11.5L28 15" stroke="#d8c9a0" stroke-width="1.1" fill="none"/>'
    + hangFish(12, 15, 18, '#6f8c9a', '#e4ebef') + hangFish(20, 15, 14, '#7a5a36', '#c9b48a') + hangFish(28, 15, 20, '#5d7a74', '#dfe5e2'),
  ),
  'a:net': svg(
    '<path d="M24 4l-3 8" stroke="#c89a62" stroke-width="3"/><path d="M21 12C33 15 31 34 19 35C8 34 9 15 21 12Z" fill="none" stroke="#b07a3c" stroke-width="2.4"/>'
    + '<path d="M14 20q8 6 15-1M12 26q9 7 18 0M15 32q5-14 7-20M21 34q4-10 2-22M27 31q1-10-4-19" stroke="#2f5b3a" stroke-width=".9" fill="none"/>'
    + '<circle cx="24.5" cy="4" r="2" fill="none" stroke="#9aa4aa" stroke-width="1.2"/>',
  ),
  // ---- питомцы
  's:gull': svg(
    '<path d="M18 31v5M23 31v5" stroke="#e7bf45" stroke-width="1.6"/><ellipse cx="22" cy="25" rx="11" ry="7.5" fill="#f6f6f1" stroke="#c9cfd4" stroke-width=".8"/>'
    + '<path d="M14 22Q24 15 35 23Q27 27 14 22Z" fill="#aab4bd"/><path d="M30 21.5L37 25L31 25.6Z" fill="#1b1c20"/>'
    + '<circle cx="12" cy="16" r="6" fill="#f6f6f1" stroke="#c9cfd4" stroke-width=".8"/><circle cx="10.5" cy="15" r="1.1" fill="#101114"/>'
    + '<path d="M6.5 16.5L1 18l5.6 1.2Z" fill="#f2c230"/><circle cx="3.2" cy="17.9" r=".7" fill="#d23a2a"/>',
  ),
  's:parrot': svg(
    '<path d="M24 28l6 11M21 29l3 10" stroke="#d8262c" stroke-width="3.2"/><path d="M29 36l1.6 3M23.6 36.5l.6 2.6" stroke="#2a5fd0" stroke-width="3.2"/>'
    + '<ellipse cx="20" cy="21" rx="8" ry="10" fill="#d8262c"/><path d="M21 16q9 3 7 15q-5-2-7-8Z" fill="#f4c430"/><path d="M23.5 21q5 4 4.5 10q-3-2-4-5Z" fill="#2a5fd0"/>'
    + '<path d="M22 18q4 1 5 5" stroke="#3aa05a" stroke-width="1.6" fill="none"/>'
    + '<circle cx="15" cy="10" r="6" fill="#d8262c"/><ellipse cx="13" cy="10.5" rx="2.6" ry="3" fill="#f4efe8"/><circle cx="13.2" cy="9.6" r="1" fill="#101114"/>'
    + '<path d="M10 10q-5 0-4 6q2-3 4-3Z" fill="#ece2cc" stroke="#9a8f78" stroke-width=".6"/>',
  ),
  // ---- удочки
  'r:basic': rod('#24313f', '#e0452f', '#c89b6a', '#8d979f'),
  'r:hazel': rod('#7a5634', '#d8b98a', '#cbb38a', '#9a6b3c', '<path d="M15 25l1 1M22 18l1 1M28 12l1 1" stroke="#d8c38f" stroke-width="2.4"/>'),
  'r:carved': rod('#e2b97f', '#f6f1e6', '#5a3a22', '#c9a24a', '<path d="M8 32L33 7" stroke="#5b3a1e" stroke-width="2.6" stroke-dasharray="1.6 2.6" stroke-linecap="butt"/>'
    + '<path d="M29.5 10.5L33 7" stroke="#d8322a" stroke-width="2.6" stroke-dasharray="1.2 1.2" stroke-linecap="butt"/>'),
  'r:gold': rod('#e8b93a', '#c0182a', '#f1e6cc', '#e0b030', '<path d="M8 32L33 7" stroke="#141414" stroke-width="2.8" stroke-dasharray=".9 5.5" stroke-linecap="butt"/>',
    '<path d="M14.5 28.6l2 2.4-2 2.4-2-2.4Z" fill="#d0102a" stroke="#7a0616" stroke-width=".5"/>'),
  // ---- поплавки
  'b:classic': svg(
    '<path d="M4 27h32" stroke="#5fb7d8" stroke-width="1.4"/><path d="M20 4v9" stroke="#e8392a" stroke-width="2.2"/>'
    + '<ellipse cx="20" cy="22" rx="8" ry="10" fill="#f6f3ea" stroke="#c9c2b0" stroke-width=".8"/><path d="M12 22a8 10 0 0 1 16 0Z" fill="#e8392a"/>',
  ),
  'b:quill': svg(
    '<path d="M4 27h32" stroke="#5fb7d8" stroke-width="1.4"/><path d="M20 2C23.4 12 23.6 26 20 38C16.4 26 16.6 12 20 2Z" fill="#f3ead2" stroke="#c9bfa4" stroke-width=".7"/>'
    + '<path d="M20 2C22 7 22.8 12 23 16H17C17.2 12 18 7 20 2Z" fill="#e8392a"/><path d="M17 16h6v2.2h-6Z" fill="#1c1c1c"/>',
  ),
  'b:duck': svg(
    '<path d="M3 30h34" stroke="#5fb7d8" stroke-width="1.4"/><path d="M8 24q-1 7 10 8h8q8-1 9-8q-3 1-6 0q-4-3-9-2Z" fill="#ffd23a" stroke="#d9a816" stroke-width=".8"/>'
    + '<circle cx="15" cy="16" r="6.5" fill="#ffd23a" stroke="#d9a816" stroke-width=".8"/><path d="M8.6 16.5Q4 17 4.5 19.2Q7 19.6 9.6 18.6Z" fill="#ff8a1f"/>'
    + '<circle cx="13.2" cy="14.6" r="1.2" fill="#141414"/><path d="M20 26q5 1 8-2" stroke="#d9a816" stroke-width="1" fill="none"/>',
  ),
  'b:firefly': svg(
    '<circle cx="20" cy="15" r="11" fill="#ffd27a" opacity=".35"/><path d="M4 27h32" stroke="#5fb7d8" stroke-width="1.4"/>'
    + '<path d="M20 3v8" stroke="#2f3a2a" stroke-width="1.6"/><circle cx="20" cy="3.5" r="2" fill="#ffe08a"/>'
    + '<ellipse cx="20" cy="25" rx="7" ry="9" fill="#2f5a3a"/><circle cx="20" cy="15.5" r="5.2" fill="#ffe6a0" stroke="#ffb43a" stroke-width="1.2"/>',
  ),
  'b:goldfish': svg(
    '<path d="M4 29h32" stroke="#5fb7d8" stroke-width="1.4"/><path d="M20 30l-5 8h10Z" fill="#ff9a2a"/>'
    + '<ellipse cx="20" cy="21" rx="6" ry="11" fill="#f2b632" stroke="#c98a12" stroke-width=".9"/><path d="M25.5 18q5 2 4 8q-3-2-4-4Z" fill="#ff9a2a"/>'
    + '<circle cx="18" cy="15" r="1.2" fill="#141414"/><path d="M15.5 9.5l1-5 2 3 1.5-4 1.5 4 2-3 1 5Z" fill="#e0b030" stroke="#a87a10" stroke-width=".6"/>',
  ),
  // ---- окна вываживания
  'w:wood': win('#7a4e2c', '#a8754a', '#3f8fb8', 'rgba(110,220,120,.55)', '#bfffaa'),
  'w:chart': win('#a7834b', '#f6e8c2', '#bcdcd2', 'rgba(200,70,50,.18)', '#aa281e',
    '<path d="M14 12h12M14 19h12M14 28h12M18 6v28M22 6v28" stroke="rgba(70,90,110,.3)" stroke-width=".6"/><circle cx="23" cy="30" r="2.4" fill="none" stroke="#7a4a1e" stroke-width=".7"/>'),
  'w:night': win('#2b3566', '#4a5598', '#13224a', 'rgba(255,200,90,.35)', '#ffdc8c',
    '<circle cx="22.5" cy="9.5" r="2.2" fill="#fff6d6"/><circle cx="16" cy="12" r=".6" fill="#fff"/><circle cx="18" cy="31" r=".5" fill="#fff"/><circle cx="24" cy="15" r=".5" fill="#fff"/>'),
  'w:gold': win('#d4a93a', '#ffe69a', '#1e7f96', 'rgba(255,215,100,.6)', '#fff0b0',
    '<circle cx="17" cy="11" r=".8" fill="#ffe69a"/><circle cx="23" cy="30" r=".8" fill="#ffe69a"/><circle cx="22" cy="9" r=".6" fill="#fff"/>'),
  // ---- значок у ника
  'n:anchor': svg(
    '<circle cx="20" cy="20" r="16" fill="#1b2a4f" stroke="#e0b030" stroke-width="2.6"/>'
    + '<path d="M20 11v18M15 15h10M12 23q8 10 16 0" stroke="#f2cf63" stroke-width="2.4" fill="none"/><circle cx="20" cy="10" r="2.2" fill="none" stroke="#f2cf63" stroke-width="1.6"/>',
  ),
  // ---- остров «Последний свет» (render/islegear.ts, макеты — lab/fishing-review/cosmetics/)
  'b:bellbuoy': svg(
    '<circle cx="20" cy="9" r="7" fill="#ffd27a" opacity=".4"/><path d="M3 31h34" stroke="#5fb7d8" stroke-width="1.4"/>'
    + '<path d="M11 27q9 6 18 0l-1.5 6q-7.5 3-15 0Z" fill="#f6f3ea" stroke="#c9c2b0" stroke-width=".7"/><path d="M10.5 24h19l.5 3.5q-10 4.5-20 0Z" fill="#d8322a"/>'
    + '<path d="M10 24.5h20" stroke="#1c1c1c" stroke-width="1.6"/>'
    + '<path d="M14 24l3-12M26 24l-3-12M15.2 19h9.6M16.2 15h7.6" stroke="#d8322a" stroke-width="1.5" fill="none"/><path d="M14.6 21.6l10.6-2.4M15.6 17.4l8.8-2.2" stroke="#f6f3ea" stroke-width=".9"/>'
    + '<path d="M18 16.5q2-3.2 4 0l.6 2.2h-5.2Z" fill="#c9a24a" stroke="#8a6a20" stroke-width=".5"/>'
    + '<path d="M16.5 12h7v-2h-7Z" fill="#1c1c1c"/><circle cx="20" cy="8.6" r="2.4" fill="#ffe6a0" stroke="#ffb43a" stroke-width="1"/>',
  ),
  'r:lighthouse': rod('#f6f1e6', '#d23a2a', '#1f4a3a', '#c9a24a',
    '<path d="M8 32L33 7" stroke="#d23a2a" stroke-width="2.6" stroke-dasharray="1.8 2.2" stroke-linecap="butt"/>',
    '<circle cx="33" cy="7" r="4.6" fill="#ffd27a" opacity=".45"/><circle cx="33" cy="7" r="1.9" fill="#fff1d6" stroke="#ffb43a" stroke-width=".9"/>'),
  's:puffin': svg(
    '<path d="M17 32l-1.6 5h4M23 32l1.6 5h-4" stroke="#f08a2a" stroke-width="1.6" fill="none"/>'
    + '<ellipse cx="20" cy="23" rx="8.5" ry="10" fill="#1b1c20"/><ellipse cx="21.6" cy="25" rx="5.4" ry="7.6" fill="#f6f6f1"/>'
    + '<circle cx="17" cy="11.5" r="6.4" fill="#1b1c20"/><ellipse cx="15.6" cy="12.2" rx="4.2" ry="4.4" fill="#f2f0ea"/>'
    + '<path d="M11.6 10.4L5 12.4l6.6 3.6Z" fill="#f08a2a" stroke="#c4582a" stroke-width=".6"/><path d="M11.6 10.6l-1.6 1 1.6 3.6Z" fill="#8f9aa3"/><path d="M9.2 11.3l-.4 3.1" stroke="#f2c230" stroke-width=".8"/>'
    + '<circle cx="15" cy="11.4" r="1.2" fill="#101114"/><path d="M14 10l2.2.4" stroke="#d23a2a" stroke-width=".7"/>',
  ),
  'h:keeper': svg(
    '<circle cx="20" cy="6.6" r="4.2" fill="#f6f3ea" stroke="#d6cfc0" stroke-width=".7"/>'
    + '<path d="M8.6 26C8 14 32 14 31.4 26Z" fill="#f6f3ea"/><path d="M9.1 19.6h21.8l.6 3.4H8.5ZM11.9 14.6h16.2l1.4 2.6H10.5Z" fill="#d8322a"/>'
    + '<path d="M7 25.6h26v6.2Q20 34 7 31.8Z" fill="#d8322a" stroke="#b02a20" stroke-width=".8"/><path d="M10 26v5.6M14 26v6.2M18 26v6.4M22 26v6.4M26 26v6.2M30 26v5.6" stroke="#b02a20" stroke-width=".7"/>',
  ),
  'a:keeper': svg(
    '<path d="M9 10l7-3h8l7 3 2 25H7Z" fill="#1f4a3a" stroke="#163629" stroke-width="1.2"/><path d="M15 7q5 4 10 0" stroke="#163629" stroke-width="2.6" fill="none"/>'
    + '<path d="M8.4 14.5h23.2M8 26.5h24" stroke="#f6f3ea" stroke-width="1.6" stroke-dasharray="1.6 1.6"/>'
    + '<path d="M12.6 25l1-8h2.4l1 8ZM23 25l1-8h2.4l1 8Z" fill="#f6f3ea"/><path d="M12.9 22.2h3.8M23.3 22.2h3.8M13.3 19h3M23.7 19h3" stroke="#d8322a" stroke-width="1.3"/>'
    + '<rect x="13.4" y="15.4" width="1.8" height="1.6" fill="#f5962a"/><rect x="23.8" y="15.4" width="1.8" height="1.6" fill="#f5962a"/>'
    + '<path d="M7.2 30.6h25.6l.2 4.4H7Z" fill="#d8322a"/><path d="M7.4 28.4h25.2" stroke="#5a3a22" stroke-width="1.6"/>'
    + '<circle cx="10" cy="33" r="4.2" fill="#ffd27a" opacity=".45"/><rect x="8.2" y="30.6" width="3.6" height="4.6" rx="1" fill="#ffe6a0" stroke="#c4582a" stroke-width=".8"/>',
  ),
  'w:fog': win('#ddd5c6', '#c9b998', '#d9ddd3', 'rgba(255,190,120,.6)', '#ffdcb0',
    '<path d="M13 5h14M13 35h14" stroke="#f2ecdf" stroke-width="1.2" stroke-dasharray="1.4 1.4"/>'
    + '<path d="M21.6 15.5l.6-6h2l.6 6z" fill="#b3b7ae"/><rect x="22.3" y="7.4" width="1.8" height="2" fill="#ffc07a"/><circle cx="23.2" cy="8.4" r="2.8" fill="#ffb062" opacity=".45"/>'
    + '<path d="M14.5 13.5q3-1.6 6 0t5 0M14.5 30q3-1.4 5.5 0t6 0" stroke="#fff" stroke-width="1.3" opacity=".7" fill="none"/>'),
  'n:lighthouse': svg(
    '<circle cx="20" cy="20" r="16" fill="#1f4a3a" stroke="#e0b030" stroke-width="2.6"/>'
    + '<path d="M20 12.5 5.4 9.8v5.4zM20 12.5l14.6-2.7v5.4z" fill="#ffb062" opacity=".5"/><circle cx="20" cy="12.5" r="6" fill="#ffd27a" opacity=".45"/>'
    + '<path d="M7 32.4q6.5-4.6 13-4.6t13 4.6v1.2q-5 4-13 4t-13-4z" fill="#2f5f4c"/>'
    + '<path d="M16.6 30 17.9 15.4h4.2L23.4 30z" fill="#f4efe6"/><path d="M17.3 22.6h5.4l.32 3.3h-6.04zM17.75 17.8h4.5l.22 2.4h-4.94z" fill="#d23a2a"/>'
    + '<path d="M16.2 14.6h7.6v1.4h-7.6z" fill="#d23a2a"/><rect x="18" y="10.6" width="4" height="4" fill="#fff1d6"/><path d="M17.2 10.8 20 7.6l2.8 3.2z" fill="#d23a2a"/>',
  ),
};
