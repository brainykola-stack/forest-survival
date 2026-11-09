/** Классы персонажа: выбор в лобби меняет стиль выживания. */

export type PlayerClass = 'lumberjack' | 'hunter' | 'healer';

export interface ClassDef {
  id: PlayerClass;
  name: string;
  icon: string;
  description: string;
  /** +к древесине за одно успешное рубание. */
  woodBonus: number;
  /** Множитель урона по врагам. */
  damageMult: number;
  /** +к мясу с убитой твари. */
  meatBonus: number;
  /** +к лечению от перевязки. */
  healBonus: number;
  /** Множитель расхода голода (меньше — сытость держится дольше). */
  hungerMult: number;
}

export const CLASSES: Record<PlayerClass, ClassDef> = {
  lumberjack: {
    id: 'lumberjack',
    name: 'Лесоруб',
    icon: '🪓',
    description: 'Дерево даётся легче: +1 древесина за удар. Слабее в бою.',
    woodBonus: 1,
    damageMult: 1,
    meatBonus: 0,
    healBonus: 0,
    hungerMult: 1,
  },
  hunter: {
    id: 'hunter',
    name: 'Охотник',
    icon: '🏹',
    description: '+25% урона и +1 мясо с каждой твари. Лес рубит как все.',
    woodBonus: 0,
    damageMult: 1.25,
    meatBonus: 1,
    healBonus: 0,
    hungerMult: 1,
  },
  healer: {
    id: 'healer',
    name: 'Лекарь',
    icon: '🌿',
    description: 'Перевязки лечат на 20 больше, голод уходит на 20% медленнее.',
    woodBonus: 0,
    damageMult: 1,
    meatBonus: 0,
    healBonus: 20,
    hungerMult: 0.8,
  },
};

export const CLASS_LIST: ClassDef[] = [CLASSES.lumberjack, CLASSES.hunter, CLASSES.healer];

export function classOf(id: string | null | undefined): ClassDef {
  if (id === 'hunter' || id === 'healer' || id === 'lumberjack') return CLASSES[id];
  return CLASSES.lumberjack;
}
