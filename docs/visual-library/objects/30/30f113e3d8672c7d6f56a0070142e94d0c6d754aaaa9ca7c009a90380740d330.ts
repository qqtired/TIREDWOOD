// Иконки интерфейса (Codex imagegen, client/assets/ui/icons/PROVENANCE.md). Нет файла — ''.
const FILES = import.meta.glob('../../assets/ui/icons/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const BY_ID = new Map<string, string>();
for (const [p, url] of Object.entries(FILES)) BY_ID.set(p.slice(p.lastIndexOf('/') + 1, -5), url);
export function uiIcon(id: string): string { return BY_ID.get(id) ?? ''; }
