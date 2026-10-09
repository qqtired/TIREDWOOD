// Идеи без живого превью, по категориям. Новая идея — одна запись в файле нужной категории (или новый файл и строка здесь).
import type { Idea } from '../types.ts';
import { ANIMAL_IDEAS } from './animals.ts';
import { COMFORT_IDEAS } from './comfort.ts';
import { EVENT_IDEAS } from './events.ts';
import { MODE_IDEAS } from './modes.ts';
import { OUTFIT_IDEAS } from './outfit.ts';
import { SOCIAL_IDEAS } from './social.ts';
import { WORLD_IDEAS } from './world.ts';
import { RESEARCH_IDEAS } from './research.ts';

export const IDEAS: readonly Idea[] = [...MODE_IDEAS, ...WORLD_IDEAS, ...ANIMAL_IDEAS, ...OUTFIT_IDEAS, ...SOCIAL_IDEAS, ...EVENT_IDEAS, ...COMFORT_IDEAS, ...RESEARCH_IDEAS];
