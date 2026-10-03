// Lightweight startup orchestration: no game, renderer, font or stylesheet imports.
export type StartupStage = 'modules' | 'fonts' | 'world' | 'frame';
export interface StartupView {
  stage(stage: StartupStage): void;
  finish(): void;
  fail(stage: StartupStage): void;
}
interface StartupGame {
  prepareFonts(): Promise<void>;
  start(): void | Promise<void>;
}
interface StartupOptions {
  view: StartupView;
  load(): Promise<StartupGame>;
  paint(): Promise<void>;
  frames(): Promise<void>;
  report(error: unknown): void;
}

export async function runStartup({ view, load, paint, frames, report }: StartupOptions): Promise<void> {
  let stage: StartupStage = 'modules';
  try {
    view.stage(stage);
    // Give the HTML cover a paint before downloading/evaluating the large game graph.
    await paint();
    const game = await load();
    view.stage(stage = 'fonts');
    await game.prepareFonts();
    view.stage(stage = 'world');
    // Paint this stage before synchronous geometry construction occupies the main thread.
    await paint();
    await game.start();
    view.stage(stage = 'frame');
    await frames();
    view.finish();
  } catch (error) {
    view.fail(stage);
    report(error);
  }
}

/** Two RAFs allow a rendered game frame to reach the browser before revealing it. */
export function waitForFrames(
  target: EventTarget,
  request: typeof requestAnimationFrame = requestAnimationFrame,
  cancel: typeof cancelAnimationFrame = cancelAnimationFrame,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    const cleanup = () => {
      target.removeEventListener('error', fail);
      target.removeEventListener('webglcontextlost', fail, true);
      cancel(frame);
    };
    const fail = (event: Event) => {
      cleanup();
      reject((event as ErrorEvent).error ?? new Error('Не удалось отрисовать первый кадр'));
    };
    target.addEventListener('error', fail);
    target.addEventListener('webglcontextlost', fail, true);
    frame = request(() => {
      frame = request(() => { cleanup(); resolve(); });
    });
  });
}

/** Canvas labels are drawn once. Keep the previous 1.5 s font fallback, without a leftover timer. */
export async function waitForFonts(fonts: Pick<FontFaceSet, 'load'>): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([fonts.load('700 30px Rubik', 'Аб7'), fonts.load('900 40px Rubik', 'Аб7')]),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, 1500); }),
    ]);
  } catch {
    // A missing font must not stop the game; the browser supplies its fallback.
  } finally {
    clearTimeout(timeout);
  }
}

const STAGE_TEXT: Record<StartupStage, string> = {
  modules: 'Загружаем игру…',
  fonts: 'Готовим надписи…',
  world: 'Собираем набережную…',
  frame: 'Рисуем первый кадр…',
};

export function startupView(root: HTMLElement, content: HTMLElement[], reload: () => void): StartupView {
  const status = root.querySelector<HTMLElement>('#startup-status')!;
  const title = root.querySelector<HTMLElement>('#startup-title')!;
  const progress = root.querySelector<HTMLElement>('#startup-progress')!;
  const retry = root.querySelector<HTMLButtonElement>('#startup-retry')!;
  retry.addEventListener('click', () => { retry.disabled = true; reload(); });
  return {
    stage(stage) {
      root.dataset.stage = stage;
      status.textContent = STAGE_TEXT[stage];
      progress.setAttribute('aria-valuetext', STAGE_TEXT[stage]);
    },
    finish() {
      for (const element of content) element.inert = false;
      root.remove();
    },
    fail(stage) {
      root.dataset.failed = 'true';
      title.textContent = 'Не получилось запуститься';
      status.textContent = stage === 'modules'
        ? 'Не удалось загрузить файлы игры. Проверьте соединение и попробуйте ещё раз.'
        : 'Не удалось открыть набережную. Попробуйте ещё раз или откройте игру в браузере с поддержкой WebGL 2.';
      progress.hidden = true;
      retry.hidden = false;
      retry.focus({ preventScroll: true });
    },
  };
}
