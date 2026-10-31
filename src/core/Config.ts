/** Общие константы мира, баланс и описание зон. */

export const WORLD_SIZE = 400;
export const TERRAIN_SEGMENTS = 160;
export const TOTAL_NIGHTS = 99;

export const PLAYER = {
  height: 1.72,
  radius: 0.34,
  walkSpeed: 4.4,
  runSpeed: 8.0,
  accel: 42,
  friction: 12,
  jumpSpeed: 6.4,
  gravity: 22,
  maxHealth: 100,
  maxHunger: 100,
  maxStamina: 100,
  interactRange: 3.4,
};

export const TIME = {
  daySeconds: 300,
  nightSeconds: 200,
  dawnSeconds: 26,
  duskSeconds: 34,
};

export const BUILD_SNAP = 2.0;

export interface ZoneDef {
  id: string;
  name: string;
  cx: number;
  cz: number;
  radius: number;
  danger: number;
  trees: number;
  rocks: number;
  bushes: number;
  fogColor: number;
  groundTint: number;
  description: string;
}

/** Зоны мира. Координаты в метрах, карта от -200 до +200. */
export const ZONES: ZoneDef[] = [
  {
    id: 'start',
    name: 'Начальный лес',
    cx: 0,
    cz: 0,
    radius: 62,
    danger: 0,
    trees: 0.75,
    rocks: 0.35,
    bushes: 0.9,
    fogColor: 0x6d8a72,
    groundTint: 0x4a5b3a,
    description: 'Редкий светлый лес. Здесь безопасно днём.',
  },
  {
    id: 'valley',
    name: 'Лесная долина',
    cx: -30,
    cz: -128,
    radius: 72,
    danger: 1,
    trees: 0.95,
    rocks: 0.3,
    bushes: 1.0,
    fogColor: 0x5f7a68,
    groundTint: 0x40543a,
    description: 'Густая долина с ручьём и старыми тропами.',
  },
  {
    id: 'rocky',
    name: 'Каменистая местность',
    cx: 124,
    cz: 66,
    radius: 66,
    danger: 2,
    trees: 0.28,
    rocks: 1.5,
    bushes: 0.45,
    fogColor: 0x6b6f74,
    groundTint: 0x5a5a52,
    description: 'Голые скалы, ветер и каменные осыпи.',
  },
  {
    id: 'camp',
    name: 'Заброшенный лагерь',
    cx: 118,
    cz: -96,
    radius: 56,
    danger: 2,
    trees: 0.55,
    rocks: 0.4,
    bushes: 0.8,
    fogColor: 0x62705c,
    groundTint: 0x4b5238,
    description: 'Чужие палатки и следы тех, кто не вернулся.',
  },
  {
    id: 'village',
    name: 'Старая деревня',
    cx: -122,
    cz: -54,
    radius: 66,
    danger: 3,
    trees: 0.45,
    rocks: 0.4,
    bushes: 0.6,
    fogColor: 0x5c6658,
    groundTint: 0x4e4a38,
    description: 'Пустые дома и колодец. Днём тихо, ночью — нет.',
  },
  {
    id: 'swamp',
    name: 'Болото',
    cx: -46,
    cz: 128,
    radius: 64,
    danger: 3,
    trees: 0.6,
    rocks: 0.25,
    bushes: 1.1,
    fogColor: 0x4f5f52,
    groundTint: 0x3b4432,
    description: 'Топь, туман и странные звуки в камышах.',
  },
  {
    id: 'deep',
    name: 'Глубокий тёмный лес',
    cx: 44,
    cz: 150,
    radius: 66,
    danger: 4,
    trees: 1.35,
    rocks: 0.5,
    bushes: 0.7,
    fogColor: 0x333d38,
    groundTint: 0x2c3529,
    description: 'Здесь почти не бывает солнца. Обиталище Оленя.',
  },
];

export function zoneAt(x: number, z: number): ZoneDef {
  let best = ZONES[0];
  let bestD = Infinity;
  for (const z0 of ZONES) {
    const d = Math.hypot(x - z0.cx, z - z0.cz) - z0.radius;
    if (d < bestD) {
      bestD = d;
      best = z0;
    }
  }
  return best;
}

/** Опасность по ночам: 0..4, растёт с номером ночи. */
export function dangerForNight(night: number): number {
  if (night <= 2) return 0.6;
  if (night <= 5) return 1;
  if (night <= 12) return 1.6;
  if (night <= 25) return 2.2;
  if (night <= 45) return 2.8;
  if (night <= 70) return 3.4;
  return 4;
}

export function maxEnemiesForNight(night: number): number {
  return Math.min(2 + Math.floor(night / 6), 11);
}
