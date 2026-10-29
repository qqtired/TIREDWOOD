// Разбор пака SIGame (.siq) прямо в браузере: ZIP по центральному каталогу → content.xml (версии 4 и 5) → наш пак.
// Модуль самодостаточный (нужны только Blob, DecompressionStream, DOMParser, createImageBitmap) — его можно взять в игру
// как есть (client/lobby/quiz/import.ts). Схема SIGame — assets/siq_5.xsd в github.com/VladimirKhil/SI.
//
// parseSiq(file) → { pack, files, stats, warnings, info }
//   pack      — наш JSON: { title, author, kind: 'jeopardy', adult, tags, source, rounds: [{ name, final, themes: [{ name,
//               questions: [{ price, type, content: [...], reveal: [...], answers: [...], wrong: [...], comment }] }] }] }
//   content   — [{ kind: 'text', value, say? } | { kind: 'image'|'audio', file } | { kind: 'video'|'html', skipped, name }
//               | { kind: 'image'|'audio', missing } | { kind: 'image'|'audio', url, skipped }]
//   reveal    — то же, но то, что показывают вместе с ответом (после «marker» в версии 4, параметр answer в версии 5)
//   files     — найденные картинки и звук: { id, name, kind, size, mime, read() } + orig / shrunk / url по мере работы
//   stats     — { images, audio, video, html }: { count, bytes }; video и html в первой версии пропускаются
//   warnings  — [{ tone: 'warn' | 'bad', text }] — по-человечески, готовы к показу
// Ошибки — SiqError с кодом и понятным текстом (message).

export class SiqError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const ERR = {
  empty: 'Файл пустой.',
  notZip: 'Это не пак SIGame: файл не открывается как архив .siq.',
  zip64: 'Пак слишком большой: такие архивы мы не открываем.',
  encrypted: 'Пак закрыт паролем — открыть его не получится.',
  noContent: 'Это не пак SIGame: нет content.xml.',
  badXml: 'Не получилось прочитать вопросы: content.xml повреждён.',
  notPackage: 'Это не пак SIGame: в content.xml нет пакета вопросов.',
  noQuestions: 'В паке нет ни одного вопроса.',
  noInflate: 'Этот браузер не умеет распаковывать паки. Открой страницу в свежем Chrome, Firefox или Safari.',
  method: 'Пак сжат способом, который мы не умеем открывать.',
};

const MB = 1024 * 1024;
/** Пределы пака на набережной (brief.md, раздел «Паки») */
export const LIMITS = { questions: 600, bytes: 30 * MB, audioBytes: 1.5 * MB, imageSide: 1280 };

const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
/** 41,2 МБ · 850 КБ · 300 Б (с неразрывным пробелом) */
export function fmtSize(b) {
  if (b >= 0.95 * MB) return `${nf1.format(b / MB)} МБ`;
  if (b >= 1024) return `${Math.round(b / 1024)} КБ`;
  return `${Math.round(b)} Б`;
}
const plural = (n, f) => {
  const m = Math.abs(n) % 100;
  const d = m % 10;
  return f[m > 10 && m < 20 ? 2 : d > 1 && d < 5 ? 1 : d === 1 ? 0 : 2];
};

// ------------------------------------------------------------------ ZIP: чтение по центральному каталогу

const dec8 = new TextDecoder('utf-8');
const dec8strict = new TextDecoder('utf-8', { fatal: true });
/** Старые архивы Windows хранят русские имена в кодовой странице 866 */
function cp866(bytes) {
  let s = '';
  for (const b of bytes) {
    if (b < 0x80) s += String.fromCharCode(b);
    else if (b <= 0xaf) s += String.fromCharCode(0x410 + b - 0x80);
    else if (b >= 0xe0 && b <= 0xef) s += String.fromCharCode(0x440 + b - 0xe0);
    else if (b === 0xf0) s += 'Ё';
    else if (b === 0xf1) s += 'ё';
    else s += '_';
  }
  return s;
}
function zipName(bytes, utf8) {
  if (utf8) return dec8.decode(bytes);
  try {
    return dec8strict.decode(bytes);
  } catch {
    return cp866(bytes);
  }
}
const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Открыть ZIP: читает только хвост и каталог — сам архив в память не грузится.
 * → { entries: [{ name, decoded, size, csize, method, flags, lho }], read(entry) → Promise<Blob> }
 */
export async function openZip(blob) {
  if (!blob.size) throw new SiqError('empty', ERR.empty);
  if (blob.size < 22) throw new SiqError('notZip', ERR.notZip);
  const tail = new Uint8Array(await blob.slice(Math.max(0, blob.size - (22 + 0xffff))).arrayBuffer());
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new SiqError('notZip', ERR.notZip);
  const eocd = new DataView(tail.buffer, tail.byteOffset + at, tail.length - at);
  const total = eocd.getUint16(10, true);
  const cdSize = eocd.getUint32(12, true);
  const cdOff = eocd.getUint32(16, true);
  if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new SiqError('zip64', ERR.zip64);
  if (cdOff + cdSize > blob.size) throw new SiqError('notZip', ERR.notZip);

  const cdBuf = await blob.slice(cdOff, cdOff + cdSize).arrayBuffer();
  const cd = new DataView(cdBuf);
  const cdBytes = new Uint8Array(cdBuf);
  const entries = [];
  for (let p = 0; p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50;) {
    const flags = cd.getUint16(p + 8, true);
    const nlen = cd.getUint16(p + 28, true);
    const elen = cd.getUint16(p + 30, true);
    const clen = cd.getUint16(p + 32, true);
    const name = zipName(cdBytes.subarray(p + 46, p + 46 + nlen), !!(flags & 0x800)).replace(/\\/g, '/');
    if (!name.endsWith('/')) {
      entries.push({
        name,
        decoded: safeDecode(name),
        flags,
        method: cd.getUint16(p + 10, true),
        csize: cd.getUint32(p + 20, true),
        size: cd.getUint32(p + 24, true),
        lho: cd.getUint32(p + 42, true),
      });
    }
    p += 46 + nlen + elen + clen;
  }
  if (!entries.length) throw new SiqError('notZip', ERR.notZip);

  /** Содержимое записи: stored — кусок файла, deflate — поток через DecompressionStream (в память целиком не читаем) */
  async function read(e, type = '') {
    if (e.flags & 1) throw new SiqError('encrypted', ERR.encrypted);
    const head = new DataView(await blob.slice(e.lho, e.lho + 30).arrayBuffer());
    if (head.getUint32(0, true) !== 0x04034b50) throw new SiqError('notZip', ERR.notZip);
    const start = e.lho + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    const raw = blob.slice(start, start + e.csize, type);
    if (e.method === 0) return raw;
    if (e.method !== 8) throw new SiqError('method', ERR.method);
    if (typeof DecompressionStream === 'undefined') throw new SiqError('noInflate', ERR.noInflate);
    const out = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    return type ? out.slice(0, out.size, type) : out;
  }
  return { entries, read };
}

// ------------------------------------------------------------------ файлы пака

const EXT = {
  image: ['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg'],
  audio: ['mp3', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'flac', 'wma'],
  video: ['mp4', 'webm', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'mpg', 'mpeg', 'm4v', '3gp', 'ogv'],
  html: ['htm', 'html'],
};
const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
};
const extOf = (n) => n.slice(n.lastIndexOf('.') + 1).toLowerCase();
const FOLDER = { image: 'images', audio: 'audio', video: 'video', html: 'html' };

/** Блоб файла пака (оригинал) — читается один раз */
export async function fileBlob(f) {
  f.orig ??= await f.read();
  return f.orig;
}
/** Адрес для предпросмотра: ужатая версия, если она есть */
export async function fileUrl(f) {
  if (!f.url) f.url = URL.createObjectURL(f.shrunk ?? (await fileBlob(f)));
  return f.url;
}
export function releaseFiles(files) {
  for (const f of files ?? []) {
    if (f.url) URL.revokeObjectURL(f.url);
    f.url = null;
  }
}

// ------------------------------------------------------------------ content.xml → пак

const kids = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : []);
const kid = (el, name) => kids(el, name)[0] ?? null;
const txt = (el) => (el?.textContent ?? '').trim();

/** Названия типов вопросов SIGame (версия 4 — type/@name, версия 5 — question/@type) → наши */
const QTYPE = {
  simple: 'simple',
  cat: 'cat', bagcat: 'cat', secret: 'cat', secretpublicprice: 'cat', secretnoquestion: 'cat',
  auction: 'auction', stake: 'auction', stakeall: 'auction',
  sponsored: 'noRisk', norisk: 'noRisk',
  forall: 'forAll',
};
const QTYPE_RU = { cat: 'Кот в мешке', auction: 'Ставка', noRisk: 'Без риска', forAll: 'Для всех' };
/** Подпись типа вопроса для интерфейса: '' — обычный */
export const typeLabel = (t) => QTYPE_RU[t] ?? '';

const ATOM = { text: 'text', say: 'say', oral: 'say', image: 'image', voice: 'audio', audio: 'audio', audionew: 'audio', video: 'video', html: 'html', marker: 'marker' };

function readPack(doc, zip, base) {
  const root = doc.documentElement;
  if (!root || root.localName !== 'package') throw new SiqError('notPackage', ERR.notPackage);

  // ---- индекс файлов: по полному и по короткому имени, и в сыром, и в раскодированном виде (%D0%9A… ↔ К)
  const byFull = new Map();
  const byBase = new Map();
  const rel = (n) => (n.toLowerCase().startsWith(base) ? n.slice(base.length) : n);
  for (const e of zip.entries) {
    const raw = rel(e.name).toLowerCase();
    const dec = rel(e.decoded).toLowerCase();
    byFull.set(raw, e);
    byFull.set(dec, e);
    const b = dec.split('/').pop();
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(e);
  }
  const recs = new Map();
  const ctx = {
    missing: new Set(), external: 0, videoItems: 0, htmlItems: 0, bigAudio: [], types: {}, noAnswer: [], noContent: [],
    skipFiles: { video: new Map(), html: new Map() },
  };

  function find(kind, ref) {
    const r0 = ref.replace(/^@/, '').trim().replace(/\\/g, '/');
    const cands = [...new Set([r0, safeDecode(r0), encodeURIComponent(r0)])].map((s) => s.toLowerCase());
    for (const c of cands) {
      const hit = byFull.get(`${FOLDER[kind]}/${c}`) ?? byFull.get(c);
      if (hit) return hit;
    }
    for (const c of cands) {
      const list = byBase.get(c.split('/').pop());
      if (list?.length) return list.find((e) => FOLDER[kind] === rel(e.decoded).toLowerCase().split('/')[0]) ?? list[0];
    }
    return null;
  }
  function record(e, kind) {
    let f = recs.get(e);
    if (!f) {
      const full = rel(e.decoded);
      f = {
        id: full, name: full.split('/').pop(), kind, size: e.size, mime: MIME[extOf(full)] ?? '',
        read: () => zip.read(e, MIME[extOf(full)] ?? ''), orig: null, shrunk: null, url: null,
      };
      recs.set(e, f);
    }
    return f;
  }
  /** Один элемент содержимого → наш вид (или null) */
  function media(kind, value) {
    const v = value.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) {
      ctx.external++;
      return { kind, url: v, skipped: true };
    }
    const e = find(kind, v);
    if (kind === 'video' || kind === 'html') {
      kind === 'video' ? ctx.videoItems++ : ctx.htmlItems++;
      if (e) ctx.skipFiles[kind].set(e, e.size);
      return { kind, skipped: true, name: v.replace(/^@/, '') };
    }
    if (!e) {
      ctx.missing.add(v.replace(/^@/, ''));
      return { kind, missing: v.replace(/^@/, '') };
    }
    const f = record(e, kind);
    if (kind === 'audio' && f.size > LIMITS.audioBytes) ctx.bigAudio.push(f.name);
    return { kind, file: f.id };
  }
  const textItem = (value, say) => (value ? (say ? { kind: 'text', value, say: true } : { kind: 'text', value }) : null);

  // ---- вопрос
  function readQuestion(q, themeName, isFinal) {
    const priceRaw = parseInt(q.getAttribute('price') ?? '', 10);
    const content = [];
    const reveal = [];
    let rawType = (q.getAttribute('type') ?? '').trim();
    const typeEl = kid(q, 'type'); // версия 4: <type name="cat"><param name="theme">…</param></type>
    if (!rawType && typeEl) rawType = (typeEl.getAttribute('name') ?? '').trim();
    const type = QTYPE[rawType.toLowerCase()] ?? (rawType ? 'other' : 'simple');
    const extra = {};
    for (const p of kids(typeEl, 'param')) extra[(p.getAttribute('name') ?? '').toLowerCase()] = txt(p);

    const push = (list, item) => item && list.push(item);
    const scenario = kid(q, 'scenario');
    if (scenario) {
      // версия 4 (и старше): сценарий из atom; marker отделяет вопрос от «показа ответа»
      let part = content;
      for (const a of kids(scenario, 'atom')) {
        const t = ATOM[(a.getAttribute('type') ?? 'text').toLowerCase()];
        const value = (a.textContent ?? '').trim();
        if (t === 'marker') part = reveal;
        else if (t === 'text' || t === 'say') push(part, textItem(value, t === 'say'));
        else if (t) push(part, media(t, value));
      }
    }
    const params = kid(q, 'params');
    if (params) {
      // версия 5: params/param[@name=question|answer…]/item
      for (const p of kids(params, 'param')) {
        const name = (p.getAttribute('name') ?? '').toLowerCase();
        if (name === 'question' || name === 'answer') {
          const list = name === 'question' ? content : reveal;
          const items = kids(p, 'item');
          if (!items.length && txt(p)) push(list, textItem(txt(p), false));
          for (const it of items) {
            const t = ATOM[(it.getAttribute('type') ?? 'text').toLowerCase()] ?? 'text';
            const value = (it.textContent ?? '').trim();
            if (t === 'text' || t === 'say') push(list, textItem(value, t === 'say' || (it.getAttribute('placement') ?? '') === 'replic'));
            else if (t !== 'marker') push(list, media(t, value)); // isRef не нужен: ссылка на файл или адрес — media() сама различает
          }
        } else if (name === 'theme' || name === 'price') {
          extra[name] = txt(p);
        }
      }
    }
    let answers = kids(kid(q, 'right'), 'answer').map(txt).filter(Boolean);
    const wrong = kids(kid(q, 'wrong'), 'answer').map(txt).filter(Boolean);
    const comment = txt(kid(kid(q, 'info'), 'comments'));
    // нет «правильных» — пробуем взять текст показа ответа
    if (!answers.length) answers = reveal.filter((i) => i.kind === 'text' && !i.say).map((i) => i.value).slice(0, 1);

    const price = Number.isFinite(priceRaw) && !isFinal ? priceRaw : 0;
    const where = isFinal ? themeName : `${themeName}, ${price || '?'}`;
    if (!answers.length) ctx.noAnswer.push(where);
    if (!content.length) ctx.noContent.push(where);
    if (type !== 'simple') ctx.types[type === 'other' ? rawType : type] = (ctx.types[type === 'other' ? rawType : type] ?? 0) + 1;

    const out = { price, type, content, answers, wrong, comment };
    if (reveal.length) out.reveal = reveal;
    if (type === 'other') out.typeName = rawType;
    if (type === 'cat' && extra.theme) out.catTheme = extra.theme;
    return out;
  }

  // ---- пакет
  const info = kid(root, 'info');
  let authors = kids(kid(info, 'authors'), 'author').map(txt).filter(Boolean);
  if (!authors.length && txt(kid(info, 'authors'))) authors = [txt(kid(info, 'authors'))];
  const restriction = (root.getAttribute('restriction') ?? '').trim();
  const title = (root.getAttribute('name') ?? '').trim() || 'Без названия';
  const tags = kids(kid(root, 'tags'), 'tag').map(txt).filter(Boolean);
  const pack = {
    title,
    author: authors.join(', '),
    kind: 'jeopardy',
    adult: /(^|\D)18(\D|$)/.test(restriction) || /18\s*\+/.test(title),
    tags,
    source: {
      format: 'siq',
      version: parseInt(root.getAttribute('version') ?? '', 10) || 0,
      restriction,
      date: (root.getAttribute('date') ?? '').trim(),
      publisher: (root.getAttribute('publisher') ?? '').trim(),
      difficulty: (root.getAttribute('difficulty') ?? '').trim(),
      language: (root.getAttribute('language') ?? '').trim(),
    },
    rounds: [],
  };
  const emptyThemes = [];
  let ri = 0;
  for (const r of kids(kid(root, 'rounds'), 'round')) {
    ri++;
    const isFinal = (r.getAttribute('type') ?? '').toLowerCase() === 'final';
    const round = { name: (r.getAttribute('name') ?? '').trim() || (isFinal ? 'Финал' : `Раунд ${ri}`), final: isFinal, themes: [] };
    let ti = 0;
    for (const t of kids(kid(r, 'themes'), 'theme')) {
      ti++;
      const name = (t.getAttribute('name') ?? '').trim() || `Тема ${ti}`;
      const questions = kids(kid(t, 'questions'), 'question').map((q) => readQuestion(q, name, isFinal));
      if (!questions.length) {
        emptyThemes.push(name);
        continue;
      }
      round.themes.push({ name, questions });
    }
    if (round.themes.length) pack.rounds.push(round);
  }
  const total = pack.rounds.reduce((n, r) => n + r.themes.reduce((m, t) => m + t.questions.length, 0), 0);
  if (!total) throw new SiqError('noQuestions', ERR.noQuestions);

  // ---- файлы и предупреждения
  const files = [...recs.values()].filter((f) => f.kind === 'image' || f.kind === 'audio');
  const sum = (arr) => ({ count: arr.length, bytes: arr.reduce((n, f) => n + f.size, 0) });
  const stats = {
    images: sum(files.filter((f) => f.kind === 'image')),
    audio: sum(files.filter((f) => f.kind === 'audio')),
    video: { count: ctx.skipFiles.video.size || ctx.videoItems, bytes: [...ctx.skipFiles.video.values()].reduce((n, v) => n + v, 0) },
    html: { count: ctx.skipFiles.html.size || ctx.htmlItems, bytes: [...ctx.skipFiles.html.values()].reduce((n, v) => n + v, 0) },
  };
  const warnings = [];
  const warn = (text, tone = 'warn') => warnings.push({ tone, text });
  const few = (list, n = 3) => list.slice(0, n).join('; ') + (list.length > n ? ` и ещё ${list.length - n}` : '');
  if (ctx.videoItems) warn(`Видео пропущено: ${ctx.videoItems}. В первой версии игры видео нет — остальное в вопросе сохранится.`);
  if (ctx.htmlItems) warn(`Веб-страницы пропущены: ${ctx.htmlItems}.`);
  if (ctx.external) warn(`Картинки и звуки по ссылкам пропущены: ${ctx.external}. Нужны файлы внутри пака.`);
  if (ctx.missing.size) warn(`Не нашлось файлов в паке: ${ctx.missing.size} (${few([...ctx.missing])}).`);
  if (ctx.noAnswer.length) warn(`Вопрос без ответа: ${few(ctx.noAnswer, 5)}. Такой вопрос рассудит только живой ведущий.`);
  if (ctx.noContent.length) warn(`Пустой вопрос: ${few(ctx.noContent, 5)}. Его пропустим.`);
  if (ctx.bigAudio.length) warn(`Звук тяжелее ${nf1.format(LIMITS.audioBytes / MB)} МБ: ${ctx.bigAudio.length} ${plural(ctx.bigAudio.length, ['файл', 'файла', 'файлов'])} — в игру возьмём только первую минуту.`);
  const odd = Object.entries(ctx.types).filter(([t]) => t === 'auction' || t === 'forAll' || !QTYPE_RU[t]);
  if (odd.length) {
    const n = odd.reduce((s, [, c]) => s + c, 0);
    warn(`Особых вопросов (${odd.map(([t]) => QTYPE_RU[t] ?? t).join(', ')}): ${n}. Пока сыграем их как обычные.`);
  }
  if (emptyThemes.length) warn(`Темы без вопросов убрали: ${few(emptyThemes)}.`);
  if (total > LIMITS.questions) warn(`В паке ${total} ${plural(total, ['вопрос', 'вопроса', 'вопросов'])}, а на набережной можно не больше ${LIMITS.questions}. Раздели пак на два и загрузи по отдельности.`, 'bad');

  return { pack, files, stats, warnings, info: { version: pack.source.version, entries: zip.entries.length } };
}

/**
 * Разобрать пак SIGame. file — File/Blob. onStep(text) — что делаем сейчас (для строки «Разбираю пак…»); можно вернуть промис, чтобы подождать перерисовки.
 */
export async function parseSiq(file, { onStep } = {}) {
  await onStep?.('Открываю пак…');
  const zip = await openZip(file);
  const contentEntry = zip.entries.find((e) => e.name.toLowerCase() === 'content.xml')
    ?? zip.entries.find((e) => e.name.toLowerCase().endsWith('/content.xml'));
  if (!contentEntry) throw new SiqError('noContent', ERR.noContent);
  const base = contentEntry.name.slice(0, contentEntry.name.length - 'content.xml'.length).toLowerCase();
  await onStep?.('Читаю вопросы…');
  const xml = dec8.decode(await (await zip.read(contentEntry)).arrayBuffer());
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new SiqError('badXml', ERR.badXml);
  await onStep?.('Раскладываю по раундам и темам…'); // onStep может вернуть промис — страница успеет перерисоваться перед тяжёлым куском
  return readPack(doc, zip, base);
}

// ------------------------------------------------------------------ ужатие картинок (до 1280 px, WebP)

async function reencode(blob, maxSide, quality) {
  const bmp = await createImageBitmap(blob);
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(bmp, 0, 0, w, h);
    const toBlob = (type, q) => (cv.convertToBlob ? cv.convertToBlob({ type, quality: q }) : new Promise((res) => cv.toBlob(res, type, q)));
    let out = await toBlob('image/webp', quality);
    if (!out || out.type !== 'image/webp') {
      // Safari не умеет WebP: подкладываем белый фон и сохраняем JPEG
      cx.globalCompositeOperation = 'destination-over';
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, w, h);
      out = await toBlob('image/jpeg', quality);
    }
    return out;
  } finally {
    bmp.close?.();
  }
}

/**
 * Ужать все картинки пака: сторона до 1280 px, WebP. Файлы gif и svg не трогаем (анимация и вектор).
 * Не получилось или не стало меньше — остаётся оригинал. → { before, after, count, kept }
 */
export async function shrinkImages(files, { maxSide = LIMITS.imageSide, quality = 0.82, onProgress } = {}) {
  const list = files.filter((f) => f.kind === 'image');
  let before = 0;
  let after = 0;
  let kept = 0;
  let done = 0;
  for (const f of list) {
    const orig = await fileBlob(f);
    before += orig.size;
    let out = null;
    if (!/gif|svg/.test(orig.type || f.mime)) out = await reencode(orig, maxSide, quality).catch(() => null);
    if (out && out.size < orig.size) {
      f.shrunk = out;
      after += out.size;
    } else {
      f.shrunk = null;
      kept++;
      after += orig.size;
    }
    if (f.url) {
      URL.revokeObjectURL(f.url);
      f.url = null;
    }
    done++;
    onProgress?.(done, list.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return { before, after, count: list.length, kept };
}

// ------------------------------------------------------------------ ZIP: запись (для «примера» на странице)

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Собрать ZIP: entries = [{ name, data: Uint8Array, deflate?: true }] → Blob.
 * Имена — UTF-8 (флаг 11). deflate — через CompressionStream, иначе stored.
 */
export async function zipWrite(entries) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const raw = e.data;
    let data = raw;
    let method = 0;
    if (e.deflate && typeof CompressionStream !== 'undefined') {
      data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
      method = 8;
    }
    const crc = crc32(raw);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, method, true);
    lh.setUint16(10, dosTime, true);
    lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, raw.length, true);
    lh.setUint16(26, nameBytes.length, true);
    parts.push(lh, nameBytes, data);
    central.push({ nameBytes, method, crc, csize: data.length, size: raw.length, offset });
    offset += 30 + nameBytes.length + data.length;
  }
  const cdStart = offset;
  for (const c of central) {
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, c.method, true);
    ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true);
    ch.setUint32(16, c.crc, true);
    ch.setUint32(20, c.csize, true);
    ch.setUint32(24, c.size, true);
    ch.setUint16(28, c.nameBytes.length, true);
    ch.setUint32(42, c.offset, true);
    parts.push(ch, c.nameBytes);
    offset += 46 + c.nameBytes.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length, true);
  end.setUint16(10, central.length, true);
  end.setUint32(12, offset - cdStart, true);
  end.setUint32(16, cdStart, true);
  parts.push(end);
  return new Blob(parts, { type: 'application/zip' });
}
