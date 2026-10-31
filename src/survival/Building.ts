import type { ItemId } from './Items';

export type BuildKind = 'wall' | 'floor' | 'door' | 'fence' | 'chest' | 'workbench' | 'torchPost' | 'campfire';

export interface BuildDef {
  kind: BuildKind;
  name: string;
  icon: string;
  cost: Partial<Record<ItemId, number>>;
  size: { x: number; y: number; z: number };
  description: string;
  hasCollision: boolean;
  needsWorkbench?: boolean;
}

export const BUILD_DEFS: Record<BuildKind, BuildDef> = {
  wall: {
    kind: 'wall',
    name: 'Стена',
    icon: '🧱',
    cost: { wood: 4, fiber: 1 },
    size: { x: 2, y: 2.4, z: 0.2 },
    description: 'Закрывает проход и держит зверя снаружи.',
    hasCollision: true,
  },
  floor: {
    kind: 'floor',
    name: 'Пол',
    icon: '▭',
    cost: { wood: 3 },
    size: { x: 2, y: 0.15, z: 2 },
    description: 'Ровная площадка для построек.',
    hasCollision: true,
  },
  door: {
    kind: 'door',
    name: 'Дверь',
    icon: '🚪',
    cost: { wood: 5, metal: 1 },
    size: { x: 2, y: 2.4, z: 0.2 },
    description: 'Открывается по E. Задерживает непрошеных гостей.',
    hasCollision: true,
  },
  fence: {
    kind: 'fence',
    name: 'Забор',
    icon: '🪵',
    cost: { wood: 2 },
    size: { x: 2, y: 1.1, z: 0.14 },
    description: 'Лёгкая ограда по периметру лагеря.',
    hasCollision: true,
  },
  chest: {
    kind: 'chest',
    name: 'Хранилище',
    icon: '📦',
    cost: { wood: 6 },
    size: { x: 1.2, y: 0.9, z: 0.8 },
    description: 'Место для вещей. Позволяет не таскать всё с собой.',
    hasCollision: true,
  },
  workbench: {
    kind: 'workbench',
    name: 'Рабочий стол',
    icon: '🛠️',
    cost: { wood: 8, stone: 4 },
    size: { x: 1.8, y: 1.0, z: 0.9 },
    description: 'Открывает сложные рецепты.',
    hasCollision: true,
  },
  torchPost: {
    kind: 'torchPost',
    name: 'Столб с факелом',
    icon: '🕯️',
    cost: { wood: 2, fiber: 2 },
    size: { x: 0.25, y: 2.2, z: 0.25 },
    description: 'Светит и немного отпугивает тварей.',
    hasCollision: false,
  },
  campfire: {
    kind: 'campfire',
    name: 'Костёр',
    icon: '🔥',
    cost: { wood: 6, stone: 4 },
    size: { x: 1.4, y: 0.5, z: 1.4 },
    description: 'Второй очаг. Даёт свет и защиту в радиусе.',
    hasCollision: false,
  },
};
