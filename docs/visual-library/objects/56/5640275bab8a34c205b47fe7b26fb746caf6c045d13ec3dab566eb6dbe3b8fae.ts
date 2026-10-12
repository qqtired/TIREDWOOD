/** Проверка файла перед передачей three.js; лаборатория принимает автономные GLB. */
export function validateGlb(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 20 || buffer.byteLength > 20 * 1024 * 1024) throw new Error('Нужен целый GLB до 20 МБ');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) {
    throw new Error('GLB повреждён или сохранён в неподдерживаемом формате');
  }
  let document: Record<string, unknown> | undefined;
  let offset = 12;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw new Error('GLB повреждён: обрезанный блок');
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (length % 4 || offset + 8 + length > buffer.byteLength) throw new Error('GLB повреждён: неверный размер блока');
    if (type === 0x4e4f534a) {
      if (document || offset !== 12 || length > 4 * 1024 * 1024) throw new Error('GLB повреждён: неверное описание модели');
      try {
        const raw: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length)).replace(/\0+$/, ''));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error();
        document = raw as Record<string, unknown>;
      } catch { throw new Error('GLB повреждён: описание модели не читается'); }
    }
    offset += 8 + length;
  }
  if (!document || (document.asset as { version?: unknown } | undefined)?.version !== '2.0') throw new Error('Нужна модель GLB 2.0');
  const required = document.extensionsRequired;
  if (Array.isArray(required) && required.some((name) => name === 'KHR_draco_mesh_compression' || name === 'EXT_meshopt_compression')) {
    throw new Error('Сохрани GLB без сжатия Draco или Meshopt');
  }
  for (const field of ['images', 'buffers'] as const) {
    const entries = document[field];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) throw new Error('GLB повреждён: неверные ресурсы');
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') throw new Error('GLB повреждён: неверный ресурс');
      const uri: unknown = (entry as Record<string, unknown>).uri;
      if (uri === undefined) continue;
      if (typeof uri !== 'string' || !uri.startsWith('data:')) throw new Error('GLB содержит внешние файлы. Сохрани текстуры и геометрию внутри GLB');
      const allowed = field === 'images' ? /^data:image\/(png|jpeg|webp);base64,/i : /^data:application\/(octet-stream|gltf-buffer);base64,/i;
      if (!allowed.test(uri)) throw new Error('Для изображений нужны PNG, JPEG или WebP внутри GLB');
    }
  }
}
