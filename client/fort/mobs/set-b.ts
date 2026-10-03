// Модели набора B — список заполняет помощник mobs-b (каждая модель — свой файл в этой папке).
// Липучка, Пузырь, Крылатка, Щитоносец — по два внешних варианта на вид (доля — weight).
import type { MobDef } from './kit.ts';
import { bloaterPuffer } from './bloater-puffer.ts';
import { bloaterToad } from './bloater-toad.ts';
import { climberGecko } from './climber-gecko.ts';
import { climberSpider } from './climber-spider.ts';
import { flyerBat } from './flyer-bat.ts';
import { flyerCrow } from './flyer-crow.ts';
import { shieldBeaver } from './shield-beaver.ts';
import { shieldTurtle } from './shield-turtle.ts';

export const MOBS_B: MobDef[] = [climberSpider, climberGecko, flyerBat, flyerCrow, bloaterPuffer, bloaterToad, shieldTurtle, shieldBeaver];
