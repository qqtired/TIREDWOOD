// Keep this entry tiny: critical UI already lives in HTML; game CSS/JS is loaded later.
import { errorReport, reportFatal } from './errors.ts';
import { savedNick } from './identity.ts';
import { bootLayout } from './layout-boot.ts';
import { runStartup, startupView, waitForFrames } from './startup.ts';

errorReport.install();
// Раскладка набережной (флаг сервера PLAZA3) — до import() игры: модули с координатами выбирают площадь при импорте.
// Здесь — никаких импортов из shared/ (кроме import type): test/plaza3-boot.test.ts
const layout = bootLayout();

const root = document.getElementById('startup')!;
const content = [document.getElementById('hud')!, document.getElementById('menus')!];

void runStartup({
  view: startupView(root, content, () => location.reload()),
  load: async () => {
    await layout;
    return import('./startup-game.ts');
  },
  paint: () => waitForFrames(window),
  frames: () => waitForFrames(window),
  report: error => {
    console.error(error);
    reportFatal(error, savedNick());
  },
});
