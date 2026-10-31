import type { RNG } from '../core/Rand';

export type WorldEventKind = 'fog' | 'figure' | 'supplies' | 'whisper';

export interface WorldEventContext {
  isNight: boolean;
  night: number;
  playerPos: { x: number; y: number; z: number };
}

/**
 * Случайные события мира. Не срабатывают слишком часто и требуют условий:
 * часть — только ночью, часть — только после определённых ночей.
 */
export class WorldEvents {
  private timer: number;
  private cooldown = 0;

  constructor(private rng: RNG, initialDelay = 90) {
    this.timer = initialDelay;
  }

  /** Возвращает событие, если его пора запускать, иначе null. */
  update(dt: number, ctx: WorldEventContext): WorldEventKind | null {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.timer -= dt;
    if (this.timer > 0 || this.cooldown > 0) return null;

    this.timer = this.rng.range(110, 210);
    this.cooldown = 20;

    const pool: WorldEventKind[] = ['supplies', 'whisper', 'fog'];
    if (ctx.isNight) pool.push('figure', 'figure');
    if (ctx.isNight && ctx.night >= 4) pool.push('fog');
    return this.rng.pick(pool);
  }

  /** Плотность тумана для события «fog» (временный эффект). */
  static fogBonus(active: boolean, strength: number): number {
    return active ? strength : 0;
  }
}
