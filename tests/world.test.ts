import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from '../src/world/World';
import { DayNight } from '../src/world/DayNight';
import { TOTAL_NIGHTS, dangerForNight, maxEnemiesForNight, zoneAt } from '../src/core/Config';

describe('Генерация мира', () => {
  let world: World;
  let scene: THREE.Scene;
  let physics: RAPIER.World;

  beforeAll(async () => {
    await RAPIER.init();
    scene = new THREE.Scene();
    physics = new RAPIER.World({ x: 0, y: -20, z: 0 });
    world = new World(424242, scene, physics);
  });

  it('создаёт рельеф с детерминированными высотами', () => {
    const a = world.heightAt(12.5, -33.25);
    const b = world.heightAt(12.5, -33.25);
    expect(a).toBe(b);
    expect(Number.isFinite(a)).toBe(true);
  });

  it('создаёт тысячи узлов добычи и постройки', () => {
    expect(world.nodes.length).toBeGreaterThan(800);
    expect(world.nodes.filter((n) => n.kind === 'tree').length).toBeGreaterThan(300);
    expect(world.nodes.filter((n) => n.kind === 'rock').length).toBeGreaterThan(100);
    expect(world.buildings.length).toBeGreaterThanOrEqual(8);
    expect(world.notes.length).toBe(6);
    expect(world.childSpots.length).toBe(4);
  });

  it('добыча даёт ресурсы и истощает узел', () => {
    const tree = world.nodes.find((n) => n.kind === 'tree' && n.alive)!;
    const loot = world.hitNode(tree, 55, true);
    expect(loot).not.toBeNull();
    expect(loot![0].id).toBe('wood');
    expect(loot![0].n).toBeGreaterThan(0);
    let guard = 0;
    while (tree.alive && guard++ < 10) world.hitNode(tree, 55, true);
    expect(tree.alive).toBe(false);
  });

  it('без инструмента дерево даёт меньше ресурсов', () => {
    const tree = world.nodes.find((n) => n.kind === 'tree' && n.alive)!;
    const loot = world.hitNode(tree, 22, false);
    expect(loot).not.toBeNull();
    expect(loot![0].id).toBe('wood');
    expect(loot![0].n).toBe(1);
  });

  it('находит узлы рядом с игроком в направлении взгляда', () => {
    const node = world.nodes.find((n) => n.kind === 'tree' && n.alive)!;
    const origin = node.pos.clone().add(new THREE.Vector3(0, 2, 0));
    const dir = new THREE.Vector3(0, -1, 0);
    const found = world.findNode(origin, dir, 4);
    expect(found).not.toBeNull();
  });
});

describe('Цикл суток', () => {
  it('переключает день и ночь и считает часы', () => {
    const scene = new THREE.Scene();
    const dn = new DayNight(scene);
    expect(dn.isNight).toBe(false);
    let becameNight = false;
    let becameDay = false;
    for (let i = 0; i < 20000 && !(becameNight && becameDay); i++) {
      const t = dn.update(0.1);
      if (t.justBecameNight) becameNight = true;
      if (t.justBecameDay) becameDay = true;
    }
    expect(becameNight).toBe(true);
    expect(becameDay).toBe(true);
    expect(dn.nightLevel).toBeGreaterThanOrEqual(0);
    expect(dn.nightLevel).toBeLessThanOrEqual(1);
    expect(dn.clockLabel()).toMatch(/^\d{2}:\d{2}$/);
  });

  it('восстанавливает время из сохранения', () => {
    const scene = new THREE.Scene();
    const dn = new DayNight(scene);
    dn.setTime('night', 50);
    expect(dn.isNight).toBe(true);
    expect(dn.time).toBe(50);
  });
});

describe('Баланс', () => {
  it('опасность и число врагов растут с ночами', () => {
    expect(dangerForNight(1)).toBeLessThan(dangerForNight(50));
    expect(maxEnemiesForNight(1)).toBeLessThan(maxEnemiesForNight(90));
    expect(maxEnemiesForNight(99)).toBeLessThanOrEqual(11);
    expect(TOTAL_NIGHTS).toBe(99);
  });

  it('определяет зону по координатам', () => {
    expect(zoneAt(0, 0).id).toBe('start');
    expect(zoneAt(120, 70).id).toBe('rocky');
    expect(zoneAt(44, 150).id).toBe('deep');
  });
});
