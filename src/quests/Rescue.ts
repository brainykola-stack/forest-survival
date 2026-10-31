import * as THREE from 'three';
import type { ChildSpot } from '../world/World';

export interface ChildEntity {
  id: string;
  name: string;
  hint: string;
  pos: THREE.Vector3;
  saved: boolean;
  group: THREE.Group;
  light: THREE.PointLight;
}

/** Дети, которых нужно найти и вывести из леса. */
export class RescueSystem {
  children: ChildEntity[] = [];

  constructor(
    private scene: THREE.Scene,
    spots: ChildSpot[],
    savedIds: string[] = [],
  ) {
    for (const spot of spots) {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6a5a8a });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), bodyMat);
      body.position.y = 0.62;
      body.castShadow = true;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xc8a888 }),
      );
      head.position.y = 1.12;
      head.castShadow = true;
      group.add(body, head);

      const light = new THREE.PointLight(0x9fd0ff, 2.4, 7, 2);
      light.position.y = 1.3;
      group.add(light);

      const saved = savedIds.includes(spot.id);
      group.position.copy(spot.pos);
      group.visible = !saved;
      this.scene.add(group);

      this.children.push({ id: spot.id, name: spot.name, hint: spot.hint, pos: spot.pos.clone(), saved, group, light });
    }
  }

  get savedCount(): number {
    return this.children.filter((c) => c.saved).length;
  }

  get total(): number {
    return this.children.length;
  }

  nearest(pos: THREE.Vector3, range = 3.2): ChildEntity | null {
    let best: ChildEntity | null = null;
    let bestD = range;
    for (const c of this.children) {
      if (c.saved) continue;
      const d = c.pos.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  save(child: ChildEntity): void {
    child.saved = true;
    child.group.visible = false;
  }

  savedIds(): string[] {
    return this.children.filter((c) => c.saved).map((c) => c.id);
  }

  update(dt: number): void {
    const t = performance.now() / 1000;
    for (const c of this.children) {
      if (c.saved) continue;
      c.group.position.y = c.pos.y + Math.sin(t * 1.6 + c.pos.x) * 0.03;
      c.light.intensity = 2.0 + Math.sin(t * 2.2 + c.pos.z) * 0.5;
    }
  }

  dispose(): void {
    for (const c of this.children) {
      this.scene.remove(c.group);
      c.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    this.children = [];
  }
}
