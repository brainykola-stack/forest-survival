import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PLAYER } from '../core/Config';
import type { InputManager } from '../core/InputManager';
import type { Terrain } from '../world/Terrain';
import { PlayerStats } from './PlayerStats';

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
  private weaponKind: 'rifle' | null = null;

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

  /** Простая модель оружия в руках от первого лица. */
  setWeapon(kind: 'rifle' | null): void {
    if (this.weaponKind === kind) return;
    this.weaponKind = kind;
    if (this.weaponGroup) {
      this.camera.remove(this.weaponGroup);
      this.weaponGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.weaponGroup = null;
    }
    if (!kind) return;

    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
    const metal = new THREE.MeshLambertMaterial({ color: 0x27272b });

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.55), wood);
    stock.position.set(0.24, -0.22, -0.55);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.85, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.24, -0.16, -0.95);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), wood);
    grip.position.set(0.24, -0.32, -0.42);
    group.add(stock, barrel, grip);
    group.position.set(0, 0, 0);
    this.camera.add(group);
    this.weaponGroup = group;
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
