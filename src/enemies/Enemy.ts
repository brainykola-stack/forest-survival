import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Terrain } from '../world/Terrain';
import { modelLibrary, type ModelInstance } from '../core/ModelLibrary';
import { steerAroundSafeZone, type SafeZone } from './SafeZone';

export type EnemyKind = 'deer' | 'hunter' | 'crawler' | 'bog';
export type AIState = 'idle' | 'patrol' | 'investigate' | 'chase' | 'attack' | 'search' | 'return';

export interface AIContext {
  playerPos: THREE.Vector3;
  terrain: Terrain;
  physics: RAPIER.World;
  playerLit: boolean;
  playerRunning: boolean;
  /** Зона защиты костра: пока огонь горит, внутрь не пускает. */
  safe?: SafeZone | null;
}

interface Model {
  group: THREE.Group;
  legs: THREE.Object3D[];
  head: THREE.Object3D | null;
  eyes: THREE.Object3D[];
}

interface Stats {
  speed: number;
  chaseSpeed: number;
  detect: number;
  fov: number;
  attackRange: number;
  damage: number;
  hp: number;
  scale: number;
}

const KIND_STATS: Record<EnemyKind, Stats> = {
  deer: { speed: 3.4, chaseSpeed: 8.2, detect: 34, fov: 1.1, attackRange: 3.1, damage: 26, hp: 260, scale: 1 },
  hunter: { speed: 3.0, chaseSpeed: 6.6, detect: 24, fov: 1.25, attackRange: 2.2, damage: 14, hp: 70, scale: 1 },
  crawler: { speed: 4.0, chaseSpeed: 7.8, detect: 18, fov: 1.4, attackRange: 1.7, damage: 9, hp: 36, scale: 1 },
  bog: { speed: 2.2, chaseSpeed: 4.4, detect: 18, fov: 1.0, attackRange: 2.8, damage: 22, hp: 150, scale: 1.2 },
};

/** Какая модель и клип атаки соответствуют виду противника. */
const KIND_MODEL: Record<EnemyKind, { key: string; height: number; attack: string; glow: number }> = {
  deer: { key: 'stag', height: 3.6, attack: 'Attack_Headbutt', glow: 0xff4a1a },
  hunter: { key: 'wolf', height: 1.7, attack: 'Attack', glow: 0xffb347 },
  crawler: { key: 'fox', height: 1.0, attack: 'Attack', glow: 0xffd27a },
  bog: { key: 'bull', height: 2.2, attack: 'Attack_Headbutt', glow: 0x7cf0c0 },
};

/** Противник с конечным автоматом состояний и простым обходом препятствий. */
export class Enemy {
  readonly group = new THREE.Group();
  readonly kind: EnemyKind;
  readonly stats: Stats;
  hp: number;
  state: AIState = 'idle';
  home: THREE.Vector3;
  position = new THREE.Vector3();
  heading = 0;
  alive = true;
  /** Тестовый режим: стоит на месте и не охотится (см. флаг ?deer=1). */
  passive = false;
  /** Сторож пещеры: не исчезает днём и не входит в ночной лимит. */
  guardian = false;
  lastKnown: THREE.Vector3 | null = null;
  private model: Model;
  private model3d: ModelInstance | null = null;
  private attackClip = 'Attack';
  private time = 0;
  private stateTimer = 0;
  attackCd = 0;
  private attackWindup = -1;
  private patrolTarget: THREE.Vector3;
  private stuckTimer = 0;
  private lastPos = new THREE.Vector3();
  private speedActual = 0;
  private chargeTimer = 0;
  private chaseStall = 0;
  private lastChaseDist = Infinity;

  constructor(
    kind: EnemyKind,
    spawn: THREE.Vector3,
    private scene: THREE.Scene,
  ) {
    this.kind = kind;
    this.stats = { ...KIND_STATS[kind] };
    this.hp = this.stats.hp;
    this.home = spawn.clone();
    this.position.copy(spawn);
    this.patrolTarget = spawn.clone();
    this.model = this.buildModel(kind);
    this.group.add(this.model.group);
    this.group.position.copy(spawn);
    scene.add(this.group);
  }

  get healthPct(): number {
    return this.hp / this.stats.hp;
  }

  /** Полный проход ИИ. Вызывается не каждый кадр для дальних врагов (см. GameStage). */
  update(dt: number, ctx: AIContext): { attacked: boolean } {
    if (!this.alive) return { attacked: false };
    this.time += dt;

    if (this.passive) {
      // Демонстрационный олень: только дышит и осматривается.
      this.speedActual = 0;
      this.updateModel3d(dt);
      this.applyTransform(ctx);
      return { attacked: false };
    }

    this.attackCd = Math.max(0, this.attackCd - dt);
    this.stateTimer += dt;

    const toPlayer = ctx.playerPos.clone().sub(this.position);
    const dist = toPlayer.length();
    const visible = this.canSee(ctx, dist);

    switch (this.state) {
      case 'idle':
        this.idle(dt);
        if (this.stateTimer > 2.5) this.setState('patrol');
        if (visible) this.setState('chase');
        break;
      case 'patrol':
        this.moveTowards(this.patrolTarget, this.stats.speed, dt, ctx);
        if (this.position.distanceTo(this.patrolTarget) < 2) {
          this.pickPatrolTarget();
        }
        if (visible) {
          this.lastKnown = ctx.playerPos.clone();
          this.setState('chase');
        }
        if (this.stateTimer > 22) this.setState('idle');
        break;
      case 'investigate':
        if (!this.lastKnown) {
          this.setState('patrol');
          break;
        }
        this.moveTowards(this.lastKnown, this.stats.speed * 1.2, dt, ctx);
        if (this.position.distanceTo(this.lastKnown) < 2.2) this.setState('search');
        if (visible) this.setState('chase');
        if (this.stateTimer > 18) this.setState('return');
        break;
      case 'chase': {
        if (visible) this.lastKnown = ctx.playerPos.clone();
        const target = this.lastKnown ?? ctx.playerPos;
        const speed = this.stats.chaseSpeed * (this.chargeTimer > 0 ? 1.25 : 1);
        this.moveTowards(target, speed, dt, ctx);
        if (this.chargeTimer > 0) this.chargeTimer -= dt;

        // Если дистанция не сокращается (круг костра, ствол, угол дома),
        // зверь не долбится в препятствие вечно, а уходит искать обход.
        if (dist < this.lastChaseDist - 0.15) this.chaseStall = 0;
        else this.chaseStall += dt;
        this.lastChaseDist = dist;
        if (this.chaseStall > 5) {
          this.chaseStall = 0;
          this.pickEscapeTarget(ctx);
          this.setState('search');
          break;
        }

        if (dist < this.stats.attackRange && this.attackCd <= 0) {
          this.setState('attack');
          this.attackWindup = 0.45;
        }
        if (!visible && this.stateTimer > 4) this.setState('search');
        if (dist > this.stats.detect * 2.4) this.setState('return');
        break;
      }
      case 'attack': {
        const attacked = this.attackTick(dt, ctx, dist);
        if (attacked) return { attacked: true };
        if (this.stateTimer > 1.0) this.setState('chase');
        break;
      }
      case 'search':
        this.wander(dt, ctx);
        if (visible) this.setState('chase');
        if (this.stateTimer > 7) this.setState('return');
        break;
      case 'return':
        this.moveTowards(this.home, this.stats.speed, dt, ctx);
        if (this.position.distanceTo(this.home) < 2.5) this.setState('patrol');
        if (visible && dist < this.stats.detect) this.setState('chase');
        break;
    }

    this.updateModel3d(dt);
    this.applyTransform(ctx);
    return { attacked: false };
  }

  /** Анимации скелетной модели по состоянию ИИ. */
  private updateModel3d(dt: number): void {
    if (!this.model3d) return;
    this.model3d.update(dt);
    let anim = 'Idle';
    if (this.state === 'attack') anim = this.attackClip;
    else if (this.state === 'chase') anim = 'Gallop';
    else if (this.speedActual > 0.4) anim = 'Walk';
    this.model3d.play(anim);
  }

  private attackTick(dt: number, ctx: AIContext, dist: number): boolean {
    if (this.attackWindup > 0) {
      this.attackWindup -= dt;
      if (this.attackWindup <= 0) {
        this.attackCd = 1.5;
        if (dist <= this.stats.attackRange + 0.6) return true;
      }
    }
    void ctx;
    return false;
  }

  private setState(s: AIState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTimer = 0;
    if (s === 'chase' && this.kind === 'deer' && Math.random() < 0.4) this.chargeTimer = 2.2;
    if (s === 'search') this.lastKnown = this.lastKnown ?? this.position.clone();
    if (s === 'chase') {
      this.chaseStall = 0;
      this.lastChaseDist = Infinity;
    }
  }

  private idle(dt: number): void {
    this.heading += dt * 0.35;
    this.speedActual = 0;
  }

  private wander(dt: number, ctx: AIContext): void {
    if (this.stateTimer > 3) {
      const angle = Math.random() * Math.PI * 2;
      const base = this.lastKnown ?? this.position;
      this.patrolTarget.set(base.x + Math.cos(angle) * 6, base.y, base.z + Math.sin(angle) * 6);
      this.stateTimer = 0;
    }
    this.moveTowards(this.patrolTarget, this.stats.speed * 0.8, dt, ctx);
  }

  /** Куда уйти, если путь к цели перекрыт: от круга костра — наружу. */
  private pickEscapeTarget(ctx: AIContext): void {
    const safe = ctx.safe;
    if (safe && safe.active) {
      const dx = this.position.x - safe.x;
      const dz = this.position.z - safe.z;
      const len = Math.hypot(dx, dz) || 1;
      const r = safe.radius + 6;
      this.patrolTarget.set(safe.x + (dx / len) * r, this.position.y, safe.z + (dz / len) * r);
    } else {
      const a = Math.random() * Math.PI * 2;
      this.patrolTarget.set(this.position.x + Math.cos(a) * 10, this.position.y, this.position.z + Math.sin(a) * 10);
    }
    this.lastKnown = null;
  }

  private pickPatrolTarget(): void {
    const angle = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 18;
    this.patrolTarget.set(this.home.x + Math.cos(angle) * r, this.home.y, this.home.z + Math.sin(angle) * r);
  }

  private moveTowards(target: THREE.Vector3, speed: number, dt: number, ctx: AIContext): void {
    const dir = target.clone().sub(this.position);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) return;
    dir.normalize();

    // Обход препятствий: три «уса» вперёд.
    const avoid = this.avoidance(ctx);
    dir.add(avoid.multiplyScalar(1.6)).normalize();

    // Не идти в глубокую воду (кроме болотного)
    const ahead = this.position.clone().addScaledVector(dir, 2.5);
    const aheadH = ctx.terrain.heightAt(ahead.x, ahead.z);
    if (aheadH < 0.35 && this.kind !== 'bog') {
      dir.multiplyScalar(-1);
    }

    // Круг костра: пока горит — внутрь нельзя, только вдоль границы.
    const steered = steerAroundSafeZone(this.position, { x: dir.x, z: dir.z }, ctx.safe ?? null);
    dir.x = steered.x;
    dir.z = steered.z;

    const step = speed * dt;
    this.position.addScaledVector(dir, step);
    this.position.y = ctx.terrain.heightAt(this.position.x, this.position.z);
    this.heading = Math.atan2(dir.x, dir.z);
    this.speedActual = speed;

    // Защита от застревания: если почти не двигаемся — выбираем новый маршрут.
    if (this.position.distanceTo(this.lastPos) < 0.05) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.2) {
        this.patrolTarget = this.position.clone().add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(12));
        this.lastKnown = null;
        this.stuckTimer = 0;
        this.setState('search');
      }
    } else {
      this.stuckTimer = 0;
      this.lastPos.copy(this.position);
    }
  }

  private avoidance(ctx: AIContext): THREE.Vector3 {
    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const result = new THREE.Vector3();
    const origin = this.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    for (const angle of [-0.55, 0, 0.55]) {
      const dir = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      const ray = new RAPIER.Ray(origin, dir);
      const hit = ctx.physics.castRay(ray, 2.4, true);
      if (hit) {
        const side = angle >= 0 ? -1 : 1;
        const perp = new THREE.Vector3(-forward.z, 0, forward.x).multiplyScalar(side);
        result.add(perp.multiplyScalar(1 - hit.timeOfImpact / 2.4));
      }
    }
    return result;
  }

  private canSee(ctx: AIContext, dist: number): boolean {
    let range = this.stats.detect;
    if (ctx.playerLit) range *= 1.45;
    if (ctx.playerRunning) range *= 1.25;
    if (dist > range) return false;

    const to = ctx.playerPos.clone().sub(this.position);
    to.y = 0;
    const angle = Math.atan2(to.x, to.z);
    let diff = angle - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > this.stats.fov && dist > 4) return false;

    const origin = this.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    const target = ctx.playerPos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const dir = target.clone().sub(origin);
    const len = dir.length();
    if (len < 0.2) return true;
    dir.normalize();
    const hit = ctx.physics.castRay(new RAPIER.Ray(origin, dir), len - 0.4, true);
    return !hit;
  }

  /** Реакция на шум: монстр идёт проверять. */
  hearNoise(pos: THREE.Vector3): void {
    if (!this.alive) return;
    if (this.state === 'chase' || this.state === 'attack') return;
    this.lastKnown = pos.clone();
    this.setState('investigate');
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    // Агрессия после удара
    if (this.hp > 0) {
      if (this.state !== 'chase') this.setState('chase');
      this.lastKnown = this.lastKnown ?? this.position.clone();
    }
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  private applyTransform(ctx: AIContext): void {
    this.position.y = ctx.terrain.heightAt(this.position.x, this.position.z);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;

    // Анимация: качание ног и корпуса
    const pace = Math.min(2.2, 0.4 + this.speedActual * 0.28);
    const swing = Math.sin(this.time * pace * 6.5) * (this.speedActual > 0.2 ? 0.55 : 0.06);
    for (let i = 0; i < this.model.legs.length; i++) {
      const leg = this.model.legs[i];
      const phase = i % 2 === 0 ? swing : -swing;
      leg.rotation.x = phase;
    }
    if (this.model.head) {
      this.model.head.rotation.x = Math.sin(this.time * 1.7) * 0.08;
    }
    this.group.position.y += Math.abs(Math.sin(this.time * pace * 6.5)) * 0.06 * (this.speedActual > 0.2 ? 1 : 0);
  }

  dispose(): void {
    this.scene.remove(this.group);
    if (this.model3d) {
      // Ресурсы внешней модели общие: освобождаем только экземпляр.
      this.model3d.dispose();
      return;
    }
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
  }

  // ------------------------------------------------------------------ модели

  private buildModel(kind: EnemyKind): Model {
    const spec = KIND_MODEL[kind];
    const instance = modelLibrary.create(spec.key, spec.height);
    if (instance) {
      this.attackClip = spec.attack;
      return this.wrapAnimal(instance, spec.glow);
    }
    if (kind === 'deer') return this.buildDeer();
    if (kind === 'hunter') return this.buildHunter();
    if (kind === 'crawler') return this.buildCrawler();
    return this.buildBog();
  }

  /** Модель животного из пака: скелет, анимации, свечение глаз. */
  private wrapAnimal(instance: ModelInstance, glowColor: number): Model {
    const root = instance.root;
    let headBone: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (!headBone && o.name && /head/i.test(o.name)) headBone = o;
    });
    const glow = new THREE.PointLight(glowColor, this.kind === 'deer' ? 2.0 : 0.9, this.kind === 'deer' ? 9 : 5, 2);
    (headBone ?? root).add(glow);

    const group = new THREE.Group();
    group.add(root);
    this.model3d = instance;
    instance.play('Idle', 0);
    return { group, legs: [], head: null, eyes: [] };
  }

  private buildDeer(): Model {
    const group = new THREE.Group();
    const hide = new THREE.MeshLambertMaterial({ color: 0x1b1a18 });
    const bone = new THREE.MeshLambertMaterial({ color: 0x8c8574 });
    const eyes: THREE.Object3D[] = [];

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 3.2), hide);
    body.position.y = 2.5;
    body.castShadow = true;
    group.add(body);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.8), hide);
    neck.position.set(0, 3.4, 1.4);
    neck.rotation.x = -0.45;
    group.add(neck);

    const head = new THREE.Group();
    head.position.set(0, 4.3, 2.1);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 1.5), hide);
    head.add(skull);
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.8), bone);
    muzzle.position.set(0, -0.15, 0.95);
    head.add(muzzle);
    // Глаза
    for (const sx of [-0.24, 0.24]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a2a }));
      eye.position.set(sx, 0.14, 0.72);
      head.add(eye);
      eyes.push(eye);
    }
    // Рога: ветвистые цилиндры
    const antler = this.buildAntlers(bone);
    head.add(antler);
    group.add(head);

    // Длинные ноги
    const legs: THREE.Object3D[] = [];
    for (const [x, z] of [
      [-0.55, 1.1],
      [0.55, 1.1],
      [-0.55, -1.1],
      [0.55, -1.1],
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 2.1, z);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.1, 0.22), hide);
      upper.position.y = -1.05;
      pivot.add(upper);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.17, 2.0, 0.17), hide);
      lower.position.y = -3.0;
      pivot.add(lower);
      group.add(pivot);
      legs.push(pivot);
    }

    const glow = new THREE.PointLight(0xff4a1a, 2.2, 10, 2);
    glow.position.set(0, 4.3, 2.4);
    group.add(glow);

    return { group, legs, head, eyes };
  }

  private buildAntlers(mat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const mk = (len: number, x: number, y: number, z: number, rz: number, rx: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, len, 5), mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      g.add(m);
    };
    for (const side of [-1, 1]) {
      mk(1.5, side * 0.25, 0.6, 0, side * 0.5, 0.2);
      mk(1.1, side * 0.85, 1.1, 0, side * 1.0, 0.35);
      mk(0.9, side * 1.25, 1.55, 0, side * 1.35, 0.5);
      mk(0.7, side * 0.55, 1.5, 0.3, side * 0.2, -0.4);
    }
    return g;
  }

  private buildHunter(): Model {
    const group = new THREE.Group();
    const cloth = new THREE.MeshLambertMaterial({ color: 0x24241f });
    const skin = new THREE.MeshLambertMaterial({ color: 0x6d6152 });
    const legs: THREE.Object3D[] = [];

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.05, 0.4), cloth);
    torso.position.y = 1.45;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Group();
    head.position.y = 2.2;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
    head.add(skull);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xd6e37a }));
    eye.position.set(0.08, 0.04, 0.2);
    head.add(eye);
    group.add(head);

    const arms: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.42, 1.9, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), cloth);
      arm.position.y = -0.45;
      pivot.add(arm);
      group.add(pivot);
      arms.push(pivot);
    }
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.18, 0.95, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.95, 0.18), cloth);
      leg.position.y = -0.47;
      pivot.add(leg);
      group.add(pivot);
      legs.push(pivot);
    }
    this.modelArms = arms;
    return { group, legs, head, eyes: [] };
  }

  private modelArms: THREE.Object3D[] = [];

  private buildCrawler(): Model {
    const group = new THREE.Group();
    const flesh = new THREE.MeshLambertMaterial({ color: 0x3a2a26 });
    const legs: THREE.Object3D[] = [];

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), flesh);
    body.scale.set(1.5, 0.7, 1.1);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Group();
    head.position.set(0, 0.62, 0.75);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), flesh);
    head.add(skull);
    for (const sx of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      eye.position.set(sx, 0.06, 0.24);
      head.add(eye);
    }
    group.add(head);

    for (const [x, z] of [
      [-0.5, 0.35],
      [0.5, 0.35],
      [-0.5, -0.35],
      [0.5, -0.35],
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.55, z);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), flesh);
      leg.position.y = -0.27;
      pivot.add(leg);
      group.add(pivot);
      legs.push(pivot);
    }
    return { group, legs, head, eyes: [] };
  }

  private buildBog(): Model {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x2f3a2b });
    const legs: THREE.Object3D[] = [];

    const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), mat);
    body.scale.set(1.1, 1.25, 1.0);
    body.position.y = 1.7;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Group();
    head.position.y = 2.95;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), mat);
    head.add(skull);
    for (const sx of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0x7cf0c0 }));
      eye.position.set(sx, 0.08, 0.34);
      head.add(eye);
    }
    group.add(head);

    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.55, 1.0, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), mat);
      leg.position.y = -0.55;
      pivot.add(leg);
      group.add(pivot);
      legs.push(pivot);
    }
    return { group, legs, head, eyes: [] };
  }
}
