import './style.css';
import { createSession, runSession, type BenchSession, type RunResult } from './runtime.ts';
import { rotatedOrder } from './metrics.ts';
import type { SceneConfig, Variant } from './types.ts';

declare const __BENCH_BUILD__: { commit: string; fingerprint: string; builtAt: string };

const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = get<HTMLDivElement>('stage');
const status = get<HTMLParagraphElement>('status');
const progress = get<HTMLProgressElement>('progress');
const labels: Record<Variant, string> = { legacy: 'A · WebGL', 'modern-webgl': 'B · новый WebGL', webgpu: 'C · WebGPU' };
const presets: Record<string, SceneConfig> = { normal: { seed: 6102026, players: 16, rain: false }, rain: { seed: 6102026, players: 64, rain: true } };
const storageKey = 'tiredwood.renderer-lab.v1';
interface Entry { id: string; group: string; build: typeof __BENCH_BUILD__; repetition: number; variant: Variant; scenario: SceneConfig; instrumentation: string; result: RunResult | null; error?: string }
let entries: Entry[] = [];
let current: BenchSession | null = null;
let busy = false;
let controller: AbortController | null = null;
let inspectorLoaded = false;
let exportUrl: string | null = null;
let captureUrl: string | null = null;
try { const saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (Array.isArray(saved?.entries)) entries = saved.entries; } catch { /* Storage is optional. */ }

get('source').textContent = `${__BENCH_BUILD__.commit.slice(0, 8)} · ${__BENCH_BUILD__.fingerprint.slice(0, 12)}`;
const selectedVariant = (): Variant => get<HTMLSelectElement>('variant').value as Variant;
const selectedComplexity = (): 1 | 10 => get<HTMLSelectElement>('complexity').value === '10' ? 10 : 1;
const withComplexity = (config: SceneConfig): SceneConfig => selectedComplexity() === 10 ? { ...config, players: config.players * 10, complexity: 10 } : { ...config };
const selectedScene = (): SceneConfig => withComplexity(presets[get<HTMLSelectElement>('scenario').value]);
function updateScenarioLabels(): void {
  const factor = selectedComplexity();
  const options = get<HTMLSelectElement>('scenario').options;
  options[0].textContent = `Набережная · ${16 * factor} персонажей`;
  options[1].textContent = `Дождь · ${64 * factor} персонажей`;
}
const dimensions = (): [number, number] => { const w = Number(get<HTMLSelectElement>('resolution').value); return [w, w * 9 / 16]; };
const seconds = (id: string, fallback: number): number => { const n = Number(get<HTMLInputElement>(id).value); return Number.isFinite(n) ? Math.max(id === 'warmup' ? 1 : 2, Math.min(60, n)) : fallback; };
const fmt = (n: number | null | undefined): string => typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(2)} мс` : '—';
const message = (text: string): void => { status.textContent = text; };

function setBusy(value: boolean): void {
  busy = value;
  document.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>('.controls input,.controls select,#preview,#single,#suite,#clear').forEach(el => { el.disabled = value; });
  get<HTMLButtonElement>('stop').disabled = !value || !controller;
  get<HTMLButtonElement>('freeze').disabled = value || !current;
  get<HTMLButtonElement>('spector').disabled = value || !current || current.backend !== 'webgl2';
}

function payload(): object { return { schema: 'tiredwood-render-benchmark/1', build: __BENCH_BUILD__, exportedAt: new Date().toISOString(), methodology: 'Representative procedural harbour; fixed DPR1; per-entry complexity1/10, actual workload in manifest; clean timing separate from GPU profiling; setup is not cold driver start; no inspector in measured runs.', entries }; }

function updateResults(): void {
  const body = get<HTMLTableSectionElement>('results'); body.replaceChildren();
  for (const e of entries) {
    const tr = document.createElement('tr'); const s = e.result?.summary;
    const values = [`${e.scenario.players} · ${e.scenario.rain ? 'дождь' : 'ясно'} · ${e.scenario.complexity ?? 1}× / ${labels[e.variant]}`, `${e.instrumentation === 'clean' ? 'Чистый' : 'GPU'} · ${e.repetition + 1}`, fmt(s?.frame?.median), fmt(s?.frame?.p95), fmt(s?.cpu?.median), fmt(s?.gpu?.median), s?.fps?.toFixed(1) ?? '—', e.error ?? (e.result?.status === 'ok' ? 'Готово' : 'Недействителен')];
    values.forEach((text, index) => { const td = document.createElement('td'); td.textContent = text; if (index === 7) td.className = e.result?.status === 'ok' ? 'ok' : 'invalid'; tr.append(td); }); body.append(tr);
  }
  get('result-count').textContent = entries.length ? `${entries.length} записей. Подробные настройки, причины недействительности и исходные кадры — в JSON.` : 'Измерений пока нет.';
  const raw = JSON.stringify(payload(), null, 2);
  if (exportUrl) URL.revokeObjectURL(exportUrl);
  exportUrl = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = get<HTMLAnchorElement>('export'); link.href = exportUrl; link.download = `render-benchmark-${__BENCH_BUILD__.fingerprint.slice(0, 12)}-${entries.length}.json`; link.hidden = !entries.length;
  try { localStorage.setItem(storageKey, raw); } catch { message('Таблица сохранена в памяти. Скачай JSON: браузер не смог сохранить результаты между перезагрузками.'); }
}

async function disposeCurrent(): Promise<void> { if (current) { const old = current; current = null; await old.dispose(); } }

async function openSession(variant: Variant, config: SceneConfig, gpuTiming: boolean): Promise<BenchSession> {
  await disposeCurrent(); const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', 'Набережная TIREDWOOD — тестовая сцена'); stage.replaceChildren(canvas);
  const [w, h] = dimensions();
  current = await createSession(canvas, variant, config, w, h, gpuTiming);
  get('backend').textContent = `${labels[variant]} · фактически ${current.backend} · ${w}×${h}`;
  get('environment').textContent = JSON.stringify({ build: __BENCH_BUILD__, environment: current.environment, manifest: current.manifest, setupMs: current.setupMs }, null, 2);
  get<HTMLAnchorElement>('png').hidden = true;
  return current;
}

async function preview(): Promise<void> {
  if (busy) return; setBusy(true); message('Подготавливаем сцену…');
  try { const s = await openSession(selectedVariant(), selectedScene(), false); s.renderAt(2); await s.flush(); message('Сцена готова. Зафиксирована 2-я секунда движения.'); }
  catch (error) { await disposeCurrent(); message(`Не удалось открыть: ${error instanceof Error ? error.message : String(error)}`); }
  finally { setBusy(false); }
}

async function measure(all: boolean): Promise<void> {
  if (busy) return;
  if (inspectorLoaded) { message('Spector уже подключён. Перезагрузи страницу перед чистыми измерениями; таблица сохранится.'); return; }
  if (document.visibilityState !== 'visible') { message('Открой вкладку перед запуском измерений.'); return; }
  const repetitions = all ? Number(get<HTMLSelectElement>('repetitions').value) : 1;
  const sceneList = all ? Object.values(presets).map(withComplexity) : [selectedScene()];
  const jobs: Array<{ variant: Variant; config: SceneConfig; repetition: number; gpu: boolean }> = [];
  for (const config of sceneList) for (let rep = 0; rep < repetitions; rep++) for (const variant of all ? rotatedOrder(rep) : [selectedVariant()]) jobs.push({ variant, config, repetition: rep, gpu: false });
  for (const config of sceneList) for (const variant of all ? rotatedOrder(0) : [selectedVariant()]) jobs.push({ variant, config, repetition: 0, gpu: true });
  const group = new Date().toISOString(); controller = new AbortController(); setBusy(true); progress.value = 0;
  const warmupMs = seconds('warmup', 3) * 1000; const measureMs = seconds('duration', 10) * 1000;
  try {
    for (let index = 0; index < jobs.length; index++) {
      if (controller.signal.aborted) break;
      const job = jobs[index]; const prefix = `${index + 1}/${jobs.length} · ${labels[job.variant]} · ${job.config.players} персонажей · ${job.gpu ? 'GPU-профиль' : 'чистый замер'}`;
      message(`${prefix} · подготовка`);
      const entry: Entry = { id: `${group}/${index}`, group, build: __BENCH_BUILD__, repetition: job.repetition, variant: job.variant, scenario: job.config, instrumentation: job.gpu ? 'gpu-timestamps' : 'clean', result: null };
      try {
        const session = await openSession(job.variant, job.config, job.gpu); let lastStatus = 0;
        entry.result = await runSession(session, { warmupMs, measureMs }, (phase, value) => { const now = performance.now(); if (now - lastStatus < 250) return; lastStatus = now; message(`${prefix} · ${phase}`); progress.value = (index + value) / jobs.length; }, controller.signal);
      } catch (error) { entry.error = error instanceof Error ? error.message : String(error); }
      finally { await disposeCurrent(); }
      entries.push(entry); updateResults(); progress.value = (index + 1) / jobs.length;
      if (!controller.signal.aborted) await new Promise<void>(resolve => setTimeout(resolve, 500));
    }
    message(controller.signal.aborted ? 'Прогон остановлен. Завершённые записи доступны в JSON.' : 'Прогон завершён. Скачай JSON; недействительные записи нельзя включать в сравнение.');
  } finally { controller = null; setBusy(false); }
}

get<HTMLButtonElement>('preview').addEventListener('click', () => { void preview(); });
get<HTMLSelectElement>('complexity').addEventListener('change', updateScenarioLabels);
get<HTMLButtonElement>('single').addEventListener('click', () => { void measure(false); });
get<HTMLButtonElement>('suite').addEventListener('click', () => { void measure(true); });
get<HTMLButtonElement>('stop').addEventListener('click', () => controller?.abort());
get<HTMLButtonElement>('clear').addEventListener('click', () => { if (busy) return; entries = []; updateResults(); message('Таблица очищена.'); });
get<HTMLButtonElement>('freeze').addEventListener('click', () => { void (async () => {
  if (!current || busy) return;
  try { const s = current; s.renderAt(2); await s.flush(); s.renderAt(2); const a = get<HTMLAnchorElement>('png'); a.href = s.canvas.toDataURL('image/png'); a.download = `render-${s.variant}-${s.sceneConfig.players}-${s.sceneConfig.rain ? 'rain' : 'dry'}-${__BENCH_BUILD__.fingerprint.slice(0, 12)}.png`; a.hidden = false; message('Кадр зафиксирован на 2-й секунде. PNG готов к скачиванию.'); }
  catch (error) { message(`Ошибка снимка: ${String(error)}`); }
})(); });

interface SpectorInstance { onCapture: { add(callback: (capture: unknown) => void): void }; captureCanvas(canvas: HTMLCanvasElement): void }
type SpectorWindow = Window & { SPECTOR?: { Spector: new () => SpectorInstance } };
get<HTMLButtonElement>('spector').addEventListener('click', () => { void (async () => {
  if (!current || current.backend !== 'webgl2' || busy) return;
  const session = current; setBusy(true); message('Подключаем Spector 0.9.33 для отдельного захвата…'); inspectorLoaded = true;
  try {
    const win = window as SpectorWindow;
    if (!win.SPECTOR) await new Promise<void>((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/spectorjs@0.9.33/dist/spector.bundle.js'; script.onload = () => resolve(); script.onerror = () => reject(new Error('Не удалось загрузить Spector с CDN')); document.head.append(script); });
    if (!win.SPECTOR) throw new Error('Spector не инициализировался');
    const spector = new win.SPECTOR.Spector();
    const captureTimeout = setTimeout(() => { message('Spector не вернул захват за 10 секунд. Перезагрузи страницу перед замерами.'); setBusy(false); }, 10000);
    spector.onCapture.add(capture => { clearTimeout(captureTimeout); if (captureUrl) URL.revokeObjectURL(captureUrl); captureUrl = URL.createObjectURL(new Blob([JSON.stringify(capture)], { type: 'application/json' })); const a = get<HTMLAnchorElement>('capture'); a.href = captureUrl; a.download = `spector-${session.variant}.json`; a.hidden = false; message('Захват Spector готов. Для новых измерений перезагрузи страницу.'); setBusy(false); });
    spector.captureCanvas(session.canvas);
    requestAnimationFrame(() => { session.renderAt(2); requestAnimationFrame(() => session.renderAt(2)); });
  } catch (error) { message(`Захват не выполнен: ${String(error)}. Перезагрузи страницу перед замерами.`); setBusy(false); }
})(); });

updateScenarioLabels();
updateResults();
