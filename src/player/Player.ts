import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PLAYER } from '../core/Config';
import type { InputManager } from '../core/InputManager';
import type { Terrain } from '../world/Terrain';
import { PlayerStats } from './PlayerStats';
import { modelLibrary, type ModelInstance } from '../core/ModelLibrary';

/** Размер и положение предмета в руке. length — желаемая длина в метрах. */
const HELD_CONFIG: Record<string, { key?: string; length: number; pos: [number, number, number] }> = {
  axe: { key: 'axe', length: 0.5, pos: [0.23, -0.24, -0.42] },
  torch: { key: 'torch', length: 0.45, pos: [0.25, -0.24, -0.45] },
  rifle: { key: 'shotgun', length: 0.58, pos: [0.19, -0.2, -0.42] },
  spear: { length: 1.3, pos: [0.22, -0.26, -0.55] },
  pickaxe: { length: 0.62, pos: [0.23, -0.24, -0.45] },
};

/** Разворачивает предмет самой длинной осью вперёд (-Z). */
function orientForward(root: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y >= size.x && size.y >= size.z) {
    root.rotation.x = -Math.PI / 2;
  } else if (size.x >= size.z) {
    root.rotation.y = Math.PI / 2;
  } else {
    // Длинная ось уже Z: разворачиваем, чтобы «дуло» смотрело от игрока.
    root.rotation.y = Math.PI;
  }
}

/** Игрок от первого лица: кинематический контроллер Rapier, камера, покачивание. */
export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly stats = new PlayerStats();
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;

  yaw = 0;
  pitch = 0;
  grounded = false;
  sprinting = false;
  moving = false;

  onFootstep: ((surface: 'grass' | 'dirt' | 'stone' | 'water') => void) | null = null;

  torchLight: THREE.PointLight;
  torchOn = false;
  private weaponGroup: THREE.Group | null = null;
  private weaponKind: string | null = null;
  private heldModel: ModelInstance | null = null;

  private velY = 0;
  private velX = 0;
  private velZ = 0;
  private controller: RAPIER.KinematicCharacterController;
  private bobPhase = 0;
  private bobAmount = 0;
  private baseEye = PLAYER.height - 0.12;
  private shake = 0;

  constructor(
    private physics: RAPIER.World,
    scene: THREE.Scene,
    spawn: THREE.Vector3,
    controller: RAPIER.KinematicCharacterController,
    private drawDistance: number,
  ) {
    this.controller = controller;

    this.camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.08, drawDistance);
    scene.add(this.camera);

    const halfH = PLAYER.height / 2 - PLAYER.radius;
    this.body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + PLAYER.height / 2 + 0.2, spawn.z),
    );
    this.collider = physics.createCollider(
      RAPIER.ColliderDesc.capsule(halfH, PLAYER.radius).setFriction(0.2),
      this.body,
    );

    this.torchLight = new THREE.PointLight(0xffc070, 0, 14, 2);
    this.torchLight.position.set(0, -0.1, 0);
    this.camera.add(this.torchLight);
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y - PLAYER.height / 2, t.z);
  }

  get eyePosition(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y + 0.35, t.z);
  }

  lookDir(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return dir.normalize();
  }

  handleMouse(dx: number, dy: number, sensitivity: number): void {
    const s = 0.0022 * sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  setTorch(on: boolean): void {
    this.torchOn = on;
    this.torchLight.intensity = on ? 6.5 : 0;
  }

  /**
   * Предмет в руках от первого лица. Для топора, факела и ружья берём
   * готовые GLB-модели, для остального — простая геометрия.
   */
  setHeldItem(id: string | null): void {
    if (this.weaponKind === id) return;
    this.weaponKind = id;
    if (this.weaponGroup) {
      this.camera.remove(this.weaponGroup);
      this.heldModel?.dispose();
      this.heldModel = null;
      this.weaponGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.weaponGroup = null;
    }
    if (!id) return;

    const cfg = HELD_CONFIG[id];
    if (!cfg) return;

    const group = new THREE.Group();
    group.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    group.rotation.set(0.12, -0.22, 0.08);
    this.camera.add(group);
    this.weaponGroup = group;

    if (cfg.key) {
      const instance = modelLibrary.create(cfg.key, cfg.length);
      if (instance) {
        orientForward(instance.root);
        // Центрируем модель в руке, чтобы она не уезжала в камеру.
        const box = new THREE.Box3().setFromObject(instance.root);
        const center = box.getCenter(new THREE.Vector3());
        instance.root.position.sub(center);
        group.add(instance.root);
        this.heldModel = instance;
        return;
      }
    }

    // Процедурный запасной вариант: копьё и кирка.
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
    const metal = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
    if (id === 'spear') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.4, 6), wood);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.set(0, 0, -0.6);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 6), metal);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(0, 0, -1.35);
      group.add(shaft, tip);
    } else if (id === 'pickaxe') {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.85, 6), wood);
      handle.rotation.x = Math.PI / 2;
      handle.position.set(0, 0, -0.45);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.06), metal);
      head.position.set(0, 0.02, -0.85);
      head.rotation.z = 0.25;
      group.add(handle, head);
    }
  }

  damage(amount: number): boolean {
    const died = this.stats.applyDamage(amount);
    if (!died && amount > 0) this.shake = 0.35;
    return died;
  }

  /** Физика и камера. Вызывается до шага физики. */
  preStep(dt: number, input: InputManager, enabled: boolean, terrain: Terrain, headBob: boolean, sensitivity: number): void {
    if (enabled) {
      const { dx, dy } = input.consumeMouse();
      this.handleMouse(dx, dy, sensitivity);
    } else {
      input.consumeMouse();
    }

    const axis = enabled ? input.moveAxis() : { x: 0, y: 0 };
    this.moving = axis.x !== 0 || axis.y !== 0;
    const wantSprint = enabled && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
    this.sprinting = wantSprint && this.moving && this.stats.stamina > 1;

    const speed = this.sprinting ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // вперёд = (-sin, -cos)
    const dirX = axis.x * cos - axis.y * sin;
    const dirZ = -axis.x * sin - axis.y * cos;

    const targetX = dirX * speed;
    const targetZ = dirZ * speed;

    const accel = this.grounded ? PLAYER.accel : PLAYER.accel * 0.35;
    let vx = this.velX;
    let vz = this.velZ;
    const blend = Math.min(1, accel * dt * 0.35);
    vx += (targetX - vx) * blend;
    vz += (targetZ - vz) * blend;
    if (!this.moving && this.grounded) {
      const damp = Math.max(0, 1 - PLAYER.friction * dt);
      vx *= damp;
      vz *= damp;
    }
    this.velX = vx;
    this.velZ = vz;

    if (this.grounded && this.velY < 0) this.velY = -1.2;
    this.velY -= PLAYER.gravity * dt;
    if (enabled && input.isDown('Space') && this.grounded) {
      this.velY = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    this.velY = Math.max(this.velY, -55);

    const desired = { x: vx * dt, y: this.velY * dt, z: vz * dt };
    this.controller.computeColliderMovement(this.collider, desired);
    const mv = this.controller.computedMovement();
    const pos = this.body.translation();
    this.body.setNextKinematicTranslation({ x: pos.x + mv.x, y: pos.y + mv.y, z: pos.z + mv.z });
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.velY < 0) this.velY = 0;

    // Шаги и покачивание
    const horiz = Math.hypot(vx, vz);
    if (this.moving && this.grounded && horiz > 0.5) {
      this.bobPhase += dt * (this.sprinting ? 13 : 8.5);
      const stepEvery = this.sprinting ? 0.34 : 0.5;
      if (this.bobPhase > Math.PI * 2) this.bobPhase -= Math.PI * 2;
      this.bobAmount += dt;
      if (this.bobAmount > stepEvery) {
        this.bobAmount = 0;
        const surface = terrain.heightAt(this.position.x, this.position.z) < 0.2 ? 'water' : 'grass';
        this.onFootstep?.(surface);
      }
    } else {
      this.bobPhase += dt * 2;
      this.bobAmount = 0;
    }

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);

    // Камера
    const bodyPos = this.body.translation();
    const bobY = headBob && this.grounded && this.moving ? Math.sin(this.bobPhase) * (this.sprinting ? 0.055 : 0.03) : 0;
    const bobX = headBob && this.grounded && this.moving ? Math.cos(this.bobPhase * 0.5) * 0.02 : 0;
    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.18 : 0;
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.18 : 0;
    this.camera.position.set(bodyPos.x + bobX + shakeX, bodyPos.y + this.baseEye + bobY + shakeY, bodyPos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    void sensitivity;
  }

  teleport(x: number, z: number, y: number): void {
    this.body.setTranslation({ x, y: y + PLAYER.height / 2 + 0.2, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + PLAYER.height / 2 + 0.2, z });
    this.velY = 0;
  }

  dispose(): void {
    this.physics.removeRigidBody(this.body);
    this.camera.removeFromParent();
    this.torchLight.removeFromParent();
  }
}
