// Кто я: ключ устройства (по нему сервер узнаёт профиль, пароля нет) и последний ник.
// Если localStorage недоступен (приватный режим), ключ живёт до перезагрузки страницы.

const KEY = 'opus.key';
const NICK = 'opus.nick';
/** Имя из старой версии игры — подставим в поле ника при первом входе */
const OLD_NAME = 'opus.name';

let memoryKey = '';

export function deviceKey(): string {
  const k = read(KEY) ?? memoryKey;
  if (/^[A-Za-z0-9_-]{16,64}$/.test(k)) return k;
  return resetDeviceKey();
}

/** Новый ключ — «другой профиль»: старый профиль на этом устройстве больше не узнается. */
export function resetDeviceKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  const k = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  memoryKey = k;
  write(KEY, k);
  return k;
}

/** Ник последнего удачного входа ('' — на этом устройстве ещё не входили). */
export function savedNick(): string {
  return read(NICK) ?? '';
}

export function saveNick(nick: string): void {
  write(NICK, nick);
}

export function forgetNick(): void {
  try {
    localStorage.removeItem(NICK);
  } catch {
    // ничего
  }
}

/** Подсказка для поля ника: имя из прошлой версии игры. */
export function oldName(): string {
  return read(OLD_NAME) ?? '';
}

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function write(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    // приватный режим — просто не запоминаем
  }
}
