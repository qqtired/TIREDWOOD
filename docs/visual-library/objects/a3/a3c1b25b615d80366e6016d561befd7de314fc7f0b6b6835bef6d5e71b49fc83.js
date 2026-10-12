import { base, clamp, mix, loadKit, part, localLabel, contactPoint, worldGrip } from './common.js';

export async function createDemo(ctx) {
  const s = base(ctx, { cam: [0, 3.8, 9.2], look: [0, 1.25, -.35], radius: 6.4 });
  const kit = await loadKit(ctx, 'social-theatre');
  const stage = part(kit, 'theatre_stage'); stage.position.z = -1; stage.rotation.y = Math.PI; s.scene.add(stage);
  const props = ['umbrella', 'crown', 'bell'].map(n => { const p = part(kit, n); p.visible = false; s.scene.add(p); return p; });
  const actor = s.jelly({ name: 'Ты · актёр', x: 0, z: .6, outfit: { c: 9, h: 'none' } });
  const helper = s.jelly({ name: 'Миша · демо', x: -2.65, z: -.6, outfit: { c: 0, h: 'sailor' } }); helper.face(0, .6);
  for (const [x, z, c] of [[-3.2, 2.9, 12], [3.2, 2.9, 5]]) { const j = s.jelly({ name: 'Зритель', x, z, outfit: { c, h: 'none' } }); j.face(0, -.5); }
  const target = s.ring(0, .6, .65, 0x65b69c), miss = s.ring(0, .6, .9, 0xcf705e); miss.visible = false;
  const cue = ctx.ui.stat('Эпизод', 'Пикник во время ветра'); const score = ctx.ui.stat('Поймано', '0 / 3');
  const timing = ctx.ui.meter('Лови, когда предмет над тобой'); timing.zone(.76, .92);
  localLabel(ctx, 'Миша подаёт реквизит');
  let phase = 'ready', episode = 0, localT = 0, elapsed = 0, chosen = 0, caught = 0, attempts = 0, success = false, intercept = -1.1, x = 0, feedback = '';
  let heldContact = null;
  const requirements = ['Зонтик для пикника', 'Корона для гостя', 'Колокольчик для финала']; const colors = [0x67b59a, 0xe9b363, 0xcc7868];
  ctx.ui.select('Реквизит', ['Зонтик', 'Корона', 'Колокольчик'].map((label, value) => ({ label, value: String(value) })), '0', v => { chosen = Number(v); });
  function begin() { phase = 'prepare'; episode = localT = elapsed = caught = attempts = 0; x = 0; feedback = ''; props.forEach(p => p.visible = false); actor.action(ctx.kit.ACT.none); s.keys.clear(); setup(); }
  function setup() { phase = 'prepare'; localT = 0; intercept = [-1.15, 1.2, -.15][episode]; target.position.x = intercept; target.visible = true; miss.visible = false; success = false; cue.set(`${episode + 1}/3 · ${requirements[episode]}`); s.result.set('Выбери реквизит и встань на метку'); s.note('A/D — двигаться. Выбери предмет; Пробел — поймать, когда он над тобой.'); }
  function catchProp() {
    if (phase !== 'flight') return;
    attempts++; const u = localT / 2.5; const propOK = chosen === episode, posOK = Math.abs(x - intercept) < .55, timeOK = u > .76 && u < .93;
    if (propOK && posOK && timeOK) { success = true; caught++; actor.avatar.jolt?.(.6); ctx.sound.ding(); props[episode].visible = false; feedback = 'Есть! Предмет в руках.'; }
    else { feedback = !propOK ? 'Реквизит перепутан — это фарс!' : !posOK ? 'Предмет пролетел мимо метки.' : u < .76 ? 'Рано! Дождись, когда он долетит.' : 'Поздно — предмет уже упал.'; ctx.sound.pop(); }
    phase = 'reaction'; localT = 0; s.result.set(feedback); s.note(success ? 'Эпизод сыгран. Следующий реквизит уже готовят.' : 'Ошибка стала частью спектакля. Следующий эпизод — шанс исправиться.');
  }
  const startBtn = s.button('Начать один дубль', begin, true); const catchBtn = s.button('Поймать · Пробел', catchProp, true); s.button('Другой дубль', begin);
  s.hold('Налево · A', 'KeyA'); s.hold('Направо · D', 'KeyD');
  return { scene: s.scene, camera: s.camera, target: s.target, cameraOwned: true, cancelInput: s.cancelInput,
    onKey(code, down) { if (code === 'Space' && down && !s.keys.has(code)) catchProp(); if (/^Digit[123]$/.test(code) && down) chosen = Number(code.slice(-1)) - 1; return s.key(code, down); },
    update(dt, t) {
      dt = Math.min(dt, .05); x = clamp(x + s.axis() * dt * 2.8, -1.9, 1.9); actor.pos.set(x, .04, .6); actor.face(x, 4.2); actor.avatar.hands = null; heldContact = null;
      if (['prepare', 'flight', 'reaction'].includes(phase)) { elapsed += dt; localT += dt; }
      if (phase === 'prepare' && localT > 7.5) { phase = 'flight'; localT = 0; helper.action(ctx.kit.ACT.wave); props[episode].visible = true; s.result.set('Предмет летит — дождись метки'); ctx.sound.whoosh(); }
      if (phase === 'flight') {
        const u = clamp(localT / 2.5, 0, 1); props[episode].position.set(mix(-2.8, intercept + .55, u), .75 + Math.sin(u * Math.PI) * 2, .6); props[episode].rotation.z = u * 4.4; timing.set(u);
        if (u >= 1) { phase = 'reaction'; localT = 0; feedback = 'Не поймал — реквизит на сцене'; s.result.set(feedback); miss.visible = true; ctx.sound.splat(); }
      } else timing.set(0);
      if (phase === 'reaction') {
        if (success) { const p = props[episode]; p.visible = true; p.position.set(x + (episode === 1 ? 0 : .22), episode === 1 ? 1.5 : .92, episode === 1 ? .65 : 1.02); p.rotation.set(0, actor.yaw, episode === 0 ? -.2 : 0); }
        else { const p = props[episode]; p.visible = true; p.position.y = .15; p.rotation.z = 1.2; }
        if (localT > 4.8) {
          props[episode].visible = false; episode++;
          if (episode < 3) setup(); else { phase = caught >= 2 ? 'success' : 'failure'; s.result.set(caught === 3 ? 'Аккуратный спектакль · 3/3' : caught === 2 ? 'Весёлый дубль · 2/3' : 'Большой фарс · попробуй другие роли'); s.note('Финал зависит от твоих перехватов. Ещё дубль — чтобы сыграть точнее.'); target.visible = false; s.celebrate(actor, caught >= 2); }
        }
      }
      score.set(`${caught} / 3`); catchBtn.disabled = phase !== 'flight'; startBtn.disabled = ['prepare', 'flight', 'reaction'].includes(phase); helper.face(actor.pos.x, actor.pos.z); s.update(dt, t);
      if (phase === 'reaction' && success && episode < 3) {
        const p = props[episode];
        const contacts = episode === 0 ? [contactPoint(ctx, p, 'umbrella_grip', [0, .12, 0]), contactPoint(ctx, p, 'umbrella_grip', [0, .12, 0], [0, .16, 0])]
          : episode === 1 ? [contactPoint(ctx, p, 'crown_left_grip', [-.2, .035, 0]), contactPoint(ctx, p, 'crown_right_grip', [.2, .035, 0])]
          : [contactPoint(ctx, actor.root, null, [-.36, .83, -.34]), contactPoint(ctx, p, 'bell_grip', [0, .28, 0])];
        heldContact = { prop: ['umbrella', 'crown', 'bell'][episode], grip: worldGrip(ctx, actor, contacts), propHands: episode === 2 ? [1] : [0, 1] };
      }
    }, dispose: () => s.dispose(), getState: () => ({ id: 'one-take-theatre', phase, episode, localT, elapsed, chosen, intercept, x, caught, attempts, feedback, heldContact, maxGripError: heldContact ? Math.max(...heldContact.propHands.map(i => heldContact.grip.errors[i])) : null })
  };
}
