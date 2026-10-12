import { controls, asset, marker, ring, line, ribbon, ellipseCourse, ellipsePoint, newVehicle, vehicleStep, ellipseBoundary, gatePass, poseVehicle, clockText, TAU, mix } from './common.js';

export async function kart(ctx) {
  const { ui, sound, kit } = ctx;
  const d = kit.diorama({ cam: [40, 30, 35], look: [0, 0, 0], radius: 2, rail: false });
  const keys = controls(ctx), rx = 24, rz = 16, width = 7;
  ellipseCourse(ctx, d, rx, rz, width);
  ribbon(ctx, d.scene, [[24, 0.035, 1], [16, 0.035, 8], [1, 0.035, 16]], 3.4, 0x9b9c72);
  for (const [x, z] of [[16, 9.8], [12, 12.4]]) d.cyl(0.18, 0.3, 0.5, 0xde8053).position.set(x, 0.25, z);
  marker(ctx, d, 'Короче · узкий срез', 14, 2.7, 7, 7);
  marker(ctx, d, 'Широкая дуга', 23, 2.7, 13, 6);
  const model = await asset(ctx, 'kart', d.scene), ghost = await asset(ctx, 'kart', d.scene);
  const ghostActor=ghost.userData.labActor;
  if(ghostActor)ghostActor.setOpacity(.28);
  else ghost.traverse(obj => { if (obj.material) { obj.material = Array.isArray(obj.material) ? obj.material.map(m => m.clone()) : obj.material.clone(); for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) { m.transparent = true; m.opacity = 0.28; m.depthWrite = false; } } });
  let ghostOn=false;
  const showGhost=on=>{ghostOn=on;if(ghostActor)ghostActor.setVisible(on);else ghost.visible=on;};
  showGhost(false);
  const gates = [1, 2, 3, 4].map(i => { const p = ellipsePoint(i / 4 * TAU, rx, rz); return ring(ctx, d.scene, p.x, 0.08, p.z, 2.1); });
  let s = newVehicle(rx, rz), phase = 'ready', elapsed = 0, accum = 0, replay = [], recording = [], best = Infinity, shortcutSeen = false, collisionCooldown = 0;
  const timer = ui.stat('Круг', '—'), delta = ui.stat('Призрак', 'Сначала чистый круг'), hitStat = ui.stat('Касания', '0'), lane = ui.stat('Линия', 'Широкая');
  const start = ui.button('Старт · Enter', () => reset(true), true); ui.button('Ещё круг · R', () => reset(true)); keys.movement(false, true);
  function reset(run = false) {
    s = newVehicle(rx, rz); phase = run ? 'running' : 'ready'; elapsed = 0; accum = 0; recording = []; shortcutSeen = false; keys.clear(); collisionCooldown = 0;
    showGhost(replay.length > 1);
    ui.note(run ? 'W — газ, D — первая дуга. Выбери широкий асфальт или узкий внутренний срез. Призрак — твоя записанная чистая попытка.' : 'Один круг. Пройди чисто, затем обгони своего настоящего призрака. Enter — старт.');
  }
  reset();
  return {
    scene: d.scene, camera: d.camera, target: d.target, cameraOwned: true,
    cancelInput(){keys.clear();s.drift=false;s.driftDir=0;s.steer=0;s.omega=0;},
    onKey(code, down) { keys.onKey(code, down); if (down && (code === 'Enter' || code === 'KeyR')) reset(true); },
    update(dt, t) {
      collisionCooldown = Math.max(0, collisionCooldown - dt);
      if (phase === 'running') {
        elapsed += dt; accum += dt;
        while (accum >= 1 / 60) {
          vehicleStep(s, keys, 1 / 60, { top: 15 });
          const a = Math.atan2(s.z / rz, s.x / rx), r = Math.hypot(s.x / rx, s.z / rz);
          const cut = a > 0.08 && a < 1.48 && r < 0.91 && r > 0.68;
          shortcutSeen ||= cut; lane.set(cut ? 'Узкий срез' : 'Широкая дуга');
          let hit = ellipseBoundary(s, rx, rz, width, false, true);
          // A cone physically blocks careless use of the inner line; it is not a cosmetic route toggle.
          for (const [x, z] of [[16, 9.8], [12, 12.4]]) if (Math.hypot(s.x - x, s.z - z) < 0.75) { s.vx *= 0.72; s.vz *= 0.72; hit = true; }
          if (hit && !collisionCooldown) { s.hits++; collisionCooldown = 0.6; sound.slip(); }
          gatePass(s, rx, rz, width + 1);
          recording.push({ t: elapsed - accum, x: s.x, z: s.z, yaw: s.yaw, steer: s.steer });
          if (s.checkpoint >= 4) {
            phase = 'won'; sound.fanfare();
            const previous = best;
            if (!s.hits && elapsed < best) { best = elapsed; replay = recording.map(p => ({ ...p })); }
            ui.note(`Финиш ${clockText(elapsed)} · ${s.hits ? `${s.hits} касаний: призрак не заменён.` : 'Чистая попытка записана.'} ${Number.isFinite(previous) ? `Разница ${(elapsed - previous).toFixed(2)} с.` : ''} R — повтор.`);
          }
          accum -= 1 / 60; if (phase !== 'running') break;
        }
        if (elapsed > 60) { phase = 'failed'; ui.note('Круг не завершён за минуту. R — новый старт, призрак сохранён.'); }
      }
      const hx = Math.cos(s.yaw), hz = Math.sin(s.yaw);
      d.camera.position.set(s.x - hx * 5.5, 3.5, s.z - hz * 5.5); d.camera.lookAt(s.x + hx * 8, 0.5, s.z + hz * 8);
      poseVehicle(model,s,.02,dt,t,d.camera);
      if (ghostOn && replay.length) {
        let idx = Math.min(replay.length - 1, Math.floor(elapsed * 60));
        while (idx > 0 && replay[idx].t > elapsed) idx--;
        while (idx < replay.length - 1 && replay[idx + 1].t < elapsed) idx++;
        const a = replay[idx], b = replay[Math.min(idx + 1, replay.length - 1)], k = b.t > a.t ? Math.max(0, Math.min(1, (elapsed - a.t) / (b.t - a.t))) : 0;
        poseVehicle(ghost, { ...s, x: mix(a.x, b.x, k), z: mix(a.z, b.z, k), yaw: a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * k, steer: a.steer, drift: false, boost: 0 },.04,dt,t,d.camera);
      }
      gates.forEach((g, i) => g.material.opacity = i === s.checkpoint ? 0.9 : 0.2);
      timer.set(clockText(elapsed)); hitStat.set(String(s.hits)); start.disabled = phase === 'running';
      if (replay.length) delta.set(`${clockText(best)} · ${replay.length} записанных поз`);
    },
    getState: () => ({ mode: 'kart', phase, clock: elapsed, score: s.checkpoint, hits: s.hits, headingYaw:s.yaw,drift:s.drift,boost:s.boost,shortcut: shortcutSeen, ghostFrames: replay.length, ghostOrigin: replay.length ? 'recorded clean player run' : 'none', recordedFrames: recording.length, best: Number.isFinite(best) ? best : null, position: { x: s.x, z: s.z }, scope: 'local simplified scene; no production balance', actors: 'actual game kart', actorState:model.userData.labActor?.state?.()||null, ghostActorState:ghost.userData.labActor?.state?.()||null }),
    dispose() { keys.clear(); d.dispose(); }
  };
}
