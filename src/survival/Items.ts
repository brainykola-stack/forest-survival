/** Каталог предметов: ресурсы, инструменты, оружие, еда, лекарства, сюжет. */

export type ItemId =
  | 'wood'
  | 'stone'
  | 'fiber'
  | 'berry'
  | 'meat'
  | 'herb'
  | 'metal'
  | 'relic'
  | 'axe'
  | 'pickaxe'
  | 'spear'
  | 'rifle'
  | 'bullet'
  | 'torch'
  | 'bandage'
  | 'note'
  | 'key'
  | 'charm';

export type ItemCategory = 'resource' | 'tool' | 'weapon' | 'food' | 'medicine' | 'story';

export interface ItemDef {
  id: ItemId;
  name: string;
  category: ItemCategory;
  icon: string;
  maxStack: number;
  description: string;
  tool?: 'axe' | 'pickaxe';
  damage?: number;
  heal?: number;
  hunger?: number;
  light?: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  wood: {
    id: 'wood',
    name: 'Древесина',
    category: 'resource',
    icon: '🪵',
    maxStack: 40,
    description: 'Сучья и поленья. Основа любого костра и постройки.',
  },
  stone: {
    id: 'stone',
    name: 'Камень',
    category: 'resource',
    icon: '🪨',
    maxStack: 40,
    description: 'Обломки породы. Нужен для инструментов и укреплений.',
  },
  fiber: {
    id: 'fiber',
    name: 'Волокно',
    category: 'resource',
    icon: '🌿',
    maxStack: 40,
    description: 'Гибкие стебли. Из них вьют верёвки и растопку.',
  },
  berry: {
    id: 'berry',
    name: 'Ягоды',
    category: 'food',
    icon: '🫐',
    maxStack: 20,
    description: 'Кислые лесные ягоды. Немного утоляют голод.',
    hunger: 12,
  },
  meat: {
    id: 'meat',
    name: 'Мясо',
    category: 'food',
    icon: '🍖',
    maxStack: 10,
    description: 'Сырое мясо. Лучше приготовить, но можно съесть и так.',
    hunger: 22,
    heal: 3,
  },
  herb: {
    id: 'herb',
    name: 'Травы',
    category: 'medicine',
    icon: '🌱',
    maxStack: 20,
    description: 'Горькие целебные травы. Основа для перевязки.',
    heal: 4,
  },
  metal: {
    id: 'metal',
    name: 'Металл',
    category: 'resource',
    icon: '⚙️',
    maxStack: 20,
    description: 'Ржавые детали со свалок и заброшенных построек.',
  },
  relic: {
    id: 'relic',
    name: 'Диковина',
    category: 'story',
    icon: '🔮',
    maxStack: 5,
    description: 'Странный предмет, оставленный в лесу. Пахнет дымом.',
  },
  axe: {
    id: 'axe',
    name: 'Топор',
    category: 'tool',
    icon: '🪓',
    maxStack: 1,
    description: 'Вален для дерева. Добывает древесину быстрее и щедрее.',
    tool: 'axe',
    damage: 14,
  },
  pickaxe: {
    id: 'pickaxe',
    name: 'Кирка',
    category: 'tool',
    icon: '⛏️',
    maxStack: 1,
    description: 'Пробивает камень и ржавые обломки.',
    tool: 'pickaxe',
    damage: 12,
  },
  spear: {
    id: 'spear',
    name: 'Копьё',
    category: 'weapon',
    icon: '🗡️',
    maxStack: 1,
    description: 'Оружие против тех, кто охотится ночью.',
    damage: 34,
  },
  rifle: {
    id: 'rifle',
    name: 'Ружьё',
    category: 'weapon',
    icon: '🔫',
    maxStack: 1,
    description: 'Дробовик из металла и дерева. Бьёт далеко и больно, но требует патронов.',
    damage: 55,
  },
  bullet: {
    id: 'bullet',
    name: 'Патроны',
    category: 'resource',
    icon: '🧨',
    maxStack: 30,
    description: 'Самокрутные патроны. Один выстрел — один патрон.',
  },
  torch: {
    id: 'torch',
    name: 'Факел',
    category: 'tool',
    icon: '🔥',
    maxStack: 1,
    description: 'Держит свет в темноте. Немного отпугивает мелких тварей.',
    light: true,
    damage: 8,
  },
  bandage: {
    id: 'bandage',
    name: 'Перевязка',
    category: 'medicine',
    icon: '🩹',
    maxStack: 10,
    description: 'Останавливает кровь и восстанавливает здоровье.',
    heal: 30,
  },
  note: {
    id: 'note',
    name: 'Записка',
    category: 'story',
    icon: '📜',
    maxStack: 10,
    description: 'Кто-то писал это в спешке.',
  },
  key: {
    id: 'key',
    name: 'Старый ключ',
    category: 'story',
    icon: '🗝️',
    maxStack: 1,
    description: 'Ключ от чего-то, что ещё нужно найти.',
  },
  charm: {
    id: 'charm',
    name: 'Оберег',
    category: 'story',
    icon: '🧿',
    maxStack: 1,
    description: 'Детская поделка. От неё становится спокойнее.',
  },
};

export const RESOURCE_ITEMS: ItemId[] = ['wood', 'stone', 'fiber', 'berry', 'herb', 'metal', 'relic'];

export function itemDef(id: string): ItemDef {
  const def = ITEMS[id as ItemId];
  if (!def) throw new Error(`Unknown item: ${id}`);
  return def;
}
