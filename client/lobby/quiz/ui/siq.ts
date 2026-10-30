// «Ракушка», окно «Загрузить»: разбор пака SIGame (.siq) прямо в браузере (docs/quiz/tech.md §20, перенос lab/quiz/js/siq.js).
// ZIP читаем по центральному каталогу (сам архив в память не грузим), content.xml разбирает общий shared/quiz/siqxml.ts
// (версии 4 и 5, без DOM), проверку делает общий validatePack — здесь только то, что бывает в браузере: распаковка
// DecompressionStream('deflate-raw'), ужатие картинок до 1280 px в WebP, длина звука, SHA-256 каждого файла.
// Без blob:-адресов (CSP игры их не пускает): превью — через data: (dataUrl). Видео, веб-страницы и svg пропускаются.
// Всё, что нужно браузеру (картинки, звук), передаётся как MediaTools — так тесты идут в Node с заглушкой.
import { PackError, fileName, validatePack } from '../../../../shared/quiz/pack.ts';
import { parseSiqXml } from '../../../../shared/quiz/siqxml.ts';
import { QZ_PACK, type QzPack, type QzUpFile } from '../../../../shared/quiz/types.ts';

const ERR = {
  empty: 'Файл пустой.',
  notZip: 'Это не пак SIGame: файл не открывается как архив .siq.',
  zip64: 'Пак слишком большой: такие архивы мы не открываем.',
  encrypted: 'Пак закрыт паролем — открыть его не получится.',
  noContent: 'Это не пак SIGame: нет content.xml.',
  noInflate: 'Этот браузер не умеет распаковывать паки. Открой страницу в свежем Chrome, Firefox или Safari.',
  method: 'Пак сжат способом, который мы не умеем открывать.',
} as const;

// ------------------------------------------------------------------ ZIP по центральному каталогу

export interface ZipEntry {
  name: string;
  decoded: string;
  flags: number;
  method: number;
  csize: number;
  size: number;
  lho: number;
}
export interface Zip {
  entries: ZipEntry[];
  read(e: ZipEntry, type?: string): Promise<Blob>;
}

const dec8 = new TextDecoder('utf-8');
const dec8strict = new TextDecoder('utf-8', { fatal: true });

/** Старые архивы Windows хранят русские имена в кодовой странице 866 */
function cp866(bytes: Uint8Array): string {
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
function zipName(bytes: Uint8Array, utf8: boolean): string {
  if (utf8) return dec8.decode(bytes);
  try { return dec8strict.decode(bytes); } catch { return cp866(bytes); }
}
const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

/** Открыть ZIP: читает только хвост и каталог. read — содержимое записи (stored — кусок файла, deflate — через DecompressionStream) */
export async function openZip(blob: Blob): Promise<Zip> {
  if (!blob.size) throw new PackError(ERR.empty);
  if (blob.size < 22) throw new PackError(ERR.notZip);
  const tail = new Uint8Array(await blob.slice(Math.max(0, blob.size - (22 + 0xffff))).arrayBuffer());
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { at = i; break; }
  }
  if (at < 0) throw new PackError(ERR.notZip);
  const eocd = new DataView(tail.buffer, tail.byteOffset + at, tail.length - at);
  const total = eocd.getUint16(10, true), cdSize = eocd.getUint32(12, true), cdOff = eocd.getUint32(16, true);
  if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new PackError(ERR.zip64);
  if (cdOff + cdSize > blob.size) throw new PackError(ERR.notZip);
  const cdBuf = await blob.slice(cdOff, cdOff + cdSize).arrayBuffer();
  const cd = new DataView(cdBuf), cdBytes = new Uint8Array(cdBuf);
  const entries: ZipEntry[] = [];
  for (let p = 0; p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50;) {
    const flags = cd.getUint16(p + 8, true);
    const nlen = cd.getUint16(p + 28, true), elen = cd.getUint16(p + 30, true), clen = cd.getUint16(p + 32, true);
    const name = zipName(cdBytes.subarray(p + 46, p + 46 + nlen), !!(flags & 0x800)).replace(/\\/g, '/');
    if (!name.endsWith('/')) {
      entries.push({ name, decoded: safeDecode(name), flags, method: cd.getUint16(p + 10, true),
        csize: cd.getUint32(p + 20, true), size: cd.getUint32(p + 24, true), lho: cd.getUint32(p + 42, true) });
    }
    p += 46 + nlen + elen + clen;
  }
  if (!entries.length) throw new PackError(ERR.notZip);

  async function read(e: ZipEntry, type = ''): Promise<Blob> {
    if (e.flags & 1) throw new PackError(ERR.encrypted);
    const head = new DataView(await blob.slice(e.lho, e.lho + 30).arrayBuffer());
    if (head.getUint32(0, true) !== 0x04034b50) throw new PackError(ERR.notZip);
    const start = e.lho + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    const raw = blob.slice(start, start + e.csize, type);
    if (e.method === 0) return raw;
    if (e.method !== 8) throw new PackError(ERR.method);
    if (typeof DecompressionStream === 'undefined') throw new PackError(ERR.noInflate);
    const out = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    return type ? out.slice(0, out.size, type) : out;
  }
  return { entries, read };
}

// ------------------------------------------------------------------ файлы пака

type Kind = 'image' | 'audio';
const FOLDER: Record<Kind, string> = { image: 'images', audio: 'audio' };
const extOf = (n: string): string => n.slice(n.lastIndexOf('.') + 1).toLowerCase();
const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4',
};
/** Картинки, которые умеем ужать; svg пропускаем (вектор может нести скрипт) */
const IMAGE_IN = new Set(['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'bmp', 'avif']);
const AUDIO_IN = new Set(['mp3', 'ogg', 'oga', 'opus', 'm4a']);

export const fmtSize = (b: number): string => (b >= 0.95 * 1048576 ? `${(Math.round((b / 1048576) * 10) / 10).toString().replace('.', ',')} МБ` : b >= 1024 ? `${Math.round(b / 1024)} КБ` : `${Math.round(b)} Б`);

/** Что браузер делает с файлами: ужимает картинку и меряет звук. В тестах — заглушка */
export interface MediaTools {
  /** Картинка → вид для загрузки (WebP до 1280 px; gif как есть, если влезает); null — не получилось */
  image(blob: Blob, ext: string): Promise<{ blob: Blob; ext: QzUpFile['ext'] } | null>;
  /** Длина звука, с; null — не прочитался */
  audio(blob: Blob): Promise<number | null>;
}

const EXT_BY_TYPE: Record<string, QzUpFile['ext']> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };

/** Ужатие и измерение средствами браузера: createImageBitmap + холст, AudioContext.decodeAudioData */
export const browserMedia: MediaTools = {
  async image(blob, ext) {
    if (ext === 'gif') return blob.size <= QZ_PACK.IMAGE_BYTES ? { blob, ext: 'gif' } : null;
    let bmp: ImageBitmap;
    try { bmp = await createImageBitmap(blob); } catch { return null; }
    const k = Math.min(1, QZ_PACK.IMAGE_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const off = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : null;
    const dom = off ? null : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const g = (off ?? dom)!.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!g) { bmp.close(); return null; }
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    for (const quality of [0.86, 0.72, 0.58]) {
      const out: Blob | null = off
        ? await off.convertToBlob({ type: 'image/webp', quality })
        : await new Promise<Blob | null>((r) => dom!.toBlob(r, 'image/webp', quality));
      const e = out ? EXT_BY_TYPE[out.type] : undefined;
      if (out && e && out.size <= QZ_PACK.IMAGE_BYTES) return { blob: out, ext: e };
    }
    return null;
  },
  async audio(blob) {
    const Ctx: typeof AudioContext | undefined = typeof AudioContext === 'function' ? AudioContext
      : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    try { return (await ctx.decodeAudioData(await blob.arrayBuffer())).duration; } catch { return null; } finally { void ctx.close().catch(() => {}); }
  },
};

/** SHA-256 в hex (crypto.subtle доступен на https и localhost) */
export async function sha256(blob: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Картинка для превью без blob: — строкой data: (FileReader) */
export function dataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(r.error);
    r.readAsDataURL(blob);
  });
}

/** Подпись файла по первым байтам: то же, что проверит сервер (PUT) */
async function audioExt(blob: Blob): Promise<QzUpFile['ext'] | null> {
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ascii = (from: number, s: string): boolean => s.split('').every((c, i) => b[from + i] === c.charCodeAt(0));
  if (ascii(0, 'OggS')) return 'ogg';
  if (ascii(4, 'ftyp')) return 'm4a';
  if (ascii(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
}

// ------------------------------------------------------------------ разбор

export interface SiqResult {
  pack: QzPack;
  files: QzUpFile[];
  /** байты файлов для загрузки: <sha256>.<ext> → Blob */
  blobs: Map<string, Blob>;
  /** по-человечески, готовы к показу */
  warnings: string[];
  stats: { images: number; audio: number; bytes: number };
}
export interface SiqOptions {
  media?: MediaTools;
  onProgress?: (p: { done: number; total: number; text: string }) => void;
}

interface Found { kind: Kind; entry: ZipEntry; ref: string }
interface Done { file: string; sec?: number }

/** Одинаковые предупреждения — одной строкой: «Видео пропущено: 3.» */
export function collapseWarnings(list: readonly string[]): string[] {
  const n = new Map<string, number>();
  for (const w of list) n.set(w, (n.get(w) ?? 0) + 1);
  return [...n].map(([w, c]) => (c < 2 ? w : /^(?:Видео пропущено|Веб-страница пропущена)\.$/.test(w) ? `${w.slice(0, -1)}: ${c}.` : `${w} (${c} раз)`));
}

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…` : s);

/** Длинные тексты SIGame (комментарии, вопросы) обрезаем до пределов набережной: лучше «…», чем отказ сервера. Возвращает, сколько обрезано */
export function fitPack(pack: QzPack): number {
  let cut = 0;
  const f = (s: string, max: number): string => { const o = clip(s, max); if (o !== s) cut++; return o; };
  pack.title = f(pack.title, QZ_PACK.TITLE);
  pack.author = f(pack.author, QZ_PACK.TITLE);
  pack.tags = pack.tags.slice(0, 20).map((t) => f(t, QZ_PACK.TITLE));
  for (const r of pack.rounds) {
    r.name = f(r.name, QZ_PACK.TITLE);
    for (const t of r.themes) {
      t.name = f(t.name, QZ_PACK.THEME);
      for (const q of t.questions) {
        for (const list of [q.content, q.reveal]) for (const c of list) if (c.kind === 'text') c.value = f(c.value, QZ_PACK.TEXT);
        q.answers = q.answers.slice(0, QZ_PACK.ANSWERS).map((a) => f(a, QZ_PACK.ANSWER));
        q.wrong = q.wrong.slice(0, QZ_PACK.ANSWERS).map((a) => f(a, QZ_PACK.ANSWER));
        q.comment = f(q.comment, QZ_PACK.COMMENT);
        if (q.catTheme) q.catTheme = f(q.catTheme, QZ_PACK.THEME);
      }
    }
  }
  return cut;
}

/**
 * Прочитать .siq: пак в нашем виде + файлы к загрузке + предупреждения. Ошибка — PackError с текстом для игрока.
 * Порядок: content.xml → какие файлы нужны (первый проход) → ужать и посчитать хеши → второй проход с настоящими именами → проверка.
 */
export async function parseSiq(blob: Blob, o: SiqOptions = {}): Promise<SiqResult> {
  const media = o.media ?? browserMedia;
  const zip = await openZip(blob);
  const contentEntry = zip.entries.find((e) => /(^|\/)content\.xml$/i.test(e.decoded)) ?? zip.entries.find((e) => /(^|\/)content\.xml$/i.test(e.name));
  if (!contentEntry) throw new PackError(ERR.noContent);
  const base = contentEntry.decoded.toLowerCase().slice(0, contentEntry.decoded.length - 'content.xml'.length);
  const xml = await (await zip.read(contentEntry)).text();

  // индекс файлов по полному и короткому имени, в сыром и раскодированном виде (%D0%9A… ↔ К)
  const rel = (n: string): string => (n.toLowerCase().startsWith(base) ? n.slice(base.length) : n);
  const byFull = new Map<string, ZipEntry>(), byBase = new Map<string, ZipEntry[]>();
  for (const e of zip.entries) {
    byFull.set(rel(e.name).toLowerCase(), e);
    byFull.set(rel(e.decoded).toLowerCase(), e);
    const b = rel(e.decoded).toLowerCase().split('/').pop()!;
    byBase.set(b, [...(byBase.get(b) ?? []), e]);
  }
  const find = (kind: Kind, ref: string): ZipEntry | null => {
    const r0 = ref.replace(/^@/, '').trim().replace(/\\/g, '/');
    const cands = [...new Set([r0, safeDecode(r0), encodeURIComponent(r0)])].map((s) => s.toLowerCase());
    for (const c of cands) { const hit = byFull.get(`${FOLDER[kind]}/${c}`) ?? byFull.get(c); if (hit) return hit; }
    for (const c of cands) {
      const list = byBase.get(c.split('/').pop()!);
      if (list?.length) return list.find((e) => rel(e.decoded).toLowerCase().split('/')[0] === FOLDER[kind]) ?? list[0];
    }
    return null;
  };

  // проход 1: какие файлы нужны (имя-заглушка; звук — длина 0)
  const wanted = new Map<ZipEntry, Found>();
  parseSiqXml(xml, (kind, ref) => {
    const entry = find(kind, ref);
    if (!entry) return undefined;
    wanted.set(entry, { kind, entry, ref });
    return { file: `x${wanted.size}`, sec: 0 };
  });

  // ужатие, длина звука, хеши — по одному (память)
  const skips: string[] = [];
  const made = new Map<ZipEntry, Done>();
  const files = new Map<string, QzUpFile>(), blobs = new Map<string, Blob>();
  let bytes = 0, step = 0;
  const total = wanted.size;
  for (const { kind, entry } of wanted.values()) {
    o.onProgress?.({ done: step++, total, text: entry.decoded.split('/').pop() ?? '' });
    const short = entry.decoded.split('/').pop() ?? entry.decoded;
    const ext = extOf(entry.decoded);
    const mime = MIME[ext] ?? '';
    if (kind === 'image') {
      if (!IMAGE_IN.has(ext)) { skips.push(ext === 'svg' ? 'Рисунки svg пропущены.' : `Картинка в неизвестном формате пропущена: ${short}.`); continue; }
      const raw = await zip.read(entry, mime);
      const out = await media.image(raw, ext);
      if (!out) { skips.push(`Картинку не удалось ужать, пропущена: ${short}.`); continue; }
      if (bytes + out.blob.size > QZ_PACK.BYTES) { skips.push('Файлы пака больше 30 МБ: остальные пропущены.'); break; }
      const hash = await sha256(out.blob);
      const f: QzUpFile = { sha256: hash, ext: out.ext, kind: 'image', size: out.blob.size };
      if (!files.has(fileName(f))) { files.set(fileName(f), f); blobs.set(fileName(f), out.blob); bytes += f.size; }
      made.set(entry, { file: fileName(f) });
    } else {
      if (!AUDIO_IN.has(ext)) { skips.push(`Звук в формате ${ext} пропущен: ${short} (берём mp3, ogg и m4a).`); continue; }
      if (entry.size > QZ_PACK.AUDIO_BYTES) { skips.push(`Звук больше 1,5 МБ пропущен: ${short}.`); continue; }
      const raw = await zip.read(entry, mime);
      const aext = await audioExt(raw);
      if (!aext) { skips.push(`Звук не открылся, пропущен: ${short}.`); continue; }
      const sec = await media.audio(raw);
      if (sec === null) { skips.push(`Звук не открылся, пропущен: ${short}.`); continue; }
      if (sec > QZ_PACK.AUDIO_SEC) { skips.push('Звук длиннее 60 с пропущен.'); continue; }
      if (bytes + raw.size > QZ_PACK.BYTES) { skips.push('Файлы пака больше 30 МБ: остальные пропущены.'); break; }
      const hash = await sha256(raw);
      const f: QzUpFile = { sha256: hash, ext: aext, kind: 'audio', size: raw.size, sec: Math.round(sec * 10) / 10 };
      if (!files.has(fileName(f))) { files.set(fileName(f), f); blobs.set(fileName(f), raw); bytes += f.size; }
      made.set(entry, { file: fileName(f), sec: f.sec });
    }
  }
  o.onProgress?.({ done: total, total, text: '' });

  // проход 2: те же вопросы с настоящими именами; пропущенное парсер отметит «Не нашлось файла» — заменяем своим предупреждением
  const missed = new Set<string>();
  const { pack, warnings } = parseSiqXml(xml, (kind, ref) => {
    const entry = find(kind, ref);
    if (!entry) return undefined;
    const d = made.get(entry);
    if (!d) missed.add(ref.replace(/^@/, '').replace(/\\/g, '/'));
    return d;
  });
  const own = warnings.filter((w) => !/^Не нашлось файла в паке: /.test(w) || ![...missed].some((m) => w === `Не нашлось файла в паке: ${m}.`));
  const cut = fitPack(pack);
  if (cut) own.push(`Длинные тексты обрезаны: ${cut}.`);
  // уходят только файлы, что остались в вопросах
  const used = new Set<string>();
  for (const r of pack.rounds) for (const t of r.themes) for (const q of t.questions) for (const c of [...q.content, ...q.reveal]) if (c.kind !== 'text') used.add(c.file);
  const list = [...files.values()].filter((f) => used.has(fileName(f)));
  const v = validatePack(pack, list);
  for (const k of [...blobs.keys()]) if (!used.has(k)) blobs.delete(k);
  return {
    pack: v.pack, files: v.files, blobs,
    warnings: collapseWarnings([...own, ...skips, ...v.warnings]),
    stats: { images: v.files.filter((f) => f.kind === 'image').length, audio: v.files.filter((f) => f.kind === 'audio').length, bytes: v.files.reduce((n, f) => n + f.size, 0) },
  };
}
