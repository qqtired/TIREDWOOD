// Лаборатория (/lab): правила решений владельца — общие для сервера и страницы. Без DOM и three.js.

/** Идея → прототип → на тесте → берём / доработать / не берём. */
export const LAB_STATUSES = ['idea', 'prototype', 'testing', 'take', 'rework', 'skip'] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];

export const LAB_STATUS_LABEL: Record<LabStatus, string> = {
  idea: 'Идея',
  prototype: 'Прототип',
  testing: 'На тесте',
  take: 'Берём',
  rework: 'Доработать',
  skip: 'Не берём',
};

/** Решённые: для них ждать нечего. */
export const LAB_DECIDED: readonly LabStatus[] = ['take', 'rework', 'skip'];

export const LAB_ID_MAX = 40;
export const LAB_NOTE_MAX = 600;
export const LAB_TITLE_MAX = 80;
/** Сколько решений держит сервер (по числу идей с запасом) и сколько последних изменений помнит журнал. */
export const LAB_MAX_DECISIONS = 200;
export const LAB_LOG_MAX = 200;
/** Ключ владельца едет только этим заголовком (никогда в адресе). */
export const LAB_KEY_HEADER = 'x-lab-key';
export const LAB_BODY_MAX = 4096;

export interface LabDecision {
  /** Название на момент записи — чтобы lab.json читался без реестра. */
  title: string;
  status: LabStatus;
  note: string;
  /** Когда решение записано, ISO. */
  at: string;
}

export interface LabLogEntry {
  id: string;
  from: LabStatus | null;
  to: LabStatus | 'reset';
  at: string;
}

/** Содержимое DATA_DIR/lab.json. */
export interface LabFile {
  version: 1;
  updatedAt: string;
  decisions: Record<string, LabDecision>;
  log: LabLogEntry[];
}

export function isLabStatus(v: unknown): v is LabStatus {
  return typeof v === 'string' && (LAB_STATUSES as readonly string[]).includes(v);
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isLabId(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= LAB_ID_MAX && ID_RE.test(v);
}

// управляющие, нулевой ширины и направления письма — как в sanitizeChat, но перевод строки (\n) оставляем
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Режет по символам, а не по парам UTF-16: эмодзи не ломается пополам. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return Array.from(s).slice(0, max).join('');
}

/** Заметка владельца: текст до LAB_NOTE_MAX, абзацы сохраняются, лишние пробелы и пустые строки — нет. */
export function cleanNote(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return clip(s, LAB_NOTE_MAX).trim();
}

/** Название одной строкой до LAB_TITLE_MAX. */
export function cleanTitle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return clip(raw.normalize('NFC').replace(CONTROL, '').replace(/\s+/g, ' ').trim(), LAB_TITLE_MAX).trim();
}

export function emptyLabFile(at: string): LabFile {
  return { version: 1, updatedAt: at, decisions: {}, log: [] };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isoOr = (v: unknown, fallback: string): string => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fallback);

/**
 * Приводит прочитанное из файла к LabFile: лишнее и испорченное выбрасывается, а не роняет сервер.
 * Файл могли поправить руками, поэтому каждое поле проверяется заново.
 */
export function normalizeLabFile(raw: unknown, now: string): LabFile {
  const out = emptyLabFile(now);
  if (!isRecord(raw)) return out;
  out.updatedAt = isoOr(raw.updatedAt, now);
  if (isRecord(raw.decisions)) {
    for (const [id, d] of Object.entries(raw.decisions)) {
      if (!isLabId(id) || !isRecord(d) || !isLabStatus(d.status)) continue;
      if (Object.keys(out.decisions).length >= LAB_MAX_DECISIONS) break;
      out.decisions[id] = { title: cleanTitle(d.title) || id, status: d.status, note: cleanNote(d.note), at: isoOr(d.at, out.updatedAt) };
    }
  }
  if (Array.isArray(raw.log)) {
    for (const e of raw.log.slice(-LAB_LOG_MAX)) {
      if (!isRecord(e) || !isLabId(e.id)) continue;
      const from = e.from === null || e.from === undefined ? null : isLabStatus(e.from) ? e.from : undefined;
      const to = e.to === 'reset' ? 'reset' : isLabStatus(e.to) ? e.to : undefined;
      if (from === undefined || to === undefined) continue;
      out.log.push({ id: e.id, from, to, at: isoOr(e.at, out.updatedAt) });
    }
  }
  return out;
}
