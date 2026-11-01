// Новый вид элиток «Крепости» (с FORT50): рост ELITE_SCALE, аура, без кольца-пояса. Включает сервер — поле elite
// сообщения fideas (вызов setEliteEnabled подключает client/fort/match.ts). Без вызова — старый вид: кольцо, чемпион ×1,12.
// Для своей проверки — адрес с ?elite=1 (только в npm run dev или с ?debug).

let enabled = false;
const override = devOverride();

function devOverride(): boolean {
  if (typeof location === 'undefined') return false;
  const p = new URLSearchParams(location.search);
  const dev = import.meta.env?.DEV === true || p.has('debug');
  return dev && p.get('elite') === '1';
}

export function setEliteEnabled(on: boolean): void {
  enabled = on;
}

export function eliteEnabled(): boolean {
  return enabled || override;
}
