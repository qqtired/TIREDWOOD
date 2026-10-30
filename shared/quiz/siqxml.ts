// content.xml SIGame 4/5 без DOM и внешних сущностей. Архив и преобразование медиа — задача импортёра.
import { blankPack, PackError } from './pack.ts';
import { answersOf } from './text.ts';
import { QZ_PACK, type QzContent, type QzPack, type QzQType, type QzQuestion } from './types.ts';

interface Xml { name: string; attrs: Record<string, string>; parts: Array<Xml | string> }
const kids = (el: Xml | undefined, name: string): Xml[] => el?.parts.filter((p): p is Xml => typeof p !== 'string' && p.name === name) ?? [];
const kid = (el: Xml | undefined, name: string): Xml | undefined => kids(el, name)[0];
const txt = (el: Xml | undefined): string => el?.parts.map(p => typeof p === 'string' ? p : txt(p)).join('').trim() ?? '';
const bad = (): never => { throw new PackError('Не получилось прочитать вопросы: content.xml повреждён.'); };
function entities(s: string): string {
  return s.replace(/&([^;]*);|&/g, (whole, name: string | undefined) => {
    const predefined: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (name && Object.hasOwn(predefined, name)) return predefined[name];
    const n = name && /^#x[\da-f]+$/i.test(name) ? parseInt(name.slice(2), 16)
      : name && /^#\d+$/.test(name) ? Number(name.slice(1)) : NaN;
    if (!Number.isInteger(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return bad();
    return String.fromCodePoint(n);
  });
}

/** Небольшое дерево только для элементов, атрибутов, текста и CDATA; DTD/ENTITY запрещены. */
function xmlTree(xml: string): Xml {
  if (new TextEncoder().encode(xml).length > QZ_PACK.JSON_BYTES) throw new PackError('content.xml слишком большой.', 413);
  const root: Xml = { name: '', attrs: {}, parts: [] }, stack = [root];
  let p = 0;
  while (p < xml.length) {
    if (xml[p] !== '<') {
      const end = xml.indexOf('<', p), next = end < 0 ? xml.length : end;
      stack.at(-1)!.parts.push(entities(xml.slice(p, next))); p = next; continue;
    }
    if (xml.startsWith('<!--', p)) { const end = xml.indexOf('-->', p + 4); if (end < 0) bad(); p = end + 3; continue; }
    if (xml.startsWith('<![CDATA[', p)) {
      const end = xml.indexOf(']]>', p + 9); if (end < 0 || stack.length < 2) bad();
      stack.at(-1)!.parts.push(xml.slice(p + 9, end)); p = end + 3; continue;
    }
    if (xml.startsWith('<?', p)) { const end = xml.indexOf('?>', p + 2); if (end < 0) bad(); p = end + 2; continue; }
    if (xml.startsWith('<!', p)) bad();
    let end = p + 1, quote = '';
    for (; end < xml.length; end++) {
      const c = xml[end];
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (end === xml.length) bad();
    const body = xml.slice(p + 1, end); p = end + 1;
    if (body.startsWith('/')) {
      if (stack.length < 2 || body.slice(1).trim() !== stack.at(-1)!.attrs['$name']) bad();
      stack.pop(); continue;
    }
    const match = /^([A-Za-z_][\w.:-]*)/.exec(body); if (!match) bad();
    const name = match![1], self = /\/\s*$/.test(body);
    let rest = body.slice(name.length).replace(/\/\s*$/, '');
    const attrs: Record<string, string> = Object.create(null);
    attrs['$name'] = name;
    while (rest.trim()) {
      const attr = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
      if (!attr || Object.hasOwn(attrs, attr[1])) bad();
      attrs[attr![1]] = entities(attr![2] ?? attr![3]); rest = rest.slice(attr![0].length);
    }
    const el: Xml = { name: name.split(':').at(-1)!, attrs, parts: [] };
    stack.at(-1)!.parts.push(el);
    if (!self) { if (stack.length > 64) bad(); stack.push(el); }
  }
  if (stack.length !== 1 || root.parts.some(p => typeof p === 'string' && p.trim())) bad();
  const elements = root.parts.filter((p): p is Xml => typeof p !== 'string');
  if (elements.length !== 1) bad();
  return elements[0];
}
const TYPES: Record<string, QzQType> = {
  simple: 'simple', cat: 'cat', bagcat: 'cat', secret: 'cat', secretpublicprice: 'cat', secretnoquestion: 'cat',
  auction: 'auction', stake: 'auction', stakeall: 'auction', sponsored: 'noRisk', norisk: 'noRisk', forall: 'forAll',
};
const ATOMS: Record<string, string> = { text: 'text', say: 'say', oral: 'say', image: 'image', voice: 'audio', audio: 'audio',
  audionew: 'audio', video: 'video', html: 'html', marker: 'marker' };
export type SiqMediaResolver = (kind: 'image' | 'audio', ref: string) => { file: string; sec?: number } | undefined;

/** resolve связывает имя внутри ZIP с уже проверенным хешем и длительностью звука. Без него медиа пропускается. */
export function parseSiqXml(xml: string, resolve?: SiqMediaResolver): { pack: QzPack; warnings: string[]; version: number } {
  const root = xmlTree(xml.replace(/^\uFEFF/, ''));
  if (root.name !== 'package') throw new PackError('Это не пак SIGame: в content.xml нет пакета вопросов.');
  const version = parseInt(root.attrs.version ?? '4', 10);
  if (version !== 4 && version !== 5) throw new PackError('Поддерживаются паки SIGame версий 4 и 5.');
  const warnings: string[] = [], pack = blankPack('siq');
  pack.title = root.attrs.name?.trim() || 'Без названия';
  const authors = kid(kid(root, 'info'), 'authors');
  pack.author = kids(authors, 'author').map(txt).filter(Boolean).join(', ') || txt(authors);
  pack.adult = /(^|\D)18(\D|$)/.test(root.attrs.restriction ?? '') || /18\s*\+/.test(pack.title);
  pack.tags = kids(kid(root, 'tags'), 'tag').map(txt).filter(Boolean);
  const media = (kind: string, value: string, duration?: string): QzContent | null => {
    if (!value) return null;
    if (kind === 'video' || kind === 'html') { warnings.push(kind === 'video' ? 'Видео пропущено.' : 'Веб-страница пропущена.'); return null; }
    if (/^(?:https?:|data:|blob:|\/\/)/i.test(value)) { warnings.push('Картинки и звуки по ссылкам не показываем.'); return null; }
    if (kind !== 'image' && kind !== 'audio') return null;
    const name = value.replace(/^@/, '').replace(/\\/g, '/');
    const file = resolve?.(kind, name);
    if (!file) { warnings.push(`Не нашлось файла в паке: ${name}.`); return null; }
    if (kind === 'image') return { kind, file: file.file };
    const sec = file.sec ?? Number(duration ?? 0);
    if (!Number.isFinite(sec) || sec < 0 || sec > QZ_PACK.AUDIO_SEC) { warnings.push('Звук длиннее 60 с пропущен.'); return null; }
    return { kind, file: file.file, sec };
  };
  const item = (el: Xml, list: QzContent[]) => {
    const type = ATOMS[(el.attrs.type ?? 'text').toLowerCase()] ?? 'text', value = txt(el);
    if (!value) return;
    if (type === 'text' || type === 'say') list.push({ kind: 'text', value, ...(type === 'say' || el.attrs.placement === 'replic' ? { say: true } : {}) });
    else { const c = media(type, value, el.attrs.duration ?? el.attrs.time); if (c) list.push(c); }
  };
  let count = 0;
  for (const r of kids(kid(root, 'rounds'), 'round')) {
    const final = (r.attrs.type ?? '').toLowerCase() === 'final';
    const round = { name: r.attrs.name?.trim() || (final ? 'Финал' : `Раунд ${pack.rounds.length + 1}`), final, themes: [] as QzPack['rounds'][number]['themes'] };
    for (const t of kids(kid(r, 'themes'), 'theme')) {
      const theme = { name: t.attrs.name?.trim() || `Тема ${round.themes.length + 1}`, questions: [] as QzQuestion[] };
      for (const q of kids(kid(t, 'questions'), 'question')) {
        if (++count > QZ_PACK.QUESTIONS) throw new PackError('В паке — не больше 600 вопросов.');
        const type = kid(q, 'type'), rawType = (q.attrs.type || type?.attrs.name || '').toLowerCase();
        const question: QzQuestion = { price: final ? 0 : parseInt(q.attrs.price ?? '0', 10) || 0,
          type: TYPES[rawType] ?? (rawType ? 'other' : 'simple'), content: [], reveal: [],
          answers: kids(kid(q, 'right'), 'answer').flatMap(a => answersOf(txt(a))),
          wrong: kids(kid(q, 'wrong'), 'answer').flatMap(a => answersOf(txt(a))), comment: txt(kid(kid(q, 'info'), 'comments')) };
        let part = question.content;
        for (const a of kids(kid(q, 'scenario'), 'atom')) {
          if (a.attrs.type?.toLowerCase() === 'marker') part = question.reveal; else item(a, part);
        }
        for (const p of [...kids(type, 'param'), ...kids(kid(q, 'params'), 'param')]) {
          const name = (p.attrs.name ?? '').toLowerCase();
          if (name === 'theme' && question.type === 'cat') question.catTheme = txt(p);
          if (name !== 'question' && name !== 'answer') continue;
          const list = name === 'question' ? question.content : question.reveal, items = kids(p, 'item');
          if (!items.length && txt(p)) list.push({ kind: 'text', value: txt(p) });
          for (const it of items) item(it, list);
        }
        if (!question.answers.length) question.answers = question.reveal.filter((c): c is Extract<QzContent, { kind: 'text' }> => c.kind === 'text' && !c.say).slice(0, 1).map(c => c.value);
        if (!question.content.length) { warnings.push(`Пустой вопрос: ${theme.name}. Его пропустим.`); continue; }
        if (!question.answers.length) warnings.push(`Вопрос без ответа: ${theme.name}. Такой вопрос рассудит только живой ведущий.`);
        if (final && theme.questions.length) { warnings.push('В финале у темы один вопрос — этот не возьмём.'); continue; }
        theme.questions.push(question);
      }
      if (theme.questions.length) round.themes.push(theme);
    }
    if (round.themes.length) pack.rounds.push(round);
  }
  if (!pack.rounds.length) throw new PackError('В паке нет ни одного вопроса.');
  return { pack, warnings, version };
}
