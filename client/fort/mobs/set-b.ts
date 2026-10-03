// Модели набора B — список заполняет помощник mobs-b (каждая модель — свой файл в этой папке).
// Липучка, Пузырь, Крылатка, Щитоносец — по два внешних варианта на вид (доля — weight).
import type { MobDef } from './kit.ts';
import { climberGecko } from './climber-gecko.ts';
import { climberSpider } from './climber-spider.ts';

export const MOBS_B: MobDef[] = [climberSpider, climberGecko];
