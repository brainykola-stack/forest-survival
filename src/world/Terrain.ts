import * as THREE from 'three';
import { fbm } from '../core/Rand';
import { WORLD_SIZE, TERRAIN_SEGMENTS } from '../core/Config';

/** Рельеф: карта высот, меш с раскраской по зонам и данные для физики. */
export class Terrain {
  readonly size = WORLD_SIZE;
  readonly segments = TERRAIN_SEGMENTS;
  readonly heights: Float32Array;
  readonly mesh: THREE.Mesh;
  readonly lake = { x: -30, z: -128, radius: 46, waterLevel: 0.0 };

  constructor(private seed: number) {
    this.heights = new Float32Array((this.segments + 1) * (this.segments + 1));
    for (let iz = 0; iz <= this.segments; iz++) {
      for (let ix = 0; ix <= this.segments; ix++) {
        const x = this.toX(ix);
        const z = this.toZ(iz);
        this.heights[iz * (this.segments + 1) + ix] = this.computeHeight(x, z);
      }
    }
    this.mesh = this.buildMesh();
  }

  toX(ix: number): number {
    return (ix / this.segments - 0.5) * this.size;
  }

  toZ(iz: number): number {
    return (iz / this.segments - 0.5) * this.size;
  }

  private computeHeight(x: number, z: number): number {
    const n1 = fbm(x * 0.009, z * 0.009, this.seed, 4);
    const n2 = fbm(x * 0.041, z * 0.041, this.seed + 17, 3);
    const n3 = fbm(x * 0.13, z * 0.13, this.seed + 41, 2);

    let h = 1.6 + (n1 - 0.5) * 15 + (n2 - 0.5) * 2.6 + (n3 - 0.5) * 0.45;

    // Каменистая зона: резкие скалы
    const rocky = this.zoneFalloff(x, z, 124, 66, 78);
    h += rocky * (n2 - 0.3) * 7;

    // Болото: плоская низина
    const swamp = this.zoneFalloff(x, z, -46, 128, 70);
    h = h * (1 - swamp * 0.7) + (swamp * 0.7) * 0.55;

    // Озеро в долине
    const lakeD = Math.hypot(x - this.lake.x, z - this.lake.z);
    if (lakeD < this.lake.radius) {
      const k = 1 - lakeD / this.lake.radius;
      const bottom = -3.4;
      const blend = k * k * (3 - 2 * k);
      h = h * (1 - blend) + bottom * blend;
    }

    // Ровная площадка у стартового лагеря
    const spawnD = Math.hypot(x, z);
    if (spawnD < 26) {
      const k = 1 - spawnD / 26;
      h = h * (1 - k * 0.85) + 2.0 * (k * 0.85);
    }

    // Края карты приподняты, чтобы нельзя было уйти за границу
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge > this.size * 0.42) {
      const k = (edge - this.size * 0.42) / (this.size * 0.08);
      h += k * k * 26;
    }
    return h;
  }

  private zoneFalloff(x: number, z: number, cx: number, cz: number, r: number): number {
    const d = Math.hypot(x - cx, z - cz);
    if (d > r) return 0;
    const k = 1 - d / r;
    return k * k * (3 - 2 * k);
  }

  /** Высота в точке: билинейная интерполяция карты высот. */
  heightAt(x: number, z: number): number {
    const fx = (x / this.size + 0.5) * this.segments;
    const fz = (z / this.size + 0.5) * this.segments;
    const ix = Math.max(0, Math.min(this.segments - 1, Math.floor(fx)));
    const iz = Math.max(0, Math.min(this.segments - 1, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - ix));
    const tz = Math.min(1, Math.max(0, fz - iz));
    const w = this.segments + 1;
    const h00 = this.heights[iz * w + ix];
    const h10 = this.heights[iz * w + ix + 1];
    const h01 = this.heights[(iz + 1) * w + ix];
    const h11 = this.heights[(iz + 1) * w + ix + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  private buildMesh(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const w = this.segments + 1;

    const lowland = new THREE.Color(0x39472f);
    const grass = new THREE.Color(0x4c6138);
    const dirt = new THREE.Color(0x4a4030);
    const rock = new THREE.Color(0x6b6a63);
    const sand = new THREE.Color(0x6d6448);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);

      const slope = this.slopeAt(x, z);
      const lakeD = Math.hypot(x - this.lake.x, z - this.lake.z);

      if (lakeD < this.lake.radius * 0.75 && h < 1.2) {
        tmp.copy(sand);
      } else if (slope > 0.42) {
        tmp.copy(rock);
      } else if (h < 0.9) {
        tmp.copy(dirt);
      } else {
        tmp.copy(grass).lerp(lowland, Math.random() * 0.35);
      }

      // Тёмная зона — глубже по цвету
      const deep = this.zoneFalloff(x, z, 44, 150, 80);
      tmp.lerp(new THREE.Color(0x243026), deep * 0.55);

      // Болото — бурый оттенок
      const swamp = this.zoneFalloff(x, z, -46, 128, 70);
      tmp.lerp(new THREE.Color(0x3a3a26), swamp * 0.4);

      tmp.multiplyScalar(0.92 + Math.random() * 0.16);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    void w;

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  slopeAt(x: number, z: number): number {
    const d = 1.0;
    const hx = this.heightAt(x + d, z) - this.heightAt(x - d, z);
    const hz = this.heightAt(x, z + d) - this.heightAt(x, z - d);
    return Math.hypot(hx, hz) / (2 * d);
  }

  /** Вершины и индексы для Rapier trimesh. */
  collisionData(): { vertices: Float32Array; indices: Uint32Array } {
    const geo = this.mesh.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const idx = geo.index;
    if (!idx) throw new Error('Terrain geometry has no index');
    const vertices = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      vertices[i * 3] = pos.getX(i);
      vertices[i * 3 + 1] = pos.getY(i);
      vertices[i * 3 + 2] = pos.getZ(i);
    }
    return { vertices, indices: new Uint32Array(idx.array as ArrayLike<number>) };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
