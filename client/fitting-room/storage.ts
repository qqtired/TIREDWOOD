import type { FittingProject } from '../../shared/fitting-room.ts';
import { normalizeProject } from './state.ts';
import { validateGlb } from './glb.ts';
import { parsePreviewGlb, disposePreviewGlb } from './glb-preview.ts';
import { checkBundleSize, MAX_BUNDLE_BYTES } from './bundle.ts';

interface StoredAsset { id: string; name: string; blob: Blob }
interface PackedAsset { id: string; name: string; data: string }
export interface FittingBundle { format: 'tiredwood-fitting-room'; project: FittingProject; assets: PackedAsset[] }
const builtinReference = new URL('./assets/harbor-beanie.png', import.meta.url).href;
const urls = new Map<string, string>();
let opening: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('tiredwood-fitting-room-v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('assets', { keyPath: 'id' });
      request.result.createObjectStore('projects');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = undefined; reject(new Error('Браузер не разрешил локальное сохранение')); };
    request.onblocked = () => reject(new Error('Закрой другую вкладку примерочной и обнови эту'));
  });
  return opening;
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error('Не хватило места для локального сохранения. Скачай копию проекта'));
  });
}
export async function loadProject(): Promise<FittingProject | undefined> {
  const db = await database();
  const raw: unknown = await result(db.transaction('projects').objectStore('projects').get('current'));
  return raw === undefined ? undefined : normalizeProject(raw);
}
export async function saveProject(project: FittingProject): Promise<void> {
  const db = await database();
  const transaction = db.transaction('projects', 'readwrite');
  const done = complete(transaction);
  transaction.objectStore('projects').put(project, 'current');
  await done;
}
export async function saveAsset(file: File): Promise<string> {
  const id = crypto.randomUUID();
  const db = await database();
  const transaction = db.transaction('assets', 'readwrite');
  const done = complete(transaction);
  transaction.objectStore('assets').put({ id, name: file.name, blob: file } satisfies StoredAsset);
  await done;
  return `local:${id}`;
}
export async function readAsset(path: string): Promise<StoredAsset> {
  if (!path.startsWith('local:')) throw new Error('Это встроенный файл');
  const db = await database();
  const record = await result<StoredAsset | undefined>(db.transaction('assets').objectStore('assets').get(path.slice(6)));
  if (!record) throw new Error('Файл этой вещи не найден. Загрузите полную копию проекта');
  return record;
}
export function blobData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Файл не удалось прочитать'));
    reader.readAsDataURL(blob);
  });
}
export async function imageUrl(path: string): Promise<string> {
  if (path === 'assets/harbor-beanie.png') return builtinReference;
  if (!path.startsWith('local:')) return path;
  if (urls.has(path)) return urls.get(path)!;
  const asset = await readAsset(path);
  const url = await blobData(asset.blob);
  urls.set(path, url);
  return url;
}
export async function exportBundle(project: FittingProject): Promise<Blob> {
  const paths = new Set(project.items.flatMap((item) => [item.reference, item.asset]).filter((path): path is string => Boolean(path?.startsWith('local:'))));
  const assets: PackedAsset[] = [];
  let estimated = new Blob([JSON.stringify(project)]).size + 1024;
  for (const path of paths) {
    const asset = await readAsset(path);
    estimated += Math.ceil(asset.blob.size / 3) * 4 + asset.name.length * 4 + 256;
    checkBundleSize(estimated);
    assets.push({ id: asset.id, name: asset.name, data: await blobData(asset.blob) });
  }
  const file = new Blob([JSON.stringify({ format: 'tiredwood-fitting-room', project, assets } satisfies FittingBundle)], { type: 'application/json' });
  checkBundleSize(file.size);
  return file;
}
export async function importBundle(file: File): Promise<FittingProject> {
  checkBundleSize(file.size);
  let raw: unknown;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error('Проект не читается: нужен JSON, скачанный из примерочной'); }
  const bundle = raw as Partial<FittingBundle> | null;
  if (!bundle || bundle.format !== 'tiredwood-fitting-room' || !Array.isArray(bundle.assets)) throw new Error('Нужна полная копия проекта примерочной');
  const project = normalizeProject(bundle.project);
  const assets: StoredAsset[] = [];
  const seen = new Set<string>();
  for (const asset of bundle.assets) {
    if (!asset || typeof asset.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(asset.id) || seen.has(asset.id) || typeof asset.name !== 'string' || typeof asset.data !== 'string') throw new Error('В проекте повреждён список файлов');
    seen.add(asset.id);
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(asset.data);
    if (!match || !['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary', 'application/octet-stream'].includes(match[1])) throw new Error('В проекте есть неподдерживаемый файл');
    let bytes: Uint8Array;
    if (asset.data.length > Math.min(MAX_BUNDLE_BYTES, 29 * 1024 * 1024)) throw new Error('Один из файлов больше 20 МБ');
    try { bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)); } catch { throw new Error('В проекте повреждён файл'); }
    if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('Один из файлов больше 20 МБ');
    const model = project.items.some((item) => item.asset === `local:${asset.id}`);
    if (model) {
      const data = bytes.buffer as ArrayBuffer;
      validateGlb(data);
      // Тот же загрузчик, что в сцене: готовность файла проверяется до записи проекта.
      const root = await parsePreviewGlb(data);
      disposePreviewGlb(root);
    }
    else if (!match[1].startsWith('image/')) throw new Error('Для референсов нужны изображения');
    assets.push({ id: asset.id, name: asset.name.slice(0, 200), blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: match[1] }) });
  }
  for (const item of project.items) for (const path of [item.reference, item.asset]) {
    if (path?.startsWith('local:') && !seen.has(path.slice(6))) throw new Error('В копии проекта не хватает файлов');
  }
  // Метаданные и файлы заменяются одной транзакцией, только после проверки всего пакета.
  const db = await database();
  const transaction = db.transaction(['assets', 'projects'], 'readwrite');
  const done = complete(transaction);
  for (const asset of assets) transaction.objectStore('assets').put(asset);
  transaction.objectStore('projects').put(project, 'current');
  await done;
  urls.clear();
  return project;
}
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
