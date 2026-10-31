import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Stage, GameHandle } from '../core/Stage';
import type { SaveData } from '../core/SaveManager';
import { World } from '../world/World';
import { DayNight } from '../world/DayNight';
import { Player } from '../player/Player';
import { Campfire } from '../camp/Campfire';
import { BuildingSystem } from '../survival/BuildingSystem';
import { RescueSystem } from '../quests/Rescue';
import { QuestSystem } from '../quests/Quests';
import { Inventory } from '../survival/Inventory';
import { ITEMS, type ItemId } from '../survival/Items';
import { craft, canCraft, type Recipe } from '../survival/Crafting';
import { Enemy, type EnemyKind } from '../enemies/Enemy';
import { WorldEvents, type WorldEventKind } from '../world/WorldEvents';
import { RNG } from '../core/Rand';
import { BUILD_DEFS, type BuildKind } from '../survival/Building';
import { InventoryUI } from '../ui/InventoryUI';
import { CraftingUI, BuildingUI } from '../ui/CraftingUI';
import { TOTAL_NIGHTS, dangerForNight, maxEnemiesForNight, PLAYER, zoneAt } from '../core/Config';
import { SessionState, type SessionPhase, type UiMode } from '../core/SessionState';



/** Игровая сцена леса: все системы выживания в одном цикле. */
export class GameStage implements Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private physics: RAPIER.World;
  private world: World;
  private player: Player;
  private dayNight: DayNight;
  private campfire: Campfire;
  private building: BuildingSystem;
  private rescue: RescueSystem;
  private quests: QuestSystem;
  private inventory = new Inventory();
  private enemies: Enemy[] = [];

  private inventoryUI: InventoryUI;
  private craftingUI: CraftingUI;
  private buildingUI: BuildingUI;

  private session = new SessionState();

  private get state(): SessionPhase {
    return this.session.phase;
  }
  private night = 1;
  private bonusNights = 0;
  private playTime = 0;
  private notesFound = new Set<string>();
  private charmTaken = false;
  private charmMesh: THREE.Group | null = null;
  private charmPos = new THREE.Vector3(-118, 0, -46);

  private interactCd = 0;
  private attackCd = 0;
  private removeMode = false;
  private spawnTimer = 0;
  private saveTimer = 0;
  private events: WorldEvents;
  private fogSurge = 0;
  private torchOn = false;
  private prompt: string | null = null;
  private promptBlocked = false;
  private deadHandled = false;
  private cheerTimer = 0;

  constructor(
    private handle: GameHandle,
    readonly seed: number,
    save: SaveData | null,
  ) {
    this.scene.fog = new THREE.FogExp2(0x8fa48b, 0.012);
    this.physics = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.physics.timestep = 1 / 60;

    this.world = new World(seed, this.scene, this.physics);

    const campX = 0;
    const campZ = 0;
    const campY = this.world.heightAt(campX, campZ);
    this.campfire = new Campfire(this.scene, new THREE.Vector3(campX, campY + 0.05, campZ));

    const controller = this.physics.createCharacterController(0.06);
    controller.enableAutostep(0.55, 0.25, true);
    controller.enableSnapToGround(0.6);
    controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((38 * Math.PI) / 180);

    const spawn = new THREE.Vector3(0, campY + 0.2, 6);
    this.player = new Player(this.physics, this.scene, spawn, controller, this.handle.settings.qualityPreset.drawDistance);
    this.camera = this.player.camera;
    this.player.onFootstep = (surface) => {
      const dist = this.player.position.distanceTo(this.campfire.position);
      this.handle.audio.footstep(dist < 8 ? 'dirt' : surface);
    };

    this.dayNight = new DayNight(this.scene);
    this.events = new WorldEvents(new RNG(seed ^ 0x9e3779b9));
    this.building = new BuildingSystem(this.scene, this.physics, this.world.terrain);
    this.rescue = new RescueSystem(this.scene, this.world.childSpots);
    this.quests = new QuestSystem();

    this.inventoryUI = new InventoryUI(document.getElementById('ui-root')!);
    this.craftingUI = new CraftingUI(document.getElementById('ui-root')!);
    this.buildingUI = new BuildingUI(document.getElementById('ui-root')!);

    this.buildCharm();
    this.prebuildCamp();

    if (save) this.applySave(save);
    else {
      this.inventory.add('wood', 3);
      this.inventory.add('fiber', 2);
      this.handle.hud.toast('Рассвет. Собери древесину и подбрось в костёр.', 5000);
      window.setTimeout(() => this.handle.hud.toast('E — взаимодействие · Tab — инвентарь · C — крафт · B — стройка', 6000), 1200);
    }

    this.handle.hud.setNight(this.night, TOTAL_NIGHTS);
    this.saveTimer = 0;
  }

  // ------------------------------------------------------------------ инициализация

  private prebuildCamp(): void {
    const y = this.world.heightAt(3.2, 0);
    this.building.restore([
      { id: 'camp_workbench', x: 3.2, y: y + 0.5, z: 0, rot: Math.PI / 2, kind: 'workbench' },
    ]);
  }

  private buildCharm(): void {
    const y = this.world.heightAt(this.charmPos.x, this.charmPos.z);
    this.charmPos.y = y;
    const group = new THREE.Group();
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff }),
    );
    group.add(orb);
    const light = new THREE.PointLight(0x8fd8ff, 3, 8, 2);
    group.add(light);
    group.position.set(this.charmPos.x, y + 1.0, this.charmPos.z);
    this.scene.add(group);
    this.charmMesh = group;
  }

  // ------------------------------------------------------------------ сохранение

  private applySave(save: SaveData): void {
    this.night = save.night;
    this.bonusNights = save.bonusNights;
    this.playTime = save.playTime;
    this.dayNight.setTime(save.phase, save.phaseTime);
    this.player.stats.health = save.stats.health;
    this.player.stats.hunger = save.stats.hunger;
    this.player.stats.stamina = save.stats.stamina;
    this.inventory.fromJSON(save.inventory);
    this.inventory.selected = 0;
    this.player.teleport(save.player.x, save.player.z, this.world.heightAt(save.player.x, save.player.z));
    this.player.yaw = save.player.yaw;
    this.player.pitch = save.player.pitch;
    this.campfire.fuel = save.campfire.fuel;
    this.campfire.lit = save.campfire.lit;
    this.notesFound = new Set(save.foundNotes);
    this.charmTaken = save.foundNotes.includes('__charm');
    if (this.charmTaken && this.charmMesh) this.charmMesh.visible = false;
    this.building.restore(save.built);
    this.quests = new QuestSystem(save.questsDone, save.questProgress);
    if (save.rescued.length > 0) {
      for (const c of this.rescue.children) {
        if (save.rescued.includes(c.id)) this.rescue.save(c);
      }
    }
    this.handle.hud.toast(`Продолжаем. Ночь ${this.night}.`, 3500);
  }

  private makeSave(): SaveData {
    const p = this.player.position;
    return {
      version: 1,
      savedAt: Date.now(),
      seed: this.seed,
      night: this.night,
      bonusNights: this.bonusNights,
      phase: this.dayNight.phase,
      phaseTime: this.dayNight.time,
      player: { x: p.x, y: p.y, z: p.z, yaw: this.player.yaw, pitch: this.player.pitch },
      stats: {
        health: this.player.stats.health,
        hunger: this.player.stats.hunger,
        stamina: this.player.stats.stamina,
      },
      inventory: this.inventory.toJSON().map((s) => (s ? { id: s.id, count: s.count } : { id: '', count: 0 })),
      hotbar: [null, null, null, null],
      campfire: { fuel: this.campfire.fuel, lit: this.campfire.lit, x: this.campfire.position.x, z: this.campfire.position.z },
      built: this.building.toJSON(),
      rescued: this.rescue.savedIds(),
      foundNotes: [...this.notesFound, ...(this.charmTaken ? ['__charm'] : [])],
      questsDone: this.quests.doneIds(),
      questProgress: this.quests.progressMap(),
      unlockedRecipes: [],
      gatheredTotal: 0,
      playTime: this.playTime,
      storyStage: 0,
    };
  }

  private async persist(): Promise<void> {
    await this.handle.save.save(this.makeSave());
    await this.handle.afterSave();
  }

  // ------------------------------------------------------------------ цикл

  update(dt: number): void {
    const hud = this.handle.hud;
    this.interactCd = Math.max(0, this.interactCd - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.cheerTimer = Math.max(0, this.cheerTimer - dt);

    if (this.state === 'playing') {
      this.playTime += dt;
      this.handleKeys();
      this.updatePlayer(dt);
      this.updateWorld(dt);
      this.updateEnemies(dt);
      this.updateInteraction();
    } else {
      // В паузах камера остаётся на месте, но мир не двигается.
      this.prompt = null;
      hud.setInteract(null);
    }

    this.updateHud();

    this.handle.audio.update(dt);
    if (this.campfire.lit) {
      const d = this.player.position.distanceTo(this.campfire.position);
      if (d < 18 && Math.random() < dt * 1.4) this.handle.audio.fireCrackle();
    }
    this.saveTimer += dt;
    if (this.saveTimer > 45 && this.state === 'playing') {
      this.saveTimer = 0;
      void this.persist();
    }
  }

  private updatePlayer(dt: number): void {
    const lock = this.handle.input.locked;
    this.player.preStep(
      dt,
      this.handle.input,
      lock && this.state === 'playing',
      this.world.terrain,
      this.handle.settings.data.headBob,
      this.handle.settings.data.sensitivity,
    );
    this.physics.step();
    this.player.stats.update(dt, this.player.sprinting, this.player.moving);
    if (this.player.stats.dead) this.handleDeath();
    if (this.player.stats.hurtFlash > 0.3) this.handle.hud.flashDamage();
    this.handle.hud.setLowHealth(this.player.stats.healthPct < 0.3);
  }

  private updateWorld(dt: number): void {
    const trans = this.dayNight.update(dt * this.handle.settings.data.daySpeed);
    if (trans.justBecameNight) this.onNightStart();
    if (trans.justBecameDay) this.onDayStart();

    if (this.fogSurge > 0) {
      this.fogSurge -= dt;
      const fog = this.scene.fog as THREE.FogExp2;
      fog.density += 0.014;
    }

    const ev = this.events.update(dt, {
      isNight: this.dayNight.isNight,
      night: this.night,
      playerPos: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
    });
    if (ev) this.applyEvent(ev);

    const crackle = this.campfire.update(dt, this.player.position);
    if (crackle.justDied) this.handle.hud.toast('Костёр погас. Нужны дрова и искра (F).', 4500);

    this.world.update(dt, this.player.position);
    this.rescue.update(dt);
    this.handle.audio.setNightLevel(this.dayNight.nightLevel);

    // Факел светит, если выбран
    const slot = this.inventory.selectedSlot();
    const wantTorch = !!slot && slot.id === 'torch';
    if (wantTorch !== this.torchOn) {
      this.torchOn = wantTorch;
      this.player.setTorch(wantTorch);
    }

    if (this.charmMesh && !this.charmTaken) {
      this.charmMesh.rotation.y += dt * 1.4;
      this.charmMesh.position.y = this.charmPos.y + 1.0 + Math.sin(this.playTime * 1.6) * 0.12;
    }

    if (this.building.selected) {
      this.building.updateGhost(this.player.position, this.player.lookDir(), this.inventory);
    }
  }

  private updateEnemies(dt: number): void {
    const nightNow = this.dayNight.nightLevel;
    if (this.dayNight.isNight) {
      this.spawnTimer -= dt;
      const maxE = maxEnemiesForNight(this.night);
      if (this.spawnTimer <= 0 && this.enemies.length < maxE) {
        this.spawnTimer = Math.max(3.5, 11 - this.night * 0.05);
        this.spawnEnemy();
      }
    } else {
      this.spawnTimer = 1.5;
    }

    const ctx = {
      playerPos: this.player.position,
      terrain: this.world.terrain,
      physics: this.physics,
      playerLit: this.torchOn || this.player.position.distanceTo(this.campfire.position) < this.campfire.safeRadius(),
      playerRunning: this.player.sprinting,
    };

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        e.dispose();
        this.enemies.splice(i, 1);
        continue;
      }
      const dist = e.position.distanceTo(this.player.position);
      // Дальние враги думают реже — экономия кадров
      const result = e.update(dist > 70 ? dt * 0.2 : dt, ctx);
      if (result.attacked && dist < e.stats.attackRange + 1.0) {
        const died = this.player.damage(e.stats.damage);
        this.handle.audio.hurt();
        this.handle.hud.flashDamage();
        if (died) this.handleDeath();
      }
      if (dist < 26 && Math.random() < dt * 0.12) {
        const pan = this.panTo(e.position);
        this.handle.audio.growl(pan, Math.max(0.25, 1 - dist / 40));
      }
    }

    // Утро — твари уходят
    if (!this.dayNight.isNight && nightNow < 0.2 && this.enemies.length > 0 && Math.random() < dt * 0.6) {
      const e = this.enemies[0];
      e.takeDamage(999);
    }
  }

  private panTo(pos: THREE.Vector3): number {
    const dir = pos.clone().sub(this.player.position).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
    return THREE.MathUtils.clamp(dir.dot(right), -1, 1);
  }

  private spawnEnemy(): void {
    const kinds: EnemyKind[] = [];
    if (this.night >= 1) kinds.push('crawler', 'crawler');
    if (this.night >= 3) kinds.push('hunter', 'hunter');
    if (this.night >= 8) kinds.push('bog');
    if (this.night >= 20 && Math.random() < 0.15) kinds.push('deer');
    if (this.night >= 99) kinds.push('deer');
    const kind = kinds[Math.floor(Math.random() * kinds.length)] ?? 'crawler';

    const angle = Math.random() * Math.PI * 2;
    const dist = 34 + Math.random() * 26;
    const x = this.player.position.x + Math.cos(angle) * dist;
    const z = this.player.position.z + Math.sin(angle) * dist;
    const y = this.world.heightAt(x, z);
    if (y < 0.4) return;
    const zone = zoneAt(x, z);
    if (zone.danger < 1 && Math.random() < 0.6) return;
    const enemy = new Enemy(kind, new THREE.Vector3(x, y, z), this.scene);
    if (this.night >= 99) {
      enemy.stats.hp = 420;
      enemy.hp = 420;
    }
    this.enemies.push(enemy);
  }

  private onNightStart(): void {
    this.handle.hud.toast(`НОЧЬ ${this.night}. Огонь — единственный друг.`, 4500);
    this.handle.audio.setNightLevel(1);
    this.spawnTimer = 0;
    this.handle.save.save(this.makeSave()).then(() => this.handle.afterSave());
    if (this.night === 99) {
      this.handle.hud.toast('Последняя ночь. Хозяин леса идёт за тобой.', 6000);
      const x = this.player.position.x + 26;
      const z = this.player.position.z - 20;
      const deer = new Enemy('deer', new THREE.Vector3(x, this.world.heightAt(x, z), z), this.scene);
      deer.stats.hp = 520;
      deer.hp = 520;
      this.enemies.push(deer);
    }
  }

  private onDayStart(): void {
    const survived = this.night;
    this.night++;
    this.handle.hud.toast(`Ночь пережита! Начинается день ${this.night}.`, 5000);
    this.handle.audio.setNightLevel(0);
    for (const e of this.enemies) e.takeDamage(9999);
    const completed = this.quests.notify('night_survived', 1);
    for (const q of completed) this.completeQuest(q.title);

    this.player.stats.heal(8);
    this.player.stats.feed(4);

    if (this.night > TOTAL_NIGHTS) {
      this.handleVictory();
    }
    void this.persist();
    void survived;
  }

  private completeQuest(title: string): void {
    this.handle.hud.toast(`Задание выполнено: ${title}`, 4200);
    this.handle.audio.pickup();
  }

  private applyEvent(kind: WorldEventKind): void {
    switch (kind) {
      case 'fog':
        this.fogSurge = 40;
        this.handle.hud.toast('Туман сгущается. Видно хуже.', 3200);
        break;
      case 'whisper':
        this.handle.audio.growl(this.panTo(this.player.position.clone().add(new THREE.Vector3(6, 0, -4))), 0.8);
        this.handle.hud.toast('Где-то в темноте хрустнула ветка.', 3200);
        break;
      case 'supplies':
        this.inventory.add('fiber', 3);
        this.inventory.add('berry', 2);
        this.handle.hud.toast('У тропы нашлись припасы: 3 волокна и 2 ягоды.', 3200);
        this.handle.audio.pickup();
        break;
      case 'figure': {
        const angle = Math.random() * Math.PI * 2;
        const x = this.player.position.x + Math.cos(angle) * 55;
        const z = this.player.position.z + Math.sin(angle) * 55;
        const y = this.world.heightAt(x, z);
        if (y > 0.4) {
          this.enemies.push(new Enemy('hunter', new THREE.Vector3(x, y, z), this.scene));
          this.handle.hud.toast('На опушке мелькнула фигура.', 3200);
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ ввод

  private handleKeys(): void {
    const input = this.handle.input;
    if (!input.locked) return;

    if (input.wasPressed('Tab')) return this.openInventory();
    if (input.wasPressed('KeyC')) return this.openCrafting();
    if (input.wasPressed('KeyB')) return this.openBuilding();
    if (input.wasPressed('KeyE')) return this.tryInteract();
    if (input.wasPressed('KeyF')) return this.trySpecial();
    if (input.wasPressed('KeyX') && (this.building.selected || this.removeMode)) {
      this.building.select(null);
      this.removeMode = false;
      this.handle.hud.toast('Режим строительства отменён.', 1800);
      return;
    }

    for (let i = 0; i < 4; i++) {
      if (input.wasPressed(`Digit${i + 1}`)) {
        this.inventory.select(i);
        this.handle.audio.uiClick();
      }
    }

    if (input.leftDown && this.attackCd <= 0) {
      this.attackCd = 0.4;
      if (this.building.selected) this.tryPlace();
      else this.tryAttack();
    }
    if (input.rightDown && this.attackCd <= 0) {
      this.attackCd = 0.4;
      this.quickTorch();
    }
  }

  private tryPlace(): void {
    const kind = this.building.selected;
    if (!kind) return;
    if (!this.building.canPlace) {
      this.handle.hud.toast(this.building.reason || 'Здесь нельзя строить.', 2000);
      return;
    }
    const piece = this.building.place(this.inventory);
    if (!piece) {
      this.handle.hud.toast('Не хватает материалов.', 2000);
      return;
    }
    this.handle.audio.build();
    this.handle.hud.toast(`Построено: ${BUILD_DEFS[kind].name}`, 1800);
    this.quests.notify('build', 1).forEach((q) => this.completeQuest(q.title));
  }

  private quickTorch(): void {
    const idx = this.inventory.slots.findIndex((s) => s?.id === 'torch');
    if (idx >= 0 && idx < 4) {
      this.inventory.select(idx);
      this.handle.audio.uiClick();
    } else if (idx >= 4) {
      this.handle.hud.toast('Факел лежит в рюкзаке — переложи его в быстрый слот.', 3000);
    } else {
      this.handle.hud.toast('Факела нет. Нужны дерево и волокно (C).', 3000);
    }
  }

  private tryAttack(): void {
    const dir = this.player.lookDir();
    const origin = this.player.eyePosition;
    const slot = this.inventory.selectedSlot();
    const def = slot ? ITEMS[slot.id] : null;
    const damage = def?.damage ?? 7;

    let best: Enemy | null = null;
    let bestD = 3.0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const to = e.position.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(origin);
      const d = to.length();
      if (d > bestD) continue;
      if (to.normalize().angleTo(dir) > 0.8) continue;
      best = e;
      bestD = d;
    }
    if (best) {
      this.handle.audio.hit();
      const killed = best.takeDamage(damage);
      if (killed) {
        this.handle.hud.toast('Тварь повержена.', 2200);
        this.quests.notify('kill', 1);
      }
      return;
    }

    // Если впереди дерево/камень — бьём по нему
    const node = this.world.findNode(origin, dir, 3.2);
    if (node && this.interactCd <= 0) {
      this.interactCd = 0.35;
      this.gather(node);
    }
  }

  private tryInteract(): void {
    if (this.interactCd > 0) return;
    this.interactCd = 0.3;
    const pos = this.player.position;
    const dir = this.player.lookDir();

    const child = this.rescue.nearest(pos, 3.4);
    if (child) return this.rescueChild(child.id);

    const note = this.nearestNote(pos, 2.6);
    if (note) return this.readNote(note.id);

    if (pos.distanceTo(this.campfire.position) < 3.4) return this.feedFire();

    const node = this.world.findNode(this.player.eyePosition, dir, PLAYER.interactRange);
    if (node) return this.gather(node);

    if (!this.charmTaken && this.charmMesh && pos.distanceTo(this.charmPos) < 2.8) {
      this.charmTaken = true;
      this.charmMesh.visible = false;
      this.inventory.add('charm', 1);
      this.handle.audio.pickup();
      this.handle.hud.toast('Ты нашёл оберег. Он тёплый.', 4000);
      return;
    }

    this.handle.hud.toast('Рядом ничего нет.', 1500);
  }

  private trySpecial(): void {
    const pos = this.player.position;
    if (this.removeMode) {
      const removed = this.building.removeNear(pos, 3.0);
      if (removed) {
        const def = BUILD_DEFS[removed.kind];
        this.inventory.refund({
          wood: Math.ceil((def.cost.wood ?? 0) / 2),
          stone: Math.ceil((def.cost.stone ?? 0) / 2),
          fiber: Math.ceil((def.cost.fiber ?? 0) / 2),
          metal: Math.ceil((def.cost.metal ?? 0) / 2),
        });
        this.handle.audio.build();
        this.handle.hud.toast(`Разобрано: ${def.name}`, 2000);
      } else {
        this.handle.hud.toast('Нечего разбирать рядом.', 1500);
      }
      return;
    }
    if (pos.distanceTo(this.campfire.position) < 3.6) {
      if (!this.campfire.lit) {
        if (this.campfire.fuel > 0) {
          this.campfire.relight();
          this.handle.hud.toast('Костёр снова горит.', 2200);
          this.handle.audio.build();
        } else if (this.inventory.remove('wood', 2)) {
          this.campfire.addFuel(18);
          this.campfire.relight();
          this.handle.hud.toast('Костёр снова горит.', 2200);
          this.handle.audio.build();
        } else {
          this.handle.hud.toast('Нужно 2 дерева, чтобы разжечь.', 2200);
        }
        return;
      }
      this.feedFire();
      return;
    }
    this.handle.hud.toast('F: у костра — подбросить дров. В режиме стройки — разобрать.', 2600);
  }

  private feedFire(): void {
    if (this.campfire.fuel >= this.campfire.maxFuel) {
      this.handle.hud.toast('Костёр и так полон.', 1600);
      return;
    }
    if (!this.inventory.remove('wood', 2)) {
      this.handle.hud.toast('Нужно 2 дерева.', 1600);
      return;
    }
    this.campfire.addFuel(18);
    this.handle.audio.build();
    this.handle.hud.toast('Дрова подброшены.', 1600);
    const done = this.quests.notify('fuel', 1);
    for (const q of done) this.completeQuest(q.title);
  }

  private gather(node: ReturnType<World['findNode']>): void {
    if (!node) return;
    const slot = this.inventory.selectedSlot();
    const tool = slot ? ITEMS[slot.id]?.tool : undefined;
    const hasTool = !!node.requiresTool && node.requiresTool === tool;
    const damage = hasTool ? 55 : 22;
    const loot = this.world.hitNode(node, damage, hasTool);
    if (!loot) return;
    this.handle.audio.chop();
    for (const l of loot) {
      const left = this.inventory.add(l.id as ItemId, l.n);
      if (left > 0) this.handle.hud.toast('Инвентарь полон!', 2200);
      else this.handle.hud.toast(`+${l.n} ${ITEMS[l.id as ItemId].name}`, 1400);
      if (l.id === 'wood') this.quests.notify('gather_wood', l.n);
      if (l.id === 'stone') this.quests.notify('gather_stone', l.n);
      if (l.id === 'berry' || l.id === 'meat') this.quests.notify('gather_food', l.n);
    }
    for (const q of this.quests.notify('gather_wood', 0)) void q;
  }

  private nearestNote(pos: THREE.Vector3, range: number): { id: string; title: string; text: string } | null {
    for (const n of this.world.notes) {
      if (this.notesFound.has(n.id)) continue;
      if (n.pos.distanceTo(pos) < range) return n;
    }
    return null;
  }

  private readNote(id: string): void {
    const note = this.world.notes.find((n) => n.id === id);
    if (!note) return;
    if (!this.enterUI('note')) return;
    this.handle.audio.uiClick();
    this.handle.screens.showNote(note.title, note.text, () => {
      this.notesFound.add(id);
      this.handle.hud.toast('Записка добавлена в дневник.', 2600);
      this.quests.notify('note', 1).forEach((q) => this.completeQuest(q.title));
      this.closeUI();
    });
  }

  private rescueChild(id: string): void {
    const child = this.rescue.children.find((c) => c.id === id);
    if (!child || child.saved) return;
    const lines: Record<string, string> = {
      child1: 'Я спряталась здесь, когда оно пришло. Оно ходит вокруг и нюхает воздух. Не беги — оно слышит бег.',
      child2: 'Взрослые ушли к вышке и не вернулись. Я видел, как оно стояло у окна и смотрело внутрь. Оно не входит, если горит огонь.',
      child3: 'В пещере есть рисунки. Олень был не всегда злым — так написано. Кто-то его разбудил.',
      child4: 'Я держал костёр всю ночь. Оно приходило три раза. Я думал, что умру. Ты правда пришёл?',
    };
    if (!this.enterUI('dialog')) return;
    this.handle.screens.showDialog(
      `${child.name} — спасённый ребёнок`,
      `${lines[child.id] ?? 'Спасибо, что нашёл меня.'}\n\n${child.hint}. Я буду ждать тебя в лагере.`,
      () => {
        this.rescue.save(child);
        this.bonusNights++;
        this.inventory.add('berry', 2);
        this.inventory.add('bandage', 1);
        this.handle.hud.toast(`${child.name} спасён(а)! Бонусная ночь: ${this.bonusNights}`, 4200);
        this.handle.audio.pickup();
        this.quests.notify('rescue', 1).forEach((q) => this.completeQuest(q.title));
        this.closeUI();
      },
    );
  }

  // ------------------------------------------------------------------ окна

  private openInventory(): void {
    if (this.inventoryUI.isOpen) return;
    if (!this.enterUI('inventory')) return;
    this.inventoryUI.open(this.inventory, {
      onUse: (id) => this.useItem(id),
      onDrop: (slot) => {
        const s = this.inventory.slots[slot];
        if (s) {
          this.inventory.slots[slot] = null;
          this.handle.hud.toast(`Выброшено: ${ITEMS[s.id].name}`, 1600);
        }
      },
      onEquip: (slot) => {
        const s = this.inventory.slots[slot];
        if (!s || slot < 4) return;
        const free = this.inventory.slots.findIndex((x, i) => i < 4 && !x);
        if (free >= 0) {
          this.inventory.slots[free] = s;
          this.inventory.slots[slot] = null;
          this.inventory.select(free);
        }
      },
      onClose: () => this.closeUI(),
    });
  }

  private useItem(id: ItemId): void {
    const def = ITEMS[id];
    if (def.heal) {
      this.player.stats.heal(def.heal);
      this.inventory.remove(id, 1);
      this.handle.audio.pickup();
      this.handle.hud.toast(`+${def.heal} здоровья`, 1600);
      return;
    }
    if (def.hunger) {
      this.player.stats.feed(def.hunger);
      this.inventory.remove(id, 1);
      this.handle.audio.pickup();
      this.handle.hud.toast(`+${def.hunger} сытости`, 1600);
      return;
    }
    this.handle.hud.toast('Это нельзя использовать.', 1600);
  }

  private openCrafting(): void {
    if (this.craftingUI.isOpen) return;
    if (!this.enterUI('crafting')) return;
    const hasBench = this.building.hasWorkbenchNear(this.player.position);
    this.craftingUI.open(
      this.inventory,
      hasBench,
      (recipe: Recipe) => this.craftItem(recipe, hasBench),
      () => this.closeUI(),
    );
  }

  private craftItem(recipe: Recipe, hasBench: boolean): void {
    if (!canCraft(this.inventory, recipe, hasBench)) {
      this.handle.hud.toast('Не хватает материалов.', 2000);
      return;
    }
    if (!craft(this.inventory, recipe, hasBench)) {
      this.handle.hud.toast('Не хватает места в инвентаре.', 2000);
      return;
    }
    this.handle.audio.craft();
    this.handle.hud.toast(`Создано: ${recipe.name}`, 2000);
    this.quests.notify('craft', 1).forEach((q) => this.completeQuest(q.title));
  }

  private openBuilding(): void {
    if (this.buildingUI.isOpen) return;
    if (!this.enterUI('building')) return;
    this.buildingUI.open(
      this.inventory,
      (kind: BuildKind | null) => this.startBuild(kind),
      () => {
        this.removeMode = true;
        this.handle.hud.toast('Режим разборки: подойди и нажми F.', 2600);
      },
      () => this.closeUI(),
    );
  }

  private startBuild(kind: BuildKind | null): void {
    this.removeMode = false;
    this.building.select(kind);
    if (kind) this.handle.hud.toast(`${BUILD_DEFS[kind].name}: ЛКМ — поставить, Esc — отмена`, 3000);
  }

  /** Открывает модальное окно и забирает управление. */
  private enterUI(mode: Exclude<UiMode, 'pause'>): boolean {
    if (!this.session.openUi(mode)) return false;
    this.handle.input.enabled = false;
    this.handle.input.releaseLock();
    return true;
  }

  private closeUI(): void {
    this.inventoryUI.close();
    this.craftingUI.close();
    this.buildingUI.close();
    this.handle.screens.clear();
    if (!this.session.closeUi()) return;
    this.handle.input.enabled = true;
    // Сбрасываем зажатые клавиши, иначе после «Продолжить» игрок уезжает сам.
    this.handle.input.clear();
    this.handle.input.requestLock();
  }

  /** Показывает меню паузы поверх текущего состояния (мир уже остановлен). */
  private showPauseMenu(): void {
    this.handle.screens.showPause({
      resume: () => this.closeUI(),
      settings: () => this.openPauseSubscreen('settings'),
      controls: () => this.openPauseSubscreen('controls'),
      lobby: () => {
        void this.persist().then(() => this.handle.toLobby());
      },
      menu: () => {
        void this.persist().then(() => this.handle.toMenu());
      },
    });
  }

  private openPauseSubscreen(kind: 'settings' | 'controls'): void {
    if (!this.session.openNested()) return;
    this.handle.screens.clear();
    const back = () => this.pause();
    if (kind === 'settings') this.handle.screens.showSettings(back);
    else this.handle.screens.showControls(back);
  }

  pause(): void {
    if (!this.session.openPause()) return;
    this.handle.input.enabled = false;
    this.handle.input.releaseLock();
    this.showPauseMenu();
  }

  onPointerLock(locked: boolean): void {
    if (!locked && this.session.isPlaying) this.pause();
  }

  // ------------------------------------------------------------------ смерть и финал

  private handleDeath(): void {
    if (this.deadHandled || this.state === 'dead') return;
    if (this.bonusNights > 0) {
      this.bonusNights--;
      this.player.stats.dead = false;
      this.player.stats.health = 55;
      this.player.stats.hunger = Math.max(this.player.stats.hunger, 30);
      const p = this.campfire.position;
      this.player.teleport(p.x + 2, p.z + 2, this.world.heightAt(p.x + 2, p.z + 2));
      this.handle.hud.toast(`Оберег детей спас тебя. Осталось бонусных ночей: ${this.bonusNights}`, 5000);
      this.handle.audio.pickup();
      return;
    }
    this.deadHandled = true;
    this.session.die();
    this.handle.input.releaseLock();
    this.handle.input.enabled = false;
    this.handle.audio.hit();
    this.handle.screens.showDeath(
      { nights: this.night - 1, rescued: this.rescue.savedCount, notes: this.notesFound.size },
      () => this.handle.toGame(null),
      () => this.handle.toLobby(),
    );
  }

  private handleVictory(): void {
    if (this.state === 'victory') return;
    this.session.win();
    this.handle.input.releaseLock();
    this.handle.input.enabled = false;
    const rescued = this.rescue.savedCount;
    let outcome = 'Ты дожил до конца. Лес отпустил тебя — но не ответил на все вопросы.';
    if (this.charmTaken && rescued >= 4) outcome = 'Оберег и спасённые дети открыли правду: лес не был злым. Он просто ждал.';
    else if (this.charmTaken) outcome = 'Ты узнал имя Хозяина и ушёл живым. Некоторые дети остались в лесу.';
    this.handle.screens.showVictory(
      { nights: TOTAL_NIGHTS, rescued, notes: this.notesFound.size, outcome },
      () => this.handle.toGame(null),
      () => this.handle.toLobby(),
    );
  }

  // ------------------------------------------------------------------ подсказки и HUD

  private updateInteraction(): void {
    if (!this.handle.input.locked) {
      this.handle.hud.setInteract(
        this.state === 'playing' ? '<span class="key-hint">ЛКМ</span>Кликни по экрану, чтобы захватить мышь' : null,
      );
      return;
    }
    const pos = this.player.position;
    const dir = this.player.lookDir();
    let html: string | null = null;
    let blocked = false;

    const child = this.rescue.nearest(pos, 3.4);
    if (child) html = `<span class="key-hint">E</span>Спасти ${child.name}`;
    else if (this.nearestNote(pos, 2.6)) html = `<span class="key-hint">E</span>Прочитать записку`;
    else if (pos.distanceTo(this.campfire.position) < 3.6) {
      html = this.campfire.lit
        ? `<span class="key-hint">E</span>Подбросить дрова · топливо ${Math.round(this.campfire.fuel)}%`
        : `<span class="key-hint">F</span>Разжечь костёр`;
      blocked = !this.campfire.lit;
    } else if (!this.charmTaken && this.charmMesh && pos.distanceTo(this.charmPos) < 2.8) {
      html = `<span class="key-hint">E</span>Взять оберег`;
    } else {
      const node = this.world.findNode(this.player.eyePosition, dir, PLAYER.interactRange);
      if (node) {
        const slot = this.inventory.selectedSlot();
        const tool = slot ? ITEMS[slot.id]?.tool : undefined;
        const ok = !node.requiresTool || node.requiresTool === tool;
        html = ok ? `<span class="key-hint">E</span>${node.label} — добыть` : `<span class="key-hint">E</span>${node.label} — добыть (медленно, нужен инструмент)`;
      }
    }

    if (this.building.selected) {
      html = this.building.canPlace
        ? `<span class="key-hint">ЛКМ</span>Поставить: ${BUILD_DEFS[this.building.selected].name}`
        : this.building.reason;
      blocked = !this.building.canPlace;
    } else if (this.removeMode) {
      html = `<span class="key-hint">F</span>Разобрать постройку`;
    }

    this.prompt = html;
    this.promptBlocked = blocked;
    this.handle.hud.setInteract(html, blocked);
  }

  private updateHud(): void {
    const hud = this.handle.hud;
    const st = this.player.stats;
    hud.setStats(st.healthPct * 100, st.hungerPct * 100, st.staminaPct * 100);
    hud.setNight(this.night, TOTAL_NIGHTS);
    hud.setClock(this.dayNight.clockLabel(), this.dayNight.isNight);
    const near = this.player.position.distanceTo(this.campfire.position) < 24;
    hud.setFire(this.campfire.fuel, this.campfire.lit, near);
    hud.setResources({
      wood: this.inventory.countOf('wood'),
      stone: this.inventory.countOf('stone'),
      fiber: this.inventory.countOf('fiber'),
    });
    hud.setRescued(this.rescue.savedCount, this.rescue.total);
    hud.setHotbar(this.inventory);

    const main = this.quests.currentMain();
    if (main) {
      // показываем задание по прогрессу
      hud.setQuest(main.quest.title, main.quest.desc, `${main.state.progress} / ${main.quest.target}`);
    } else {
      hud.setQuest('Девяносто девять', 'Переживи оставшиеся ночи.', `${this.night} / ${TOTAL_NIGHTS}`);
    }
    if (this.bonusNights > 0) {
      hud.setQuest('Оберег детей', `Бонусных ночей: ${this.bonusNights}`, '');
    }
  }

  resolveInteraction(): void {
    // заготовка для внешних вызовов (например, кнопки интерфейса)
    void this.prompt;
    void this.promptBlocked;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.inventoryUI.close();
    this.craftingUI.close();
    this.buildingUI.close();
    this.handle.screens.clear();
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.rescue.dispose();
    this.building.dispose();
    this.campfire.dispose();
    this.dayNight.dispose();
    this.world.dispose();
    this.player.dispose();
    this.physics.free();
    this.scene.clear();
  }
}
