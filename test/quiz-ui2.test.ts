// «Ракушка», часть 2б: HUD «Своей игры», «Крокодила», «Кто из нас?» (hud-jp-model.ts, hud-modes-model.ts), окно «Ракушка»
// (win-model.ts), разбор .siq (siq.ts) и загрузка пака (upload.ts). Всё без DOM: модели — чистые функции, siq и upload получают
// заглушки (картинки, звук, сеть). Главная логика и главный сценарий; крайних случаев нет.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import zlib from 'node:zlib';
import { buzzModel, answerModel, betModel, betQuick, dropModel, hostPanel, jpPlate, packButtons, giveButtons } from '../client/lobby/quiz/ui/hud-jp-model.ts';
import {
  askModel, crocPlate, digitsBusy, keyHit, lineMsg, modeLines, modePlate, plainDock, queueModel, toolOut, toolsHtml, toolsVisible, whoHint, whoPlate, whoPreview, wordsHtml,
  wordsModel,
} from '../client/lobby/quiz/ui/hud-modes-model.ts';
import { DOCK_ROWS, likeButton, plateSpec, rolesBar } from '../client/lobby/quiz/ui/hud-model.ts';
import { setQuizImageUrls } from '../client/lobby/quiz/ui/paint.ts';
import { fitPack, openZip, parseSiq, collapseWarnings, type MediaTools } from '../client/lobby/quiz/ui/siq.ts';
import { TicketDesk, UploadError, uploadPack, waitSeconds, type UploadDeps, type UploadProgress } from '../client/lobby/quiz/ui/upload.ts';
import {
  checkDraft, defaultSetup, draftFromText, modeCards, myRecs, packRow, packSummary, pickTab, playableRounds, saveReason, setupReason, startMsg, tabsFor, toggleTheme, topLists,
} from '../client/lobby/quiz/ui/win-model.ts';
import { blankPack, fileName } from '../shared/quiz/pack.ts';
import {
  QZ_CROC, QZ_JP, QZ_PACK, type QzJpBoard, type QzMe, type QzPackInfo, type QzPackOutline, type QzView,
} from '../shared/quiz/types.ts';

const NOW = 5_000_000;
const who = (slot: number, nick: string) => ({ slot, nick });
const me = (o: Partial<QzMe> = {}): QzMe => ({ slot: 7, place: -1, role: '', vote: -1, swap: false, canSwap: true, canPlay: false, canTake: false, gapUntil: 0, ...o });
const view = (o: Partial<QzView> = {}): QzView => ({
  rev: 1, now: NOW, phase: 'game', endsAt: 0, mode: 'jeopardy', count: 4, seated: 4, vote: null, riddle: null, results: null, evening: [], noTokens: false, zat: null,
  people: [], call: null, swap: { n: 0, need: 3 }, ...o,
}) as QzView;
const Q = { theme: 'Рыбалка', price: 300, type: 'simple' as const, th: 0, cell: 2, content: [{ kind: 'text' as const, value: 'Самая крупная рыба на пирсе' }] };
const jp = (o: Partial<QzJpBoard> = {}): QzJpBoard & { lines: never[]; asks: never[] } => ({
  step: 'pick', pack: { id: 'b-nab', title: 'Набережная' }, round: 'Раунд 1', final: true, host: null,
  players: [{ ...who(7, 'Я'), pult: 0, score: 300, away: 0 }, { ...who(901, 'Барон'), pult: 1, score: 500, away: 0 }, { ...who(902, 'Соня'), pult: 2, score: -100, away: NOW + 5000 }],
  turn: 7, themes: [], packs: null, q: Q, openAt: 0, buzz: null, out: [], said: '', verdict: '', answer: null, dispute: null, fin: null, endsAt: NOW + 10_000, total: 15_000,
  lines: [], asks: [], ...o,
});
const jv = (o: Partial<QzJpBoard> = {}, v: Partial<QzView> = {}): QzView => view({ mode: 'jeopardy', jp: jp(o), ...v });
const jme = (o: Partial<NonNullable<QzMe['jp']>> = {}, m: Partial<QzMe> = {}): QzMe => me({ role: 'player', jp: { pult: 0, canBuzz: false, lockUntil: 0, cat: false, ...o }, ...m });
const hostMe = (o: Partial<NonNullable<QzMe['jp']>> = {}): QzMe =>
  me({ role: 'host', jp: { pult: -1, canBuzz: false, lockUntil: 0, cat: false, host: { answers: ['Сом', 'Сомик'], wrong: ['Карп'], comment: 'Рекордный сом', say: ['Назовите рыбу'] }, ...o } });
const hostV = (o: Partial<QzJpBoard> = {}) => jv({ host: who(7, 'Я'), players: jp().players.slice(1), turn: 901, ...o });

describe('«Своя игра»: плашка сверху', () => {
  it('ведущий в setup: «Пак и темы» и «Пусть ведёт Затейник»; остальным — «выбирает пак»', () => {
    const h = jpPlate(hostV({ step: 'setup', q: null }), hostMe())!;
    assert.match(h.html, /Ты ведёшь «Свою игру»/);
    assert.match(h.html, /data-qz="winopen"/);
    assert.match(h.html, /data-qz="jpZat"/);
    const o = jpPlate(jv({ step: 'setup', q: null, host: who(9, 'Вася') }), jme())!;
    assert.match(o.html, /<b>Вася<\/b> выбирает пак/);
    assert.doesNotMatch(o.html, /jpZat/);
  });

  it('выбор пака залом: три карточки с цифрами, мой голос подсвечен, плашка важнее обычной', () => {
    const packs = [0, 1, 2].map((i) => ({ id: `p${i}`, title: `Пак ${i}`, sub: 'смесь', n: i }));
    const p = jpPlate(jv({ step: 'packvote', q: null, packs }), jme(), 1)!;
    assert.equal(p.prio, 90);
    assert.equal((p.html.match(/data-qz="pv"/g) ?? []).length, 3);
    assert.match(p.html, /qz-vopt is-mine" data-qz="pv" data-i="1"/);
    assert.match(packButtons(jp({ packs }), -1), /<i>2<\/i>/);
    // карточки — второй строкой плашки (k-event-actions), а не справа от заголовка: длинные названия не выталкивают их за плашку
    assert.match(p.html, /<span class="k-event-actions"><button[^>]*qz-vopt/);
    assert.doesNotMatch(p.html, /qz-side/);
    const long = packButtons(jp({ packs: [{ id: 'p', title: 'Очень длинное название пака, которое не лезет в плашку', sub: 'Автор', n: 0 }] }), -1);
    assert.match(long, /<span>Очень длинное название пака, которое не лезет в плашку<\/span>/, 'название целиком — обрезает CSS, а не текст');
    // 1.1: в подсказке — кто заказал «Сыграть» или что пак новый (как плашка на карточке табло)
    assert.match(packButtons(jp({ packs: [{ id: 'p', title: 'Мой', sub: '', n: 0, by: 'Tired', fresh: true }] }), -1), /title="Мой · заказал Tired"/);
    assert.match(packButtons(jp({ packs: [{ id: 'p', title: 'Мой', sub: '', n: 0, fresh: true }] }), -1), /title="Мой · новый"/);
  });

  it('«Кот в мешке»: кнопки только у отдающего и только на тех, кто за пультом', () => {
    const v = jv({ step: 'cat' });
    const give = jpPlate(v, jme({ cat: true }))!;
    assert.match(give.html, /data-qz="give" data-slot="901"/);
    assert.doesNotMatch(give.html, /data-slot="902"/, 'отошедший не получает');
    assert.doesNotMatch(give.html, /data-slot="7"/, 'себе нельзя');
    assert.doesNotMatch(jpPlate(v, jme())!.html, /data-qz="give"/);
    assert.equal(giveButtons(jp(), me()).includes('Барон'), true);
  });

  it('«Неверно»: «Оспорить» только тому, кому доступно; «засчитать?» — тем, чей голос нужен', () => {
    const w = jv({ step: 'wrong', buzz: who(7, 'Я'), said: 'Щука', verdict: 'no' });
    assert.match(jpPlate(w, jme({ canDispute: true }))!.html, /data-qz="dispute"/);
    assert.doesNotMatch(jpPlate(w, jme())!.html, /data-qz="dispute"/);
    const d = jv({ step: 'dispute', buzz: who(901, 'Барон'), said: 'Сомик', dispute: { by: who(901, 'Барон'), yes: 1, no: 0 } });
    const judge = jpPlate(d, jme({ canJudgeDispute: true }))!;
    assert.match(judge.html, /data-qz="dv" data-ok="1"/);
    assert.match(judge.html, /data-qz="dv" data-ok="0"/);
    assert.match(judge.html, /за 1 · против 0/);
    assert.doesNotMatch(jpPlate(d, jme())!.html, /data-qz="dv"/);
  });

  it('каждый шаг даёт плашку', () => {
    for (const step of ['setup', 'packvote', 'pick', 'cat', 'read', 'buzz', 'answer', 'judge', 'wrong', 'dispute', 'reveal', 'fremove', 'fbet', 'fanswer', 'fjudge', 'freveal'] as const) {
      const v = jv({ step, fin: { themes: ['Море', 'Еда'], remover: 7, bet: [], answered: [], shown: [] }, packs: [] });
      assert.ok(jpPlate(v, jme()), `шаг ${step}`);
    }
  });
});

describe('«Своя игра»: «Жму!», ответ, ставка, выбор темы', () => {
  it('кнопка: закрыта → открыта → «Рано!» → уже отвечал; полоска считает время', () => {
    const read = jv({ step: 'read', openAt: NOW + 4000, total: 5000 });
    const closed = buzzModel(read, jme(), NOW)!;
    assert.equal(closed.state, 'closed');
    assert.ok(closed.p > 0.15 && closed.p < 0.25, `p=${closed.p}`);
    const open = buzzModel(jv({ step: 'buzz', endsAt: NOW + 3500, total: 7000 }), jme({ canBuzz: true }), NOW)!;
    assert.equal(open.state, 'open');
    assert.equal(open.p, 0.5);
    assert.equal(buzzModel(read, jme({ lockUntil: NOW + 900 }), NOW)!.state, 'blocked');
    assert.equal(buzzModel(jv({ step: 'buzz', out: [7] }), jme({ canBuzz: true }), NOW)!.state, 'out');
    assert.equal(buzzModel(jv({ step: 'buzz' }), jme({ canBuzz: false }), NOW)!.state, 'wait');
    assert.equal(buzzModel(jv({ step: 'buzz' }), hostMe(), NOW), null, 'ведущему кнопка не нужна');
    assert.equal(buzzModel(jv({ step: 'pick' }), jme(), NOW), null);
  });

  it('ответ: поле у отвечающего и у финалиста; отправленный текст скрывает поле', () => {
    const v = jv({ step: 'answer', buzz: who(7, 'Я') });
    const a = answerModel(v, jme(), NOW)!;
    assert.equal(a.kind, 'jp');
    assert.equal(a.sent, false);
    assert.equal(answerModel(jv({ step: 'answer', buzz: who(7, 'Я'), said: 'Сомик' }), jme(), NOW)!.sent, true);
    assert.equal(answerModel(jv({ step: 'answer', buzz: who(901, 'Барон') }), jme(), NOW), null, 'отвечает не я');
    const f = answerModel(jv({ step: 'fanswer' }), jme({ bet: 100 }), NOW)!;
    assert.equal(f.kind, 'final');
    assert.equal(answerModel(jv({ step: 'fanswer' }), jme({ bet: 100, fanswered: true }), NOW)!.sent, true);
  });

  it('ставка: от 1 до своего счёта; быстрые — минимум, половина, всё', () => {
    const b = betModel(jv({ step: 'fbet' }), jme({ bet: 0 }))!;
    assert.deepEqual([b.min, b.max], [1, 300]);
    assert.deepEqual([betQuick(b, 'min'), betQuick(b, 'half'), betQuick(b, 'all')], [1, 150, 300]);
    const minus = jv({ step: 'fbet', players: [{ ...who(7, 'Я'), pult: 0, score: -100, away: 0 }] });
    assert.equal(betModel(minus, jme({ bet: 0 }))!.max, 1, 'в минусе ставка всё равно от 1');
    assert.equal(betModel(jv({ step: 'fbet' }), jme()), null, 'не финалист — ставки нет');
  });

  it('убрать тему: кнопка на каждую оставшуюся — только тому, чья очередь', () => {
    const fin = { themes: ['Рыбалка', 'Море', 'Еда'], remover: 7, bet: [], answered: [], shown: [] };
    assert.deepEqual(dropModel(jv({ step: 'fremove', fin }), jme())!.themes, ['Рыбалка', 'Море', 'Еда']);
    assert.equal(dropModel(jv({ step: 'fremove', fin: { ...fin, remover: 901 } }), jme()), null);
  });
});

describe('«Своя игра»: панель ведущего', () => {
  const st = { moreUsed: 0, endArmed: false };

  it('нет панели: ведёт Затейник, я играю, шаг setup и packvote', () => {
    assert.equal(hostPanel(jv({ step: 'read' }), jme(), st), null);
    assert.equal(hostPanel(hostV({ step: 'setup', q: null }), hostMe(), st), null);
    assert.equal(hostPanel(hostV({ step: 'packvote', q: null }), hostMe(), st), null);
  });

  it('читаю вопрос: верный ответ, неверные, комментарий и «Открыть кнопки» на Пробел', () => {
    const p = hostPanel(hostV({ step: 'read' }), hostMe(), st)!;
    assert.match(p.html, /Самая крупная рыба/);
    assert.match(p.html, /<b>Сом<\/b>/);
    assert.match(p.html, /принимается: Сомик/);
    assert.match(p.html, /не принимается: Карп/);
    assert.match(p.html, /читай вслух:<\/span> Назовите рыбу/);
    assert.match(p.html, /data-qz="jpOpen"[^>]*>Открыть кнопки/);
  });

  it('отвечают: ✓ / ✗ с цифрами, «+5 с» гаснет после двух раз, текст игрока виден', () => {
    const v = hostV({ step: 'answer', buzz: who(901, 'Барон'), said: 'Сомик' });
    const p = hostPanel(v, hostMe(), st)!;
    assert.match(p.html, /data-qz="jpJudge" data-ok="1"/);
    assert.match(p.html, /data-qz="jpJudge" data-ok="0"/);
    assert.match(p.html, /Игрок: <b>«Сомик»<\/b>/);
    assert.doesNotMatch(p.html, /data-qz="jpMore" disabled/);
    assert.match(hostPanel(v, hostMe(), { moreUsed: QZ_JP.MORE_MAX, endArmed: false })!.html, /data-qz="jpMore" disabled/);
    assert.notEqual(hostPanel(v, hostMe(), { moreUsed: 1, endArmed: false })!.sig, p.sig, 'счётчик меняет разметку');
  });

  it('никто не жмёт: «Показать ответ» на R; «Завершить раунд» просит второго нажатия', () => {
    const v = hostV({ step: 'buzz', total: QZ_JP.SHOW_AUTO_MS });
    assert.match(hostPanel(v, hostMe(), st)!.html, /data-qz="jpShow"/);
    assert.match(hostPanel(hostV({ step: 'buzz', total: 7000 }), hostMe(), st)!.html, /кнопки открыты/);
    assert.match(hostPanel(v, hostMe(), st)!.html, /Завершить раунд/);
    assert.match(hostPanel(v, hostMe(), { moreUsed: 0, endArmed: true })!.html, /Точно завершить\?/);
  });

  it('финал: ответы игроков с ✓ и ✗; просьба сесть за пульт', () => {
    const fa = [{ ...who(901, 'Барон'), text: 'Кит', ok: '' as const }, { ...who(902, 'Соня'), text: '', ok: 'yes' as const }];
    const p = hostPanel(hostV({ step: 'fjudge', round: '', fin: { themes: ['Море'], remover: 0, bet: [], answered: [], shown: [] } }), hostMe({ fanswers: fa }), st)!;
    assert.match(p.html, /data-qz="fjudge" data-slot="901" data-ok="1"/);
    assert.match(p.html, /— нет ответа —/);
    assert.match(p.html, /is-on" data-qz="fjudge" data-slot="902" data-ok="1"/);
    const v = hostV({ step: 'read' });
    (v.jp as unknown as { asks: unknown[] }).asks = [who(903, 'Кузя')];
    assert.match(hostPanel(v, hostMe(), st)!.html, /data-qz="seat" data-slot="903" data-ok="1"/);
  });
});

describe('«Крокодил»: плашка, слово, очередь, инструменты', () => {
  const cv = (o: Partial<NonNullable<QzView['croc']>> = {}, v: Partial<QzView> = {}): QzView => view({
    mode: 'croc', croc: { step: 'draw', num: 2, of: 4, drawer: who(901, 'Барон'), queue: [], mask: 'М _ _ К', level: 1, guessed: [], drawing: 1, endsAt: NOW + 40_000, total: 80_000, last: null, lines: [], ...o }, ...v,
  });
  const cm = (o: Partial<NonNullable<QzMe['croc']>> = {}, m: Partial<QzMe> = {}): QzMe => me({ croc: { queued: false, drew: false, got: false, ...o }, ...m });

  it('плашка: рисую — слово и кольцо; угадываю — маска; угадал — зелёная', () => {
    const mine = crocPlate(cv({ drawer: who(7, 'Я') }), cm({ word: 'маяк' }, { role: 'drawer' }), NOW)!;
    assert.match(mine.html, /Ты рисуешь: <b class="k-gold">маяк<\/b>/);
    assert.match(mine.html, /qz-ring/);
    const guess = crocPlate(cv(), cm(), NOW)!;
    assert.match(guess.html, /Рисует <b>Барон<\/b>/);
    assert.match(guess.html, /qz-mask">М _ _ К/);
    const got = crocPlate(cv(), cm({ got: true }), NOW)!;
    assert.equal(got.tone, 'good');
    assert.match(got.html, /Ты угадал!/);
  });

  it('выбор слова: три карточки с цифрами и сложностью, только рисующему', () => {
    const v = cv({ step: 'words', drawer: who(7, 'Я') });
    const m = wordsModel(v, cm({ choices: ['маяк', 'причал', 'катамаран'] }), NOW)!;
    const html = wordsHtml(m, 1);
    assert.equal((html.match(/data-qz="crWord"/g) ?? []).length, 3);
    assert.match(html, /qo-word is-on" data-qz="crWord" data-i="1"/);
    assert.match(html, /сложное · ×2/);
    assert.equal(wordsModel(cv({ step: 'words' }), cm({ choices: ['а', 'б', 'в'] }), NOW), null);
  });

  it('«Хочу рисовать»: в очереди — «Передумал»; кто рисовал, и рисующий — кнопки нет; очередь полна — нет', () => {
    assert.match(queueModel(cv(), cm())!.html, /data-take="1"/);
    const q = queueModel(cv({ queue: [who(8, 'Оля'), who(7, 'Я')] }), cm({ queued: true }))!;
    assert.equal(q.place, 2);
    assert.match(q.html, /data-take="0"/);
    assert.equal(queueModel(cv(), cm({ drew: true })), null);
    assert.equal(queueModel(cv({ drawer: who(7, 'Я') }), cm()), null);
    assert.equal(queueModel(cv({ of: QZ_CROC.TURNS_MAX }), cm()), null);
  });

  it('инструменты: цвет, толщина, ластик, ведёрко → то, что читает мольберт', () => {
    assert.deepEqual(toolOut({ color: 3, width: 2, erase: false }), { color: 3, width: 2, size: 2, erase: false, fill: false });
    assert.deepEqual(toolOut({ color: 3, width: 2, erase: false, fill: true }), { color: 3, width: 2, size: 2, erase: false, fill: true });
    assert.equal(toolOut({ color: 3, width: 1, erase: true }).color, QZ_CROC.ERASER);
    const html = toolsHtml({ color: 2, width: 0, erase: false });
    assert.equal((html.match(/data-qz="crColor"/g) ?? []).length, QZ_CROC.COLORS.length);
    assert.equal((html.match(/data-qz="crWidth"/g) ?? []).length, QZ_CROC.WIDTHS.length);
    assert.match(html, /qz-color is-on" style="--c:[^"]+" data-qz="crColor" data-i="2"/);
    for (const k of ['crErase', 'crFill', 'crUndo', 'crClear']) assert.match(html, new RegExp(`data-qz="${k}"`));
    assert.match(toolsHtml({ color: 2, width: 0, erase: false, fill: true }), /qz-tool is-on" data-qz="crFill"/);
    assert.equal(toolsVisible(cv({ drawer: who(7, 'Я') }), cm()), true);
    assert.equal(toolsVisible(cv(), cm()), false);
  });
});

describe('«Кто из нас?»: плашка, свои вопросы, подсказка', () => {
  const wv = (o: Partial<NonNullable<QzView['who']>> = {}): QzView => view({
    mode: 'whoofus', who: { step: 'vote', num: 3, of: 10, players: [who(7, 'Я'), who(901, 'Барон')], q: 'Кто из нас первым уснёт?', title: 'Соня', by: null, asked: 3, voted: 1,
      skip: { n: 1, need: 2 }, tally: null, leaders: [], endsAt: NOW + 9000, total: 15_000, lines: [], ...o },
  });
  const wm = (o: Partial<NonNullable<QzMe['who']>> = {}): QzMe => me({ who: { in: true, vote: 0, skip: false, own: 1, pts: 0, ...o } });

  it('голосование: вопрос, кольцо и «Пропустить вопрос» со счётом; мой голос — в подписи', () => {
    const p = whoPlate(wv(), wm(), NOW)!;
    assert.match(p.html, /Кто из нас первым уснёт\?/);
    assert.match(p.html, /data-qz="whoSkip"[^>]*>Пропустить вопрос <b>1\/2<\/b>/);
    assert.match(whoPlate(wv(), wm({ vote: 901 }), NOW)!.html, /твой голос: <b>Барон<\/b>/);
    assert.doesNotMatch(whoPlate(wv(), me({ who: { in: false, vote: 0, skip: false, own: 0, pts: 0 } }), NOW)!.html, /whoSkip/);
  });

  it('свои вопросы: сколько осталось добавить; живой вид ставит «Кто из нас…», «?» и титул по «=»', () => {
    const a = askModel(wv({ step: 'ask' }), wm({ own: 1 }))!;
    assert.deepEqual([a.own, a.left], [1, 1]);
    assert.equal(askModel(wv({ step: 'ask' }), wm({ own: 2 }))!.left, 0);
    assert.equal(askModel(wv(), wm()), null, 'в голосовании поле не нужно');
    assert.deepEqual(whoPreview('первым уснёт на рыбалке = Соня набережной'), { q: 'Кто из нас первым уснёт на рыбалке?', title: 'Соня набережной' });
    assert.equal(whoPreview('   '), null);
    assert.equal(whoPreview('x'.repeat(200)), null, 'длинное не обрезаем молча');
  });

  it('«кликни по желейке» — только в голосовании и только участнику', () => {
    assert.equal(whoHint(wv(), wm()), true);
    assert.equal(whoHint(wv({ step: 'reveal' }), wm()), false);
    assert.equal(whoHint(wv(), me()), false);
  });
});

describe('HUD частей 2: общая плашка, цифры, док, клавиши', () => {
  it('плашка режима: свои три режима в игре; вызов роли и «Загадка» — прежним путём', () => {
    assert.match(modePlate(jv({ step: 'pick' }), jme(), NOW, { pvMine: -1 })!.html, /Твой ход/);
    assert.equal(modePlate(jv({ step: 'pick' }), jme(), NOW, { pvMine: -1 }) !== null, true);
    assert.equal(modePlate(view({ mode: 'riddle' }), me(), NOW, { pvMine: -1 }), null);
    assert.equal(modePlate(jv({ step: 'pick' }, { call: { role: 'host', by: 'open', to: null, endsAt: NOW + 5000 } }), jme(), NOW, { pvMine: -1 }), null);
    assert.match(modePlate(view({ phase: 'roles', mode: 'whoofus' }), me(), NOW, { pvMine: -1 })!.html, /Играют все, кто сидит/);
  });

  it('цифры заняты: голос за пак, ✓ / ✗ ведущего, слово, тема в финале', () => {
    assert.equal(digitsBusy(jv({ step: 'packvote' }), jme()), true);
    assert.equal(digitsBusy(hostV({ step: 'answer' }), hostMe()), true);
    assert.equal(digitsBusy(jv({ step: 'pick' }), jme()), false);
    assert.equal(digitsBusy(view({ mode: 'croc', croc: { step: 'words', drawer: who(7, 'Я') } as never }), me()), true);
  });

  it('док чужих режимов: «✓ Петя угадал!» без ника, свежие внизу, не больше шести, старые гаснут', () => {
    const line = (id: number, kind: 'guess' | 'got' | 'zat', at: number, text = 'лодка', slot = 902) => ({ id, slot, nick: kind === 'got' ? '' : 'Соня', text, at, kind, mark: '' as const, markedAt: 0 });
    const m = plainDock([line(1, 'guess', NOW - 1000), line(2, 'got', NOW - 500, '✓ Петя угадал!'), line(3, 'zat', NOW - 100, 'Молодцы!')], me(), NOW);
    assert.deepEqual(m.rows.map((r) => [r.id, r.sys, !!r.got]), [[1, false, false], [2, true, true], [3, true, false]]);
    assert.equal(m.rows[1].text, 'Петя угадал!');
    assert.equal(plainDock(Array.from({ length: 10 }, (_, i) => line(i, 'guess', NOW - 10 + i)), me(), NOW).rows.length, DOCK_ROWS);
    assert.equal(plainDock([line(1, 'guess', NOW - 30_200)], me(), NOW).rows[0].fade, true, 'через 30 с строка гаснет');
    assert.equal(plainDock([line(1, 'guess', NOW - 40_000)], me(), NOW).rows.length, 0, 'и исчезает');
    assert.deepEqual(modeLines(view({ mode: 'riddle' })), []);
  });

  it('клавиши: пак 1–3, Пробел, ✓ / ✗, R, тема, слово, Z, F — и только когда есть что делать', () => {
    assert.deepEqual(keyHit(jv({ step: 'packvote' }), jme(), 'Digit2'), { msg: { t: 'qz', a: 'jpPv', i: 1 }, mine: 1 });
    assert.equal(keyHit(jv({ step: 'packvote' }), jme(), 'Digit4'), null);
    assert.deepEqual(keyHit(jv({ step: 'buzz' }), jme(), 'Space'), { msg: { t: 'qz', a: 'jpBuzz' } });
    assert.deepEqual(keyHit(hostV({ step: 'read' }), hostMe(), 'Space'), { msg: { t: 'qz', a: 'jpOpen' } });
    assert.equal(keyHit(jv({ step: 'pick' }), jme(), 'Space'), null, 'Пробел вне вопроса — игре');
    assert.deepEqual(keyHit(hostV({ step: 'answer' }), hostMe(), 'Digit1'), { msg: { t: 'qz', a: 'jpJudge', ok: true } });
    assert.deepEqual(keyHit(hostV({ step: 'judge' }), hostMe(), 'Digit2'), { msg: { t: 'qz', a: 'jpJudge', ok: false } });
    assert.deepEqual(keyHit(hostV({ step: 'buzz', total: QZ_JP.SHOW_AUTO_MS }), hostMe(), 'KeyR'), { msg: { t: 'qz', a: 'jpShow' } });
    assert.equal(keyHit(hostV({ step: 'buzz', total: 7000 }), hostMe(), 'KeyR'), null);
    const fin = { themes: ['А', 'Б', 'В'], remover: 7, bet: [], answered: [], shown: [] };
    assert.deepEqual(keyHit(jv({ step: 'fremove', fin }), jme(), 'Digit3'), { msg: { t: 'qz', a: 'jpDrop', th: 2 } });
    assert.equal(keyHit(jv({ step: 'fremove', fin }), jme(), 'Digit4'), null);
    const c = view({ mode: 'croc', croc: { step: 'words', drawer: who(7, 'Я'), queue: [], of: 2 } as never });
    assert.deepEqual(keyHit(c, me({ croc: { queued: false, drew: false, got: false, choices: ['а', 'б', 'в'] } }), 'Digit3'), { msg: { t: 'qz', a: 'crWord', i: 2 } });
    const d = view({ mode: 'croc', croc: { step: 'draw', drawer: who(7, 'Я'), queue: [], of: 2 } as never });
    assert.deepEqual(keyHit(d, me({ croc: { queued: false, drew: true, got: false } }), 'KeyZ'), { undo: true });
    assert.deepEqual(keyHit(d, me({ croc: { queued: false, drew: true, got: false } }), 'KeyG'), { fill: true });
    const g = view({ mode: 'croc', croc: { step: 'draw', drawer: who(901, 'Барон'), queue: [], of: 2 } as never });
    assert.deepEqual(keyHit(g, me({ croc: { queued: false, drew: false, got: false } }), 'KeyF'), { msg: { t: 'qz', a: 'role', take: true, r: 'drawer' } });
    assert.equal(keyHit(g, me({ croc: { queued: true, drew: false, got: false } }), 'KeyF'), null);
    assert.equal(keyHit(view({ mode: 'riddle' }), me(), 'Space'), null);
  });

  it('текст из чата «В игру»: отвечающему — ответ, финалисту — ответ финала, остальным — реплика', () => {
    assert.deepEqual(lineMsg(jv({ step: 'answer', buzz: who(7, 'Я') }), jme(), 'Сомик'), { t: 'qz', a: 'jpAns', text: 'Сомик' });
    assert.deepEqual(lineMsg(jv({ step: 'fanswer' }), jme({ bet: 50 }), 'Кит'), { t: 'qz', a: 'jpFans', text: 'Кит' });
    assert.deepEqual(lineMsg(jv({ step: 'fanswer' }), jme({ bet: 50, fanswered: true }), 'Кит'), { t: 'qz', a: 'say', text: 'Кит' });
    assert.deepEqual(lineMsg(jv({ step: 'pick' }), jme(), 'привет'), { t: 'qz', a: 'say', text: 'привет' });
    assert.deepEqual(lineMsg(null, null, 'привет'), { t: 'qz', a: 'say', text: 'привет' });
  });

  it('вызов роли: записавшийся «Играю» видит «Передумал», ведущий — «Не веду»; «Крокодил» — «Передумал»', () => {
    const call = (taken: Array<ReturnType<typeof who>>) => ({ role: 'host' as const, roles: ['host' as const, 'player' as const], by: 'open' as const, to: null, taken, endsAt: NOW + 8000 });
    const free = rolesBar(view({ phase: 'roles', call: call([who(901, 'Барон')]) }), me({ canTake: true }), NOW)!;
    assert.match(free.html, /data-r="host">Веду я/);
    assert.match(free.html, /data-r="player">Играю/);
    assert.match(free.html, /записались 1/);
    const took = rolesBar(view({ phase: 'roles', call: call([who(7, 'Я')]) }), me({ canTake: true }), NOW)!;
    assert.match(took.html, /data-r="player" data-take="0">Передумал/);
    assert.notEqual(took.sig, free.sig);
    const host = rolesBar(view({ phase: 'roles', call: call([]) }), me({ canTake: true, role: 'host' }), NOW)!;
    assert.match(host.html, /data-r="host" data-take="0">Не веду/);
    assert.doesNotMatch(host.html, /data-r="player"/);
    const cr = { role: 'drawer' as const, roles: ['drawer' as const], by: 'open' as const, to: null, taken: [who(7, 'Я')], endsAt: NOW + 8000 };
    assert.match(rolesBar(view({ phase: 'roles', mode: 'croc', call: cr }), me({ canTake: false }), NOW)!.html, /data-take="0">Передумал/);
    assert.equal(rolesBar(view({ phase: 'roles', mode: 'croc', call: { ...cr, taken: [] } }), me({ canTake: false }), NOW), null, 'не записан и не может — полосы нет');
  });

  it('итоги «Своей игры»: «Пак понравился» — только тому, кто играл; после нажатия «Спасибо!» и не нажимается', () => {
    const r = view({ phase: 'results', mode: 'jeopardy', results: { mode: 'jeopardy', top: [], endsAt: NOW + 9000, pack: { id: 'p1', title: 'Набережная' } } });
    const played = me({ result: { place: 2, pts: 800, tokens: 12 } });
    assert.match(likeButton(r, played), /data-qz="like" data-pack="p1"[^>]*>.*Пак понравился/);
    setQuizImageUrls({ heart: '/h.webp' });
    try { assert.match(likeButton(r, played), /<img class="k-ic"/, 'сердце — с классом кита, иначе картинка во весь размер'); } finally { setQuizImageUrls({ heart: '' }); }
    assert.equal(likeButton(r, me()), '', 'зритель не играл');
    assert.match(plateSpec(r, played, NOW)!.html, /data-qz="like"/);
    assert.doesNotMatch(plateSpec(r, me(), NOW)!.html, /data-qz="like"/);
    assert.match(likeButton(r, played, new Set(['p1'])), /is-on" data-qz="like" data-pack="p1" disabled[^>]*>.*Спасибо!/);
    // место 0 — ведущий или зритель: в строке итога только жетоны, лайка нет
    const lead = me({ result: { place: 0, pts: 0, tokens: 6 } });
    const line = plateSpec(r, lead, NOW)!.html;
    assert.match(line, /Итоги: <b class="k-gold">\+6<\/b>/);
    assert.doesNotMatch(line, /место|очк|data-qz="like"/);
    assert.equal(likeButton(r, lead), '');
    assert.match(plateSpec(r, me({ result: { place: 0, pts: 0, tokens: 0 } }), NOW)!.html, /Игра окончена/);
    assert.equal(likeButton(view({ phase: 'results', mode: 'riddle', results: { mode: 'riddle', top: [], endsAt: 1 } }), played), '', 'у «Загадки» пака нет');
  });
});

// ------------------------------------------------------------------ окно «Ракушка»

const info = (o: Partial<QzPackInfo> = {}): QzPackInfo => ({
  id: 'a1b2c3d4e5f6', title: 'Набережная', author: 'Оля', kind: 'jeopardy', adult: false, rounds: 2, themes: 8, questions: 40, bytes: 0, at: 1, plays: 12, likes: 3, builtin: false,
  canDel: true, liked: false, ...o,
});
const outline = (): QzPackOutline => ({
  info: info(),
  rounds: [
    { name: 'Раунд 1', final: false, themes: ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж'].map((name) => ({ name, prices: [100, 200] })) },
    { name: 'Мало тем', final: false, themes: [{ name: 'Х', prices: [100] }, { name: 'У', prices: [100] }] },
    { name: 'Финал', final: true, themes: [{ name: 'Маяк', prices: [0] }] },
  ],
});

describe('окно «Ракушка»: вкладки и «Пак и темы»', () => {
  it('вкладки: четыре; у ведущего в setup первая — «Пак и темы»; «Играть» у него превращается в неё', () => {
    assert.deepEqual(tabsFor(false).map((t) => t.label), ['Играть', 'Паки', 'Загрузить', 'Рекорды']);
    assert.deepEqual(tabsFor(true).map((t) => t.label), ['Пак и темы', 'Паки', 'Загрузить', 'Рекорды']);
    assert.equal(pickTab(undefined, false), 'play');
    assert.equal(pickTab('records', false), 'records');
    assert.equal(pickTab('play', true), 'setup');
    assert.equal(pickTab('что-то', true), 'setup');
  });

  it('карточки режимов: сколько людей и сколько длится', () => {
    const c = modeCards();
    assert.deepEqual(c.map((x) => x.name), ['Загадка', 'Своя игра', 'Крокодил', 'Кто из нас?']);
    assert.equal(c[3].who, 'от 4 человек');
    assert.equal(c[0].len, '5 загадок или 15 мин');
  });

  it('выбор по умолчанию: первый раунд с тремя темами, первые шесть тем, финал есть — включён', () => {
    const o = outline();
    assert.deepEqual(playableRounds(o), [0]);
    const s = defaultSetup(o)!;
    assert.deepEqual([s.round, s.themes.length, s.final], [0, 6, true]);
    assert.equal(defaultSetup({ ...o, rounds: [o.rounds[1]] }), null);
  });

  it('темы: от 3 до 6; седьмую поставить нельзя; «Начать» с причиной, пока тем мало', () => {
    const s = defaultSetup(outline())!;
    assert.equal(setupReason(s), '');
    assert.equal(toggleTheme(s, 6), false, 'шестерых хватит');
    for (const i of [0, 1, 2, 3]) assert.equal(toggleTheme(s, i), true);
    assert.deepEqual(s.themes, [4, 5]);
    assert.match(setupReason(s), /от 3 до 6/);
    assert.equal(toggleTheme(s, 6), true);
    assert.equal(setupReason(s), '');
    assert.deepEqual(startMsg(s), { t: 'qz', a: 'jpStart', pack: 'a1b2c3d4e5f6', round: 0, themes: [4, 5, 6], final: true });
    assert.equal(setupReason(null), 'Выбери пак');
  });
});

describe('окно «Ракушка»: каталог, загрузка, рекорды', () => {
  const pic = (id: string) => `<i class="${id}"></i>`;

  it('строка каталога: 18+, «Удалить» только у своих, двумя нажатиями; встроенные не удаляются; чужой текст экранируется', () => {
    assert.match(packRow(info({ adult: true }), false, pic), />18\+</);
    assert.match(packRow(info(), false, pic), /data-w="del"[^>]*>Удалить</);
    assert.match(packRow(info(), true, pic), /k-btn--stop[^>]*>Точно удалить\?</);
    assert.doesNotMatch(packRow(info({ canDel: false }), false, pic), /data-w="del"/);
    assert.doesNotMatch(packRow(info({ builtin: true }), false, pic), /data-w="del"/);
    const evil = packRow(info({ title: '<img src=x onerror=1>' }), false, pic);
    assert.doesNotMatch(evil, /<img src=x/);
    assert.match(packRow(info({ kind: 'words', questions: 300 }), false, pic), /300 слов/);
  });

  it('текстовый пак: живой вид — счёт, ошибки по строкам, отказ проверки; название можно дописать руками', () => {
    assert.equal(draftFromText('   '), null);
    const text = ['Раунд: Первый', 'Тема: Рыбы', '100 Кто? = осётр', '200 Что? = окунь', 'Тема: Маяк', '100 Сколько? = 185', '200 Где? = тут', 'Тема: Пирс', '100 Чем? = удочкой', '200 Как? = так'].join('\n');
    const d = draftFromText(text)!;
    assert.deepEqual(d.errors, []);
    assert.equal(d.problem, 'Напиши название пака', 'названия в тексте нет');
    assert.equal(saveReason(5, d, false), 'Напиши название пака');
    d.pack.title = 'Мой пак';
    assert.equal(checkDraft(d).problem, '');
    assert.equal(saveReason(5, d, false), '');
    assert.match(packSummary(d.pack), /1 раунд · 3 темы · 6 вопросов/);
    const bad = draftFromText('Пак: Х\nТема: Без раунда\nвопрос без цены и ответа');
    assert.ok(bad!.errors.length > 0 || bad!.problem !== '');
  });

  it('кнопка «Сохранить»: серая ниже 3-го уровня, пока идёт загрузка и без пака; уровень неизвестен — решит сервер', () => {
    const ok = { pack: { ...blankPack(), title: 'Х' }, warnings: [], errors: [], problem: '' };
    assert.equal(saveReason(2, ok, false), 'Загружать паки можно с 3-го уровня');
    assert.equal(saveReason(3, ok, false), '');
    assert.equal(saveReason(null, ok, false), '');
    assert.equal(saveReason(5, ok, true), 'Идёт загрузка…');
    assert.equal(saveReason(5, null, false), 'Выбери файл или напиши пак');
    assert.equal(saveReason(5, { ...ok, errors: ['Строка 3: …'] }, false), 'Исправь ошибки в паке');
  });

  it('рекорды: свои цифры и четыре таблицы', () => {
    const r = myRecs({ jpGames: 12, jpWins: 4, jpBest: 3400, rdSolved: 30, rdMade: 11, crGuessed: 22, crDrawn: 5, whoTitles: 3, dayCoins: 120 });
    assert.equal(r[0].value, 'игр 12 · побед 4 · лучший счёт 3400');
    assert.equal(topLists({ jpWins: [], rdSolved: [], crGuessed: [], whoTitles: [] }).length, 4);
  });
});

// ------------------------------------------------------------------ разбор .siq

/** Маленький ZIP: stored (0) или deflate (8) */
function zip(files: Array<[string, Uint8Array | string, 0 | 8]>): Blob {
  const bytes = (d: Uint8Array | string): Buffer => Buffer.from(typeof d === 'string' ? d : d);
  const parts: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const [name, data, method] of files) {
    const raw = bytes(data), nm = Buffer.from(name), comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(method, 8);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nm);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return new Blob([Buffer.concat([...parts, cd, e])]);
}

const q = (price: number, text: string, answer: string, extra = ''): string => `<question price="${price}"><scenario>${extra}<atom>${text}</atom></scenario><right><answer>${answer}</answer></right></question>`;
const xml = (name = 'Пак из теста', first = ''): string => `<?xml version="1.0" encoding="utf-8"?><package name="${name}" version="4" xmlns="http://vladimirkhil.com/ygpackage3.0.xsd">
<info><authors><author>Оля</author></authors></info><rounds><round name="Раунд 1"><themes>
<theme name="Рыбы"><questions>${q(100, 'Кто самый крупный?', 'Сом', first)}${q(200, 'Что на картинке?', 'Маяк', '<atom type="image">@pic.png</atom>')}</questions></theme>
<theme name="Море"><questions>${q(100, 'Левый борт?', 'Порт')}${q(200, 'Видео?', 'Шторм', '<atom type="video">@v.mp4</atom>')}</questions></theme>
<theme name="Еда"><questions>${q(100, 'Из чего уха?', 'Из рыбы')}${q(200, 'Что за звук?', 'Прибой', '<atom type="voice">@s.mp3</atom>')}${q(300, 'Длинный?', 'Да', '<atom type="voice">@long.mp3</atom>')}</questions></theme>
</themes></round></rounds></package>`;
const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6]);
const fakeMedia = (): MediaTools & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    async image(blob, ext) { calls.push(`image:${ext}`); return { blob: new Blob([new Uint8Array(await blob.arrayBuffer()).slice(0, 64)]), ext: 'webp' }; },
    async audio(blob) { calls.push('audio'); return blob.size === 200 ? 75 : 12.46; },
  };
};

describe('.siq в браузере: ZIP, content.xml, файлы', () => {
  const siq = (): Blob => zip([
    ['content.xml', xml(), 8], ['Images/pic.png', new Uint8Array(500).fill(7), 8], ['Audio/s.mp3', MP3, 0], ['Audio/long.mp3', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(197)]), 0], ['Video/v.mp4', 'видео', 0],
  ]);

  it('ZIP читается по каталогу: stored и deflate', async () => {
    const z = await openZip(siq());
    assert.deepEqual(z.entries.map((e) => e.name), ['content.xml', 'Images/pic.png', 'Audio/s.mp3', 'Audio/long.mp3', 'Video/v.mp4']);
    assert.match(await (await z.read(z.entries[0])).text(), /<package name="Пак из теста"/);
    assert.equal((await z.read(z.entries[2])).size, MP3.length);
    await assert.rejects(() => openZip(new Blob(['не архив, совсем не архив, ну вообще'])), /не открывается как архив/);
    await assert.rejects(() => openZip(new Blob([])), /пустой/);
  });

  it('пак: картинка ужата и посчитана, звук с длиной, видео и длинный звук пропущены с предупреждениями, лишние файлы не уходят', async () => {
    const media = fakeMedia();
    const r = await parseSiq(siq(), { media });
    assert.equal(r.pack.title, 'Пак из теста');
    assert.equal(r.pack.source.format, 'siq');
    assert.deepEqual(r.files.map((f) => [f.kind, f.ext]), [['image', 'webp'], ['audio', 'mp3']]);
    const img = r.pack.rounds[0].themes[0].questions[1].content.find((c) => c.kind === 'image');
    assert.ok(img && img.kind === 'image' && /^[a-f0-9]{64}\.webp$/.test(img.file));
    assert.equal(r.files[1].sec, 12.5, 'длина звука — с точностью до десятых');
    assert.deepEqual([...r.blobs.keys()].sort(), r.files.map(fileName).sort());
    assert.ok(r.warnings.includes('Видео пропущено.'));
    assert.ok(r.warnings.includes('Звук длиннее 60 с пропущен.'));
    assert.deepEqual(r.stats, { images: 1, audio: 1, bytes: r.files[0].size + r.files[1].size });
    // вопрос без своей картинки остался, но без неё: пак цел
    assert.equal(r.pack.rounds[0].themes[2].questions.length, 3);
    assert.ok(media.calls.includes('image:png') && media.calls.includes('audio'));
  });

  it('прогресс идёт по файлам; не пак — понятный отказ', async () => {
    const seen: string[] = [];
    await parseSiq(siq(), { media: fakeMedia(), onProgress: (p) => seen.push(`${p.done}/${p.total}`) });
    assert.equal(seen.at(-1), `${seen.length - 1}/${seen.length - 1}`);
    await assert.rejects(() => parseSiq(zip([['readme.txt', 'привет', 0]]), { media: fakeMedia() }), /нет content\.xml/);
    await assert.rejects(() => parseSiq(zip([['content.xml', '<package name="Х" version="4"><rounds/></package>', 8]]), { media: fakeMedia() }), /нет ни одного вопроса/);
  });

  it('длинные тексты SIGame обрезаются до пределов, а не заваливают загрузку', async () => {
    const long = 'я'.repeat(QZ_PACK.COMMENT + 80);
    const r = await parseSiq(zip([['content.xml', xml('Н'.repeat(90)).replace('<right>', `<info><comments>${long}</comments></info><right>`), 8], ['Images/pic.png', new Uint8Array(10), 0], ['Audio/s.mp3', MP3, 0]]), { media: fakeMedia() });
    assert.equal(r.pack.title.length, QZ_PACK.TITLE);
    assert.ok(r.warnings.some((w) => /Длинные тексты обрезаны/.test(w)));
    assert.ok(r.pack.rounds[0].themes[0].questions[0].comment.length <= QZ_PACK.COMMENT);
    const p = blankPack();
    p.rounds = [{ name: 'Р', final: false, themes: [{ name: 'Т', questions: [{ price: 1, type: 'simple', content: [{ kind: 'text', value: 'ж'.repeat(700) }], reveal: [], answers: Array.from({ length: 12 }, (_, i) => `о${i}`), wrong: [], comment: '' }] }] }];
    assert.ok(fitPack(p) >= 1);
    assert.equal(p.rounds[0].themes[0].questions[0].answers.length, QZ_PACK.ANSWERS);
  });

  it('одинаковые предупреждения — одной строкой', () => {
    assert.deepEqual(collapseWarnings(['Видео пропущено.', 'Видео пропущено.', 'Видео пропущено.', 'Другое.']), ['Видео пропущено: 3.', 'Другое.']);
  });
});

// ------------------------------------------------------------------ загрузка

function fakeNet(script: (call: { method: string; url: string; n: number }) => Response | Promise<Response>) {
  const log: string[] = [], waits: number[] = [];
  let inFlight = 0, maxFlight = 0, n = 0;
  const deps: UploadDeps = {
    ticket: async () => ({ ticket: `t${++tickets}`, exp: NOW + 300_000, left: 4 }),
    async fetch(url, init) {
      const method = String(init.method);
      const headers = init.headers as Record<string, string>;
      log.push(`${method} ${url} ${headers['x-quiz-ticket']}`);
      inFlight++; maxFlight = Math.max(maxFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return script({ method, url, n: n++ });
    },
    sleep: async (ms) => { waits.push(ms); },
  };
  let tickets = 0;
  return { deps, log, waits, get maxFlight() { return maxFlight; } };
}
const json = (o: unknown, status = 200, h: Record<string, string> = {}): Response => new Response(JSON.stringify(o), { status, headers: h });
const job = () => {
  const files = [{ sha256: 'a'.repeat(64), ext: 'webp' as const, kind: 'image' as const, size: 100 }, { sha256: 'b'.repeat(64), ext: 'mp3' as const, kind: 'audio' as const, size: 300, sec: 4 }];
  const blobs = new Map(files.map((f) => [fileName(f), new Blob([new Uint8Array(f.size)])]));
  return { pack: { ...blankPack('siq'), title: 'Х' }, files, blobs };
};
const happy = (c: { method: string; url: string }): Response => c.url === '/quiz/up' ? json({ ok: true, id: 'd1', need: [`${'a'.repeat(64)}.webp`, `${'b'.repeat(64)}.mp3`] })
  : c.url.endsWith('/done') ? json({ ok: true, info: info() }) : json({ ok: true, left: 0 });

describe('загрузка пака: билет → POST → PUT по одному → done', () => {
  it('порядок, по одному файлу за раз, билет в каждом запросе, полоска доходит до конца', async () => {
    const net = fakeNet(happy);
    const seen: UploadProgress[] = [];
    const r = await uploadPack(job(), net.deps, (p) => seen.push(p));
    assert.equal(r.title, 'Набережная');
    assert.deepEqual(net.log, ['POST /quiz/up t1', `PUT /quiz/up/d1/${'a'.repeat(64)}.webp t1`, `PUT /quiz/up/d1/${'b'.repeat(64)}.mp3 t1`, 'POST /quiz/up/d1/done t1']);
    assert.equal(net.maxFlight, 1, 'параллельных запросов нет');
    assert.deepEqual(seen.map((p) => p.phase).filter((x, i, a) => a.indexOf(x) === i), ['ticket', 'pack', 'files', 'done']);
    assert.equal(seen.at(-1)!.sent, 400);
    assert.ok(seen.some((p) => p.file === 2 && p.files === 2));
  });

  it('429: ждём по Retry-After и повторяем тот же запрос; всё время занято — отказ «сервер занят»', async () => {
    let first = true;
    const net = fakeNet((c) => { if (c.method === 'PUT' && first) { first = false; return json({ ok: false }, 429, { 'retry-after': '3' }); } return happy(c); });
    await uploadPack(job(), net.deps);
    assert.deepEqual(net.waits, [3000]);
    assert.equal(net.log.filter((l) => l.includes('.webp')).length, 2, 'тот же файл прислан заново');
    const busy = fakeNet(() => json({ ok: false }, 429));
    await assert.rejects(() => uploadPack(job(), busy.deps), (e: unknown) => e instanceof UploadError && e.code === 'busy');
    assert.equal(waitSeconds(null, 0), 5);
    assert.equal(waitSeconds('1', 0), 2);
    assert.equal(waitSeconds('999', 0), 30);
  });

  it('билет истёк (401): новый билет и всё заново; три раза подряд — отказ с понятным текстом', async () => {
    let dead = true;
    const net = fakeNet((c) => { if (dead && c.url.startsWith('/quiz/up/d1/') && c.method === 'PUT') { dead = false; return json({ ok: false, error: 'билет' }, 401); } return happy(c); });
    await uploadPack(job(), net.deps);
    assert.deepEqual(net.log.filter((l) => l.startsWith('POST /quiz/up ')).map((l) => l.split(' ')[2]), ['t1', 't2'], 'второй POST — уже с новым билетом');
    assert.equal(net.log.at(-1), 'POST /quiz/up/d1/done t2');
    const never = fakeNet(() => json({ ok: false }, 401));
    await assert.rejects(() => uploadPack(job(), never.deps), (e: unknown) => e instanceof UploadError && e.code === 'ticket');
  });

  it('отказ сервера — его строка для игрока; нет связи — своя; нет файла — не уходим', async () => {
    const bad = fakeNet((c) => (c.url === '/quiz/up' ? json({ ok: false, error: 'Файлы пака — не больше 30 МБ.' }, 413) : happy(c)));
    await assert.rejects(() => uploadPack(job(), bad.deps), /не больше 30 МБ/);
    const down = fakeNet(happy);
    down.deps.fetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(() => uploadPack(job(), down.deps), (e: unknown) => e instanceof UploadError && e.code === 'net');
    const j = job();
    j.blobs.clear();
    await assert.rejects(() => uploadPack(j, fakeNet(happy).deps), /Не нашёл файл пака/);
  });

  it('билет по сокету: ответ, отказ по уровню и по дневному пределу, молчание', async () => {
    const desk = new TicketDesk();
    const ok = desk.ask(() => {});
    assert.equal(desk.pending, true);
    desk.ticket({ ticket: 'x', exp: 1, left: 2 });
    assert.equal((await ok).ticket, 'x');
    const no = desk.ask(() => {});
    assert.equal(desk.error('rate', 'не наше'), false, 'чужие отказы не трогаем');
    assert.equal(desk.error('level', 'Загружать паки можно с 3-го уровня'), true);
    await assert.rejects(() => no, (e: unknown) => e instanceof UploadError && e.code === 'level');
    await assert.rejects(() => desk.ask(() => {}, 5), /не отвечает/);
    assert.equal(desk.pending, false);
  });
});
