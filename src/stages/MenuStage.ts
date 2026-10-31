import * as THREE from 'three';
import type { Stage, GameHandle } from '../core/Stage';

/** Живой фон главного меню: ночной лес, туман, силуэт оленя. */
export class MenuStage implements Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private time = 0;
  private deer: THREE.Group;
  private fireflies: THREE.Points;
  private fireData: Float32Array;
  private disposables: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor(handle: GameHandle) {
    void handle;
    this.scene.fog = new THREE.FogExp2(0x0a1210, 0.028);
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, 3.4, 16);
    this.camera.lookAt(0, 4, 0);

    const hemi = new THREE.HemisphereLight(0x3c5a6a, 0x0a0f0a, 0.7);
    this.scene.add(hemi);

    const moon = new THREE.DirectionalLight(0x9fb6d8, 0.9);
    moon.position.set(-20, 40, 20);
    this.scene.add(moon);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(120, 40),
      new THREE.MeshLambertMaterial({ color: 0x1a2418 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.disposables.push(ground.geometry, ground.material as THREE.Material);

    this.buildTrees();
    this.deer = this.buildDeer();

    // Светлячки
    const count = 90;
    this.fireData = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.fireData[i * 3] = (Math.random() - 0.5) * 60;
      this.fireData[i * 3 + 1] = 0.6 + Math.random() * 6;
      this.fireData[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.fireData, 3));
    this.fireflies = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xa8e6a0, size: 0.13, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.scene.add(this.fireflies);
    this.disposables.push(geo, this.fireflies.material as THREE.Material);
  }

  private buildTrees(): void {
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 7, 5);
    trunkGeo.translate(0, 3.5, 0);
    const leafGeo = new THREE.ConeGeometry(2.4, 6, 6);
    leafGeo.translate(0, 6.5, 0);

    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x241d16 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x18281c });
    const count = 160;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const rng = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = rng(9, 85);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const s = rng(0.7, 1.7);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
    }
    this.scene.add(trunks, leaves);
    this.disposables.push(trunkGeo, leafGeo, trunkMat, leafMat);
  }

  private buildDeer(): THREE.Group {
    const group = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 3.4), dark);
    body.position.y = 2.7;
    group.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.8), dark);
    neck.position.set(0, 3.7, 1.5);
    neck.rotation.x = -0.4;
    group.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.5), dark);
    head.position.set(0, 4.6, 2.3);
    group.add(head);
    for (const sx of [-0.25, 0.25]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff5a2a }),
      );
      eye.position.set(sx, 4.68, 2.95);
      group.add(eye);
    }
    for (const [x, z] of [
      [-0.6, 1.2],
      [0.6, 1.2],
      [-0.6, -1.2],
      [0.6, -1.2],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), dark);
      leg.position.set(x, 1.3, z);
      group.add(leg);
    }
    group.position.set(-4, 0, -34);
    group.rotation.y = 0.35;
    this.scene.add(group);
    return group;
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time * 0.06;
    this.camera.position.set(Math.sin(t) * 3.5, 3.2 + Math.sin(t * 1.7) * 0.25, 16 + Math.cos(t) * 1.5);
    this.camera.lookAt(0, 3.6, 0);

    this.deer.position.x = -4 + Math.sin(this.time * 0.13) * 2.2;
    this.deer.rotation.y = 0.35 + Math.sin(this.time * 0.21) * 0.12;

    const pos = this.fireflies.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + Math.sin(this.time * 0.7 + i) * dt * 0.35;
      const y = pos.getY(i) + Math.cos(this.time * 0.5 + i * 1.7) * dt * 0.2;
      pos.setX(i, x);
      pos.setY(i, Math.max(0.4, y));
    }
    pos.needsUpdate = true;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.scene.clear();
  }
}
