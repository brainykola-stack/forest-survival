import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Terrain } from './Terrain';
import { RNG } from '../core/Rand';
import { ZONES, zoneAt, WORLD_SIZE } from '../core/Config';
import type { ItemId } from '../survival/Items';

export type NodeKind = 'tree' | 'rock' | 'bush' | 'wreck' | 'crate';

export interface ResourceNode {
  id: number;
  kind: NodeKind;
  pos: THREE.Vector3;
  alive: boolean;
  hp: number;
  maxHp: number;
  instanceId: number;
  mesh: THREE.InstancedMesh;
  scale: number;
  collider: RAPIER.Collider | null;
  respawnAt: number;
  label: string;
  requiresTool?: 'axe' | 'pickaxe';
}

export interface NoteSpot {
  id: string;
  title: string;
  text: string;
  pos: THREE.Vector3;
}

export interface ChildSpot {
  id: string;
  name: string;
  hint: string;
  pos: THREE.Vector3;
}

export interface BuildingInfo {
  name: string;
  x: number;
  z: number;
  size: number;
}

interface TreeInstance {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
}

/** Мир: рельеф, растительность, постройки, точки интереса и узлы добычи. */
export class World {
  readonly terrain: Terrain;
  readonly group = new THREE.Group();
  readonly nodes: ResourceNode[] = [];
  readonly buildings: BuildingInfo[] = [];
  readonly notes: NoteSpot[] = [];
  readonly childSpots: ChildSpot[] = [];
  readonly campPos = new THREE.Vector3(0, 0, 0);

  private rng: RNG;
  private colliders: RAPIER.Collider[] = [];
  private nodeSeq = 0;
  private treePositions: TreeInstance[] = [];
  private instanced: THREE.InstancedMesh[] = [];
  private nodeMats = new Map<ResourceNode, { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number }>();
  private tick = 0;

  constructor(
    readonly seed: number,
    private scene: THREE.Scene,
    private physics: RAPIER.World,
  ) {
    this.rng = new RNG(seed);
    this.terrain = new Terrain(seed);
    this.group.add(this.terrain.mesh);
    scene.add(this.group);

    this.buildTerrainCollider();
    this.buildVegetation();
    this.buildBuildings();
    this.buildProps();
  }

  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  groundY(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  private buildTerrainCollider(): void {
    const { vertices, indices } = this.terrain.collisionData();
    const body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.9);
    this.colliders.push(this.physics.createCollider(desc, body));
  }

  private addBoxCollider(
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY = 0,
  ): RAPIER.Collider {
    const body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz).setRotation(quatY(rotY)),
    );
    const col = this.physics.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.8), body);
    this.colliders.push(col);
    return col;
  }

  private addCylinderCollider(cx: number, cy: number, cz: number, halfH: number, r: number): RAPIER.Collider {
    const body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
    const col = this.physics.createCollider(RAPIER.ColliderDesc.cylinder(halfH, r), body);
    this.colliders.push(col);
    return col;
  }

  // ------------------------------------------------------------------ растительность

  private buildVegetation(): void {
    const tree = this.scatterTrees();
    this.buildTreeMeshes(tree);
    this.buildRockMeshes();
    this.buildBushMeshes();
    this.buildFernMeshes();
  }

  private scatterTrees(): TreeInstance[] {
    const rng = this.rng;
    const positions: TreeInstance[] = [];
    const attempts = 22000;
    for (let i = 0; i < attempts; i++) {
      const x = rng.range(-WORLD_SIZE * 0.46, WORLD_SIZE * 0.46);
      const z = rng.range(-WORLD_SIZE * 0.46, WORLD_SIZE * 0.46);
      const zone = zoneAt(x, z);
      const lakeD = Math.hypot(x - this.terrain.lake.x, z - this.terrain.lake.z);
      if (lakeD < this.terrain.lake.radius + 3) continue;
      if (Math.hypot(x, z) < 13) continue;
      if (this.nearBuilding(x, z, 9)) continue;
      const slope = this.terrain.slopeAt(x, z);
      if (slope > 0.62) continue;
      const y = this.terrain.heightAt(x, z);
      if (y < 0.7) continue;
      if (!rng.chance(0.1 * zone.trees)) continue;
      const s = rng.range(0.8, 1.75) * (zone.id === 'deep' ? 1.25 : 1);
      positions.push({ x, y, z, s, rot: rng.range(0, Math.PI * 2) });
      if (positions.length > 2400) break;
    }
    this.treePositions = positions;
    return positions;
  }

  private buildTreeMeshes(trees: TreeInstance[]): void {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 6, 6, 1);
    trunkGeo.translate(0, 3, 0);

    const c1 = new THREE.ConeGeometry(2.1, 4.2, 7);
    c1.translate(0, 5.4, 0);
    const c2 = new THREE.ConeGeometry(1.55, 3.6, 7);
    c2.translate(0, 7.6, 0);
    const c3 = new THREE.ConeGeometry(1.0, 2.8, 7);
    c3.translate(0, 9.5, 0);
    const foliageGeo = mergeGeometries([c1, c2, c3])!;

    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3b2f24 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f4a2c });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const leaves = new THREE.InstancedMesh(foliageGeo, leafMat, trees.length);
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    leaves.castShadow = true;
    leaves.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();

    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
      m.compose(new THREE.Vector3(t.x, t.y - 0.2, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
      color.setHSL(0.28 + this.rng.range(-0.03, 0.05), 0.34, 0.16 + this.rng.range(0, 0.09));
      leaves.setColorAt(i, color);
      this.addCylinderCollider(t.x, t.y + 2.6 * t.s, t.z, 2.6 * t.s, 0.38 * t.s);
    }
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;

    this.group.add(trunks, leaves);
    this.instanced.push(trunks, leaves);

    // Узлы добычи дерева (каждое дерево)
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      this.registerNode({
        kind: 'tree',
        pos: new THREE.Vector3(t.x, t.y + 1.4, t.z),
        mesh: trunks,
        instanceId: i,
        hp: 100,
        label: 'Дерево',
        scale: t.s,
        requiresTool: 'axe',
      });
    }
  }

  private buildRockMeshes(): void {
    const rng = this.rng;
    const list: Array<{ x: number; y: number; z: number; s: number; rot: number }> = [];
    for (let i = 0; i < 14000; i++) {
      const x = rng.range(-WORLD_SIZE * 0.46, WORLD_SIZE * 0.46);
      const z = rng.range(-WORLD_SIZE * 0.46, WORLD_SIZE * 0.46);
      const zone = zoneAt(x, z);
      if (this.nearBuilding(x, z, 6)) continue;
      if (Math.hypot(x - this.terrain.lake.x, z - this.terrain.lake.z) < this.terrain.lake.radius) continue;
      const y = this.terrain.heightAt(x, z);
      if (y < 0.6) continue;
      if (!rng.chance(0.05 * zone.rocks)) continue;
      list.push({ x, y, z, s: rng.range(0.5, 2.4), rot: rng.range(0, Math.PI * 2) });
      if (list.length > 900) break;
    }

    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x77756c });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    list.forEach((r, i) => {
      q.setFromEuler(new THREE.Euler(this.rng.range(-0.3, 0.3), r.rot, this.rng.range(-0.3, 0.3)));
      m.compose(new THREE.Vector3(r.x, r.y + r.s * 0.4, r.z), q, new THREE.Vector3(r.s, r.s * 0.8, r.s));
      mesh.setMatrixAt(i, m);
      color.setHSL(0.1, 0.04, 0.32 + this.rng.range(0, 0.14));
      mesh.setColorAt(i, color);
      if (r.s > 0.9) this.addBoxCollider(r.x, r.y + r.s * 0.4, r.z, r.s * 0.7, r.s * 0.5, r.s * 0.7);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
    this.instanced.push(mesh);

    list.forEach((r, i) => {
      this.registerNode({
        kind: 'rock',
        pos: new THREE.Vector3(r.x, r.y + r.s * 0.5, r.z),
        mesh,
        instanceId: i,
        hp: 100,
        label: 'Камень',
        scale: r.s,
        requiresTool: 'pickaxe',
      });
    });
  }

  private buildBushMeshes(): void {
    const rng = this.rng;
    const list: Array<{ x: number; y: number; z: number; s: number }> = [];
    for (let i = 0; i < 14000; i++) {
      const x = rng.range(-WORLD_SIZE * 0.46, WORLD_SIZE * 0.46);
      const z = rng.range(-WORLD_SIZE * 0.46, WORLD_SIZE * 0.46);
      const zone = zoneAt(x, z);
      if (this.nearBuilding(x, z, 4)) continue;
      const lakeD = Math.hypot(x - this.terrain.lake.x, z - this.terrain.lake.z);
      if (lakeD < this.terrain.lake.radius - 2) continue;
      const y = this.terrain.heightAt(x, z);
      if (y < 0.5) continue;
      if (!rng.chance(0.075 * zone.bushes)) continue;
      list.push({ x, y, z, s: rng.range(0.55, 1.25) });
      if (list.length > 1400) break;
    }

    const geo = new THREE.IcosahedronGeometry(0.75, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x38512f });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    list.forEach((b, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28));
      m.compose(new THREE.Vector3(b.x, b.y + 0.45 * b.s, b.z), q, new THREE.Vector3(b.s, b.s * 0.8, b.s));
      mesh.setMatrixAt(i, m);
      color.setHSL(0.27, 0.3, 0.2 + rng.range(0, 0.08));
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
    this.instanced.push(mesh);

    list.forEach((b, i) => {
      this.registerNode({
        kind: 'bush',
        pos: new THREE.Vector3(b.x, b.y + 0.5, b.z),
        mesh,
        instanceId: i,
        hp: 60,
        label: 'Куст',
        scale: b.s,
      });
    });
  }

  private buildFernMeshes(): void {
    const rng = this.rng;
    const count = 1600;
    const geo = new THREE.ConeGeometry(0.28, 0.85, 4);
    geo.translate(0, 0.42, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x435c33 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < count; i++) {
      const x = rng.range(-WORLD_SIZE * 0.45, WORLD_SIZE * 0.45);
      const z = rng.range(-WORLD_SIZE * 0.45, WORLD_SIZE * 0.45);
      const y = this.terrain.heightAt(x, z);
      const s = rng.range(0.6, 1.6);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28));
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
    this.instanced.push(mesh);
  }

  private nearBuilding(x: number, z: number, dist: number): boolean {
    for (const b of this.buildings) {
      if (Math.hypot(x - b.x, z - b.z) < dist + b.size) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ постройки

  private buildBuildings(): void {
    this.house(20, 12, 9, 7, 1, 'Хижина у лагеря', true);
    this.house(-54, -142, 8, 6.5, 1, 'Хижина в долине', false);
    this.house(-118, -48, 11, 8, 2, 'Двухэтажный дом', false);
    this.house(-138, -70, 8.5, 7, 1, 'Сторожка', false);
    this.watchtower(120, 86);
    this.campSite(112, -102);
    this.caveMouth(44, 152);
    this.ruin(-10, 128);
  }

  /**
   * Дом: фундамент, стены, окна, двускатная крыша, крыльцо.
   * При floors = 2 добавляются внутренние лестница и второй этаж.
   */
  private house(x: number, z: number, w: number, d: number, floors: number, name: string, safe: boolean): void {
    const y = this.terrain.heightAt(x, z);
    const halfW = w / 2;
    const halfD = d / 2;
    const floorH = 2.7;
    const h = floorH * floors;
    const wallMat = new THREE.MeshLambertMaterial({ color: safe ? 0x6b5a3e : 0x4d4436 });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x33291d });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x453728 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a241d });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x3a4a55, emissive: 0xffb060, emissiveIntensity: 0.55 });
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x6a665c });

    const add = (px: number, py: number, pz: number, sx: number, sy: number, sz: number, mat: THREE.Material, solid = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      if (solid) this.addBoxCollider(px, py, pz, sx / 2, sy / 2, sz / 2);
      return mesh;
    };

    // Фундамент и пол первого этажа
    add(x, y + 0.15, z, w + 0.6, 0.5, d + 0.6, stoneMat);
    add(x, y + 0.42, z, w, 0.1, d, floorMat, false);

    // Стены. Передняя — с проёмом двери на первом этаже.
    const doorW = 1.7;
    const doorH = 2.2;
    const sideW = (w - doorW) / 2;
    add(x - (doorW / 2 + sideW / 2), y + floorH / 2 + 0.45, z + halfD, sideW, floorH, 0.28, wallMat);
    add(x + (doorW / 2 + sideW / 2), y + floorH / 2 + 0.45, z + halfD, sideW, floorH, 0.28, wallMat);
    add(x, y + doorH + (floorH - doorH) / 2 + 0.45, z + halfD, doorW, floorH - doorH, 0.28, wallMat, false);
    if (floors > 1) {
      add(x, y + floorH * 1.5 + 0.45, z + halfD, w, floorH, 0.28, wallMat);
    }
    add(x, y + h / 2 + 0.45, z - halfD, w, h, 0.28, wallMat);
    add(x - halfW, y + h / 2 + 0.45, z, 0.28, h, d, wallMat);
    add(x + halfW, y + h / 2 + 0.45, z, 0.28, h, d, wallMat);

    // Дверная рама и крыльцо
    add(x - doorW / 2 - 0.08, y + doorH / 2 + 0.45, z + halfD + 0.02, 0.16, doorH, 0.36, trimMat);
    add(x + doorW / 2 + 0.08, y + doorH / 2 + 0.45, z + halfD + 0.02, 0.16, doorH, 0.36, trimMat);
    add(x, y + 0.45 + doorH + 0.08, z + halfD + 0.02, doorW + 0.3, 0.16, 0.36, trimMat);
    add(x, y + 0.2, z + halfD + 0.8, doorW + 0.8, 0.2, 1.4, floorMat);
    add(x - doorW / 2 - 0.3, y + 0.9, z + halfD + 1.3, 0.16, 1.6, 0.16, trimMat);
    add(x + doorW / 2 + 0.3, y + 0.9, z + halfD + 1.3, 0.16, 1.6, 0.16, trimMat);

    // Окна: по два на передней и задней стене, по одному на боковых
    const win = (px: number, py: number, pz: number, sx: number, sz: number) => {
      add(px, py, pz, sx, 1.05, sz, glassMat, false);
      add(px, py - 0.6, pz, sx + 0.18, 0.12, sz + 0.18, trimMat, false);
      add(px, py + 0.6, pz, sx + 0.18, 0.12, sz + 0.18, trimMat, false);
    };
    for (let f = 0; f < floors; f++) {
      const wy = y + 1.55 + f * floorH;
      const off = halfD + 0.15;
      win(x - halfW * 0.45, wy, z + off, 1.1, 0.08);
      win(x + halfW * 0.45, wy, z + off, 1.1, 0.08);
      win(x - halfW * 0.45, wy, z - off, 1.1, 0.08);
      win(x + halfW * 0.45, wy, z - off, 1.1, 0.08);
      win(x - halfW - 0.15, wy, z, 0.08, 1.1);
    }

    // Второй этаж: плита с проёмом под лестницу
    if (floors > 1) {
      const stairW = 1.5;
      add(x + (halfW - stairW) / 2 + stairW / 2, y + floorH + 0.45, z, w - stairW, 0.18, d, floorMat);
      // Лестница вдоль левой стены
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const sy = y + 0.55 + (i + 0.5) * ((floorH - 0.4) / steps);
        const sz = z - halfD + 0.9 + i * ((d - 1.2) / steps);
        add(x - halfW + stairW / 2 + 0.1, sy, sz, stairW, (floorH - 0.4) / steps, (d - 1.2) / steps + 0.06, trimMat);
      }
    }

    // Двускатная крыша
    const pitch = 0.5; // ~28°
    const slopeLen = (halfW + 0.7) / Math.cos(pitch);
    const ridgeY = y + h + 0.45 + Math.tan(pitch) * halfW;
    const left = add(x - halfW / 2, (y + h + 0.45 + ridgeY) / 2, z, slopeLen, 0.22, d + 1.4, roofMat, false);
    left.rotation.z = pitch;
    const right = add(x + halfW / 2, (y + h + 0.45 + ridgeY) / 2, z, slopeLen, 0.22, d + 1.4, roofMat, false);
    right.rotation.z = -pitch;
    add(x + halfW * 0.45, ridgeY + 0.7, z - halfD * 0.4, 0.8, 1.6, 0.8, stoneMat, false);

    // Мебель
    add(x + halfW - 1.2, y + 0.95, z - halfD + 1.2, 1.3, 0.12, 0.9, trimMat);
    add(x + halfW - 1.2, y + 0.62, z - halfD + 1.2, 0.14, 0.66, 0.7, trimMat, false);
    add(x - halfW + 1.1, y + 0.75, z + halfD - 1.2, 0.9, 0.9, 0.9, new THREE.MeshLambertMaterial({ color: 0x5a4a30 }));
    if (floors > 1) {
      add(x + halfW - 1.4, y + floorH + 0.65, z - halfD + 1.6, 1.2, 0.4, 2.0, new THREE.MeshLambertMaterial({ color: 0x4b3c2c }));
    }

    // Свет внутри
    const lamp = new THREE.PointLight(0xffb861, safe ? 10 : 6, 16, 2);
    lamp.position.set(x, y + floorH - 0.2, z);
    this.group.add(lamp);
    if (floors > 1) {
      const lamp2 = new THREE.PointLight(0xffb861, 5, 12, 2);
      lamp2.position.set(x, y + h - 0.2, z);
      this.group.add(lamp2);
    }

    this.buildings.push({ name, x, z, size: Math.max(halfW, halfD) });
  }

  private watchtower(x: number, z: number): void {
    const y = this.terrain.heightAt(x, z);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x3d3327 });
    for (const [dx, dz] of [
      [-1.6, -1.6],
      [1.6, -1.6],
      [-1.6, 1.6],
      [1.6, 1.6],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 9, 0.35), legMat);
      leg.position.set(x + dx, y + 4.5, z + dz);
      leg.castShadow = true;
      this.group.add(leg);
      this.addBoxCollider(x + dx, y + 4.5, z + dz, 0.2, 4.5, 0.2);
    }
    const platform = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 6), legMat);
    platform.position.set(x, y + 8.6, z);
    platform.castShadow = true;
    this.group.add(platform);
    this.addBoxCollider(x, y + 8.6, z, 3, 0.2, 3);
    const railMat = new THREE.MeshLambertMaterial({ color: 0x33301f });
    for (const [dx, dz, sx, sz] of [
      [0, -2.9, 6, 0.2],
      [0, 2.9, 6, 0.2],
      [-2.9, 0, 0.2, 6],
      [2.9, 0, 0.2, 6],
    ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.1, sz), railMat);
      rail.position.set(x + dx, y + 9.3, z + dz);
      this.group.add(rail);
      this.addBoxCollider(x + dx, y + 9.3, z + dz, sx / 2, 0.55, sz / 2);
    }
    this.buildings.push({ name: 'Сторожевая вышка', x, z, size: 4 });
  }

  private campSite(x: number, z: number): void {
    const y = this.terrain.heightAt(x, z);
    const tentMat = new THREE.MeshLambertMaterial({ color: 0x4a4232 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const tx = x + Math.cos(a) * 6;
      const tz = z + Math.sin(a) * 6;
      const ty = this.terrain.heightAt(tx, tz);
      const tent = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 5), tentMat);
      tent.position.set(tx, ty + 1.2, tz);
      tent.castShadow = true;
      this.group.add(tent);
      this.addBoxCollider(tx, ty + 1.2, tz, 1.5, 1.2, 1.5);
    }
    // погасший костёр
    const ash = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.25, 10), new THREE.MeshLambertMaterial({ color: 0x2a2723 }));
    ash.position.set(x, y + 0.12, z);
    this.group.add(ash);
    // ящики
    for (let i = 0; i < 4; i++) {
      const cx = x + this.rng.range(-8, 8);
      const cz = z + this.rng.range(-8, 8);
      const cy = this.terrain.heightAt(cx, cz);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshLambertMaterial({ color: 0x56432c }));
      crate.position.set(cx, cy + 0.45, cz);
      crate.castShadow = true;
      this.group.add(crate);
      this.addBoxCollider(cx, cy + 0.45, cz, 0.45, 0.45, 0.45);
    }
    this.buildings.push({ name: 'Заброшенный лагерь', x, z, size: 9 });
  }

  private caveMouth(x: number, z: number): void {
    const y = this.terrain.heightAt(x, z);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x4c4a44 });
    const arch = new THREE.Group();
    const left = new THREE.Mesh(new THREE.BoxGeometry(5, 9, 6), rockMat);
    left.position.set(-6, 4, 0);
    const right = new THREE.Mesh(new THREE.BoxGeometry(5, 9, 6), rockMat);
    right.position.set(6, 4, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 7), rockMat);
    top.position.set(0, 9, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 3), rockMat);
    back.position.set(0, 4, -4.5);
    arch.add(left, right, top, back);
    arch.position.set(x, y, z);
    arch.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.add(arch);
    this.addBoxCollider(x - 6, y + 4, z, 2.5, 4.5, 3);
    this.addBoxCollider(x + 6, y + 4, z, 2.5, 4.5, 3);
    this.addBoxCollider(x, y + 11.5, z, 9, 2.5, 3.5);
    this.addBoxCollider(x, y + 4, z - 4.5, 8, 4, 1.5);

    const dark = new THREE.PointLight(0x2a4a66, 2.5, 12, 2);
    dark.position.set(x, y + 2, z + 1);
    this.group.add(dark);

    this.buildings.push({ name: 'Пещера', x, z, size: 10 });
  }

  private ruin(x: number, z: number): void {
    const y = this.terrain.heightAt(x, z);
    const mat = new THREE.MeshLambertMaterial({ color: 0x51483a });
    for (let i = 0; i < 5; i++) {
      const w = this.rng.range(1.5, 4);
      const h = this.rng.range(1, 3.4);
      const px = x + this.rng.range(-7, 7);
      const pz = z + this.rng.range(-7, 7);
      const py = this.terrain.heightAt(px, pz);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), mat);
      wall.position.set(px, py + h / 2, pz);
      wall.rotation.y = this.rng.range(0, 3.14);
      wall.castShadow = true;
      this.group.add(wall);
      this.addBoxCollider(px, py + h / 2, pz, w / 2, h / 2, 0.3);
    }
    this.buildings.push({ name: 'Развалины', x, z, size: 8 });
  }

  // ------------------------------------------------------------------ точки интереса

  private buildProps(): void {
    const note = (id: string, title: string, text: string, x: number, z: number) => {
      const y = this.terrain.heightAt(x, z);
      const paper = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.65),
        new THREE.MeshBasicMaterial({ color: 0xd9cfae, side: THREE.DoubleSide }),
      );
      paper.position.set(x, y + 1.05, z);
      paper.rotation.x = -0.5;
      this.group.add(paper);
      this.notes.push({ id, title, text, pos: new THREE.Vector3(x, y + 1.0, z) });
    };

    note(
      'n1',
      'Дневник смотрителя',
      'День 12. Дети пропали на третий день. Мы нашли их следы у старой деревни, но дальше — только тишина.\n\nЕсли ты читаешь это — не отходи от костра ночью. Оно не любит огонь.',
      21,
      13,
    );
    note(
      'n2',
      'Записка в доме',
      'Мы заперли дверь и сидели до рассвета. Оно ходило вокруг и стучало по стенам.\n\nОдин раз — это не стук. Это оно пробует, насколько крепко.',
      -118,
      -46,
    );
    note(
      'n3',
      'Обрывок у вышки',
      'С вышки видно всё. Ночью в глубоком лесу зажигается второй огонь. Я не зажигал его.\n\nКто-то ещё живёт здесь. Или что-то.',
      120,
      86,
    );
    note(
      'n4',
      'В пещере',
      'Дети рисовали здесь. На стенах — олень с горящими глазами.\n\nОни называли его «Хозяин». И писали, что он не всегда был злым.',
      44,
      152,
    );
    note(
      'n5',
      'Дневник в лагере',
      'Мы пришли впятером. Остались двое. Тот, кто переживёт девяносто девятую ночь, узнает правду.',
      112,
      -102,
    );
    note(
      'n6',
      'Последняя страница',
      'Если всё повторится — ищи оберег в старой деревне. Он ведёт к тому, кто начал это.\n\nНе сжигай его. Никогда.',
      -138,
      -70,
    );

    this.childSpots.push(
      {
        id: 'child1',
        name: 'Мира',
        hint: 'Прячется в хижине в долине',
        pos: new THREE.Vector3(-54, this.terrain.heightAt(-54, -142) + 0.1, -142),
      },
      {
        id: 'child2',
        name: 'Тимур',
        hint: 'Сидит в старом доме деревни',
        pos: new THREE.Vector3(-118, this.terrain.heightAt(-118, -48) + 0.1, -48),
      },
      {
        id: 'child3',
        name: 'Вера',
        hint: 'Слышна у пещеры',
        pos: new THREE.Vector3(44, this.terrain.heightAt(44, 152) + 0.1, 152),
      },
      {
        id: 'child4',
        name: 'Костя',
        hint: 'Прячется в заброшенном лагере',
        pos: new THREE.Vector3(112, this.terrain.heightAt(112, -102) + 0.1, -102),
      },
    );
  }

  // ------------------------------------------------------------------ узлы добычи

  private registerNode(args: {
    kind: NodeKind;
    pos: THREE.Vector3;
    mesh: THREE.InstancedMesh;
    instanceId: number;
    hp: number;
    label: string;
    scale: number;
    requiresTool?: 'axe' | 'pickaxe';
  }): ResourceNode {
    const node: ResourceNode = {
      id: this.nodeSeq++,
      kind: args.kind,
      pos: args.pos,
      alive: true,
      hp: args.hp,
      maxHp: args.hp,
      instanceId: args.instanceId,
      mesh: args.mesh,
      scale: args.scale,
      collider: null,
      respawnAt: 0,
      label: args.label,
      requiresTool: args.requiresTool,
    };
    this.nodes.push(node);
    const quat = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    args.mesh.getMatrixAt(args.instanceId, m);
    m.decompose(new THREE.Vector3(), quat, new THREE.Vector3());
    this.nodeMats.set(node, { pos: args.pos.clone(), quat, scale: args.scale });
    return node;
  }

  /** Наносит удар по узлу. Без инструмента добыча идёт, но скуднее. */
  hitNode(node: ResourceNode, damage: number, hasTool: boolean): Array<{ id: ItemId; n: number }> | null {
    if (!node.alive) return null;
    node.hp -= damage;
    const loot: Array<{ id: ItemId; n: number }> = [];
    switch (node.kind) {
      case 'tree':
        loot.push({ id: 'wood', n: hasTool ? 2 : 1 });
        break;
      case 'rock':
        loot.push({ id: 'stone', n: hasTool ? 2 : 1 });
        if (this.rng.chance(0.06)) loot.push({ id: 'metal', n: 1 });
        break;
      case 'bush': {
        const roll = this.rng.next();
        if (roll < 0.45) loot.push({ id: 'berry', n: this.rng.int(1, 2) });
        else if (roll < 0.8) loot.push({ id: 'fiber', n: this.rng.int(1, 2) });
        else loot.push({ id: 'herb', n: 1 });
        break;
      }
      case 'wreck':
        loot.push({ id: 'metal', n: 1 });
        break;
      case 'crate':
        loot.push({ id: 'wood', n: 2 });
        if (this.rng.chance(0.5)) loot.push({ id: 'fiber', n: 2 });
        break;
    }
    if (node.hp <= 0) {
      node.alive = false;
      node.hp = 0;
      const respawn = node.kind === 'tree' ? 260 : node.kind === 'rock' ? 220 : 150;
      node.respawnAt = this.tick + respawn;
      this.setNodeHidden(node, true);
    }
    return loot;
  }

  private setNodeHidden(node: ResourceNode, hidden: boolean): void {
    const info = this.nodeMats.get(node);
    if (!info) return;
    const m = new THREE.Matrix4();
    if (hidden) {
      m.compose(info.pos, info.quat, new THREE.Vector3(0.0001, 0.0001, 0.0001));
    } else {
      m.compose(info.pos, info.quat, new THREE.Vector3(info.scale, info.scale, info.scale));
    }
    node.mesh.setMatrixAt(node.instanceId, m);
    node.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    this.tick += dt;
    for (const node of this.nodes) {
      if (!node.alive && this.tick >= node.respawnAt) {
        node.alive = true;
        node.hp = node.maxHp;
        this.setNodeHidden(node, false);
      }
    }
    // Трава и кусты колышутся: небольшое покачивание инстансов рядом с игроком не нужно,
    // но шейдер ветра включён через vertexColors-материал (см. ниже).
    void playerPos;
  }

  /** Ближайший узел в пределах радиуса и в направлении взгляда. */
  findNode(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, maxAngle = 0.62): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestScore = Infinity;
    for (const node of this.nodes) {
      if (!node.alive) continue;
      const to = node.pos.clone().sub(origin);
      const dist = to.length();
      if (dist > maxDist || dist < 0.05) continue;
      const angle = to.normalize().angleTo(dir);
      if (angle > maxAngle) continue;
      const score = dist + angle * 3;
      if (score < bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  }

  dispose(): void {
    for (const im of this.instanced) {
      im.geometry.dispose();
      (im.material as THREE.Material).dispose();
      this.group.remove(im);
    }
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mat = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.scene.remove(this.group);
    for (const c of this.colliders) {
      const rb = c.parent();
      if (rb) this.physics.removeRigidBody(rb);
    }
    this.colliders = [];
    this.terrain.dispose();
  }
}

function quatY(angle: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}
