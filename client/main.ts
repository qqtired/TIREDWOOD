// Keep this entry tiny: critical UI already lives in HTML; game CSS/JS is loaded later.
import { errorReport, reportFatal } from './errors.ts';
import { savedNick } from './identity.ts';
import { bindHudScale } from './ui/kit/scale.ts';
import { runStartup, startupView, waitForFrames } from './startup.ts';

errorReport.install();

const root = document.getElementById('startup')!;
const content = [document.getElementById('hud')!, document.getElementById('menus')!];

// масштаб первой загрузки — как у слоёв кита (--hud-k от размера окна); игра перехватит его сама, когда запустится
const unbindScale = bindHudScale(document.documentElement, () => 1);
const view = startupView(root, content, () => location.reload());

void runStartup({
  view: { ...view, finish: () => { unbindScale(); view.finish(); } },
  load: () => import('./startup-game.ts'),
  paint: () => waitForFrames(window),
  frames: () => waitForFrames(window),
  report: error => {
    console.error(error);
    reportFatal(error, savedNick());
  },
});
