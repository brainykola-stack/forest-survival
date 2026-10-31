import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BUILD_DEFS, type BuildKind } from './Building';
import type { Inventory } from './Inventory';
import type { Terrain } from '../world/Terrain';
import { BUILD_SNAP } from '../core/Config';

export interface PlacedPiece {
  id: string;
  kind: BuildKind;
  x: number;
  y: number;
  z: number;
  rot: number;
  group: THREE.Group;
  collider: RAPIER.Collider | null;
}

/** Строительство: призрак, проверка места, установка и разборка. */
export class BuildingSystem {
  readonly group = new THREE.Group();
  pieces: PlacedPiece[] = [];
  selected: BuildKind | null = null;
  ghost: THREE.Mesh | null = null;
  private ghostOk = false;
  private ghostReason = '';
  private seq = 0;
  private ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x6fd08a, transparent: true, opacity: 0.42, depthWrite: false });
  private ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xd05a4a, transparent: true, opacity: 0.38, depthWrite: false });
  private nextPos = new THREE.Vector3();
  private nextRot = 0;

  constructor(
    private scene: THREE.Scene,
    private physics: RAPIER.World,
    private terrain: Terrain,
  ) {
    scene.add(this.group);
  }

  select(kind: BuildKind | null): void {
    this.selected = kind;
    if (this.ghost) {
      this.ghost.removeFromParent();
      this.ghost.geometry.dispose();
      this.ghost = null;
    }
    if (!kind) return;
    const def = BUILD_DEFS[kind];
    const geo = new THREE.BoxGeometry(def.size.x, def.size.y, def.size.z);
    this.ghost = new THREE.Mesh(geo, this.ghostMatBad);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  updateGhost(playerPos: THREE.Vector3, lookDir: THREE.Vector3, inv: Inventory): void {
    if (!this.selected || !this.ghost) return;
    const def = BUILD_DEFS[this.selected];
    const flat = new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize();
    const dist = Math.min(6.5, Math.max(2.2, 2.2 + (def.size.x + def.size.z) * 0.4));
    const target = playerPos.clone().addScaledVector(flat, dist);
    const snappedX = Math.round(target.x / BUILD_SNAP) * BUILD_SNAP;
    const snappedZ = Math.round(target.z / BUILD_SNAP) * BUILD_SNAP;
    const groundY = this.terrain.heightAt(snappedX, snappedZ);

    this.nextPos.set(snappedX, groundY + def.size.y / 2, snappedZ);
    this.nextRot = Math.round(Math.atan2(flat.x, flat.z) / (Math.PI / 2)) * (Math.PI / 2);

    this.ghost.position.copy(this.nextPos);
    this.ghost.rotation.y = this.nextRot;
    this.ghost.visible = true;

    const check = this.validate(def, snappedX, snappedZ, groundY, inv);
    this.ghostOk = check.ok;
    this.ghostReason = check.reason;
    this.ghost.material = check.ok ? this.ghostMatOk : this.ghostMatBad;
  }

  private validate(
    def: (typeof BUILD_DEFS)[BuildKind],
    x: number,
    z: number,
    y: number,
    inv: Inventory,
  ): { ok: boolean; reason: string } {
    if (!inv.has(def.cost)) return { ok: false, reason: 'Не хватает материалов' };
    const slope = this.terrain.slopeAt(x, z);
    if (slope > 0.55) return { ok: false, reason: 'Слишком крутой склон' };
    const ground = this.terrain.heightAt(x, z);
    if (ground < 0.3) return { ok: false, reason: 'Здесь вода' };
    for (const p of this.pieces) {
      const dx = Math.abs(p.x - x);
      const dz = Math.abs(p.z - z);
      const dy = Math.abs(p.y - y);
      if (dx < 1.1 && dz < 1.1 && dy < 1.2) return { ok: false, reason: 'Здесь уже что-то стоит' };
    }
    return { ok: true, reason: 'Можно строить' };
  }

  get canPlace(): boolean {
    return this.ghostOk;
  }

  get reason(): string {
    return this.ghostReason;
  }

  place(inv: Inventory): PlacedPiece | null {
    if (!this.selected || !this.ghost || !this.ghostOk) return null;
    const kind = this.selected;
    const def = BUILD_DEFS[kind];
    if (!inv.pay(def.cost)) return null;

    const piece: PlacedPiece = {
      id: `p${this.seq++}`,
      kind,
      x: this.nextPos.x,
      y: this.nextPos.y,
      z: this.nextPos.z,
      rot: this.nextRot,
      group: new THREE.Group(),
      collider: null,
    };
    piece.group.position.copy(this.nextPos);
    piece.group.rotation.y = this.nextRot;
    this.buildVisual(kind, piece.group);
    this.group.add(piece.group);

    if (def.hasCollision) {
      const body = this.physics.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(this.nextPos.x, this.nextPos.y, this.nextPos.z)
          .setRotation({ x: 0, y: Math.sin(this.nextRot / 2), z: 0, w: Math.cos(this.nextRot / 2) }),
      );
      piece.collider = this.physics.createCollider(
        RAPIER.ColliderDesc.cuboid(def.size.x / 2, def.size.y / 2, def.size.z / 2),
        body,
      );
    }
    this.pieces.push(piece);
    return piece;
  }

  /** Разборка постройки рядом с точкой. Возвращает половину ресурсов. */
  removeNear(pos: THREE.Vector3, range = 2.6): { kind: BuildKind } | null {
    let best: PlacedPiece | null = null;
    let bestD = range;
    for (const p of this.pieces) {
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return null;
    const kind = best.kind;
    if (best.collider) {
      const body = best.collider.parent();
      if (body) this.physics.removeRigidBody(body);
    }
    best.group.removeFromParent();
    best.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.pieces = this.pieces.filter((p) => p !== best);
    return { kind };
  }

  nearestPiece(pos: THREE.Vector3, range = 2.8): PlacedPiece | null {
    for (const p of this.pieces) {
      if (Math.hypot(p.x - pos.x, p.z - pos.z) < range) return p;
    }
    return null;
  }

  hasWorkbenchNear(pos: THREE.Vector3, range = 4.5): boolean {
    return this.pieces.some((p) => p.kind === 'workbench' && Math.hypot(p.x - pos.x, p.z - pos.z) < range);
  }

  private buildVisual(kind: BuildKind, group: THREE.Group): void {
    const def = BUILD_DEFS[kind];
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b5134 });
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x4a3a26 });
    const stone = new THREE.MeshLambertMaterial({ color: 0x6e6b62 });

    if (kind === 'torchPost') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), wood);
      pole.position.y = 1.1;
      pole.castShadow = true;
      group.add(pole);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0xffa03a }));
      flame.position.y = 2.35;
      group.add(flame);
      const light = new THREE.PointLight(0xff9a40, 8, 16, 2);
      light.position.y = 2.3;
      group.add(light);
      return;
    }

    if (kind === 'campfire') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.16, 6, 12), stone);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      group.add(ring);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.3, 7), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
      flame.position.y = 0.85;
      group.add(flame);
      const light = new THREE.PointLight(0xff9a3c, 13, 20, 1.8);
      light.position.y = 1.2;
      group.add(light);
      return;
    }

    if (kind === 'workbench') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.9), wood);
      top.position.y = 0.95;
      group.add(top);
      for (const [x, z] of [
        [-0.75, -0.35],
        [0.75, -0.35],
        [-0.75, 0.35],
        [0.75, 0.35],
      ]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), darkWood);
        leg.position.set(x, 0.47, z);
        group.add(leg);
      }
      return;
    }

    if (kind === 'chest') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.7), wood);
      box.position.y = 0.4;
      group.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 0.75), darkWood);
      lid.position.y = 0.86;
      group.add(lid);
      return;
    }

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(def.size.x, def.size.y, def.size.z), wood);
    mesh.position.y = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (kind === 'door') {
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshLambertMaterial({ color: 0xb08a3a }));
      handle.position.set(def.size.x * 0.32, 0, 0.14);
      group.add(handle);
    }
    if (kind === 'fence') {
      mesh.material = darkWood;
    }
  }

  toJSON(): Array<{ id: string; x: number; y: number; z: number; rot: number; kind: BuildKind }> {
    return this.pieces.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, rot: p.rot, kind: p.kind }));
  }

  /** Восстановление построек из сохранения. */
  restore(list: Array<{ id: string; x: number; y: number; z: number; rot: number; kind?: BuildKind }>): void {
    for (const raw of list) {
      const kind = (raw.kind ?? 'wall') as BuildKind;
      const def = BUILD_DEFS[kind];
      if (!def) continue;
      const piece: PlacedPiece = {
        id: raw.id,
        kind,
        x: raw.x,
        y: raw.y,
        z: raw.z,
        rot: raw.rot,
        group: new THREE.Group(),
        collider: null,
      };
      piece.group.position.set(raw.x, raw.y, raw.z);
      piece.group.rotation.y = raw.rot;
      this.buildVisual(kind, piece.group);
      this.group.add(piece.group);
      if (def.hasCollision) {
        const body = this.physics.createRigidBody(
          RAPIER.RigidBodyDesc.fixed()
            .setTranslation(raw.x, raw.y, raw.z)
            .setRotation({ x: 0, y: Math.sin(raw.rot / 2), z: 0, w: Math.cos(raw.rot / 2) }),
        );
        piece.collider = this.physics.createCollider(
          RAPIER.ColliderDesc.cuboid(def.size.x / 2, def.size.y / 2, def.size.z / 2),
          body,
        );
      }
      this.pieces.push(piece);
    }
  }

  dispose(): void {
    for (const p of this.pieces) {
      if (p.collider) {
        const body = p.collider.parent();
        if (body) this.physics.removeRigidBody(body);
      }
      p.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    this.pieces = [];
    this.scene.remove(this.group);
    if (this.ghost) {
      this.ghost.removeFromParent();
      this.ghost.geometry.dispose();
    }
  }
}
