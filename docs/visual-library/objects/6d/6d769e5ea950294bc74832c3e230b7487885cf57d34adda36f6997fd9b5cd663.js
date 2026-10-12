import { base, clamp, loadKit, part } from './common.js';

export async function createDemo(ctx) {
  const s = base(ctx, { cam: [0, 8.8, 9.8], look: [0, .3, 0], radius: 6.6 });
  const kit = await loadKit(ctx, 'social-beach');
  const you = s.jelly({ name: 'Ты', x: 0, z: 3.2, outfit: { c: 9, h: 'cap' } });
  const ghost = s.jelly({ name: 'Запись автора', x: 0, z: 3.2, outfit: { c: 12, h: 'none' } }); ghost.root.visible = false;
  ghost.root.traverse(o => { if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; o.material = mats.map(m => { const n = m.clone(); n.transparent = true; n.opacity = .32; n.depthWrite = false; return n; }); if (!Array.isArray(o.material) || o.material.length === 1) o.material = o.material[0]; } });
  const gates = [{ x: -1.8, z: 1.4, jump: false }, { x: 1.5, z: -.3, jump: true }, { x: -.4, z: -2.25, jump: false }];
  const models = gates.map(g => { const m = part(kit, g.jump ? 'chalk_hurdle' : 'chalk_gate'); m.position.set(g.x, 0, g.z); s.scene.add(m); return m; });
  const marks = gates.map(g => s.ring(g.x, g.z, .62, 0x60b298)); s.ring(0, 3.2, .75, 0xe3b25a);
  const timer = ctx.ui.stat('Время', '0,0 с'), progress = ctx.ui.stat('Ворота', '0 / 3'), record = ctx.ui.stat('Доказательство', 'Автор ещё не пробежал');
  let phase = 'edit', elapsed = 0, passed = 0, penalty = 0, vy = 0, selected = 0, tape = [], proof = [], proofTime = 0, replayIndex = 0, hitLock = 0;
  ctx.ui.select('Поставить ворота', [1, 2, 3].map(v => ({ value: String(v - 1), label: `Метка ${v}${v === 2 ? ' · прыжок' : ''}` })), '0', v => { selected = Number(v); });
  const setPhase = p => { phase = p; elapsed = passed = penalty = vy = replayIndex = 0; hitLock = 0; tape = []; s.keys.clear(); you.pos.set(0, 0, 3.2); you.action(ctx.kit.ACT.none); ghost.root.visible = p === 'challenge'; marks.forEach(m => m.material.color.setHex(0x60b298)); s.result.set(p === 'author' ? 'Автор доказывает путь' : 'Повтори против записи автора'); s.note('WASD — беги через 1 → 2 → 3. Пробел — прыгни через вторые ворота.'); };
  function jump() { if (['author', 'challenge'].includes(phase) && you.pos.y <= .01) { vy = 4.2; you.grounded = false; ctx.sound.whoosh(); } }
  const authorBtn = s.button('Доказать путь', () => setPhase('author'), true);
  const challengeBtn = s.button('Повторить запись', () => { if (proof.length) setPhase('challenge'); }, true); challengeBtn.disabled = true;
  s.button('Изменить маршрут', () => { phase = 'edit'; proof = []; ghost.root.visible = false; record.set('Новый маршрут нужно доказать'); s.result.set('Выбери метку и кликни по площадке'); s.note('Клик по настилу передвигает выбранную метку. Минимум 1,2 м между метками.'); });
  s.hold('Вперёд · W', 'KeyW'); s.hold('Назад · S', 'KeyS'); s.hold('Влево · A', 'KeyA'); s.hold('Вправо · D', 'KeyD'); s.button('Прыгнуть · Пробел', jump);
  s.note('Три метки можно переставить кликом. Сначала автор должен сам пройти маршрут.');
  return { scene: s.scene, camera: s.camera, target: s.target, cameraOwned: true, cancelInput: s.cancelInput,
    tap(nx, ny) {
      if (phase !== 'edit') return; const p = s.floorAt(nx, ny); if (!p) return;
      const x = clamp(p.x, -3.9, 3.9), z = clamp(p.z, -3, 2.3);
      if (gates.some((g, i) => i !== selected && Math.hypot(g.x - x, g.z - z) < 1.2)) { s.note('Метки слишком близко. Оставь место для поворота.'); return; }
      gates[selected].x = x; gates[selected].z = z; models[selected].position.set(x, 0, z); marks[selected].position.set(x, .035, z); ctx.sound.pop();
    },
    onKey(code, down) { if (code === 'Space' && down && !s.keys.has(code)) jump(); if (code === 'KeyR' && down) setPhase(proof.length ? 'challenge' : 'author'); return s.key(code, down); },
    update(dt, t) {
      dt = Math.min(dt, .04); hitLock = Math.max(0, hitLock - dt);
      if (['author', 'challenge'].includes(phase)) {
        elapsed += dt; let dx = s.axis(), dz = Number(s.keys.has('KeyS')) - Number(s.keys.has('KeyW')); const norm = Math.hypot(dx, dz) || 1;
        you.pos.x = clamp(you.pos.x + dx / norm * dt * 3.3, -4.6, 4.6); you.pos.z = clamp(you.pos.z + dz / norm * dt * 3.3, -3.5, 3.5); if (dx || dz) you.face(you.pos.x + dx, you.pos.z + dz);
        vy -= dt * 8; you.pos.y = Math.max(0, you.pos.y + vy * dt); if (you.pos.y === 0) { vy = 0; you.grounded = true; }
        tape.push({ t: elapsed, x: you.pos.x, z: you.pos.z, y: you.pos.y, yaw: you.yaw });
        for (let i = 0; i < gates.length; i++) {
          const g = gates[i]; if (Math.hypot(you.pos.x - g.x, you.pos.z - g.z) > .65) continue;
          if (i === passed && (!g.jump || you.pos.y > .28)) { passed++; marks[i].material.color.setHex(0xe7b348); ctx.sound.ding(); s.result.set(`Есть метка ${passed}`); }
          else if (i >= passed && hitLock === 0) { penalty += 2; hitLock = 1.8; you.avatar.jolt?.(.4); ctx.sound.pop(); s.note(i === passed ? 'Прыгни через барьер. Касание: +2 с.' : 'Сначала предыдущая метка. Пропуск: +2 с.'); }
        }
        if (phase === 'challenge' && proof.length) {
          while (replayIndex + 1 < proof.length && proof[replayIndex + 1].t <= elapsed) replayIndex++;
          const p = proof[replayIndex]; ghost.pos.set(p.x, p.y, p.z); ghost.yaw = p.yaw;
        }
        if (passed === 3) {
          const total = elapsed + penalty;
          if (phase === 'author') { proof = tape.map(p => ({ ...p })); proofTime = total; phase = 'proved'; record.set(`${proofTime.toFixed(1)} с · ${proof.length} кадров записи`); s.result.set('Маршрут доказан. Теперь повтори его.'); s.note('«Повторить запись» запускает твоё сохранённое движение и новую реальную попытку.'); }
          else { phase = total <= proofTime ? 'success' : 'failure'; s.result.set(total <= proofTime ? `Обогнал запись на ${(proofTime - total).toFixed(1)} с` : `Запись быстрее на ${(total - proofTime).toFixed(1)} с`); s.note('Повтори, чтобы пройти чище, или вернись к трём меткам.'); s.celebrate(you, total <= proofTime); }
        } else if (elapsed > 30) { phase = 'failure'; s.result.set('30 секунд вышли · путь не закончен'); s.note('Повтори попытку; доказательство автора сохраняется до редактирования.'); }
      }
      progress.set(`${passed} / 3`); timer.set(`${(elapsed + penalty).toFixed(1)} с${penalty ? ` · штраф ${penalty}` : ''}`); authorBtn.disabled = ['author', 'challenge'].includes(phase); challengeBtn.disabled = !proof.length || ['author', 'challenge'].includes(phase); s.update(dt, t);
    }, dispose: () => s.dispose(), getState: () => ({ id: 'chalk-relay', phase, elapsed, penalty, passed, pos: { x: you.pos.x, y: you.pos.y, z: you.pos.z }, gates: gates.map(g => ({ ...g })), proofTime, proofFrames: proof.length, replayIndex, replaySource: 'actual-author-input-tape' })
  };
}
