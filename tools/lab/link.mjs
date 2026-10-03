// Ссылка владельца для локального сервера: node tools/lab/link.mjs [DATA_DIR] [адрес]
// Читает DATA_DIR/lab-key (ключ создаёт сервер при старте с LAB=1, в dev он включён) и печатает ссылку
// вида http://127.0.0.1:5190/lab/#key=... Ключ — секрет: ссылку печатает только этот скрипт, больше он нигде не светится.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? process.env.DATA_DIR;
if (!dir) {
  console.error('Укажи папку данных сервера: node tools/lab/link.mjs <DATA_DIR> [адрес] (или переменная DATA_DIR).');
  process.exit(1);
}
const base = (process.argv[3] ?? `http://127.0.0.1:${process.env.PORT ?? 5190}`).replace(/\/+$/, '');
const file = path.join(dir, 'lab-key');
let key = '';
try {
  key = readFileSync(file, 'utf8').trim();
} catch {
  console.error(`Нет файла ${file}: запусти сервер с LAB=1 (в dev он включён) и повтори.`);
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) {
  console.error('Ключ в файле выглядит неправильно (нужно 32–128 знаков: латиница, цифры, - и _). Удали файл и перезапусти сервер: он создаст новый.');
  process.exit(1);
}
console.log(`${base}/lab/#key=${key}`);
