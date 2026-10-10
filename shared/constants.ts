// Общие константы симуляции. Сервер и клиент считают по одним и тем же числам,
// поэтому предсказание движения на клиенте совпадает с сервером бит в бит.

// 14 — новая «Крепость»: другой снимок орды и хвост арсенала, карточки волн, рекорды (старые вкладки перезагрузятся)
// 15 — вываживание: другая модель шкалы (рыба в 2–98 %, натяжение лески, водка), оценки улова вместо «идеально»
// 16 — ферма: комната farm, сообщения farm/farmMe/farmPlot/farmRoster/farmEv/farmSt, калитка на площади
export const PROTOCOL_VERSION = 16;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const TICK_MS = 1000 / TICK_RATE;

// Тело игрока: коллизия — вертикальный параллелепипед (AABB)
export const PLAYER_HALF = 0.42;
export const PLAYER_HEIGHT = 1.6;
export const EYE_HEIGHT = 1.42;
export const STEP_HEIGHT = 0.52;

// Хитбокс (эллипсоид), чуть щедрее коллизии
export const HITBOX_RX = 0.52;
export const HITBOX_RY = 0.82;
export const HITBOX_CY = 0.8; // центр над ступнями
export const HEADSHOT_Y = 1.14; // попадание выше этой высоты — в голову

// Движение
export const RUN_SPEED = 8.4;
export const ADS_SPEED = 5.2;
// 1 - exp(-20/60): плавный, но быстрый разгон и торможение на земле.
// Записано литералом, чтобы не зависеть от реализации Math.exp в разных движках.
export const GROUND_BLEND = 0.28346868942621073;
export const AIR_ACCEL = 34;
export const MAX_AIR_SPEED = 19;
export const GRAVITY = 24;
export const JUMP_VELOCITY = 8.6;
export const COYOTE_TICKS = 7;
export const JUMP_BUFFER_TICKS = 7;
export const DASH_SPEED = 18.5;
export const DASH_TICKS = 10;
export const DASH_COOLDOWN_TICKS = 78;
export const DASH_EXIT_SPEED = 11;
export const TRAMPOLINE_VELOCITY = 16.8;

// Вода вокруг причала
export const WATER_Y = -1.25;
export const DROWN_Y = -1.55;

// Бой
export const BASE_HEALTH = 100;
export const ARMOR_ABSORB = 0.5;
export const RESPAWN_TICKS = 126;
export const SPAWN_PROTECT_TICKS = 96;
// Откат целей при выстреле: до 400 мс, чтобы попадания засчитывались и у тех, кто играет через VPN
// (пинг ~250 мс + задержка интерполяции). История хранит 64 тика — с запасом.
export const MAX_REWIND_TICKS = 24;
export const HISTORY_TICKS = 64;
export const ASSIST_WINDOW_TICKS = 300;

// Раунд
export const WARMUP_TICKS = 7 * TICK_RATE;
export const ROUND_TICKS = 5 * 60 * TICK_RATE;
export const END_TICKS = 9 * TICK_RATE;
export const SCORE_LIMIT = 50;

// Банки варенья: лечат
export const JAM_HEAL = 45;
export const JAM_RESPAWN_TICKS = 22 * TICK_RATE;
export const JAM_RADIUS = 1.1;

// Отхил: 5 с без урона — здоровье само растёт до максимума (с бонусом автомата), броня — нет
export const REGEN_DELAY_TICKS = 5 * TICK_RATE;
export const REGEN_PER_SEC = 5;

// Снайперская AWP на верху центрального креста «Причала»: подбирают только люди (заходят в неё),
// выстрелы и темп — в sim.ts; ушла из рук (кончилась, лопнул, вышел) — вернётся на крест через 45 с
export const AWP_RADIUS = 0.9;
export const AWP_RESPAWN_TICKS = 45 * TICK_RATE;

export const MAX_NAME = 16;
export const MAX_CHAT = 140;
export const MAX_HUMANS = 16;

export const TEAM_NAMES = ['Черника', 'Мандарин'] as const;
export const TEAM_COLORS = [0x4a63ff, 0xff8a1c] as const;
export const TEAM_CSS = ['#4a63ff', '#ff8a1c'] as const;

export const PHASE_WARMUP = 0;
export const PHASE_PLAY = 1;
export const PHASE_END = 2;

/** Имена ботов пейнтбола (заняты: людям их брать нельзя) */
export const BOT_NAMES = [
  'Пудинг', 'Мармелад', 'Зефир', 'Холодец', 'Кисель', 'Панакота', 'Суфле', 'Джем',
  'Желешка', 'Мусс', 'Пастила', 'Щербет', 'Компот', 'Нуга', 'Ирис', 'Сгущёнка',
];
