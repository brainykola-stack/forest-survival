import { describe, it, expect } from 'vitest';
import { steerAroundSafeZone, type SafeZone } from '../src/enemies/SafeZone';

const zone = (active: boolean): SafeZone => ({ x: 0, z: 0, radius: 12, active });

describe('Круг защиты костра', () => {
  it('без огня зона не действует', () => {
    const dir = { x: -1, z: 0 };
    const out = steerAroundSafeZone({ x: 20, z: 0 }, dir, zone(false));
    expect(out).toEqual(dir);
  });

  it('не пускает внутрь: движение становится касательным', () => {
    const pos = { x: 12.2, z: 0 };
    const dir = { x: -1, z: 0 }; // строго к центру
    const out = steerAroundSafeZone(pos, dir, zone(true));
    // радиальная составляющая внутрь должна исчезнуть
    const radial = out.x * -1 + out.z * 0;
    expect(radial).toBeLessThanOrEqual(0.001);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(1, 3);
  });

  it('позволяет идти вдоль границы', () => {
    const pos = { x: 12.2, z: 0 };
    const dir = { x: 0, z: 1 };
    const out = steerAroundSafeZone(pos, dir, zone(true));
    expect(out.x).toBeCloseTo(0, 3);
    expect(out.z).toBeGreaterThan(0.9);
  });

  it('выталкивает наружу, если враг оказался внутри', () => {
    const pos = { x: 3, z: 0 };
    const out = steerAroundSafeZone(pos, { x: -1, z: 0 }, zone(true));
    expect(out.x).toBeGreaterThan(0.9);
    expect(Math.abs(out.z)).toBeLessThan(0.1);
  });

  it('не мешает уходить от костра', () => {
    const pos = { x: 20, z: 0 };
    const dir = { x: 1, z: 0 };
    const out = steerAroundSafeZone(pos, dir, zone(true));
    expect(out).toEqual(dir);
  });

  it('из самого центра уводит хоть куда-то', () => {
    const out = steerAroundSafeZone({ x: 0, z: 0 }, { x: 0, z: 0 }, zone(true));
    expect(Math.hypot(out.x, out.z)).toBeGreaterThan(0.5);
  });
});
