import { describe, it, expect } from 'vitest';
import { CLASSES, CLASS_LIST, classOf } from '../src/player/Classes';

describe('Классы персонажа', () => {
  it('три класса, и все разные', () => {
    expect(CLASS_LIST).toHaveLength(3);
    expect(new Set(CLASS_LIST.map((c) => c.id)).size).toBe(3);
  });

  it('лесоруб получает больше дерева и не теряет урон', () => {
    const c = CLASSES.lumberjack;
    expect(c.woodBonus).toBeGreaterThan(0);
    expect(c.damageMult).toBe(1);
  });

  it('охотник бьёт сильнее и получает больше мяса', () => {
    const c = CLASSES.hunter;
    expect(c.damageMult).toBeGreaterThan(1);
    expect(c.meatBonus).toBeGreaterThan(0);
  });

  it('лекарь лечит сильнее и голодает медленнее', () => {
    const c = CLASSES.healer;
    expect(c.healBonus).toBeGreaterThan(0);
    expect(c.hungerMult).toBeLessThan(1);
  });

  it('неизвестный класс превращается в лесоруба', () => {
    expect(classOf('nonsense').id).toBe('lumberjack');
    expect(classOf(undefined).id).toBe('lumberjack');
  });
});
