// «Выше облаков»: самостоятельная полоса, общие правила и ограниченный сетевой контракт.
import type { Outfit } from './outfit.ts';
import type { PlayerState } from './sim.ts';

export const SKILL_COURSE = 'sky-islands-v1';
export const SKILL_CAPACITY = 5;
export const SKILL_TOP = 40;
export const SKILL_FALL_Y = 31;
export const SKILL_REJOIN_TICKS = 10 * 60 * 60;
export const SKILL_CHECKPOINTS = Array.from({ length: 9 }, (_, i) => ({ x: i * 30, y: SKILL_TOP, z: 0, yaw: -Math.PI / 2 }));
export const SKILL_SECTIONS = [
  { name: 'Первые облака', hint: 'Разбег, прыжок и широкие островки', color: 0x55cdb4 },
  { name: 'Небесный паром', hint: 'Дождись площадки и проедь над пропастью', color: 0x60bce8 },
  { name: 'Пульс ветра', hint: 'Жёлтый — приготовься. Красный — толчок', color: 0xffb85d },
  { name: 'Точная линия', hint: 'Прыгай по узким островкам зигзагом', color: 0xc09afa },
  { name: 'Две орбиты', hint: 'Перепрыгни вращающиеся перекладины', color: 0xff8dab },
  { name: 'Лифт в небо', hint: 'Поднимись на лифте и спустись по ступеням', color: 0x70cdd1 },
  { name: 'Тающие облака', hint: 'Мигающая площадка скоро опустится', color: 0xebbc6a },
  { name: 'Последний полёт', hint: 'Паром, точный прыжок и последний порыв', color: 0x8db4fd },
] as const;
export interface SkillProgress { checkpoint: number; startedAt: number | null; finishedAt: number | null; falls: number; run: number }
export interface SkillPeer { level: number; id: number; pid: number; nick: string; outfit: Outfit; x: number; y: number; z: number; yaw: number; grounded: number; checkpoint: number; finished: boolean }
export type SkillServerMsg = {
  t: 'skill_state'; course: typeof SKILL_COURSE; tick: number; id: number; ack: number;
  state: PlayerState; reset: number; progress: SkillProgress; peers: SkillPeer[];
};
export interface SkillStatus { n: number; max: number; names: string[]; course: string }
export function skillTime(ticks: number): string {
  const sec = Math.max(0, ticks) / 60;
  return `${Math.floor(sec / 60)}:${(sec % 60).toFixed(2).padStart(5, '0')}`;
}
export function skillMedal(ticks: number, falls: number): string {
  return ticks <= 180 * 60 && falls <= 2 ? 'Золотое облако' : ticks <= 360 * 60 ? 'Серебряное облако' : 'Покоритель неба';
}
