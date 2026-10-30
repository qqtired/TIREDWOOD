/** Фразы «Ракушки» 1.1. Случайность всегда от хоста, чтобы повторять сценарии в тестах. */
export function zatLine(lines: readonly string[], rand: () => number): string {
  return lines[Math.min(lines.length - 1, Math.max(0, Math.floor(rand() * lines.length)))];
}

export const ZAT_RIDDLE_SOLVED = ['Браво!', 'Красиво угадано!', 'Ну голова!'];
export const ZAT_RIDDLE_MISSED = ['Эх, не угадали…', 'Хитро загадано!'];
export const ZAT_WHO_TITLE = ['Вот это да!', 'Кто бы сомневался!'];
export const ZAT_WARM_CORRECT = ['Верно!', 'Молодец!'];
