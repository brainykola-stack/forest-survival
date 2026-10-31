import type { Inventory } from './Inventory';
import type { ItemId } from './Items';

export interface Recipe {
  id: string;
  name: string;
  icon: string;
  result: { id: ItemId; count: number };
  cost: Partial<Record<ItemId, number>>;
  requiresWorkbench?: boolean;
  description: string;
}

/** Рецепты. Часть открывается сразу, часть — после рабочего стола или находки чертежа. */
export const RECIPES: Recipe[] = [
  {
    id: 'axe',
    name: 'Топор',
    icon: '🪓',
    result: { id: 'axe', count: 1 },
    cost: { wood: 3, fiber: 2 },
    description: 'Дерево отдаёт больше древесины, если рубить топором.',
  },
  {
    id: 'pickaxe',
    name: 'Кирка',
    icon: '⛏️',
    result: { id: 'pickaxe', count: 1 },
    cost: { wood: 3, stone: 3 },
    description: 'Позволяет добывать камень с жил.',
  },
  {
    id: 'torch',
    name: 'Факел',
    icon: '🔥',
    result: { id: 'torch', count: 1 },
    cost: { wood: 2, fiber: 3 },
    description: 'Светит в темноте и отпугивает мелких тварей.',
  },
  {
    id: 'spear',
    name: 'Копьё',
    icon: '🗡️',
    result: { id: 'spear', count: 1 },
    cost: { wood: 4, fiber: 2, stone: 2 },
    requiresWorkbench: true,
    description: 'Серьёзный аргумент против ночных гостей.',
  },
  {
    id: 'bandage',
    name: 'Перевязка',
    icon: '🩹',
    result: { id: 'bandage', count: 1 },
    cost: { herb: 3, fiber: 2 },
    description: 'Восстанавливает 30 здоровья.',
  },
  {
    id: 'workbench',
    name: 'Рабочий стол',
    icon: '🛠️',
    result: { id: 'wood', count: 0 },
    cost: { wood: 8, stone: 4 },
    description: 'Чертежи, требующие стола, станут доступны. Ставится из меню строительства.',
  },
];

export function unlockedRecipes(hasWorkbench: boolean): Recipe[] {
  return RECIPES.filter((r) => !r.requiresWorkbench || hasWorkbench);
}

export function canCraft(inv: Inventory, recipe: Recipe, hasWorkbench: boolean): boolean {
  if (recipe.requiresWorkbench && !hasWorkbench) return false;
  return inv.has(recipe.cost);
}

export function craft(inv: Inventory, recipe: Recipe, hasWorkbench: boolean): boolean {
  if (!canCraft(inv, recipe, hasWorkbench)) return false;
  if (recipe.result.count <= 0) return false;
  if (!inv.pay(recipe.cost)) return false;
  const left = inv.add(recipe.result.id, recipe.result.count);
  if (left > 0) {
    inv.refund(recipe.cost);
    inv.remove(recipe.result.id, recipe.result.count - left);
    return false;
  }
  return true;
}
