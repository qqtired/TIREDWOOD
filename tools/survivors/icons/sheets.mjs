// «Подземелье»: листы иконок для Codex CLI image_gen — что на каждом листе и полный текст промпта.
// Один лист = одна генерация: круглые медальоны сеткой на белом фоне; режет их tools/survivors/icons/cut.mjs.
// Цвет диска медальона = категория (оружие, эволюция, пассивка, подбор, точка на карте, действие, враг, интерфейс).

/** Диск и обод медальона по категориям. Тёмные и средние тона, без неона. */
export const CATEGORY = {
  weapon: 'a deep warm rust-brick red-brown inner disc (dark #5A2819 at the edge to #9A4A2E in the center) with a polished brass rim',
  evo: 'a rich golden-amber inner disc glowing from the center with soft golden rays (#7A4E12 at the edge to #F0BE58 in the center) with an ornate polished GOLD rim decorated with small round studs (the upgraded legendary version)',
  passive: 'a deep muted verdigris teal-green inner disc (#1B423E at the edge to #3E7C72 in the center) with a dark bronze rim',
  pickup: 'a deep mossy olive-green inner disc (#26341C at the edge to #5E7A3A in the center) with a dark walnut-wood rim',
  poi: 'a cool slate-grey stone inner disc (#343C45 at the edge to #6B7682 in the center) with a dark iron rim with four small rivets',
  active: 'a bright warm amber-orange inner disc (#8A3E12 at the edge to #F09A40 in the center) with a brass rim',
  mob: 'a warm sandy cave-floor stone inner disc (#6A4B33 at the edge to #B48C64 in the center) with a dark iron rim that has two small glossy violet jam drips running over it',
  ui: 'a dark warm umber-brown inner disc (#2A201B at the edge to #5A463A in the center) with a thin brass rim',
};

/** Листы: kind и id — как в docs/survivors/design-data.json и client/dungeon/data.ts (файл <kind>-<id>.webp). */
export const SHEETS = [
  {
    name: 'weapons', cols: 4, rows: 2,
    items: [
      ['weapon', 'lantern', 'a big brass-and-glass miner\'s lantern hanging from a short chain, a bright warm amber flame inside, a soft cone of warm light flaring out of it'],
      ['weapon', 'embers', 'three glowing hot orange-red embers (round coals with bright yellow cores) flying in curved homing trails with tiny sparks'],
      ['weapon', 'pickaxe', 'an iron miner\'s pickaxe with a wooden handle, spinning, with a curved pale-amber motion arc around it like a returning boomerang'],
      ['weapon', 'fireflies', 'three small glowing golden fireflies (tiny round glowing bodies with little wings) circling along one faint glowing ring orbit'],
      ['weapon', 'spark', 'a faceted turquoise crystal shard releasing a jagged turquoise lightning spark that zig-zags out to the side'],
      ['weapon', 'stalactites', 'a sharp grey-brown stone stalactite falling point-down, a few small rock chips around it and a dark round shadow under its tip'],
      ['weapon', 'charges', 'a bundle of three short red-brown blasting powder sticks tied with twine, a lit fuse sparking on top'],
      ['weapon', 'beam', 'a brass beacon lamp with a big round glass lens shooting one long straight piercing beam of warm white-gold light diagonally'],
    ],
  },
  {
    name: 'passives', cols: 4, rows: 2,
    items: [
      ['passive', 'might', 'a thick cream wax candle with a big bright tall flame on a glowing wick'],
      ['passive', 'cooldown', 'a small round glass flask of golden lamp oil with a cork stopper, one golden drop falling from it'],
      ['passive', 'area', 'a round brass-rimmed magnifying lens with a short wooden handle, glinting glass'],
      ['passive', 'amount', 'a dark grey flint stone and a steel striker hitting it, a bright burst of orange sparks'],
      ['passive', 'maxhp', 'a brown leather work apron with stitched edges, a front pocket and neck strap'],
      ['passive', 'armor', 'a dented brown miner\'s helmet with a small brass headlamp glowing on the front'],
      ['passive', 'speed', 'a sturdy brown leather work boot with iron hobnails on the sole and a small white motion swoosh behind the heel'],
      ['passive', 'magnet', 'an old worn iron horseshoe with nail holes, a few small turquoise crystal shards being pulled toward it'],
    ],
  },
  {
    name: 'evo-active', cols: 3, rows: 2,
    items: [
      ['evo', 'lantern_evo', 'the miner\'s lantern, upgraded: gilded gold frame, ornate, blazing white-gold flame, two fierce jets of fire bursting out of it to the front and to the back'],
      ['evo', 'stalactites_evo', 'a huge round falling boulder with glowing golden cracks, several small stalactites falling around it and a puff of dust'],
      ['evo', 'beam_evo', 'a small golden lighthouse lamp head (brass lantern room with a big lens) shooting two opposite long beams of golden light, as if rotating'],
      ['evo', 'fireflies_evo', 'a swarm of many glowing golden fireflies arranged in two concentric glowing rings, a small warm heart-shaped glow in the very center'],
      ['active', 'dash', 'a bright white-amber comet-like dash streak shooting forward with three parallel motion lines and a small dust puff at its tail'],
      ['active', 'strike', 'a heavy brass lantern on its chain slammed down onto the stone floor, a big circular amber shockwave ring and flying stone chips around the impact'],
    ],
  },
  {
    name: 'pickups', cols: 3, rows: 2,
    items: [
      ['pickup', 'gem', 'a cluster of three glowing turquoise experience crystals (faceted gem shards)'],
      ['pickup', 'stew', 'a steaming round clay bowl of hearty stew with chunks of vegetables and a wooden spoon'],
      ['pickup', 'magnet', 'a classic U-shaped magnet, crimson-red body with silver tips, small curved pull lines between the tips'],
      ['pickup', 'keg', 'a small round wooden powder keg with iron hoops and a lit sparking fuse on top'],
      ['pickup', 'hourglass', 'a brass-framed hourglass with glowing turquoise sand trickling down'],
      ['pickup', 'chest', 'a small wooden treasure chest with brass corners, the lid slightly open, warm golden light spilling out'],
    ],
  },
  {
    name: 'poi', cols: 4, rows: 3,
    items: [
      ['poi', 'altar', 'a low carved stone altar with two lit candles and a softly glowing amber-gold abstract ornament on its front (no letters)'],
      ['poi', 'brazier', 'an iron brazier bowl on three legs with a burning orange fire and a few gold coins glinting in it'],
      ['poi', 'cursedChest', 'an old dark wooden chest wrapped in heavy iron chains with a padlock, violet jam glow leaking out of the lid seam and dripping'],
      ['poi', 'spring', 'a mossy round stone basin full of glowing turquoise healing water with a tiny fountain'],
      ['poi', 'lamppost', 'a tall old iron lamppost with a glowing amber lantern on top casting a round pool of warm light'],
      ['poi', 'minecart', 'an old wooden mine cart with iron wheels on a short piece of rail, filled with rocks'],
      ['poi', 'powderKegs', 'a stack of four wooden gunpowder barrels (three below, one on top) with fuses, one fuse sparking'],
      ['poi', 'trampoline', 'a big bouncy cream-colored mushroom with a wide springy cap, two curved bounce lines above it'],
      ['poi', 'forge', 'a stone forge hearth with glowing orange coals and a leather bellows, an iron anvil in front of it'],
      ['poi', 'chest', 'a closed wooden treasure chest with brass fittings and a vertical beam of warm golden light rising from it (a dropped reward)'],
      ['poi', 'elite', 'the menacing head of a big mossy green troll brute wearing a wooden barrel like a helmet with iron hoops, small tusks, glowing lilac eyes, violet jam splotches'],
      ['poi', 'boss', 'the head of a huge cave worm bursting out of a hole in the ground: armored brown stone-plated head, a round open maw ringed with blunt cream teeth, glowing violet jam bands between its segments'],
    ],
  },
  {
    name: 'mobs', cols: 4, rows: 3,
    items: [
      ['mob', 'rat', 'a cellar rat running: grey-brown fur, long pink tail, violet jam splotches on its back, glowing lilac eyes'],
      ['mob', 'bat', 'a cave bat with spread leathery brown-violet wings, small furry body, big ears, glowing lilac eyes, jam drips on the wings'],
      ['mob', 'slime', 'a jam slug: a plump glossy slug made of violet blackcurrant jam, two eye stalks with glowing lilac eye tips, cream-pink underside'],
      ['mob', 'slimelet', 'a tiny baby jam slug: a small round glossy violet jam droplet blob with two short eye stalks, cute'],
      ['mob', 'shroom', 'a mushroom man: a stout walking mushroom with a wide tan-brown cap covered with violet jam drips, cream stem body with stubby arms, glowing lilac eyes, grumpy'],
      ['mob', 'beetle', 'a shield beetle seen from the front: chunky dark-shelled beetle holding a big riveted iron-grey shield plate, violet jam splotches, glowing lilac eyes'],
      ['mob', 'spitter', 'a spitter toad: a plump olive-green toad with huge swollen glossy violet jam cheek sacs, glowing lilac eyes'],
      ['mob', 'larva', 'a jam larva: a small segmented pale grub with violet glowing segments, tiny mandibles, lilac eyes'],
      ['mob', 'barrel', 'the Cooper: head and shoulders of a big mossy green troll brute with a wooden barrel strapped on his back, small tusks, glowing lilac eyes, violet jam splotches'],
      ['mob', 'shaman', 'the Mushroom Shaman: an old mushroom elder with a wide tan cap dripping violet jam, a long beard of pale mushroom gills, a dark purple robe and a gnarled staff with a glowing lilac crystal'],
      ['mob', 'boss', 'Old Jam, the giant cave worm boss: armored brown stone-plated head with a round maw ringed with cream teeth, glowing violet jam bands between body segments, rising out of the ground'],
      null,
    ],
  },
  {
    name: 'ui', cols: 4, rows: 3,
    items: [
      ['ui', 'reroll', 'two curved brass arrows chasing each other in a circle around a tumbling wooden die (dots only)'],
      ['ui', 'banish', 'a blank parchment card torn in half with a bold dark-red cross mark slashed over it'],
      ['ui', 'gold', 'a small stack of shiny gold coins with blank embossed rims and a bright glint'],
      ['ui', 'levelup', 'a radiant golden star with a bold upward chevron arrow above it and small sparkles'],
      ['ui', 'kills', 'a squashed defeated violet jam blob with two little cross-shaped closed eyes and a jam splatter around it (cute, not gory)'],
      ['ui', 'temper', 'a blacksmith hammer striking a glowing orange-hot metal bar, a burst of sparks'],
      ['ui', 'hp', 'a glossy deep red heart like a polished gemstone, warm highlight'],
      ['ui', 'fury', 'a clenched leather-gloved fist wreathed in orange-red flames'],
      ['ui', 'haste', 'a brass pocket watch with a blank dial (only tick marks, no numbers) and quick swirling amber motion streaks'],
      ['ui', 'wind', 'a swirling gust of pale mint-white wind spirals with a small feather'],
      ['ui', 'pull', 'a swirling vortex of small turquoise experience crystals spiraling inward to the center'],
      ['ui', 'wave', 'a dark cave mouth with many small glowing lilac eyes peering out of the darkness (an incoming horde)'],
    ],
  },
  // доработки: слабые на контактном листе (тонкие/неконтрастные при 48 px) — отдельной генерацией, выбор в cut.mjs (PICK)
  {
    name: 'fix', cols: 2, rows: 2, fix: true,
    items: [
      ['weapon', 'fireflies', 'three BIG bright glowing golden fireflies (round glowing bodies with little wings, each large) circling along one thick glowing golden ring orbit, bright against the dark disc'],
      ['weapon', 'stalactites', 'one big sharp pale sandy-cream stone stalactite falling point-down with bold speed lines above it, a few rock chips and a dark round shadow under its tip, high contrast'],
      ['ui', 'wave', 'a horde coming: three pairs of big glowing lilac eyes peering out of a dark arched cave mouth framed by warm amber-lit stones'],
      ['evo', 'fireflies_evo', 'six big glowing golden fireflies on two concentric glowing rings (three on each ring), a small warm heart-shaped glow in the very center, simple and bold'],
    ],
  },
];

const INTRO = 'Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image.';
const REF = 'The attached image is an already approved sheet from the same icon set: use it ONLY as a style reference (the same medallion construction, rim thickness, outline weight, lighting direction, painting style and level of detail) and generate a NEW image with the new contents below; do not copy its objects or its colors.';
const STYLE = 'Style: polished hand-painted game item icons in the same look as warm storybook cartoon concept art for a browser top-down action game set in underground cellars and an old mine under a cozy seaside town: clean readable shapes, soft rounded forms, gentle painterly texture, moderately saturated warm colors (not neon, not oversaturated). World palette: dark warm stone, brass and old wood, warm amber lantern light, cool turquoise crystals as an accent, glossy violet blackcurrant jam of the Jam Baron\'s army. Light dark fantasy without excess: no blood, no gore, no skulls, no horror, not childish, not sci-fi, no neon.';
const NOTEXT = 'Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no labels or captions under the icons, no frame around the sheet, no watermark, no signature.\nno text, no letters, no logos.';

/** Короткие метки цвета для листов, где категории смешаны */
const TAG = { weapon: 'rust-red', evo: 'gold upgraded', passive: 'teal', pickup: 'moss-green', poi: 'slate-grey', active: 'amber-orange', mob: 'sandy', ui: 'dark umber' };
const ORD = ['first', 'second', 'third', 'fourth'];

/** Полный текст промпта для листа (ровно он идёт на stdin Codex). */
export function promptFor(sheet, withRef = false) {
  const n = sheet.items.filter(Boolean).length;
  const cats = [...new Set(sheet.items.filter(Boolean).map((it) => it[0]))];
  const layout = `Game UI icon sheet, landscape 3:2 (1536x1024), on a perfectly flat, uniform, pure white background filling the whole canvas edge to edge (no texture, no gradient, no shadows on the background, no vignette, nothing else on the background). Exactly ${n} round icon medallions arranged in a strict grid of ${sheet.cols} columns and ${sheet.rows} rows, evenly spaced, all medallions exactly the same size (each about 80% of its grid cell), each centered in its cell, with clear white gaps between them; nothing touches the canvas edge or another medallion.${sheet.cols * sheet.rows > n ? ' The last cell (bottom right) stays completely empty white.' : ''}`;
  const build = 'Every medallion has the same construction: a perfect flat-on circle (not tilted, no drop shadow); a rim about 6% of the diameter; an inner disc with a soft radial gradient, lighter in the center behind the object; ONE single bold object in the center, large (about 70% of the inner disc), drawn in a 3/4 view with a consistent dark warm-brown outline, simple chunky shapes and few small details so it stays readable at 48 pixels; strong light-dark contrast between the object and the disc. The lighting is the same on every medallion: warm key light from the upper left, soft shade on the lower right, a small specular highlight. Nothing sticks out beyond the rim.';
  const colors = cats.length === 1
    ? `Every medallion on this sheet has ${CATEGORY[cats[0]]}.`
    : 'Medallion colors: ' + cats.map((c) => `the ${TAG[c]} medallions (${sheet.items.filter((it) => it && it[0] === c).length}) have ${CATEGORY[c]}`).join('; ') + '.';
  const rows = [];
  let k = 1;
  for (let r = 0; r < sheet.rows; r++) {
    const cells = [];
    for (let c = 0; c < sheet.cols; c++) {
      const it = sheet.items[r * sheet.cols + c];
      if (!it) continue;
      const tag = cats.length === 1 ? '' : `[${TAG[it[0]]} medallion] `;
      cells.push(`${k++}) ${tag}${it[2]}`);
    }
    if (cells.length) rows.push(`${ORD[r][0].toUpperCase() + ORD[r].slice(1)} row, left to right: ${cells.join('; ')}.`);
  }
  return [`${INTRO}${withRef ? ' ' + REF : ''} Brief:`, '', layout, '', build, '', colors, '', 'Contents of the medallions:', ...rows, '', STYLE, '', NOTEXT, ''].join('\n');
}

/** id всех иконок по порядку листов: [{kind, id, sheet, index}] */
export function allIcons() {
  const out = [];
  for (const s of SHEETS) if (!s.fix) s.items.forEach((it, i) => { if (it) out.push({ kind: it[0], id: it[1], sheet: s.name, index: i }); });
  return out;
}
