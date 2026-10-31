// Интерфейс 3.0 «Веранда v3» (docs/ui3/brief.md): новый HUD и вывески в мире — флаг сервера UI3, только явная 1, даже в dev.
// Сервер читает process.env.UI3 и отдаёт его в /health (ui: 3); браузер — globalThis.__opusUi (ставит client/layout-boot.ts
// до import() игры, как раскладку площади). Выключен — игра ровно как раньше: HUD «Светлый», вывески прежние.
type G = { __opusUi?: unknown; process?: { env?: Record<string, string | undefined> } };
const g = globalThis as G;
export const UI3: boolean = g.__opusUi === 3 || g.process?.env?.UI3 === '1';
