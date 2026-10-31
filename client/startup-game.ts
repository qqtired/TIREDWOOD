// This graph (including its extracted CSS) is requested only after the HTML loader paints.
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import '@fontsource/rubik/900.css';
import '@fontsource/rubik-mono-one/cyrillic-400.css';
import '@fontsource/rubik-mono-one/latin-400.css';
// кит интерфейса 2.0 (client/ui/kit/) — до styles.css: одноимённые переменные игры на :root остаются её
import './ui/kit/tokens.css';
import './ui/kit/kit.css';
import './ui/kit/combat.css';
import './styles.css';
import { App } from './app.ts';
// HUD «Веранда v3» (docs/ui3/brief.md): все правила под [data-hud='veranda3'] и подключены после стилей игры (app.ts) — как в
// лаборатории lab/ui3/; без флага UI3 атрибут остаётся 'light' и эти стили ничего не меняют
import './ui/kit/hud3/veranda3.css';
import './ui/kit/hud3/veranda3-msg.css';
import './ui/kit/hud3/veranda3-fight.css';
import './ui/kit/hud3/veranda3-water.css';
import './ui/kit/hud3/veranda3-plaza.css';
import './ui/kit/hud3/veranda3-quiz.css';
// вход 3.0 (client/ui/entry3.ts): меню входа поверх живой набережной — тоже только под [data-hud='veranda3']
import './ui/kit/hud3/entry3.css';
import { UI3 } from '../shared/ui3.ts';
import { bindHud3 } from './ui/hud3.ts';
import { waitForFonts } from './startup.ts';

export function prepareFonts(): Promise<void> {
  return waitForFonts(document.fonts);
}

export async function start(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hud = document.getElementById('hud')!;
  const menus = document.getElementById('menus')!;
  // Preserve the outfit studio route as well as the normal game entry.
  if (new URLSearchParams(location.search).has('dress')) {
    const { startDressStudio } = await import('./lobby/dress.ts');
    startDressStudio(canvas, menus);
  } else {
    // интерфейс 3.0 по флагу сервера UI3: HUD «Веранда v3» вместо «Светлого»; окна (data-skin='retro2') — как были
    if (UI3) document.documentElement.dataset.hud = 'veranda3';
    new App(canvas, hud, menus).start();
    // HUD v3: награды — у жетонов, ник в новостях цветом, значок у системных строк чата (слоты HUD уже построены в App)
    if (UI3) bindHud3();
  }
}
