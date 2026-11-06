import { PLAYER } from '../core/Config';

/** Здоровье, голод, выносливость и правила урона. */
export class PlayerStats {
  health = PLAYER.maxHealth;
  hunger = PLAYER.maxHunger;
  stamina = PLAYER.maxStamina;
  invuln = 0;
  hurtFlash = 0;
  dead = false;

  private starvationTick = 0;

  get healthPct(): number {
    return this.health / PLAYER.maxHealth;
  }

  get hungerPct(): number {
    return this.hunger / PLAYER.maxHunger;
  }

  get staminaPct(): number {
    return this.stamina / PLAYER.maxStamina;
  }

  update(dt: number, sprinting: boolean, moving: boolean): void {
    if (this.dead) return;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    // Голод: полоса убывает постепенно, на бегу быстрее.
    this.hunger = Math.max(0, this.hunger - dt * (sprinting ? 0.3 : 0.16));

    if (this.hunger <= 0) {
      this.starvationTick += dt;
      if (this.starvationTick >= 1) {
        this.starvationTick -= 1;
        this.applyDamage(2, true);
      }
    } else if (this.hunger > 55 && this.health < PLAYER.maxHealth) {
      this.health = Math.min(PLAYER.maxHealth, this.health + dt * 0.45);
    }

    if (sprinting && moving) {
      this.stamina = Math.max(0, this.stamina - dt * 14);
    } else {
      this.stamina = Math.min(PLAYER.maxStamina, this.stamina + dt * 9);
    }
  }

  /** Возвращает true, если персонаж погиб от этого удара. */
  applyDamage(amount: number, ignoreInvuln = false): boolean {
    if (this.dead) return false;
    if (!ignoreInvuln && this.invuln > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.invuln = ignoreInvuln ? 0 : 0.55;
    this.hurtFlash = 0.45;
    if (this.health <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  heal(amount: number): void {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  feed(amount: number): void {
    this.hunger = Math.min(PLAYER.maxHunger, this.hunger + amount);
  }

  restoreStamina(amount: number): void {
    this.stamina = Math.min(PLAYER.maxStamina, this.stamina + amount);
  }
}
