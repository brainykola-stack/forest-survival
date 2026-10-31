import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/survival/Inventory';
import { craft, canCraft, RECIPES } from '../src/survival/Crafting';
import { QuestSystem, QUESTS } from '../src/quests/Quests';

describe('Инвентарь', () => {
  it('складывает предметы в стопки и учитывает лимит', () => {
    const inv = new Inventory();
    inv.add('wood', 30);
    expect(inv.countOf('wood')).toBe(30);
    const left = inv.add('wood', 25); // 10 в первую стопку, 15 во вторую
    expect(left).toBe(0);
    expect(inv.countOf('wood')).toBe(55);
    inv.add('wood', 15);
    expect(inv.countOf('wood')).toBe(70);
  });

  it('не даёт уйти в минус и корректно списывает', () => {
    const inv = new Inventory();
    inv.add('stone', 5);
    expect(inv.remove('stone', 6)).toBe(false);
    expect(inv.remove('stone', 5)).toBe(true);
    expect(inv.countOf('stone')).toBe(0);
  });

  it('оплата рецепта списывает ровно стоимость', () => {
    const inv = new Inventory();
    inv.add('wood', 10);
    inv.add('fiber', 4);
    expect(inv.has({ wood: 3, fiber: 2 })).toBe(true);
    expect(inv.pay({ wood: 3, fiber: 2 })).toBe(true);
    expect(inv.countOf('wood')).toBe(7);
    expect(inv.countOf('fiber')).toBe(2);
  });

  it('переживает сериализацию и обратную загрузку', () => {
    const inv = new Inventory();
    inv.add('wood', 7);
    inv.add('axe', 1);
    const json = JSON.parse(JSON.stringify(inv.toJSON()));
    const inv2 = new Inventory();
    inv2.fromJSON(json);
    expect(inv2.countOf('wood')).toBe(7);
    expect(inv2.countOf('axe')).toBe(1);
  });

  it('первые четыре слота — быстрый доступ', () => {
    const inv = new Inventory();
    inv.add('torch', 1);
    inv.select(3);
    expect(inv.selected).toBe(3);
    inv.select(9);
    expect(inv.selected).toBe(3);
  });
});

describe('Крафт', () => {
  const axe = RECIPES.find((r) => r.id === 'axe')!;
  const spear = RECIPES.find((r) => r.id === 'spear')!;

  it('требует материалы', () => {
    const inv = new Inventory();
    inv.add('wood', 3);
    expect(canCraft(inv, axe, false)).toBe(false);
    inv.add('fiber', 2);
    expect(canCraft(inv, axe, false)).toBe(true);
  });

  it('создаёт предмет и тратит ресурсы', () => {
    const inv = new Inventory();
    inv.add('wood', 3);
    inv.add('fiber', 2);
    expect(craft(inv, axe, false)).toBe(true);
    expect(inv.countOf('axe')).toBe(1);
    expect(inv.countOf('wood')).toBe(0);
  });

  it('не даёт создать запертый рецепт без рабочего стола', () => {
    const inv = new Inventory();
    inv.add('wood', 4);
    inv.add('fiber', 2);
    inv.add('stone', 2);
    expect(canCraft(inv, spear, false)).toBe(false);
    expect(canCraft(inv, spear, true)).toBe(true);
    expect(craft(inv, spear, false)).toBe(false);
    expect(craft(inv, spear, true)).toBe(true);
    expect(inv.countOf('spear')).toBe(1);
  });
});

describe('Задания', () => {
  it('считает прогресс и не засчитывает дважды', () => {
    const qs = new QuestSystem();
    const wood = QUESTS.find((q) => q.id === 'q_wood')!;
    qs.notify('gather_wood', 3);
    expect(qs.states.get(wood.id)!.progress).toBe(3);
    const done = qs.notify('gather_wood', 5);
    expect(done.some((q) => q.id === wood.id)).toBe(true);
    expect(qs.states.get(wood.id)!.done).toBe(true);
    const again = qs.notify('gather_wood', 5);
    expect(again.length).toBe(0);
    expect(qs.states.get(wood.id)!.progress).toBe(wood.target);
  });

  it('восстанавливается из сохранения', () => {
    const qs = new QuestSystem(['q_wood'], { q_axe: 0 });
    expect(qs.states.get('q_wood')!.done).toBe(true);
    const main = qs.currentMain();
    expect(main?.quest.id).not.toBe('q_wood');
  });
});
