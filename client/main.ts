// Keep this entry tiny: critical UI already lives in HTML; game CSS/JS is loaded later.
import { errorReport, reportFatal } from './errors.ts';
import { savedNick } from './identity.ts';
import { runStartup, startupView, waitForFrames } from './startup.ts';

errorReport.install();

const root = document.getElementById('startup')!;
const content = [document.getElementById('hud')!, document.getElementById('menus')!];

void runStartup({
  view: startupView(root, content, () => location.reload()),
  load: () => import('./startup-game.ts'),
  paint: () => waitForFrames(window),
  frames: () => waitForFrames(window),
  report: error => {
    console.error(error);
    reportFatal(error, savedNick());
  },
});
