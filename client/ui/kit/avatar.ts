// Неподвижный портрет своей желейки: цвета и видимые детали Outfit, без второго 3D-рендера.
// Все названия проверяются каталогом до попадания в SVG; оформление — токены светлого HUD.
import { DEFAULT_OUTFIT, PALETTE, itemOf, slotKey, type Outfit, type Slot } from '../../../shared/outfit.ts';

export interface PortraitModel {
  color: string;
  secondary: string;
  pattern: string;
  eyes: string;
  hat: string;
  accessory: string;
  top: string;
  pet: string;
}

function palette(index: number, fallback: number): string {
  const color = PALETTE[Number.isInteger(index) ? index : -1] ?? PALETTE[fallback]!;
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Только видимые в портрете детали: снасти, значок ника и низ одежды не требуют перерисовки. */
export function portraitModel(outfit: Outfit): PortraitModel {
  const pick = (slot: Slot, fallback = 'none'): string => {
    const key = slotKey(outfit, slot);
    return itemOf(slot, key) ? key : fallback;
  };
  return {
    color: palette(outfit.c, DEFAULT_OUTFIT.c), secondary: palette(outfit.c2, DEFAULT_OUTFIT.c2),
    pattern: pick('p'), eyes: pick('e', 'normal'), hat: pick('h'), accessory: pick('a'), top: pick('u'), pet: pick('s'),
  };
}

// Силуэт той же желейки из render/outfit3d.ts: округлая макушка, широкое пузико, без ног.
const BODY = 'M32 13C19 13 12 27 10 42C8 55 13 61 32 61S56 55 54 42C52 27 45 13 32 13Z';
const INK = 'var(--surf-text)';
const WHITE = 'var(--surf-solid)';
const RED = 'var(--bad)';
const GOLD = 'var(--gold)';
const GREEN = 'var(--good)';
const BLUE = 'var(--info)';
const PURPLE = 'var(--special)';
const path = (d: string, fill: string, extra = ''): string => `<path d="${d}" fill="${fill}" ${extra}/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string): string => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const line = (d: string, color: string, width = 2): string => path(d, 'none', `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`);

function pattern(key: string, secondary: string): string {
  switch (key) {
    case 'stripes': return line('M9 41H55M9 48H55M10 55H54', secondary, 3);
    case 'dots': return [[18, 39], [35, 44], [46, 38], [15, 53], [43, 55], [27, 57]].map(([x, y]) => ellipse(x!, y!, 2, 2, secondary)).join('');
    case 'spots': return ellipse(16, 43, 6, 4, secondary) + ellipse(44, 51, 7, 5, secondary) + ellipse(27, 57, 4, 3, secondary);
    case 'camo': return path('M9 36L18 33 23 39 19 43 11 44ZM41 40L52 35 57 45 51 50 42 47ZM22 51L29 48 36 54 33 62 21 60Z', secondary);
    case 'sunset': return path('M7 44Q32 34 57 44V63H7Z', secondary, 'opacity=".65"') + line('M9 48Q32 40 55 48', GOLD, 2);
    case 'sugar': return line('M16 42L18 40M25 48L27 50M43 41L45 43M45 56L47 54M14 56L16 58M33 57L35 55', secondary, 2);
    default: return '';
  }
}

function eyes(key: string): string {
  const sclera = ellipse(24, 32, 5, 6, WHITE) + ellipse(40, 32, 5, 6, WHITE);
  const pupils = ellipse(25, 32, 2.3, 3.5, INK) + ellipse(39, 32, 2.3, 3.5, INK);
  if (key === 'happy') return line('M20 32Q24 26 28 32M36 32Q40 26 44 32', INK, 2.5);
  if (key === 'sleepy') return sclera + pupils + path('M18 25H46V31H18Z', 'var(--jelly-body)') + line('M20 31H28M36 31H44', INK, 1.3);
  if (key === 'angry') return sclera + pupils + path('M18 24L30 29V25ZM46 24L34 29V25Z', 'var(--jelly-body)') + line('M20 27L28 30M36 30L44 27', INK, 2);
  if (key === 'shades' || key === 'prism') return path('M18 27H29L28 36H20ZM35 27H46L44 36H36Z', key === 'prism' ? PURPLE : INK) + line('M28 29H36', INK, 2) + line('M21 29L24 32M38 29L41 32', WHITE, 1);
  let extra = '';
  if (key === 'glasses' || key === 'angler') extra = `<g fill="none" stroke="${key === 'angler' ? GOLD : INK}" stroke-width="1.8"><rect x="18" y="25" width="12" height="14" rx="4"/><rect x="34" y="25" width="12" height="14" rx="4"/><path d="M30 30H34"/></g>`;
  if (key === 'monocle') extra = `<circle cx="40" cy="32" r="7" fill="none" stroke="${GOLD}" stroke-width="2"/>` + line('M46 34L48 46', GOLD, 1.3);
  if (key === 'patch') extra = line('M16 24L48 38', INK, 2) + ellipse(24, 32, 6, 7, INK);
  return sclera + pupils + extra;
}

function hat(key: string): string {
  const brim = (color: string, width = 20): string => ellipse(32, 22, width, 3, color);
  const dome = (color: string): string => path('M18 20Q19 9 32 9Q45 9 46 20Z', color);
  const band = (color: string): string => path('M19 18H45V21H19Z', color);
  switch (key) {
    case 'none': return '';
    case 'cap': case 'farmcap': return dome(key === 'cap' ? RED : GREEN) + ellipse(37, 22, 15, 3, key === 'cap' ? RED : GREEN) + line('M32 11V19', WHITE, 1);
    case 'crown': return path('M18 21L16 9 25 15 32 5 39 15 48 9 46 21Z', GOLD) + band('var(--gold-lo)') + ellipse(32, 16, 2, 2.5, RED);
    case 'devil': return path('M20 19Q11 12 18 4Q17 11 27 14ZM44 19Q53 12 46 4Q47 11 37 14Z', RED);
    case 'tophat': return path('M21 5H43L42 22H22Z', INK) + band(RED) + brim(INK);
    case 'storm': case 'nightcap': return path('M16 21Q28 4 40 5L46 9 39 10 45 21Z', PURPLE) + brim(PURPLE) + ellipse(31, 15, 2, 2, GOLD);
    case 'fool': return path('M18 22Q10 10 15 7L26 16 32 5 38 16 49 7Q54 10 46 22Z', RED) + path('M32 5L38 16 46 22H32Z', GREEN) + band(GOLD);
    case 'helmet': return dome(GOLD) + brim(GOLD, 17) + line('M32 10V18', 'var(--gold-lo)', 2);
    case 'astronaut': return path('M13 28Q8 5 32 5Q56 5 51 28L46 27Q46 13 32 13Q18 13 18 27Z', WHITE) + line('M19 24Q32 18 45 24', BLUE, 3) + ellipse(13, 27, 3, 5, INK) + ellipse(51, 27, 3, 5, INK);
    case 'ushanka': return dome(INK) + path('M16 16H23V31H15ZM41 16H48L49 31H41Z', INK) + band(WHITE);
    case 'bandana': return dome(RED) + band(WHITE) + path('M43 20L53 25 48 28Z', RED);
    case 'sailor': case 'captain': return dome(WHITE) + band(INK) + brim(INK, key === 'captain' ? 17 : 14) + ellipse(32, 16, 2, 2, GOLD);
    case 'keeper': return dome(RED) + path('M17 18H47V24H17Z', RED) + line('M22 20H42', WHITE, 1.2);
    case 'leafcrown': return path('M16 20L14 9 24 14 26 5 33 14 39 5 42 14 51 9 48 20Z', GREEN);
    case 'pigears': return dome('var(--bad-hi)') + ellipse(17, 10, 5, 7, 'var(--bad-hi)') + ellipse(47, 10, 5, 7, 'var(--bad-hi)') + ellipse(17, 10, 2, 4, RED) + ellipse(47, 10, 2, 4, RED);
    case 'panama': case 'angler': case 'explorer': return dome(key === 'explorer' ? GREEN : WHITE) + brim(key === 'explorer' ? GREEN : WHITE) + band(BLUE) + (key === 'angler' ? ellipse(44, 19, 2, 3, GOLD) : '');
    case 'sou': return dome(GOLD) + brim(GOLD, 23) + path('M12 22L14 29H20V22Z', GOLD);
    case 'sunhat': return dome(GOLD) + brim(GOLD, 23) + ellipse(43, 19, 5, 5, GOLD) + ellipse(43, 19, 2.5, 2.5, INK);
    case 'fisher': case 'straw': case 'goldstraw': case 'oldgardener': return dome(GOLD) + brim(GOLD, 23) + band(key === 'oldgardener' ? GREEN : 'var(--gold-lo)');
    default: return '';
  }
}

function top(key: string): string {
  if (key === 'none') return '';
  const color = key === 'plaid' ? RED : ['sweater', 'stargardener'].includes(key) ? PURPLE : GREEN;
  let details = line('M32 48V63', WHITE, 1.5);
  if (key === 'plaid') details = line('M11 53H53M11 60H53M20 47V63M32 47V63M44 47V63', INK, 1.4);
  if (key === 'sprout') details = line('M32 58V51M32 53Q24 46 26 54M32 55Q40 48 38 55', WHITE, 1.8);
  return path('M9 48Q18 44 23 48L32 51 41 48Q46 44 55 48V64H9Z', color) + details;
}

function accessory(key: string): string {
  switch (key) {
    case 'mustache': return path('M32 39Q25 34 18 42Q26 46 32 41Q38 46 46 42Q39 34 32 39Z', INK);
    case 'scarf': return path('M11 44Q32 50 53 44L51 50Q32 56 13 50ZM21 49H27L25 62H19Z', RED) + line('M20 55H26M20 59H26', WHITE, 2);
    case 'bowtie': return path('M32 47L23 43V53ZM32 47L41 43V53Z', RED) + ellipse(32, 48, 2, 3, RED);
    case 'headphones': return line('M10 33V22Q10 7 32 7Q54 7 54 22V33', INK, 3) + ellipse(11, 33, 4, 7, BLUE) + ellipse(53, 33, 4, 7, BLUE);
    case 'chain': return line('M15 45Q32 59 49 45', GOLD, 2.8) + ellipse(32, 55, 3, 4, GOLD);
    case 'lifebuoy': return `<ellipse cx="32" cy="57" rx="23" ry="6" fill="none" stroke="${WHITE}" stroke-width="5"/>` + line('M10 57H15M49 57H54', RED, 5);
    case 'epaulets': return path('M9 43L19 45 17 51 8 48ZM55 43L45 45 47 51 56 48Z', GOLD);
    case 'angler': case 'tunic': case 'oilskin': case 'keeper': case 'apron': return path('M11 45L22 43 27 49 32 46 37 49 42 43 53 45V63H11Z', key === 'oilskin' ? GOLD : key === 'tunic' ? WHITE : GREEN) + line('M32 49V62', INK, 1.5) + path('M17 51H25V57H17ZM39 51H47V57H39Z', GOLD);
    case 'jetpack': case 'canpack': return path('M7 41H13V60H7ZM51 41H57V60H51Z', key === 'jetpack' ? PURPLE : GREEN);
    case 'deviltail': return line('M52 57Q64 53 56 44', RED, 3) + path('M55 41L61 45 53 48Z', RED);
    case 'greengloves': return ellipse(11, 53, 5, 5, GREEN) + ellipse(53, 53, 5, 5, GREEN);
    case 'alarm': return ellipse(44, 51, 6, 6, WHITE) + line('M44 47V51L47 53', INK, 1.5);
    case 'basket': return path('M41 52H57L55 63H43Z', GOLD) + line('M44 53Q49 43 54 53', 'var(--gold-lo)', 2);
    case 'bee': return ellipse(49, 40, 4, 5, WHITE) + ellipse(53, 45, 5, 3, GOLD) + line('M52 43V47', INK, 1.5);
    case 'net': return `<ellipse cx="52" cy="43" rx="5" ry="7" fill="none" stroke="${GOLD}" stroke-width="2"/>` + line('M52 50V63M49 38L55 47M49 47L55 38', WHITE, 1);
    case 'kukan': return line('M42 48V59', GOLD, 1.5) + ellipse(45, 55, 4, 6, BLUE);
    default: return '';
  }
}

function pet(key: string): string {
  if (key === 'none') return '';
  const x = 51, y = 44;
  switch (key) {
    case 'parrot': return ellipse(x, y + 4, 5, 7, RED) + ellipse(x, y - 2, 4, 4, GREEN) + path('M55 41L60 43 55 45Z', GOLD) + ellipse(x + 1, y - 2, 1, 1, INK);
    case 'gull': case 'puffin': case 'chick': return ellipse(x, y + 3, 5, 6, key === 'chick' ? GOLD : key === 'puffin' ? INK : WHITE) + ellipse(x + 1, y - 2, 4, 4, key === 'chick' ? GOLD : WHITE) + path('M55 40L60 42 55 44Z', RED) + ellipse(x + 2, y - 2, 1, 1, INK);
    case 'piglet': return ellipse(x, y + 2, 6, 7, 'var(--bad-hi)') + path('M46 40L45 34 49 37ZM56 40L57 34 53 37Z', 'var(--bad-hi)') + ellipse(x, y + 4, 3, 2, RED) + ellipse(x - 2, y, 1, 1, INK) + ellipse(x + 2, y, 1, 1, INK);
    case 'mushroom': return path('M49 42H54V53H49Z', WHITE) + path('M44 44Q45 32 52 32Q59 32 60 44Z', RED) + ellipse(50, 38, 2, 2, WHITE);
    case 'beetle': return ellipse(x, y, 5, 6, GREEN) + line('M51 38V50M45 41L42 39M57 41L60 39', INK, 1.2);
    case 'firefly': return path('M46 38H56V51H46Z', BLUE, 'opacity=".65"') + ellipse(x, y, 3, 3, GOLD) + path('M46 36H56V39H46Z', GOLD);
    default: return '';
  }
}

/** prefix нужен лишь для уникальных SVG-id, когда на странице несколько бейджей. */
export function jellyPortrait(outfit: Outfit, prefix = 'k-avatar'): string {
  const m = portraitModel(outfit);
  const id = prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'k-avatar';
  const color = m.pattern === 'gold' ? GOLD : m.color;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false" style="--jelly-body:${color};--jelly-secondary:${m.secondary}">
    <defs><clipPath id="${id}-body">${path(BODY, WHITE)}</clipPath><radialGradient id="${id}-shine" cx=".3" cy=".2" r=".9"><stop stop-color="${WHITE}" stop-opacity=".6"/><stop offset=".4" stop-color="${WHITE}" stop-opacity="0"/><stop offset="1" stop-color="${INK}" stop-opacity=".28"/></radialGradient></defs>
    ${path(BODY, color)}<g clip-path="url(#${id}-body)">${pattern(m.pattern, m.secondary)}${path(BODY, `url(#${id}-shine)`)}${top(m.top)}</g>
    ${ellipse(21, 21, 3, 1.6, WHITE)}${eyes(m.eyes)}${line('M29 40Q32 43 35 40', INK, 1.5)}${hat(m.hat)}${accessory(m.accessory)}${pet(m.pet)}
  </svg>`;
}
