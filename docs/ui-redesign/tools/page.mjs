// Полный прогон страницы lab/ui: ошибки, 404, переполнение, снимки по шкуркам.
import { lock, unlock, launch, kill, connect, send, ev, nav, shot, logs, sleep } from './cdp.mjs';
const OUT = '/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/shots/page-v2';
const URL0 = process.argv[2];
const bad = [];
await lock();
try {
  launch(1440, 900);
  await connect(1440, 900);
  await send('Network.enable');
  // ловим 4xx/5xx
  const { default: _ } = { default: 0 };
  await nav(URL0);
  await sleep(2500);
  // прокрутка всей страницы, чтобы ленивые картинки загрузились
  const H = await ev('document.documentElement.scrollHeight');
  for (let y = 0; y < H; y += 800) { await ev(`scrollTo(0,${y})`); await sleep(120); }
  await sleep(1500);
  const failed = await ev(`performance.getEntriesByType('resource').filter(e => e.responseStatus >= 400).map(e => e.responseStatus + ' ' + e.name)`);
  const broken = await ev(`[...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src).map(i => i.src)`);
  const stages = await ev(`document.querySelectorAll('.pg-stage, .stage, [data-stage]').length`);
  const secs = await ev(`[...document.querySelectorAll('.pg-screens')].map(s => s.id + ':' + s.querySelectorAll('.pg-wait').length + ':' + s.querySelector('.screens-body').children.length)`);
  console.log('height', H, 'stages', stages); console.log('sections', secs.join(' '));
  console.log('failed', failed); console.log('broken imgs', [...new Set(broken)]);
  const totalKB = await ev(`Math.round(performance.getEntriesByType('resource').reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0) / 1024)`);
  console.log('loaded KB', totalKB);
  for (const skin of ['retro2', 'beach', 'dusk']) {
    await ev(`document.querySelector('.pg-skin[data-pick=${skin}]')?.click() ?? document.querySelector('.pg-cmp[data-pick=${skin}]')?.click()`);
    await sleep(600);
    await ev('scrollTo(0,0)'); await sleep(400);
    await shot(`${OUT}/${skin}-top.png`);
    for (const id of ['screens-entry', 'screens-fishing', 'screens-farm', 'screens-fort', 'icons']) {
      await ev(`document.getElementById('${id}').scrollIntoView()`); await sleep(700);
      await shot(`${OUT}/${skin}-${id}.png`);
    }
  }
  const ow = await ev('document.documentElement.scrollWidth');
  console.log('scrollWidth@1440', ow);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1200);
  console.log('scrollWidth@390', await ev('document.documentElement.scrollWidth'));
  const wide = await ev(`[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 392 && !e.closest('.pg-frame, .stage-frame, [class*=frame]')).slice(0,8).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().right))`);
  console.log('wide@390', wide);
  await ev('scrollTo(0,0)'); await sleep(300);
  await shot(`${OUT}/mobile-top.png`);
} finally {
  console.log('LOGS', JSON.stringify([...new Set(logs)], null, 1));
  kill(); unlock();
}
