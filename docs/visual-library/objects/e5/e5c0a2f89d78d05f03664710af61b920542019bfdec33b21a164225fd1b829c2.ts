export const MAX_BUNDLE_BYTES = 512 * 1024 * 1024;
export function checkBundleSize(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_BUNDLE_BYTES) {
    throw new Error('Полная копия больше 512 МБ. Уменьши изображения или модели перед переносом');
  }
}
