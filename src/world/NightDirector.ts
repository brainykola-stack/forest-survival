import type { EnemyKind } from '../enemies/Enemy';

/**
 * Особая ночь: набор правил, который меняет матч.
 * Обычные ночи получают нейтральный модификатор, а сложность растёт отдельно.
 */
export interface NightModifier {
  id: string;
  title: string;
  subtitle: string;
  enemyBonus: number;
  speedFactor: number;
  damageFactor: number;
  fog: number;
  fireDrain: number;
  nightScale: number;
  spawnNearCamp: boolean;
  guaranteed: EnemyKind[];
}

const NEUTRAL: NightModifier = {
  id: 'normal',
  title: '',
  subtitle: '',
  enemyBonus: 0,
  speedFactor: 1,
  damageFactor: 1,
  fog: 0,
  fireDrain: 1,
  nightScale: 1,
  spawnNearCamp: false,
  guaranteed: [],
};

/** Особые ночи: каждая десятая ломает привычный уклад. */
const SPECIAL: Record<number, Omit<NightModifier, 'id'>> = {
  10: {
    title: 'НОЧЬ СТАИ',
    subtitle: 'Волки идут вместе. Их больше, чем обычно.',
    enemyBonus: 2,
    speedFactor: 1.05,
    damageFactor: 1,
    fog: 0.002,
    fireDrain: 1,
    nightScale: 1,
    spawnNearCamp: false,
    guaranteed: ['hunter', 'hunter'],
  },
  20: {
    title: 'ГОЛОДНЫЙ ЛЕС',
    subtitle: 'Даже костёр не кажется защитой. Урон выше.',
    enemyBonus: 1,
    speedFactor: 1.05,
    damageFactor: 1.3,
    fog: 0.003,
    fireDrain: 1.1,
    nightScale: 1,
    spawnNearCamp: false,
    guaranteed: ['hunter'],
  },
  30: {
    title: 'ТИХАЯ ОХОТА',
    subtitle: 'Олень вышел из глубины леса.',
    enemyBonus: 1,
    speedFactor: 1.1,
    damageFactor: 1.1,
    fog: 0.004,
    fireDrain: 1,
    nightScale: 1,
    spawnNearCamp: false,
    guaranteed: ['deer'],
  },
  40: {
    title: 'КРОВАВАЯ ЛУНА',
    subtitle: 'Свет ушёл. Твари бьют втрое злее.',
    enemyBonus: 2,
    speedFactor: 1.1,
    damageFactor: 1.45,
    fog: 0.006,
    fireDrain: 1.2,
    nightScale: 1,
    spawnNearCamp: false,
    guaranteed: ['bog'],
  },
  50: {
    title: 'ДОЛГАЯ НОЧЬ',
    subtitle: 'Эта ночь длится в полтора раза дольше.',
    enemyBonus: 1,
    speedFactor: 1,
    damageFactor: 1.15,
    fog: 0.004,
    fireDrain: 1.3,
    nightScale: 1.6,
    spawnNearCamp: false,
    guaranteed: ['crawler', 'crawler'],
  },
  60: {
    title: 'ГУСТОЙ ТУМАН',
    subtitle: 'Видно на пару шагов. Тварей больше.',
    enemyBonus: 2,
    speedFactor: 0.95,
    damageFactor: 1.2,
    fog: 0.014,
    fireDrain: 1.1,
    nightScale: 1.1,
    spawnNearCamp: false,
    guaranteed: ['crawler'],
  },
  70: {
    title: 'ОСАДА',
    subtitle: 'Они приходят прямо к лагерю.',
    enemyBonus: 3,
    speedFactor: 1.05,
    damageFactor: 1.25,
    fog: 0.006,
    fireDrain: 1.2,
    nightScale: 1,
    spawnNearCamp: true,
    guaranteed: ['hunter', 'bog'],
  },
  80: {
    title: 'ХОЛОД',
    subtitle: 'Огонь пожирает топливо вдвое быстрее.',
    enemyBonus: 1,
    speedFactor: 1.1,
    damageFactor: 1.25,
    fog: 0.008,
    fireDrain: 2,
    nightScale: 1.2,
    spawnNearCamp: false,
    guaranteed: ['deer'],
  },
  90: {
    title: 'ПОСЛЕДНИЙ РУБЕЖ',
    subtitle: 'Лес высылает всё, что у него есть.',
    enemyBonus: 3,
    speedFactor: 1.15,
    damageFactor: 1.35,
    fog: 0.01,
    fireDrain: 1.4,
    nightScale: 1.3,
    spawnNearCamp: true,
    guaranteed: ['deer', 'hunter', 'hunter'],
  },
  99: {
    title: 'ХОЗЯИН ЛЕСА',
    subtitle: 'Последняя ночь. Он пришёл лично.',
    enemyBonus: 2,
    speedFactor: 1.15,
    damageFactor: 1.4,
    fog: 0.012,
    fireDrain: 1.5,
    nightScale: 1.5,
    spawnNearCamp: false,
    guaranteed: ['deer'],
  },
};

export class NightDirector {
  /** Модификатор для конкретной ночи (1..99). */
  forNight(night: number): NightModifier {
    const special = SPECIAL[night];
    if (special) return { id: `night-${night}`, ...special };
    return { ...NEUTRAL, guaranteed: [] };
  }

  isSpecial(night: number): boolean {
    return SPECIAL[night] !== undefined;
  }

  /** Краткая подсказка игроку заранее: «следующая ночь особенная». */
  upcomingSpecial(night: number): NightModifier | null {
    for (let n = night + 1; n <= Math.min(night + 10, 99); n++) {
      const m = SPECIAL[n];
      if (m) return { id: `night-${n}`, ...m };
    }
    return null;
  }
}
