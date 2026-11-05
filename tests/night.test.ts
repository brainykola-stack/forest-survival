import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NightDirector } from '../src/world/NightDirector';
import { Campfire } from '../src/camp/Campfire';

describe('Режиссёр ночей', () => {
  const d = new NightDirector();

  it('каждая десятая ночь особенная', () => {
    for (const n of [10, 20, 30, 40, 50, 60, 70, 80, 90, 99]) {
      const m = d.forNight(n);
      expect(d.isSpecial(n)).toBe(true);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.subtitle.length).toBeGreaterThan(0);
    }
  });

  it('обычная ночь не добавляет эффектов', () => {
    const m = d.forNight(7);
    expect(m.enemyBonus).toBe(0);
    expect(m.speedFactor).toBe(1);
    expect(m.damageFactor).toBe(1);
    expect(m.fog).toBe(0);
    expect(m.fireDrain).toBe(1);
    expect(m.nightScale).toBe(1);
    expect(m.guaranteed).toHaveLength(0);
  });

  it('особые ночи отличаются друг от друга', () => {
    const titles = [10, 20, 30, 40, 50, 60, 70, 80, 90, 99].map((n) => d.forNight(n).title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('холодная ночь жжёт дрова быстрее', () => {
    expect(d.forNight(80).fireDrain).toBeGreaterThan(1.5);
  });

  it('долгая ночь длится дольше обычной', () => {
    expect(d.forNight(50).nightScale).toBeGreaterThan(1.3);
  });

  it('осада приводит врагов к лагерю', () => {
    expect(d.forNight(70).spawnNearCamp).toBe(true);
  });

  it('олицетворение оленя гарантировано в ночь охоты и в финале', () => {
    expect(d.forNight(30).guaranteed).toContain('deer');
    expect(d.forNight(99).guaranteed).toContain('deer');
  });

  it('подсказывает следующую особую ночь', () => {
    expect(d.upcomingSpecial(3)?.id).toBe('night-10');
    expect(d.upcomingSpecial(11)?.id).toBe('night-20');
    expect(d.upcomingSpecial(99)).toBeNull();
  });
});

describe('Костёр и расход топлива', () => {
  it('двойной расход сжигает топливо быстрее', () => {
    const sceneA = new THREE.Scene();
    const a = new Campfire(sceneA, new THREE.Vector3(0, 0, 0));
    a.drainMultiplier = 1;
    const sceneB = new THREE.Scene();
    const b = new Campfire(sceneB, new THREE.Vector3(0, 0, 0));
    b.drainMultiplier = 2;

    const p = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < 100; i++) {
      a.update(0.1, p);
      b.update(0.1, p);
    }
    expect(b.fuel).toBeLessThan(a.fuel);
  });

  it('пустой костёр гаснет', () => {
    const scene = new THREE.Scene();
    const fire = new Campfire(scene, new THREE.Vector3(0, 0, 0));
    fire.fuel = 0.5;
    let died = false;
    for (let i = 0; i < 60; i++) {
      if (fire.update(0.1, new THREE.Vector3(0, 0, 0)).justDied) died = true;
    }
    expect(fire.lit).toBe(false);
    expect(died).toBe(true);
  });
});
