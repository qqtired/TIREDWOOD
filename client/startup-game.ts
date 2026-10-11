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
    new App(canvas, hud, menus).start();
  }
}
