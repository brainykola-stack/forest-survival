import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Enemy, type AIContext } from '../src/enemies/Enemy';

function makeCtx(playerPos: THREE.Vector3, torchOn: boolean): AIContext {
  return {
    playerPos,
    terrain: { heightAt: () => 0, slopeAt: () => 0 } as unknown as AIContext['terrain'],
    physics: { castRay: () => null } as unknown as AIContext['physics'],
    playerLit: torchOn,
    playerRunning: false,
    torchOn,
    safe: null,
  };
}

describe('Олень-монстр', () => {
  it('боится факела и отступает', () => {
    const scene = new THREE.Scene();
    const deer = new Enemy('deer', new THREE.Vector3(0, 0, 0), scene);
    deer.update(0.1, makeCtx(new THREE.Vector3(0, 0, 6), true));
    expect(deer.state).toBe('flee');
  });

  it('без света идёт в погоню', () => {
    const scene = new THREE.Scene();
    const deer = new Enemy('deer', new THREE.Vector3(0, 0, 0), scene);
    for (let i = 0; i < 5; i++) deer.update(0.1, makeCtx(new THREE.Vector3(0, 0, 6), false));
    expect(deer.state === 'chase' || deer.state === 'attack').toBe(true);
  });

  it('не заходит в круг костра', () => {
    const scene = new THREE.Scene();
    const deer = new Enemy('deer', new THREE.Vector3(20, 0, 0), scene);
    const ctx = makeCtx(new THREE.Vector3(0, 0, 0), false);
    ctx.safe = { x: 0, z: 0, radius: 12, active: true };
    for (let i = 0; i < 120; i++) deer.update(0.1, ctx);
    expect(Math.hypot(deer.position.x, deer.position.z)).toBeGreaterThan(11);
  });
});
