import { base, clamp, loadKit, part, localLabel, contactPoint, worldGrip } from './common.js';

export async function createDemo(ctx) {
  const s = base(ctx, { cam: [0, 3.3, 8.4], look: [0, 1.1, -.4], radius: 6.2 });
  const kit = await loadKit(ctx, 'social-theatre');
  const you = s.jelly({ name: 'Ты · ответ', x: 1.3, z: .4, outfit: { c: 9, h: 'bandana' } });
  const partner = s.jelly({ name: 'Аня · демо', x: -1.3, z: .4, outfit: { c: 12, h: 'straw' } }); you.face(0, 3.8); partner.face(0, 3.8);
  const uke = part(kit, 'ukulele'), drum = part(kit, 'drum'); s.scene.add(uke, drum); uke.position.set(-1.3, .85, .1); drum.position.set(1.3, .85, .1);
  const spectator = s.jelly({ name: 'Коля слушает', x: 0, z: -2.35, outfit: { c: 5, h: 'none' } }); spectator.face(0, .7);
  const discs = [-1.5, -.5, .5, 1.5].map((x, i) => { const m = s.ring(x, 2, .28, [0xe0ac50, 0x66b397, 0xcf7867, 0xd3bcd4][i]); return m; });
  const pointer = s.d.ball(.095, 0xf3b84d); pointer.position.set(-1.5, .2, 2);
  const phaseStat = ctx.ui.stat('Сейчас', 'Послушай и ответь'), scoreStat = ctx.ui.stat('Точно', '0 / 12'), patternStat = ctx.ui.stat('Мотив', 'до · ре · ми · пауза');
  const pulse = ctx.ui.meter('Доля · жми в середине'); pulse.zone(.28, .72);
  const motifs = [[0, 1, 2, -1], [2, -1, 1, 0], [0, 2, -1, 1]], frequencies = [261.63, 293.66, 329.63];
  const labels = ['до', 'ре', 'ми'];
  let phase = 'ready', round = 0, localT = 0, elapsed = 0, played = -1, score = 0, timed = 0, attempted = new Set(), capture = [], feedback = '', roleMode = 'echo', noteFlash = 0, partnerFlash = 0, replayT = 0, replayPlayed = -1;
  let heldContact = null, replayEvents = [];
  localLabel(ctx, 'Аня играет первые четыре доли');
  ctx.ui.select('Твой ответ', [{ value: 'echo', label: 'Повторить мотив' }, { value: 'variation', label: 'Вариация · последнюю звучащую ноту выше' }], roleMode, v => { roleMode = v; });
  function tone(n, origin) { if (n >= 0) ctx.sound.tone({ f0: frequencies[n % 3], f1: frequencies[n % 3] * .996, dur: .26, type: origin === 'partner' ? 'triangle' : 'sine', vol: .11 }); else ctx.sound.tick?.(.6); if (origin === 'partner') partnerFlash = .3; else noteFlash = .3; }
  function begin() { phase = 'countdown'; round = localT = elapsed = score = timed = 0; attempted = new Set(); capture = []; replayEvents = []; played = -1; s.result.set('Приготовься · Аня играет первой'); s.note('Слушай 4 доли, затем 1/2/3 — ноты, Пробел — пауза. Жми в середине каждой доли.'); you.action(ctx.kit.ACT.none); partner.action(ctx.kit.ACT.none); }
  function expected(beat) { const motif = motifs[round], n = motif[beat], lastSound = motif.findLastIndex(v => v >= 0); return roleMode === 'variation' && beat === lastSound ? (n + 1) % 3 : n; }
  function input(n) {
    if (phase !== 'reply') { if (phase === 'ready') { tone(n, 'you'); s.note('Свободная проба. Для игры вдвоём нажми «Начать джем».'); } return; }
    const beat = Math.floor(localT); if (beat < 0 || beat > 3 || attempted.has(beat)) return;
    attempted.add(beat); const offset = localT - (beat + .5), onTime = Math.abs(offset) <= .24, right = n === expected(beat);
    tone(n, 'you'); if (onTime) timed++; if (onTime && right) { score++; feedback = 'В такт!'; ctx.sound.plip?.(1.2); } else feedback = !right ? 'Другая нота — ритм продолжается' : offset < 0 ? 'Рано — подожди середину доли' : 'Поздно — поймай следующую долю';
    capture.push({ round, beat, note: n, offset, at: round * 4 + localT, expected: expected(beat), correct: onTime && right }); s.result.set(feedback);
  }
  const startBtn = s.button('Начать джем', begin, true);
  ['До · 1', 'Ре · 2', 'Ми · 3', 'Пауза · Пробел'].forEach((label, i) => s.button(label, () => input(i === 3 ? -1 : i), i < 3));
  s.button('Ещё мотив', begin);
  const replayBtn = s.button('Послушать наш дубль', () => { if (capture.length) { capture.sort((a, b) => a.round - b.round || a.beat - b.beat); phase = 'replay'; replayT = 0; replayPlayed = -1; replayEvents = []; s.result.set('Играет ваш настоящий дубль'); } }); replayBtn.disabled = true;
  return { scene: s.scene, camera: s.camera, target: s.target, cameraOwned: true, cancelInput: s.cancelInput,
    onKey(code, down) { if (down && !s.keys.has(code)) { if (/^Digit[123]$/.test(code)) input(Number(code.at(-1)) - 1); if (code === 'Space') input(-1); } return s.key(code, down); },
    update(dt, t) {
      dt = Math.min(dt, .05); noteFlash = Math.max(0, noteFlash - dt); partnerFlash = Math.max(0, partnerFlash - dt);
      if (['countdown', 'call', 'reply', 'between'].includes(phase)) { localT += dt; elapsed += dt; }
      if (phase === 'countdown') { phaseStat.set(`Старт через ${Math.max(1, Math.ceil(3 - localT))}`); if (localT >= 3) { phase = 'call'; localT = 0; played = -1; } }
      if (phase === 'call') {
        phaseStat.set(`Аня задаёт · круг ${round + 1}/3`); patternStat.set(motifs[round].map(n => n < 0 ? 'пауза' : labels[n]).join(' · ')); const beat = Math.floor(localT);
        if (beat < 4 && beat !== played && localT - beat >= .5) { played = beat; tone(motifs[round][beat], 'partner'); }
        if (localT >= 4) { phase = 'reply'; localT = 0; attempted = new Set(); s.result.set('Твой ответ — четыре доли'); }
      } else if (phase === 'reply') {
        phaseStat.set(`Ты отвечаешь · круг ${round + 1}/3`);
        if (localT >= 4) { for (let beat = 0; beat < 4; beat++) if (!attempted.has(beat)) capture.push({ round, beat, note: -2, offset: null, at: round * 4 + beat + .5, expected: expected(beat), correct: false }); phase = 'between'; localT = 0; s.result.set(`${score} точных долей · музыка продолжается`); }
      } else if (phase === 'between' && localT > 4) {
        round++; localT = 0; played = -1;
        if (round < 3) phase = 'call'; else { phase = score >= 9 ? 'success' : 'failure'; phaseStat.set('Джем завершён'); s.result.set(score >= 9 ? `Общий ритм · ${score}/12` : `Дубль записан · ${score}/12`); s.note('Можно услышать именно ваши сыгранные ноты или начать новый мотив.'); s.celebrate(you, score >= 9); spectator.action(score >= 9 ? ctx.kit.ACT.dance : ctx.kit.ACT.wave); }
      }
      if (phase === 'replay') {
        replayT += dt;
        while (replayPlayed + 1 < capture.length) {
          const event = capture[replayPlayed + 1], at = event.at ?? event.round * 4 + event.beat + .5 + (event.offset ?? 0);
          if (at > replayT) break;
          replayPlayed++;
          if (event.note >= -1) { tone(event.note, 'you'); replayEvents.push({ round: event.round, beat: event.beat, note: event.note, at, processedAt: replayT }); }
        }
        if (replayT > 12.6) { phase = score >= 9 ? 'success' : 'failure'; s.result.set(`Дубль закончен · ${score}/12`); }
      }
      const beatFrac = phase === 'call' || phase === 'reply' ? localT % 1 : 0; pulse.set(beatFrac); const beat = clamp(Math.floor(localT), 0, 3); pointer.position.x = [-1.5, -.5, .5, 1.5][beat]; pointer.position.y = .16 + Math.sin(beatFrac * Math.PI) * .3; pointer.visible = ['call', 'reply'].includes(phase);
      discs.forEach((m, i) => m.material.opacity = i === beat && ['call', 'reply'].includes(phase) ? 1 : .42);
      uke.position.set(partner.pos.x - Math.sin(partner.yaw) * .48, 1.02, partner.pos.z - Math.cos(partner.yaw) * .48); uke.rotation.set(0, partner.yaw, -.45 + partnerFlash * .13, 'YXZ');
      drum.position.set(you.pos.x - Math.sin(you.yaw) * .5, .97, you.pos.z - Math.cos(you.yaw) * .5); drum.rotation.set(-Math.PI / 2, you.yaw, noteFlash * .06, 'YXZ');
      const membrane = drum.getObjectByName('drum_membrane'); if (membrane) membrane.scale.y = 1 - noteFlash * .3;
      you.avatar.hands = null; partner.avatar.hands = null;
      scoreStat.set(`${score} / 12`); startBtn.disabled = ['countdown', 'call', 'reply', 'between'].includes(phase); replayBtn.disabled = !['success', 'failure'].includes(phase); s.update(dt, t);
      const neck = contactPoint(ctx, uke, 'ukulele_grip', [0, 0, 0]), strum = contactPoint(ctx, uke, 'ukulele_strum', [0, -.1, -.035]);
      const rim = contactPoint(ctx, drum, 'drum_grip', [0, .08, -.18]), hit = contactPoint(ctx, drum, 'drum_hit', [0, .202, 0]);
      const strumSurface = strum.point.clone(), hitSurface = hit.point.clone();
      const strumLift = partnerFlash > .20 ? 0 : Math.sin(clamp(partnerFlash / .20, 0, 1) * Math.PI) * .09;
      const hitLift = noteFlash > .20 ? 0 : Math.sin(clamp(noteFlash / .20, 0, 1) * Math.PI) * .1;
      strum.point.add(new ctx.THREE.Vector3(0, 0, -strumLift).applyQuaternion(uke.quaternion)); hit.point.add(new ctx.THREE.Vector3(0, hitLift, 0).applyQuaternion(drum.quaternion));
      heldContact = { ukulele: worldGrip(ctx, partner, [neck, strum]), drum: worldGrip(ctx, you, [rim, hit]), action: { strumLift, hitLift, strumSurface: strumSurface.toArray(), hitSurface: hitSurface.toArray(), strumAtSound: partnerFlash > .20, drumAtSound: noteFlash > .20 } };
    }, dispose: () => s.dispose(), getState: () => ({ id: 'reply-jam', phase, round, localT, elapsed, score, timed, roleMode, motif: motifs[Math.min(round, 2)], capture: capture.map(p => ({ ...p })), feedback, replayT, replayEvents: replayEvents.map(p => ({ ...p })), heldContact, maxGripError: heldContact ? Math.max(heldContact.ukulele.maxError, heldContact.drum.maxError) : null })
  };
}
