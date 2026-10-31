// Что «Общее» включено на сервере (флаг SOCIAL, shared/social.ts): пишет client/ui/social.ts, читают меню Esc, Tab крепости
// и клавиши. Отдельный файл без DOM и Vite-импортов — его могут грузить тесты в Node.
export const socialState = { on: false, quiz: false };
